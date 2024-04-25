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
  * aossCollectionName - The name of the Amazon OpenSearch Serverless Collection
  * aossIndexName - The name of the OpenSearch index which will store the vectorized snowflake metadata
  * env: 
    * account - Aws account id to deploy to 
    * region - Aws region to deploy to
  * snowflakeAccountId - The snowflake account id (i.e. "\<organization>-\<account>")
  * snowflakeDb - The snowflake database to use
  * snowflakeAuthentication - One of the allowed [authentication types](packages%2Finfrastructure%2Fsrc%2Fruntime%2Futils%2FSnowflake.ts#L94). For more information see [Snowflake Authentication Methods](#Snowflake-Authentication-Methods)
  * snowflakeRole - The snowflake role used to access the snowflake database
  * snowflakeSchema - The snowflake schema to use
  * snowflakeWarehouse - The snowflake warehouse to use
* `pnpm run deploy`
* Post deployment, go to SSM parameter store in the AWS Console and input your Snowflake password into the parameter configured in your snowflakeAuthentication settings.
* Invoke the "IndexTablesFunction" to index the table metadata
* Invoke the "TextToSqlFunction" with the following payload
```json
{
  "human": "Ask your snowflake data a natural language question here"
} 
```

### Snowflake Authentication Methods

The example provides three different ways to authenticate to Snowflake. 

* [UsernameAndPasswordAuthentication](packages%2Finfrastructure%2Fsrc%2Fruntime%2Futils%2FSnowflake.ts#L54) - Uses native Snowflake username and password authentication.
  * username - The Snowflake username
  * parameterName - The name of the SSM Parameter store parameter where the Snowflake password is stored as a secure string
* [KeyPairAuthentication](packages%2Finfrastructure%2Fsrc%2Fruntime%2Futils%2FSnowflake.ts#L67) - Uses snowflake key-pair authentication. Private key is stored in SSM Parameter Store as a SecureString. See ["Using key-pair authentication and key-pair rotation"](https://docs.snowflake.com/en/developer-guide/node-js/nodejs-driver-authenticate#using-key-pair-authentication-and-key-pair-rotation) in the Snowflake docs for more information.
  * username - The Snowflake username
  * parameterName - The name of the SSM Parameter store parameter where the private key is stored as a secure string
* [OAuthClientCredentialsAuthentication](packages%2Finfrastructure%2Fsrc%2Fruntime%2Futils%2FSnowflake.ts#L80) - Uses snowflake external OAuth authentication with Client Credentials flow. Client secret is stored in SSM Parameter Store as a SecureString. See ["Using OAuth"](https://docs.snowflake.com/en/developer-guide/node-js/nodejs-driver-authenticate#using-oauth) in the Snowflake docs for more information.
  * username - The Snowflake username
  * parameterName - The name of the SSM Parameter store parameter where the OAuth client secret is stored as a secure string
  * tokenUrl - The url to exchange client credentials for an OAuth token
  * clientId - The OAuth client id
  * scope - The OAuth scope