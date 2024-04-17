# text-to-sql-with-bedrock-lambda-and-snowflake
This CDK project provide and example of using Bedrock with Lambda to interface directly with a Snowflake DB using a natural language interface

## Architecture

![architecture.drawio.png](images%2Farchitecture.drawio.png)

This architecture uses the following services

* [Amazon Bedrock](https://aws.amazon.com/bedrock/) - The example leverages the [Amazon Titan Embedding G1 - Text Model](https://docs.aws.amazon.com/bedrock/latest/userguide/titan-embedding-models.html) to generate vector representations of Snowflake table metadata and [Anthropic Claude 3 Haiku](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages.html) to generate SQL via Amazon Bedrock API.
* [Vector Engine for Amazon OpenSearch Serverless](https://aws.amazon.com/opensearch-service/serverless-vector-engine/) - The example stores the vector representations of Snowflake table metadata in an Amazon Opensearch vector search collection.
* [AWS Lambda](https://aws.amazon.com/lambda/) - The example use two AWS Lambda functions
  * [IndexTablesFunction](packages%2Finfrastructure%2Fsrc%2Fruntime%2Fhandlers%2FIndexTables.ts) - This function queries Snowflake for table metadata, turns that metadata into vector representations using Bedrock and the stores those representations in OpenSearch
  * [TextToSqlFunction](packages%2Finfrastructure%2Fsrc%2Fruntime%2Fhandlers%2FTextToSql.ts) - This function take a natural language query, does a similarity search on the vectorized table metadata stored in opensearch. Then using the returned metadata along with the human query is prompted to generate a SQL statement that is then executed against the Snowflake database and the results are returned.


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