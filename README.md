# text-to-sql-with-athena-and-snowflake

# Deploy

* `pnpm install`
* Edit the 'connectionString' parameter in [main.ts](packages%2Finfrastructure%2Fsrc%2Fmain.ts)
* `projen deploy`
* Post deployment, go to secrets manager in the AWS Console and input your Snowflake username and password into the AthenaJdbcFederation/text-to-sql-with-athena-and-snowflake/snowflake secret.