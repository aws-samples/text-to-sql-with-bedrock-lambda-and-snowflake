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

import { SQSEvent, SQSHandler } from "aws-lambda";
import { Callback, Context, Handler } from "aws-lambda/handler";

import { SQSBatchResponse } from "aws-lambda/trigger/sqs";
import { AwsApiCalls } from "./Aws";

import { OpenSearchApiCalls } from "./Opensearch";
import { Powertools } from "./Powertools";

export * from "./Aws";
export * from "./Powertools";

export interface BasicLambdaTools {
  aws: AwsApiCalls;
  powertools: Powertools;
  aoss: OpenSearchApiCalls;
}

export type LambdaHandler<TEvent = any, TResult = any> =
  Handler<TEvent, TResult> extends (event: TEvent, context: Context, callback: Callback<TResult>, tools: BasicLambdaTools) => infer R
    ? (event: TEvent, context: Context, callback: Callback<TResult>, tools: BasicLambdaTools) => R
    : never;

export type SQSLambdaHandler = SQSHandler extends (event: SQSEvent, context: Context, callback: Callback<SQSBatchResponse>, tools: BasicLambdaTools) => infer R
  ? (event: SQSEvent, context: Context, callback: Callback<SQSBatchResponse>, tools: BasicLambdaTools) => R
  : LambdaHandler;
