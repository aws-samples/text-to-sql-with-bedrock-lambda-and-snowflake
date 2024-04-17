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

import * as path from "path";
import { Aws, Duration, RemovalPolicy } from "aws-cdk-lib";
import { Architecture, Code, Function, IFunction, Runtime } from "aws-cdk-lib/aws-lambda";

import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";

import { Construct, Dependable, IDependable } from "constructs";

import { Layers } from "./Layers";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { SnowflakeConnection } from "../stacks";
import { OpenSearchServerlessVectorStore } from "./OpenSearchServerlessVectorStore";

export interface LambdasConfig {
  layers: Layers;
  snowflakeConnection: SnowflakeConnection;
  snowFlakePasswordParameterName: string;
  vectorStore: OpenSearchServerlessVectorStore;
  indexName: string;
}

export class Lambdas extends Construct implements IDependable {
  readonly textToSql: IFunction;
  readonly indexTables: IFunction;

  constructor(scope: Construct, id: string, config: LambdasConfig) {
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
    const textToSqlFunctionLogGroup = new LogGroup(this, "TextToSqlFunctionLogGroup", {
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
      logGroupName: "/aws/lambda/TextToSqlFunction",
    });
    this.textToSql = new Function(this, "TextToSqlFunction", {
      functionName: "TextToSqlFunction",
      handler: "index.onEvent",
      code: Code.fromAsset(path.join(__dirname, "..", "..", "dist", "TextToSql.zip")),
      environment: {
        LOG_LEVEL: "DEBUG",
        SNOWFLAKE_ACCOUNT: config.snowflakeConnection.snowflakeAccountId,
        SNOWFLAKE_DATABASE: config.snowflakeConnection.snowflakeDb,
        SNOWFLAKE_USER: config.snowflakeConnection.snowflakeUser,
        SNOWFLAKE_WAREHOUSE: config.snowflakeConnection.snowflakeWarehouse,
        SNOWFLAKE_PASSWORD_PARAMETER_NAME: config.snowFlakePasswordParameterName,
        SNOWFLAKE_SCHEMA: config.snowflakeConnection.snowflakeSchema,
        AOSS_REGION: Aws.REGION,
        AOSS_NODE: config.vectorStore.collection.attrCollectionEndpoint,
        AOSS_INDEX_NAME: config.indexName,
      },
      memorySize: 256,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(30),
      runtime: Runtime.NODEJS_LATEST,
      logGroup: textToSqlFunctionLogGroup,
      layers: [config.layers.powerToolsLayer, config.layers.lambdasLayer],
      initialPolicy: [
        new PolicyStatement({
          actions: ["ssm:GetParameter"],
          effect: Effect.ALLOW,
          resources: [`arn:${Aws.PARTITION}:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:parameter${config.snowFlakePasswordParameterName}`],
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
      ],
    });
    const indexTablesFunctionLogGroup = new LogGroup(this, "IndexTablesFunctionLogGroup", {
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
      logGroupName: "/aws/lambda/IndexTablesFunction",
    });
    this.indexTables = new Function(this, "IndexTablesFunction", {
      functionName: "IndexTablesFunction",
      handler: "index.onEvent",
      code: Code.fromAsset(path.join(__dirname, "..", "..", "dist", "IndexTables.zip")),
      environment: {
        LOG_LEVEL: "DEBUG",
        SNOWFLAKE_ACCOUNT: config.snowflakeConnection.snowflakeAccountId,
        SNOWFLAKE_DATABASE: config.snowflakeConnection.snowflakeDb,
        SNOWFLAKE_USER: config.snowflakeConnection.snowflakeUser,
        SNOWFLAKE_WAREHOUSE: config.snowflakeConnection.snowflakeWarehouse,
        SNOWFLAKE_PASSWORD_PARAMETER_NAME: config.snowFlakePasswordParameterName,
        SNOWFLAKE_SCHEMA: config.snowflakeConnection.snowflakeSchema,
        AOSS_REGION: Aws.REGION,
        AOSS_NODE: config.vectorStore.collection.attrCollectionEndpoint,
        AOSS_INDEX_NAME: config.indexName,
      },
      memorySize: 256,
      architecture: Architecture.ARM_64,
      timeout: Duration.minutes(15),
      runtime: Runtime.NODEJS_LATEST,
      logGroup: indexTablesFunctionLogGroup,
      layers: [config.layers.powerToolsLayer, config.layers.lambdasLayer],
      initialPolicy: [
        new PolicyStatement({
          actions: ["ssm:GetParameter"],
          effect: Effect.ALLOW,
          resources: [`arn:${Aws.PARTITION}:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:parameter${config.snowFlakePasswordParameterName}`],
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
      ],
    });
    config.vectorStore.grantFullDataAccess("index-table-function", this.indexTables.role!);
    config.vectorStore.grantFullDataAccess("text-to-sql-function", this.textToSql.role!);
  }
}
