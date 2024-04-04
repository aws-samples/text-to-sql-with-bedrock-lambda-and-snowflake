import {Construct} from "constructs";

import {BlockPublicAccess, Bucket} from "aws-cdk-lib/aws-s3";
import {Aws, RemovalPolicy, SecretValue, Stack} from "aws-cdk-lib";
import {Secret} from "aws-cdk-lib/aws-secretsmanager";
import {CfnApplication} from "aws-cdk-lib/aws-sam";
import {CfnDataCatalog} from "aws-cdk-lib/aws-athena";


export interface AthenaSnowflakeDataSourceConfig {
	connectionString: string,
}

export class AthenaSnowflakeDataSource extends Construct {

	constructor(scope: Construct, id: string, config: AthenaSnowflakeDataSourceConfig) {
		super(scope, id);
		new Secret(this, 'SnowflakeCredentials', {
			secretName: `AthenaJdbcFederation/${Stack.of(this).stackName}/snowflake`,
			removalPolicy: RemovalPolicy.DESTROY,
			description: 'Credentials for snowflake',
			secretObjectValue: {
				username: SecretValue.unsafePlainText('REPLACE ME AFTER DEPLOYMENT'),
				password: SecretValue.unsafePlainText('REPLACE ME AFTER DEPLOYMENT'),
			},
		});
		const spillBucket = new Bucket(this, "LambdaSpillBucket", {
			removalPolicy: RemovalPolicy.DESTROY,
			blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
			enforceSSL: true
		})
		const lambdaFunctionName = "athena-snowflake-connector-fn"
		new CfnApplication(this, "AthenaSnowflakeConnector", {
			location: {
				applicationId: "arn:aws:serverlessrepo:us-east-1:292517598671:applications/AthenaSnowflakeConnector",
				semanticVersion: "2024.10.1"
			},
			parameters: {
				"SecretNamePrefix": "AthenaJdbcFederation/",
				"DefaultConnectionString": `${config.connectionString}&\${AthenaJdbcFederation/${Stack.of(this).stackName}/snowflake}`,
				"SpillBucket": spillBucket.bucketName,
				"LambdaFunctionName": lambdaFunctionName
			}
		})
		new CfnDataCatalog(this, "SnowflakeDataCatalog", {
			name: "snowflake",
			type: "LAMBDA",
			parameters: {
				"metadata-function": `arn:aws:lambda:${Aws.REGION}:${Aws.ACCOUNT_ID}:function:${lambdaFunctionName}`,
				"record-function": `arn:aws:lambda:${Aws.REGION}:${Aws.ACCOUNT_ID}:function:${lambdaFunctionName}`
			}
		})


	}
}