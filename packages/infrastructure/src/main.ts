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
import { OAuthClientCredentialsAuthentication } from "./runtime/utils";

const app = new App();

new TextToSqlWithLambdaAndSnowflakeStack(app, "text-to-sql-with-lambda-and-snowflake", {
  aossCollectionName: "imdb",
  aossIndexName: "imdb-table-metadata",
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "us-east-1",
  },
  snowflakeAccountId: "otzhjhy-glb64226",
  snowflakeDb: "IMDB",
  // snowflakeAuthentication: new KeyPairAuthentication("84646402-7404-4831-9a71-a4b44dbcecdd", "/text-to-sql-with-lambda-and-snowflake/password"),
  snowflakeAuthentication: new OAuthClientCredentialsAuthentication(
    "84646402-7404-4831-9a71-a4b44dbcecdd",
    "/text-to-sql-with-lambda-and-snowflake/client-credentials",
    "https://login.microsoftonline.com/4b35c00f-2bc0-4f69-b529-56debf3e163d/oauth2/v2.0/token",
    "99291312-a9a0-4ab7-b156-5b3e538f8c2d",
    "https://otzhjhy-glb64226.snowflakecomputing.com/.default",
  ),
  snowflakeRole: "SYSADMIN",
  snowflakeSchema: "PUBLIC",
  snowflakeUser: "developer",
  snowflakeWarehouse: "TEST_WH",
});
Aspects.of(app).add(new AwsSolutionsChecks());
app.synth();
