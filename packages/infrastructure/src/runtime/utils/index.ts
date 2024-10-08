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

import { SQSEvent, SQSHandler } from "aws-lambda";
import { Callback, Context, Handler } from "aws-lambda/handler";

import { SQSBatchResponse } from "aws-lambda/trigger/sqs";
import { Aws, AwsApiCalls } from "./Aws";

import { OpenSearch, OpenSearchApiCalls, OpenSearchConfig } from "./OpenSearch";
import { Powertools } from "./Powertools";
import { Snowflake, SnowflakeApiCalls, SnowflakeAuthentication, SnowflakeConfig } from "./Snowflake";

export * from "./Aws";
export * from "./Powertools";
export * from "./Snowflake";

export interface BasicLambdaTools {
  aws: AwsApiCalls;
  powertools: Powertools;
  aoss: OpenSearchApiCalls;
  snowflake: SnowflakeApiCalls;
}

export interface BasicLambdaToolsConfig {
  awsConfig: { [key: string]: any | undefined };
  aossConfig: OpenSearchConfig;
  snowflakeConfig: SnowflakeConfig;
}

export function defaultBasicLambdaTools(
  powertools: Powertools,
  config: BasicLambdaToolsConfig = {
    awsConfig: {},
    aossConfig: {
      region: process.env.AOSS_REGION!,
      node: process.env.AOSS_NODE!,
      indexName: process.env.AOSS_INDEX_NAME!,
    },
    snowflakeConfig: {
      account: process.env.SNOWFLAKE_ACCOUNT!,
      database: process.env.SNOWFLAKE_DATABASE!,
      application: "Default",
      authentication: JSON.parse(process.env.SNOWFLAKE_AUTHENTICATION!) as SnowflakeAuthentication,
      warehouse: process.env.SNOWFLAKE_WAREHOUSE!,
      schema: process.env.SNOWFLAKE_SCHEMA!,
    },
  },
): BasicLambdaTools {
  return {
    aws: Aws.instance(config.awsConfig, powertools),
    powertools,
    aoss: OpenSearch.instance(config.aossConfig, Aws.instance(config, powertools), powertools),
    snowflake: Snowflake.instance(
      {
        ...config.snowflakeConfig,
        application: powertools.serviceName,
      },
      Aws.instance(config, powertools),
      powertools,
    ),
  };
}

export type LambdaHandler<TEvent = any, TResult = any> =
  Handler<TEvent, TResult> extends (event: TEvent, context: Context, callback: Callback<TResult>, tools: BasicLambdaTools) => infer R
    ? (event: TEvent, context: Context, callback: Callback<TResult>, tools: BasicLambdaTools) => R
    : never;

export type SQSLambdaHandler = SQSHandler extends (event: SQSEvent, context: Context, callback: Callback<SQSBatchResponse>, tools: BasicLambdaTools) => infer R
  ? (event: SQSEvent, context: Context, callback: Callback<SQSBatchResponse>, tools: BasicLambdaTools) => R
  : LambdaHandler;
