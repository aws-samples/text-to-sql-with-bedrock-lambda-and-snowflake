import { App } from "aws-cdk-lib";

import { TextToSqlWithAthenaAndSnowflakeStack } from "./stacks/TextToSqlWithAthenaAndSnowflakeStack";

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: "us-east-1",
};

const app = new App();

new TextToSqlWithAthenaAndSnowflakeStack(app, "text-to-sql-with-athena-and-snowflake", {
  env: devEnv,
  snowflakeUser: "awsgalen",
  snowflakeDb: "SNOWFLAKE_SAMPLE_DATA",
  snowflakeRole: "SYSADMIN",
  snowflakeAccountId: "otzhjhy-glb64226",
  snowflakeWarehouse: "TEST_WH",
  crawlerPath: "IMDB/%",
});

app.synth();
