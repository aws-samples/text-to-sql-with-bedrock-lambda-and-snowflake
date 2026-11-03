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

import { App, Aspects } from "aws-cdk-lib";

import { TextToSqlWithLambdaAndSnowflakeStack } from "./stacks";
import { AwsSolutionsChecks } from "cdk-nag";
import { KeyPairAuthentication } from "./runtime/utils";

const app = new App();

new TextToSqlWithLambdaAndSnowflakeStack(app, "text-to-sql-with-lambda-and-snowflake", {
  aossCollectionName: "imdb",
  aossIndexName: "imdb-table-metadata",
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  snowflakeAccountId: "<YOUR_SNOWFLAKE_ACCOUNT_ID>",
  snowflakeDb: "IMDB",
  // Key-pair authentication is the default and recommended method. Snowflake doesn't allow password sign-in
  // for TYPE = SERVICE users. The second argument is "<secret-name>/<json-key>": the stack creates a
  // Secrets Manager secret with that name, and you store the private key in it under that key after deploying.
  snowflakeAuthentication: new KeyPairAuthentication("TEXT_TO_SQL_SVC", "text-to-sql-snowflake/privateKey"),
  // Or OAuth client credentials:
  // snowflakeAuthentication: new OAuthClientCredentialsAuthentication(
  //   username,
  //   "<secret-name>/<json-key>",
  //   tokenUrl,
  //   clientId,
  //   scope,
  // ),
  // UsernameAndPasswordAuthentication is deprecated and doesn't work for TYPE = SERVICE users.
  //
  // Optional. When omitted, Snowflake uses the user's default role.
  snowflakeRole: "TEXT_TO_SQL_ROLE",
  snowflakeSchema: "PUBLIC",
  snowflakeWarehouse: "TEST_WH",
  // Optional. Runs the Lambda functions in a VPC. See "Connect to Snowflake over AWS PrivateLink" in the README.
  // vpcConfig: {
  //   vpcId: "<YOUR_VPC_ID>",
  //   subnets: {
  //     subnetType: SubnetType.PRIVATE_WITH_EGRESS,
  //     onePerAz: true,
  //   },
  // },
  // Optional. Set to false (with vpcConfig) to allow OpenSearch Serverless access only through its VPC endpoint.
  // aossAllowPublicAccess: false,
});
Aspects.of(app).add(new AwsSolutionsChecks());
app.synth();
