/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { Duration, Fn, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { SnowflakeConnection } from "./index";
import { Construct } from "constructs";
import { Layers } from "../constructs/Layers";
import { Lambdas } from "../constructs/Lambdas";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { OpenSearchServerlessVectorStore } from "../constructs/OpenSearchServerlessVectorStore";
import { NagSuppressions } from "cdk-nag";
import { SnowflakeAuthentication } from "../runtime/utils";
import {
  FlowLogDestination,
  FlowLogTrafficType,
  InterfaceVpcEndpointAwsService,
  IVpc,
  Port,
  SecurityGroup,
  SelectedSubnets,
  SubnetSelection,
  SubnetType,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { CnameRecord, PrivateHostedZone } from "aws-cdk-lib/aws-route53";

export interface TextToSqlWithLambdaAndSnowflakeStackProps extends StackProps, SnowflakeConnection {
  snowflakeAuthentication: SnowflakeAuthentication;
  aossIndexName: string;
  aossCollectionName: string;
  /**
   * Optional config if you want to use AWS PrivateLink to connect to Snowflake
   */
  snowflakePrivateLinkConfig?: SnowflakePrivateLinkConfig;
  vpcConfig?: VpcConfig;
}

/**
 * Configuration for using AWS PrivateLink to connect to Snowflake
 */
export interface SnowflakePrivateLinkConfig {
  /**
   * The privatelink-vpce-id value returned by the  SYSTEM$GET_PRIVATELINK_CONFIG function
   */
  vpceId: string;
}

export interface VpcConfig {
  /**
   * An optional vpc id of an existing vpc. If not provided an VPC is created
   */
  vpcId?: string;
  /**
   * An optional subnet selection where the lambdas and vpc endpoints will be deployed. If not provided selection will be for PRIVATE_ISOLATED subnets
   */
  subnets?: SubnetSelection;
}

export class TextToSqlWithLambdaAndSnowflakeStack extends Stack {
  constructor(scope: Construct, id: string, props: TextToSqlWithLambdaAndSnowflakeStackProps) {
    super(scope, id, props);
    const layers = new Layers(this, "Layers");
    let vpc: IVpc | undefined = undefined;
    let securityGroups: SecurityGroup[] | undefined = undefined;
    let selectedSubnets: SelectedSubnets | undefined = undefined;
    if (props.vpcConfig != undefined) {
      if (props.vpcConfig.vpcId != undefined) {
        vpc = Vpc.fromLookup(this, "Vpc", {
          vpcId: props.vpcConfig.vpcId,
        });
      } else {
        const vpcFlowLogsLogGroup = new LogGroup(this, "VpcFlowLogsLogGroup", {
          logGroupName: `/${this.stackName}/vpc/flowlogs`,
          removalPolicy: RemovalPolicy.DESTROY,
          retention: RetentionDays.ONE_DAY,
        });
        vpc = new Vpc(this, "Vpc", {
          maxAzs: 2,
          subnetConfiguration: [
            {
              name: "private-isolated",
              subnetType: SubnetType.PRIVATE_ISOLATED,
            },
          ],
          flowLogs: {
            ToCloudWatch: {
              destination: FlowLogDestination.toCloudWatchLogs(vpcFlowLogsLogGroup),
              trafficType: FlowLogTrafficType.REJECT,
            },
          },
        });
      }
      const snowflakeVpcSecurityGroup = new SecurityGroup(this, "SnowflakeVpcEndpointSecurityGroup", {
        vpc: vpc,
        description: "Security group for snowflake vpc endpoint",
        securityGroupName: "snowflake-vpce-sg",
        allowAllOutbound: true,
      });
      snowflakeVpcSecurityGroup.addIngressRule(snowflakeVpcSecurityGroup, Port.HTTPS, "Allow https");
      snowflakeVpcSecurityGroup.addIngressRule(snowflakeVpcSecurityGroup, Port.HTTP, "Allow http");
      securityGroups = [snowflakeVpcSecurityGroup];
      selectedSubnets =
        props.vpcConfig?.subnets != undefined
          ? vpc.selectSubnets(props.vpcConfig.subnets)
          : vpc.selectSubnets({
              subnetType: SubnetType.PRIVATE_ISOLATED,
            });

      vpc.addInterfaceEndpoint("BedrockRuntimeVpce", {
        subnets: selectedSubnets,
        securityGroups: securityGroups,
        service: InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME,
        privateDnsEnabled: true,
      });
      // vpc.addGatewayEndpoint("S3Vpce", {
      //   subnets: [selectedSubnets],
      //
      //   service: InterfaceVpcEndpointAwsService.S3,
      // });
      if (props.snowflakePrivateLinkConfig != undefined) {
        const snowflakeInterfaceEndpoint = vpc.addInterfaceEndpoint("SnowflakeVpce", {
          subnets: selectedSubnets,
          securityGroups: securityGroups,
          service: {
            name: props.snowflakePrivateLinkConfig.vpceId,
            port: 443,
          },
          privateDnsEnabled: false,
        });
        const snowflakePrivateHostedZone = new PrivateHostedZone(this, "PrivateLinkHostedZone", {
          zoneName: "privatelink.snowflakecomputing.com",
          vpc: vpc,
        });

        new CnameRecord(this, "PrivateLinkRecord", {
          recordName: "*",
          zone: snowflakePrivateHostedZone,
          domainName: Fn.select(1, Fn.split(":", Fn.select(0, snowflakeInterfaceEndpoint.vpcEndpointDnsEntries))),
          ttl: Duration.seconds(60),
        });
      }
    }

    const secretStringTemplate: { [key: string]: string } = {};
    const keyName = props.snowflakeAuthentication.parameterName.split("/")[1] as string;
    secretStringTemplate[keyName] = "";

    const secret = new Secret(this, "SnowflakeAuthenticationSecret", {
      secretName: props.snowflakeAuthentication.parameterName.split("/")[0],
      description: "Snowflake authentication secret",
      generateSecretString: {
        secretStringTemplate: JSON.stringify(secretStringTemplate),
        generateStringKey: keyName,
        excludeCharacters: '/@"',
      },
    });

    const vectorStore = new OpenSearchServerlessVectorStore(this, "VectorStore", {
      name: props.aossCollectionName,
      description: "Knowledge base in text-to-sql RAG framework",
      subnets: selectedSubnets,
      vpc: vpc,
      securityGroups: securityGroups,
    });

    const lambdas = new Lambdas(this, "Lambdas", {
      layers: layers,
      snowflakeConnection: {
        ...props,
      },
      vectorStore,
      snowflakeAuthentication: props.snowflakeAuthentication,
      indexName: props.aossIndexName,
      vpc: vpc,
      securityGroups: securityGroups,
      selectedSubnets: selectedSubnets,
      usePrivateLink: props.snowflakePrivateLinkConfig != undefined,
      secret: secret,
    });
    lambdas.node.addDependency(secret);
    this.cdkNagSuppressions();
  }

  private cdkNagSuppressions() {
    NagSuppressions.addStackSuppressions(this, [
      {
        id: "AwsSolutions-L1",
        reason: "Manually managing runtimes",
      },
    ]);
    NagSuppressions.addStackSuppressions(this, [
      {
        id: "AwsSolutions-IAM4",
        reason: "AWS Managed policies are ok",
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, `/${this.stackName}/Lambdas/TextToSqlFunction/ServiceRole/DefaultPolicy/Resource`, [
      {
        id: "AwsSolutions-IAM5",
        reason: "Wildcard permissions for anthropic models allowed here",
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, `/${this.stackName}/Lambdas/IndexTablesFunction/ServiceRole/DefaultPolicy/Resource`, [
      {
        id: "AwsSolutions-IAM5",
        reason: "Wildcard permissions for anthropic models allowed here",
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, `/${this.stackName}/SnowflakeAuthenticationSecret/Resource`, [
      {
        id: "AwsSolutions-SMG4",
        reason: "Secret value is managed on the snowflake side so we do not want to auto-rotate",
      },
    ]);
  }
}
