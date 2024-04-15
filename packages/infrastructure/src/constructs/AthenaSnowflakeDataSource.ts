import { Construct, Dependable, IDependable } from "constructs";

import { BlockPublicAccess, Bucket } from "aws-cdk-lib/aws-s3";
import { Aws, RemovalPolicy, Stack } from "aws-cdk-lib";

import { CfnApplication } from "aws-cdk-lib/aws-sam";
import { CfnDataCatalog, CfnWorkGroup } from "aws-cdk-lib/aws-athena";
import { SnowflakeConnection } from "../stacks/TextToSqlWithAthenaAndSnowflakeStack";
import { Grant, IGrantable } from "aws-cdk-lib/aws-iam";

export interface AthenaSnowflakeDataSourceConfig extends SnowflakeConnection {
  assetBucket: Bucket;
}

export class AthenaSnowflakeDataSource extends Construct implements IDependable {
  readonly workgroup: CfnWorkGroup;
  readonly lambdaFunctionName: string = "athena-snowflake-connector-fn";
  readonly dataCatalog: CfnDataCatalog;
  private readonly outputLocation: string = "athena-workgroup";
  private readonly outputBucket: Bucket;
  constructor(scope: Construct, id: string, config: AthenaSnowflakeDataSourceConfig) {
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
    this.outputBucket = config.assetBucket;
    const spillBucket = new Bucket(this, "LambdaSpillBucket", {
      removalPolicy: RemovalPolicy.DESTROY,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });

    new CfnApplication(this, "AthenaSnowflakeConnector", {
      location: {
        applicationId: "arn:aws:serverlessrepo:us-east-1:292517598671:applications/AthenaSnowflakeConnector",
        semanticVersion: "2024.10.1",
      },
      parameters: {
        SecretNamePrefix: "AthenaJdbcFederation/",
        DefaultConnectionString: `snowflake://jdbc:snowflake://${config.snowflakeAccountId}.snowflakecomputing.com:443?db=${config.snowflakeDb}&role=${config.snowflakeRole}&warehouse=${config.snowflakeWarehouse}&\${AthenaJdbcFederation/${Stack.of(this).stackName}/snowflake}`,
        SpillBucket: spillBucket.bucketName,
        LambdaFunctionName: this.lambdaFunctionName,
      },
    });
    this.dataCatalog = new CfnDataCatalog(this, "SnowflakeDataCatalog", {
      name: "snowflake",
      type: "LAMBDA",
      parameters: {
        "metadata-function": `arn:aws:lambda:${Aws.REGION}:${Aws.ACCOUNT_ID}:function:${this.lambdaFunctionName}`,
        "record-function": `arn:aws:lambda:${Aws.REGION}:${Aws.ACCOUNT_ID}:function:${this.lambdaFunctionName}`,
      },
    });

    this.workgroup = new CfnWorkGroup(this, "SnowflakeWorkGroup", {
      name: "snowflake-workgroup",
      workGroupConfiguration: {
        resultConfiguration: {
          outputLocation: this.s3UrlForObject(),
        },
        enforceWorkGroupConfiguration: false,
        publishCloudWatchMetricsEnabled: true,
        requesterPaysEnabled: false,
        engineVersion: {
          selectedEngineVersion: "AUTO",
          effectiveEngineVersion: "AUTO",
        },
      },
    });
  }

  arnForObjects(keyPattern: string) {
    return this.outputBucket.arnForObjects(`${this.outputLocation}/${keyPattern}`);
  }

  s3UrlForObject(key?: string) {
    return this.outputBucket.s3UrlForObject(`${this.outputLocation}${key != undefined ? "/" + key : ""}`);
  }

  grantReadWrite(identity: IGrantable, objectsKeyPattern?: any): Grant {
    return this.outputBucket.grantReadWrite(identity, objectsKeyPattern);
  }
}
