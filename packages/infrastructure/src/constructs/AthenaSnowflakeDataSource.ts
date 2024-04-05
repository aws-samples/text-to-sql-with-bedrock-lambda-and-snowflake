import {Construct} from "constructs";

import {BlockPublicAccess, Bucket} from "aws-cdk-lib/aws-s3";
import {Aws, RemovalPolicy,  Stack} from "aws-cdk-lib";

import {CfnApplication} from "aws-cdk-lib/aws-sam";
import {CfnDataCatalog} from "aws-cdk-lib/aws-athena";
import {SnowflakeConnection} from "../stacks/TextToSqlWithAthenaAndSnowflakeStack";


export interface AthenaSnowflakeDataSourceConfig extends SnowflakeConnection{

}

export class AthenaSnowflakeDataSource extends Construct {


	constructor(scope: Construct, id: string, config: AthenaSnowflakeDataSourceConfig) {
		super(scope, id);

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
				"DefaultConnectionString": `snowflake://jdbc:snowflake://${config.snowflakeAccountId}.snowflakecomputing.com:443?db=${config.snowflakeDb}&role=${config.snowflakeRole}&warehouse=${config.snowflakeWarehouse}&\${AthenaJdbcFederation/${Stack.of(this).stackName}/snowflake}`,
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