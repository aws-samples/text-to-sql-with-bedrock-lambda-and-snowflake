/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import { Aws, Stack, StackProps } from "aws-cdk-lib";
import { SnowflakeConnection } from "./index";
import { Construct } from "constructs";
import { Layers } from "../constructs/Layers";
import { Lambdas } from "../constructs/Lambdas";
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from "aws-cdk-lib/custom-resources";
import { ParameterDataType } from "aws-cdk-lib/aws-ssm";
import { OpenSearchServerlessVectorStore } from "../constructs/OpenSearchServerlessVectorStore";
import { NagSuppressions } from "cdk-nag";

export interface TextToSqlWithLambdaAndSnowflakeStackProps extends StackProps, SnowflakeConnection {
  snowflakePasswordParameterName: string;
  aossIndexName: string;
  aossCollectionName: string;
}

export class TextToSqlWithLambdaAndSnowflakeStack extends Stack {
  constructor(scope: Construct, id: string, props: TextToSqlWithLambdaAndSnowflakeStackProps) {
    super(scope, id, props);
    const layers = new Layers(this, "Layers");
    const passwordParameter = new AwsCustomResource(this, "SnowflakePasswordParameter", {
      onCreate: {
        service: "SSM",
        action: "PutParameter",
        physicalResourceId: PhysicalResourceId.of(props.snowflakePasswordParameterName),
        parameters: {
          Type: "SecureString",
          Value: "Replace me after deployment via the console",
          DataType: ParameterDataType.TEXT,
          Name: props.snowflakePasswordParameterName,
        },
      },
      onDelete: {
        service: "SSM",
        action: "DeleteParameter",
        parameters: {
          Name: props.snowflakePasswordParameterName,
        },
      },
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: [`arn:${Aws.PARTITION}:ssm:${Aws.REGION}:${Aws.ACCOUNT_ID}:parameter/${props.snowflakePasswordParameterName}`],
      }),
    });
    const vectorStore = new OpenSearchServerlessVectorStore(this, "VectorStore", props.aossCollectionName, "Knowledge base in text-to-sql RAG framework");

    const lambdas = new Lambdas(this, "Lambdas", {
      layers: layers,
      snowflakeConnection: {
        ...props,
      },
      vectorStore,
      snowFlakePasswordParameterName: props.snowflakePasswordParameterName,
      indexName: props.aossIndexName,
    });
    lambdas.node.addDependency(passwordParameter);
    this.cdkNagSuppressions();
  }

  private cdkNagSuppressions() {
    NagSuppressions.addStackSuppressions(this, [
      {
        id: "AwsSolutions-L1",
        reason: "Manually managing runtimes",
      },
    ]);
    NagSuppressions.addStackSuppressions(this, [
      {
        id: "AwsSolutions-IAM4",
        reason: "AWS Managed policies are ok",
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, `/${this.stackName}/Lambdas/TextToSqlFunction/ServiceRole/DefaultPolicy/Resource`, [
      {
        id: "AwsSolutions-IAM5",
        reason: "Wildcard permissions for anthropic models allowed here",
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(this, `/${this.stackName}/Lambdas/IndexTablesFunction/ServiceRole/DefaultPolicy/Resource`, [
      {
        id: "AwsSolutions-IAM5",
        reason: "Wildcard permissions for anthropic models allowed here",
      },
    ]);
  }
}
