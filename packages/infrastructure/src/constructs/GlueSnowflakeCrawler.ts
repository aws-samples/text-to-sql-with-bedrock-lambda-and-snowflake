import { Construct, Dependable, IDependable } from "constructs";
import { CfnConnection, CfnCrawler, CfnDatabase } from "aws-cdk-lib/aws-glue";
import { Aws, Fn } from "aws-cdk-lib";
import { ManagedPolicy, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { SnowflakeConnection } from "../stacks/TextToSqlWithAthenaAndSnowflakeStack";
import { GatewayVpcEndpointAwsService, InterfaceVpcEndpointAwsService, Port, SecurityGroup, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import { AwsCustomResource, AwsCustomResourcePolicy } from "aws-cdk-lib/custom-resources";

export interface GlueSnowflakeCrawlerConfig extends SnowflakeConnection {
  secret: Secret;
  assetBucket: Bucket;
}

export class GlueSnowflakeCrawler extends Construct implements IDependable {
  readonly database: CfnDatabase;

  constructor(scope: Construct, id: string, config: GlueSnowflakeCrawlerConfig) {
    super(scope, id);
    Dependable.implement(this, {
      dependencyRoots: [this],
    });
    this.node.addValidation({
      validate(): string[] {
        const messages: string[] = [];
        return messages;
      },
    });
    //crawler has to run in a private subnet of a vpc
    const crawlerVpc = new Vpc(this, "SnowflakeGlueCrawlerVpc", {
      subnetConfiguration: [
        {
          subnetType: SubnetType.PRIVATE_ISOLATED,
          name: "GlueCrawlerIsolatedSubnet",
        },
      ],
      gatewayEndpoints: {
        S3: {
          service: GatewayVpcEndpointAwsService.S3,
        },
      },
    });
    const snowflakeJdbcSecurityGroup = new SecurityGroup(this, "SnowflakeJdbcSecurityGroup", {
      vpc: crawlerVpc,
      description: "Security group for Snowflake JDBC connection",
      securityGroupName: "snowflake-jdbc-sg",
      allowAllOutbound: true,
    });
    snowflakeJdbcSecurityGroup.addIngressRule(snowflakeJdbcSecurityGroup, Port.allTcp(), "Allow all TCP to same sg");

    crawlerVpc.addInterfaceEndpoint("SecretManagerEndpoint", {
      service: InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: crawlerVpc.selectSubnets({
        subnetType: SubnetType.PRIVATE_ISOLATED,
      }),
      securityGroups: [snowflakeJdbcSecurityGroup],
    });
    crawlerVpc.addInterfaceEndpoint("GlueEndpoint", {
      service: InterfaceVpcEndpointAwsService.GLUE,
      subnets: crawlerVpc.selectSubnets({
        subnetType: SubnetType.PRIVATE_ISOLATED,
      }),
      securityGroups: [snowflakeJdbcSecurityGroup],
    });

    const asset = new BucketDeployment(this, "SnowflakeJdbcDriverDeployment", {
      destinationBucket: config.assetBucket,
      sources: [Source.asset("/tmp/snowflake-jdbc-3.15.0.jar")],
      destinationKeyPrefix: "drivers",
      memoryLimit: 1024,
      extract: false,
      retainOnDelete: true,
    });
    const connection = new CfnConnection(this, "GlueSnowflakeConnection", {
      catalogId: Aws.ACCOUNT_ID,
      connectionInput: {
        name: "SnowflakeConnection",
        connectionType: "JDBC",
        connectionProperties: {
          JDBC_DRIVER_JAR_URI: asset.deployedBucket.s3UrlForObject(`drivers/${Fn.select(0, asset.objectKeys)}`),
          JDBC_DRIVER_CLASS_NAME: "net.snowflake.client.jdbc.SnowflakeDriver",
          JDBC_CONNECTION_URL: `jdbc:snowflake://${config.snowflakeAccountId}.snowflakecomputing.com/?user=${config.snowflakeUser}&db=${config.snowflakeDb}&role=${config.snowflakeRole}&warehouse=${config.snowflakeWarehouse}`,
          JDBC_ENFORCE_SSL: "false",
          KAFKA_SSL_ENABLED: "false",
          SECRET_ID: config.secret.secretName,
        },
        physicalConnectionRequirements: {
          availabilityZone: crawlerVpc.selectSubnets({
            subnetType: SubnetType.PRIVATE_ISOLATED,
          }).availabilityZones[0],
          subnetId: crawlerVpc.selectSubnets({
            subnetType: SubnetType.PRIVATE_ISOLATED,
          }).subnetIds[0],
          securityGroupIdList: [snowflakeJdbcSecurityGroup.securityGroupId],
        },
      },
    });
    const glueCrawlerRole = new Role(this, "GlueCrawlerRole", {
      assumedBy: new ServicePrincipal("glue.amazonaws.com"),
      managedPolicies: [ManagedPolicy.fromManagedPolicyArn(this, "AWSGlueServiceRole", "arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole")],
    });
    glueCrawlerRole.grantPassRole(glueCrawlerRole);
    config.secret.grantRead(glueCrawlerRole);
    config.assetBucket.grantReadWrite(glueCrawlerRole);
    this.database = new CfnDatabase(this, "SnowflakeDatabase", {
      catalogId: Aws.ACCOUNT_ID,
      databaseInput: {
        name: "snowflake",
      },
    });
    const jdbcTarget = {
      connectionName: connection.ref,
      path: config.crawlerPath ?? `${config.snowflakeDb}/%`,
      exclusions: [],
    };
    const crawler = new CfnCrawler(this, "GlueCrawler", {
      databaseName: this.database.ref,
      name: "SnowflakeCrawler",
      recrawlPolicy: {
        recrawlBehavior: "CRAWL_EVERYTHING",
      },
      schemaChangePolicy: {
        deleteBehavior: "DEPRECATE_IN_DATABASE",
        updateBehavior: "UPDATE_IN_DATABASE",
      },
      targets: {
        jdbcTargets: [jdbcTarget],
      },
      role: glueCrawlerRole.roleArn,
    });
    const command = {
      service: "Glue",
      action: "UpdateCrawler",
      physicalResourceId: { id: "UpdateCrawler" },
      parameters: {
        Name: crawler.ref,
        JdbcTargets: [
          {
            ...jdbcTarget,
            EnableAdditionalMetadata: ["COMMENTS"],
          },
        ],
      },
    };
    const updateCrawlerDataSource = new AwsCustomResource(this, "UpdateCrawlerDataSource", {
      onCreate: command,
      onUpdate: command,
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });
    updateCrawlerDataSource.node.addDependency(crawler);
  }
}
