import { Construct, Dependable, IDependable } from "constructs";
import { CfnNotebookInstance, CfnNotebookInstanceLifecycleConfig } from "aws-cdk-lib/aws-sagemaker";
import { Effect, ManagedPolicy, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import { Bucket } from "aws-cdk-lib/aws-s3";
import path from "node:path";
import { Aws, Fn } from "aws-cdk-lib";
import { CfnDatabase } from "aws-cdk-lib/aws-glue";
import { OpenSearchServerlessVectorStore } from "./OpenSearchServerlessVectorStore";
import { AthenaSnowflakeDataSource } from "./AthenaSnowflakeDataSource";

export interface SageMakerNotebookConfig {
  assetBucket: Bucket;
  database: CfnDatabase;
  vectorStore: OpenSearchServerlessVectorStore;
  athenaSnowflakeDataSource: AthenaSnowflakeDataSource;
}

export class SageMakerNotebook extends Construct implements IDependable {
  readonly role: Role;

  constructor(scope: Construct, id: string, config: SageMakerNotebookConfig) {
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

    const notebooks = new BucketDeployment(this, "Notebooks", {
      destinationBucket: config.assetBucket,
      extract: true,
      retainOnDelete: true,
      destinationKeyPrefix: "notebooks",
      sources: [Source.asset(path.join(__dirname, "..", "notebooks"))],
    });
    this.role = new Role(this, "NotebookRole", {
      assumedBy: new ServicePrincipal("sagemaker.amazonaws.com"),
      managedPolicies: [ManagedPolicy.fromManagedPolicyArn(this, "AmazonSageMakerFullAccess", "arn:aws:iam::aws:policy/AmazonSageMakerFullAccess")],
      inlinePolicies: {
        "0": new PolicyDocument({
          statements: [
            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: ["glue:GetTables", "glue:GetDatabase"],
              resources: [`arn:${Aws.PARTITION}:glue:${Aws.REGION}:${Aws.ACCOUNT_ID}:database/${config.database.ref}`],
            }),

            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: ["bedrock:InvokeModel"],
              resources: [
                `arn:${Aws.PARTITION}:bedrock:${Aws.REGION}::foundation-model/amazon.titan-embed-text-v1`,
                `arn:${Aws.PARTITION}:bedrock:${Aws.REGION}::foundation-model/anthropic.*`,
              ],
            }),
            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: ["aoss:APIAccessAll"],
              resources: [`${config.vectorStore.collection.attrArn}`],
            }),
            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: ["aoss:ListCollections"],
              resources: ["*"],
            }),

            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: ["aoss:ListCollections"],
              resources: ["*"],
            }),
            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: ["athena:*Query*"],
              resources: [`arn:${Aws.PARTITION}:athena:${Aws.REGION}:${Aws.ACCOUNT_ID}:workgroup/${config.athenaSnowflakeDataSource.workgroup.name}`],
            }),
            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: ["athena:GetDataCatalog"],
              resources: [`arn:${Aws.PARTITION}:athena:${Aws.REGION}:${Aws.ACCOUNT_ID}:datacatalog/${config.database.ref}`],
            }),
            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: ["lambda:InvokeFunction"],
              resources: [`arn:${Aws.PARTITION}:lambda:${Aws.REGION}:${Aws.ACCOUNT_ID}:function:${config.athenaSnowflakeDataSource.lambdaFunctionName}`],
            }),
            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: ["s3:ListBucket"],
              resources: [`${config.assetBucket.bucketArn}`],
            }),
            new PolicyStatement({
              effect: Effect.ALLOW,
              actions: ["s3:GetObject", "s3:PutObject"],
              resources: [`${config.athenaSnowflakeDataSource.arnForObjects("*")}`],
            }),
          ],
        }),
      },
    });

    config.vectorStore.grantFullDataAccess("notebook-access-policy", this.role);
    config.athenaSnowflakeDataSource.grantReadWrite(this.role);

    const downloadFiles = Fn.base64(`cd /home/ec2-user/SageMaker/ && aws s3 sync ${notebooks.deployedBucket.s3UrlForObject()}/notebooks .`);
    const lifecycleConfig = new CfnNotebookInstanceLifecycleConfig(this, "NotebookInstanceLifecycleConfig", {
      notebookInstanceLifecycleConfigName: "snowflake-text-to-sql-notebook-lifecycle",
      onStart: [
        {
          content: downloadFiles,
        },
      ],
    });
    const notebookInstance = new CfnNotebookInstance(this, "NotebookInstance", {
      roleArn: this.role.roleArn,
      instanceType: "ml.t3.medium",
      notebookInstanceName: "snowflake-text-to-sql-notebook",
      directInternetAccess: "Enabled",
      rootAccess: "Enabled",
      volumeSizeInGb: 5,
      platformIdentifier: "notebook-al2-v2",
      lifecycleConfigName: lifecycleConfig.attrNotebookInstanceLifecycleConfigName,
    });

    notebookInstance.node.addDependency(this.role);
  }
}
