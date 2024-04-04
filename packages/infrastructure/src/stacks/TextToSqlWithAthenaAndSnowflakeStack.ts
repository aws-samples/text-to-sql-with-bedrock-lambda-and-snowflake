import {Stack, StackProps} from "aws-cdk-lib";
import {Construct} from "constructs";
import {AthenaSnowflakeDataSource, AthenaSnowflakeDataSourceConfig} from "../constructs/AthenaSnowflakeDataSource";


export interface TextToSqlWithAthenaAndSnowflakeStackProps extends StackProps, AthenaSnowflakeDataSourceConfig {

}

export class TextToSqlWithAthenaAndSnowflakeStack extends Stack {
	constructor(scope: Construct, id: string, props: TextToSqlWithAthenaAndSnowflakeStackProps) {
		super(scope, id, props);

		new AthenaSnowflakeDataSource(this, "SnowflakeDataSource", {
			connectionString: props.connectionString
		})
	}
}
