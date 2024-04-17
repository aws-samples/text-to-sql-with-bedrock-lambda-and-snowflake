# text-to-sql-with-bedrock-lambda-and-snowflake
The project provide and example of using Bedrock with Lambda to interface directly with a Snowflake DB using a natural language interface

## Prerequisites

* A Snowflake account
* [pnpm installed](https://pnpm.io/installation)
* An AWS account
  * [CDK bootstrapped in the account](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html)
  * [Anthropic and Titan models enabled for Bedrock in the account](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html)
* [AWS account credentials available on the command line](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-authentication.html) 

## Deployment

* `pnpm install`
* `pnpm run default`
* Edit the parameters in [main.ts](packages%2Finfrastructure%2Fsrc%2Fmain.ts)
  * aossCollectionName
  * aossIndexName
  * env: 
    * account
    * region
  * snowflakeAccountId
  * snowflakeDb
  * snowflakeRole
  * snowflakeSchema
  * snowflakeUser
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