import { App } from "aws-cdk-lib";

import { TextToSqlWithAthenaAndSnowflakeStack } from "./stacks/TextToSqlWithAthenaAndSnowflakeStack";

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new TextToSqlWithAthenaAndSnowflakeStack(app, "text-to-sql-with-athena-and-snowflake", {
  env: devEnv,
  connectionString:"snowflake://jdbc:snowflake://otzhjhy-glb64226.snowflakecomputing.com:443?db=SNOWFLAKE_SAMPLE_DATA"
});
// new MyStack(app, 'ms-dynamics-365-changes-events-prod', { env: prodEnv });

app.synth();
