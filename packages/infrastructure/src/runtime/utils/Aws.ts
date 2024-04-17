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

import { BedrockRuntimeClient, InvokeModelCommand, InvokeModelCommandInput, InvokeModelCommandOutput } from "@aws-sdk/client-bedrock-runtime";
import { GetParameterCommand, GetParameterCommandInput, GetParameterCommandOutput, SSMClient } from "@aws-sdk/client-ssm";
import { Powertools } from "./Powertools";

export type PaginationConfig = {
  pageSize?: number;
  startingToken?: any;
  stopOnSameToken?: boolean;
};

export interface AwsApiCalls {
  bedrockRuntimeClient: BedrockRuntimeClient;
  invokeModel(input: InvokeModelCommandInput): Promise<InvokeModelCommandOutput>;
  getParameter(input: GetParameterCommandInput): Promise<GetParameterCommandOutput>;
}

export class Aws implements AwsApiCalls {
  static instance(config: { [key: string]: any | undefined } = {}, powertools: Powertools | undefined) {
    if (this._instance == undefined) {
      this._instance = new Aws(config, powertools);
    }
    return this._instance;
  }

  private static _instance: Aws | undefined;

  //@ts-ignore
  private config: { [key: string]: any | undefined };
  //@ts-ignore
  private _powertools: Powertools | undefined;

  private _bedrockRuntimeClient?: BedrockRuntimeClient;
  private _ssmClient?: SSMClient;

  private constructor(config: { [key: string]: any | undefined } = {}, powertools: Powertools | undefined) {
    this.config = config;
    this._powertools = powertools;
  }

  public newInstance(config: { [key: string]: any | undefined } = {}, powertools: Powertools | undefined): AwsApiCalls {
    return new Aws(config, powertools);
  }

  public get bedrockRuntimeClient(): BedrockRuntimeClient {
    if (this._bedrockRuntimeClient == undefined) {
      this._bedrockRuntimeClient = this._powertools
        ? this._powertools.tracer.captureAWSv3Client(
            new BedrockRuntimeClient({
              ...this.config,
              retryMode: "adaptive",
            }),
          )
        : new BedrockRuntimeClient(this.config);
    }
    return this._bedrockRuntimeClient;
  }

  private get ssmClient(): SSMClient {
    if (this._ssmClient == undefined) {
      this._ssmClient = this._powertools
        ? this._powertools.tracer.captureAWSv3Client(
            new SSMClient({
              ...this.config,
              retryMode: "adaptive",
            }),
          )
        : new SSMClient(this.config);
    }
    return this._ssmClient;
  }

  async invokeModel(input: InvokeModelCommandInput): Promise<InvokeModelCommandOutput> {
    return this.bedrockRuntimeClient.send(new InvokeModelCommand(input));
  }

  async getParameter(input: GetParameterCommandInput): Promise<GetParameterCommandOutput> {
    return this.ssmClient.send(new GetParameterCommand(input));
  }
}
