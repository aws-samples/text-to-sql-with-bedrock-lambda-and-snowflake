# text-to-sql-with-athena-and-snowflake

# Deploy

## text-to-sql-with-lambda-and-snowflake-stack

* `pnpm install`
* `pnpm run default`
* Edit the parameters in [main.ts](packages%2Finfrastructure%2Fsrc%2Fmain.ts)
  * snowflakeUser
  * snowflakeDb
  * snowflakeRole
  * snowflakeAccountId: 
  * snowflakeWarehouse
* `pnpm run deploy`
* Post deployment, go to SSM parameter store in the AWS Console and input your Snowflake password into the /text-to-sql-with-lambda-and-snowflake/password parameters.
* Invoke the "IndexTablesFunction" to index the table metadata
* Invoke the "TextToSqlFunction" with the following payload
```json
{
  "human": "show me all non-adult movie titles from 1980"
} 
```