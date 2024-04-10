import { RemovalPolicy, SecretValue, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { AthenaSnowflakeDataSource } from "../constructs/AthenaSnowflakeDataSource";
import { GlueSnowflakeCrawler } from "../constructs/GlueSnowflakeCrawler";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { OpenSearchServerlessVectorStore } from "../constructs/OpenSearchServerlessVectorStore";
import { SageMakerNotebook } from "../constructs/SageMakerNotebook";
import { BlockPublicAccess, Bucket } from "aws-cdk-lib/aws-s3";

export interface SnowflakeConnection {
  snowflakeAccountId: string;
  snowflakeDb: string;
  snowflakeRole: string;
  snowflakeUser: string;
  snowflakeWarehouse: string;
  /**
   * By default, the Glue crawler will crawl all tables un the snowflakeDb.
   * You can use this parameter to override that and be more selective.
   * Should be in the format 'MyDatabase/MySchema/MyTable'. You can also use '%' as a wildcard
   * for example 'MyDatabase/MySchema/%' will crawl all tables under MySchema
   */
  crawlerPath?: string;
}

export interface TextToSqlWithAthenaAndSnowflakeStackProps extends StackProps, SnowflakeConnection {}

export class TextToSqlWithAthenaAndSnowflakeStack extends Stack {
  constructor(scope: Construct, id: string, props: TextToSqlWithAthenaAndSnowflakeStackProps) {
    super(scope, id, props);
    const assetBucket = new Bucket(this, "AssetBucket", {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });
    const secret = new Secret(this, "SnowflakeCredentials", {
      secretName: `AthenaJdbcFederation/${Stack.of(this).stackName}/snowflake`,
      removalPolicy: RemovalPolicy.DESTROY,
      description: "Credentials for snowflake",
      secretObjectValue: {
        username: SecretValue.unsafePlainText(props.snowflakeUser),
        password: SecretValue.unsafePlainText("REPLACE ME AFTER DEPLOYMENT"),
      },
    });

    new AthenaSnowflakeDataSource(this, "SnowflakeDataSource", props);

    const crawler = new GlueSnowflakeCrawler(this, "GlueSnowflakeCrawler", {
      assetBucket,
      secret: secret,
      ...props,
    });
    const vectorStore = new OpenSearchServerlessVectorStore(this, "VectorStore", "knowledge-base", "Knowledge base in text-to-sql RAG framework");

    new SageMakerNotebook(this, "SageMakerNotebook", {
      assetBucket,
      database: crawler.database,
      vectorStore: vectorStore,
    });
  }
}
