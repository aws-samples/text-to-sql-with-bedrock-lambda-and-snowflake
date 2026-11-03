# text-to-sql-with-bedrock-lambda-and-snowflake
This CDK project provide and example of using Bedrock with Lambda to interface directly with a Snowflake DB using a natural language interface

## Architecture

![architecture.drawio.png](images%2Farchitecture.drawio.png)
![text-to-sql-for-snowflake.drawio.png](images%2Ftext-to-sql-for-snowflake.drawio.png)
This architecture uses the following services

* [Amazon Bedrock](https://aws.amazon.com/bedrock/) - The example uses [Amazon Nova Multimodal Embeddings](https://docs.aws.amazon.com/nova/latest/nova2-userguide/embeddings.html) (`amazon.nova-2-multimodal-embeddings-v1:0`, 1024 dimensions) to generate vector representations of Snowflake table metadata, and [Anthropic Claude Haiku 5.5](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages.html) to generate SQL via the Amazon Bedrock API. Haiku 5.5 is called through the `us.anthropic.claude-haiku-5-5` [cross-Region inference profile](https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html), so the stack must be deployed to a US Region.
* [Vector Engine for Amazon OpenSearch Serverless](https://aws.amazon.com/opensearch-service/serverless-vector-engine/) - The example stores the vector representations of Snowflake table metadata in an Amazon Opensearch vector search collection.
* [AWS Lambda](https://aws.amazon.com/lambda/) - The example use two AWS Lambda functions
  * [IndexTablesFunction](packages%2Finfrastructure%2Fsrc%2Fruntime%2Fhandlers%2FIndexTables.ts) - This function queries Snowflake for table metadata, turns that metadata into vector representations using Bedrock and the stores those representations in OpenSearch
  * [TextToSqlFunction](packages%2Finfrastructure%2Fsrc%2Fruntime%2Fhandlers%2FTextToSql.ts) - This function take a natural language query, does a similarity search on the vectorized table metadata stored in opensearch. Then using the returned metadata along with the human query is prompted to generate a SQL statement that is then executed against the Snowflake database and the results are returned.
* [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/) - The example stores the Snowflake credential (by default, a key-pair private key) in a Secrets Manager secret that the stack creates.



## Prerequisites

* A Snowflake account
* [pnpm installed](https://pnpm.io/installation)
* An AWS account
  * [CDK bootstrapped in the account](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html)
  * [Access to Claude Haiku 5.5 and Amazon Nova Multimodal Embeddings in Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html). For Anthropic models, complete the first-time use form, then invoke Claude Haiku 5.5 once from the Bedrock console playground before you deploy. The first call to a third-party model starts its AWS Marketplace subscription, and the Lambda roles in this stack don't have Marketplace permissions.
  * If you are upgrading an existing deployment that indexed tables with Titan embeddings (1536 dimensions), delete the OpenSearch index named by `aossIndexName` (or choose a new name) and run the IndexTablesFunction again. The index is created at 1024 dimensions the first time documents are written to it.
* [AWS account credentials available on the command line](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-authentication.html) 
* `openssl` and [`jq`](https://jqlang.org/) (1.6 or later) to create and store the Snowflake key pair

## Deployment

1. Set up a Snowflake service user with key-pair authentication. See [Snowflake setup](#snowflake-setup).
2. `pnpm install`
3. `pnpm run default`
4. Edit the parameters in [main.ts](packages%2Finfrastructure%2Fsrc%2Fmain.ts)
   * aossCollectionName - The name of the Amazon OpenSearch Serverless Collection
   * aossIndexName - The name of the OpenSearch index which will store the vectorized snowflake metadata
   * env: 
     * account - Aws account id to deploy to 
     * region - Aws region to deploy to
   * snowflakeAccountId - The snowflake account identifier (i.e. "\<organization>-\<account>")
   * snowflakeDb - The snowflake database to use
   * snowflakeAuthentication - One of the [authentication types](packages%2Finfrastructure%2Fsrc%2Fruntime%2Futils%2FSnowflake.ts). `KeyPairAuthentication` is the default. For more information see [Snowflake Authentication Methods](#snowflake-authentication-methods)
   * snowflakeRole - [Optional] The snowflake role the Lambda functions use. If not set, Snowflake uses the user's default role
   * snowflakeSchema - The snowflake schema to use
   * snowflakeWarehouse - The snowflake warehouse to use
   * snowflakePrivateLinkConfig - [Optional] Configures the example to use AWS PrivateLink to connect to Snowflake. See [Connect to Snowflake over AWS PrivateLink](#connect-to-snowflake-over-aws-privatelink) for more information.
   * vpcConfig - [Optional] Configures the lambdas to use a vpc
     * vpcId - [Optional] The id of an existing VPC to deploy to. If not specified a new vpc will be created
     * subnets - [Optional] A subnet selection to determine what subnets the lambdas will be deployed in. If not specified defaults to PRIVATE_ISOLATED.
   * aossAllowPublicAccess - [Optional] Defaults to `true`. Set to `false` (with `vpcConfig`) to allow access to the OpenSearch Serverless collection only through its VPC endpoint. See [Security considerations](#security-considerations).
5. `pnpm run deploy`
6. Store the Snowflake private key in the Secrets Manager secret the stack created. See [Store the Snowflake credential](#store-the-snowflake-credential).
7. Invoke the "IndexTablesFunction" to index the table metadata. See [Invoke the functions](#invoke-the-functions).
8. Invoke the "TextToSqlFunction" with the following payload
```json
{
  "human": "Ask your snowflake data a natural language question here"
} 
```

### Snowflake setup

Snowflake doesn't allow password sign-in for `TYPE = SERVICE` users, and has [deprecated single-factor password sign-in](https://docs.snowflake.com/en/user-guide/security-mfa-rollout) for all users. The Lambda functions can't answer an MFA prompt, so use [key-pair authentication](https://docs.snowflake.com/en/user-guide/key-pair-auth) with a service user.

1. Generate an unencrypted PKCS#8 key pair. The `key-pair` directory is in `.gitignore`.
   ```bash
   mkdir -p key-pair
   openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out key-pair/snowflake.p8 -nocrypt
   openssl rsa -in key-pair/snowflake.p8 -pubout -out key-pair/snowflake.pub
   ```
2. Print the public key as a single line, without the `BEGIN` and `END` lines:
   ```bash
   grep -v "PUBLIC KEY" key-pair/snowflake.pub | tr -d '\n'
   ```
3. In Snowflake, create a role that can only read the data, and a service user with that role and the public key. Run this as a role that can create users and roles and manage grants, such as `SECURITYADMIN`. Replace the warehouse, database and schema names with yours.
   ```sql
   CREATE ROLE IF NOT EXISTS TEXT_TO_SQL_ROLE;
   GRANT USAGE ON WAREHOUSE TEST_WH TO ROLE TEXT_TO_SQL_ROLE;
   GRANT USAGE ON DATABASE IMDB TO ROLE TEXT_TO_SQL_ROLE;
   GRANT USAGE ON SCHEMA IMDB.PUBLIC TO ROLE TEXT_TO_SQL_ROLE;
   GRANT SELECT ON ALL TABLES IN SCHEMA IMDB.PUBLIC TO ROLE TEXT_TO_SQL_ROLE;
   GRANT SELECT ON FUTURE TABLES IN SCHEMA IMDB.PUBLIC TO ROLE TEXT_TO_SQL_ROLE;

   CREATE USER IF NOT EXISTS TEXT_TO_SQL_SVC
     TYPE = SERVICE
     DEFAULT_ROLE = TEXT_TO_SQL_ROLE
     DEFAULT_WAREHOUSE = TEST_WH;
   ALTER USER TEXT_TO_SQL_SVC SET RSA_PUBLIC_KEY = '<public key from step 2>';
   GRANT ROLE TEXT_TO_SQL_ROLE TO USER TEXT_TO_SQL_SVC;
   ```
   To try the example on the Snowflake sample data instead (for example `snowflakeDb: "SNOWFLAKE_SAMPLE_DATA"` and `snowflakeSchema: "TPCH_SF1"`), replace the database, schema and table grants with `GRANT IMPORTED PRIVILEGES ON DATABASE SNOWFLAKE_SAMPLE_DATA TO ROLE TEXT_TO_SQL_ROLE;`.
4. In [main.ts](packages%2Finfrastructure%2Fsrc%2Fmain.ts), set the user name in `KeyPairAuthentication` and set `snowflakeRole` to the role.

### Store the Snowflake credential

The stack creates an AWS Secrets Manager secret (not an SSM parameter) for the Snowflake credential. The second argument of each authentication type is `"<secret-name>/<json-key>"`: the secret is named `<secret-name>`, and the functions read the credential from the `<json-key>` field of the secret's JSON value. With the default in `main.ts` (`"text-to-sql-snowflake/privateKey"`), the secret is named `text-to-sql-snowflake` and its value is a JSON object with one field, `privateKey`, whose value is the contents of `key-pair/snowflake.p8`.

The stack outputs the secret's name (`SnowflakeAuthenticationSecretName`) and ARN (`SnowflakeAuthenticationSecretArn`). When the stack is first deployed, the field holds a random placeholder value, so the functions can't connect until you replace it. Store the whole PEM file, including its first and last lines and its newlines. `jq` escapes the newlines into the JSON string for you:

```bash
aws secretsmanager put-secret-value \
  --secret-id text-to-sql-snowflake \
  --secret-string "$(jq -n --rawfile pem key-pair/snowflake.p8 '{privateKey: $pem}')"
```

Delete the local `key-pair/snowflake.p8` file when you no longer need it.

### Invoke the functions

The functions are invoked directly (there is no API Gateway or function URL). The AWS CLI stops waiting for a response after 60 seconds by default and then retries the call, which runs the function again. Both functions can take longer than that, so raise the CLI read timeout:

```bash
aws lambda invoke --function-name IndexTablesFunction \
  --cli-read-timeout 300 \
  --cli-binary-format raw-in-base64-out --payload '{}' index-tables.json

aws lambda invoke --function-name TextToSqlFunction \
  --cli-read-timeout 120 \
  --cli-binary-format raw-in-base64-out \
  --payload '{"human": "Which 5 customers placed the most orders?"}' text-to-sql.json
```

* **TextToSqlFunction timeout.** The function has a 90 second timeout. A question takes about 20 seconds end to end, and a suspended Snowflake warehouse adds time to resume. If you put an Amazon API Gateway REST API in front of it, note that REST API integrations time out after 29 seconds by default.
* **Index readiness.** OpenSearch Serverless makes new documents searchable about a minute after they are written. Until then the TextToSqlFunction finds no table metadata and returns `{"results":"nothing"}`. After indexing, the IndexTablesFunction runs a test search every 10 seconds, for up to 2 minutes, and returns once the tables are searchable. If it logs `Indexed tables are not searchable yet`, wait a minute before asking a question.
* **Re-indexing.** Each run of the IndexTablesFunction adds the table metadata to the index again. To re-index from scratch, delete the index (or choose a new `aossIndexName`) first.

### Snowflake Authentication Methods

The example provides three different ways to authenticate to Snowflake. For each one, `parameterName` is `"<secret-name>/<json-key>"`, as described in [Store the Snowflake credential](#store-the-snowflake-credential).

* [KeyPairAuthentication](packages%2Finfrastructure%2Fsrc%2Fruntime%2Futils%2FSnowflake.ts) - (Default, recommended) Uses Snowflake key-pair authentication. This is the only method that works for `TYPE = SERVICE` users. See ["Using key-pair authentication and key-pair rotation"](https://docs.snowflake.com/en/developer-guide/node-js/nodejs-driver-authenticate#using-key-pair-authentication-and-key-pair-rotation) in the Snowflake docs for more information.
  * username - The Snowflake username
  * parameterName - The secret name and JSON key where the PEM-encoded, unencrypted private key is stored
* [OAuthClientCredentialsAuthentication](packages%2Finfrastructure%2Fsrc%2Fruntime%2Futils%2FSnowflake.ts) - Uses Snowflake external OAuth authentication with Client Credentials flow. See ["Using OAuth"](https://docs.snowflake.com/en/developer-guide/node-js/nodejs-driver-authenticate#using-oauth) in the Snowflake docs for more information.
  * username - The Snowflake username
  * parameterName - The secret name and JSON key where the OAuth client secret is stored
  * tokenUrl - The url to exchange client credentials for an OAuth token
  * clientId - The OAuth client id
  * scope - The OAuth scope
* [UsernameAndPasswordAuthentication](packages%2Finfrastructure%2Fsrc%2Fruntime%2Futils%2FSnowflake.ts) - **Deprecated.** Uses native Snowflake username and password authentication. Snowflake doesn't allow password sign-in for `TYPE = SERVICE` users and has [deprecated single-factor password sign-in](https://docs.snowflake.com/en/user-guide/security-mfa-rollout) for other users, so this method doesn't work for most accounts. It is kept so existing code still compiles, and logs a warning when used.
  * username - The Snowflake username
  * parameterName - The secret name and JSON key where the Snowflake password is stored

### Connect to Snowflake over AWS PrivateLink

It is possible to connect to Snowflake without traversing the public internet by using [AWS PrivateLink](https://docs.aws.amazon.com/vpc/latest/privatelink/what-is-privatelink.html).
To use AWS PrivateLink in this example you must first [enable AWS PrivateLink for your Snowflake account](https://docs.snowflake.com/en/user-guide/admin-security-privatelink).
Once enabled retrieve the `privatelink-vpce-id` value returned by the [SYSTEM$GET_PRIVATELINK_CONFIG](https://docs.snowflake.com/en/sql-reference/functions/system_get_privatelink_config) function.
Configure the `snowflakePrivateLinkConfig` parameter in [main.ts](packages%2Finfrastructure%2Fsrc%2Fmain.ts).

```javascript
new TextToSqlWithLambdaAndSnowflakeStack(app, "text-to-sql-with-lambda-and-snowflake", {
    ...
    snowflakePrivateLinkConfig: {
      vpceId: "<privatelink-vpce-id>"
    }
    ...
}
```

## Security considerations

* **OpenSearch Serverless network access.** By default the collection's network policy allows access from the public internet. Every request must still be signed with AWS credentials (SigV4), and the collection's data access policies allow only the two Lambda function roles. To allow access only from your VPC, set `vpcConfig` and `aossAllowPublicAccess: false`. The stack then creates an OpenSearch Serverless VPC endpoint, and the network policy allows only that endpoint. The OpenSearch Dashboards and console views of the collection are then reachable only from the VPC. In a VPC, the Lambda functions also need a route to Snowflake (AWS PrivateLink, which needs a Snowflake edition that supports it, or a NAT gateway) and to AWS Secrets Manager (a NAT gateway, or a Secrets Manager interface endpoint, which this stack doesn't create).
* **Credentials in logs.** The functions log only non-secret connection fields (account, user, role, warehouse, database, schema). Don't add logging of the connection options or the secret value. Earlier versions of this example logged the full Snowflake connection options, including the private key, password or OAuth token, at INFO level. If you deployed an earlier version, rotate the Snowflake credential and delete the log streams in the `/aws/lambda/TextToSqlFunction` and `/aws/lambda/IndexTablesFunction` log groups.
* **Other log contents.** The functions run with `LOG_LEVEL: DEBUG` and `SNOWFLAKE_LOG_LEVEL: TRACE`, so the logs contain the questions, the generated SQL, the model responses and Snowflake driver traces. The Snowflake driver masks secrets in its own logs. Lower these levels in [Lambdas.ts](packages%2Finfrastructure%2Fsrc%2Fconstructs%2FLambdas.ts) if the data is sensitive.
* **Generated SQL runs as-is.** The prompt asks the model for read-only SQL, but that is not a security control. Give `snowflakeRole` only `USAGE` and `SELECT` grants, as in [Snowflake setup](#snowflake-setup).
