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
import { UsernameAndPasswordAuthentication } from "./runtime/utils";
import { SubnetType } from "aws-cdk-lib/aws-ec2";

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
  //use one of the following authentication methods for Snowflake
  // snowflakeAuthentication: new KeyPairAuthentication(username, ssm_parameter_name_with_private_key),
  // snowflakeAuthentication: new OAuthClientCredentialsAuthentication(
  //   username,
  //   ssm_parameter_name_with_client_credentials,
  //   tokenUrl,
  //   clientId,
  //   scope,
  // ),
  snowflakeAuthentication: new UsernameAndPasswordAuthentication("username", "ssm_parameter_name_with_user_password"),
  snowflakeRole: "SYSADMIN",
  snowflakeSchema: "PUBLIC",
  snowflakeWarehouse: "TEST_WH",
  vpcConfig: {
    vpcId: "privatelink-vpce-id",
    subnets: {
      subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      onePerAz: true,
    },
  },
});
Aspects.of(app).add(new AwsSolutionsChecks());
app.synth();
