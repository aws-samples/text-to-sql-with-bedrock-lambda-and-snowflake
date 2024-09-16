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

import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { BedrockEmbeddings } from "@langchain/community/embeddings/bedrock";
import { OpenSearchVectorStore } from "@langchain/community/vectorstores/opensearch";
import { Document } from "@langchain/core/documents";
import { Client, RequestParams } from "@opensearch-project/opensearch";
import { AwsSigv4Signer } from "@opensearch-project/opensearch/aws";
import { ApiResponse, Context, TransportRequestOptions } from "@opensearch-project/opensearch/lib/Transport.d.ts";
import { AwsApiCalls } from "./Aws";
import { Powertools } from "./Powertools";

export interface OpenSearchApiCalls {
  addDocuments(documents: Document[]): Promise<void>;
  similaritySearch(query: string, k: number): Promise<Document[]>;
  indexExists<TResponse = boolean, TContext = Context>(params?: RequestParams.IndicesExists, options?: TransportRequestOptions): Promise<ApiResponse<TResponse, TContext>>;
}

export interface OpenSearchConfig {
  region: string;
  node: string;
  indexName: string;
}

export class OpenSearch implements OpenSearchApiCalls {
  static instance(config: OpenSearchConfig, aws: AwsApiCalls, powertools: Powertools | undefined) {
    if (this._instance == undefined) {
      this._instance = new OpenSearch(config, aws, powertools);
    }
    return this._instance;
  }

  private static _instance: OpenSearch | undefined;
  private _aws?: AwsApiCalls;
  private config: OpenSearchConfig;
  private _vectorStore?: OpenSearchVectorStore;
  //@ts-ignore
  private _powertools: Powertools | undefined;

  private _client?: Client;
  private _embeddings?: BedrockEmbeddings;

  private constructor(config: OpenSearchConfig, aws: AwsApiCalls, powertools: Powertools | undefined) {
    this.config = config;
    this._powertools = powertools;
    this._aws = aws;
  }

  public newInstance(config: OpenSearchConfig, aws: AwsApiCalls, powertools: Powertools | undefined): OpenSearchApiCalls {
    return new OpenSearch(config, aws, powertools);
  }

  private get embeddings(): BedrockEmbeddings {
    if (this._embeddings == undefined) {
      this._embeddings = new BedrockEmbeddings({
        client: this._aws?.bedrockRuntimeClient,
        model: "amazon.titan-embed-text-v1", // Default value
      });
    }
    return this._embeddings;
  }

  private get vectorStore(): OpenSearchVectorStore {
    if (this._vectorStore == undefined) {
      this._vectorStore = new OpenSearchVectorStore(this.embeddings, {
        client: this.client,
        service: "aoss",
        indexName: this.config.indexName,
      });
    }
    return this._vectorStore;
  }

  private get client(): Client {
    if (this._client == undefined) {
      this._client = new Client({
        ...AwsSigv4Signer({
          region: this.config.region,
          service: "aoss",
          // Must return a Promise that resolve to an AWS.Credentials object.
          // This function is used to acquire the credentials when the client start and
          // when the credentials are expired.
          // The Client will refresh the Credentials only when they are expired.
          // With AWS SDK V2, Credentials.refreshPromise is used when available to refresh the credentials.

          // Example with AWS SDK V3:
          getCredentials: () => {
            // Any other method to acquire a new Credentials object can be used.
            const credentialsProvider = defaultProvider();
            return credentialsProvider();
          },
        }),
        node: this.config.node,
      });
    }
    return this._client;
  }

  async indexExists<TResponse = boolean, TContext = Context>(params?: RequestParams.IndicesExists, options?: TransportRequestOptions): Promise<ApiResponse<TResponse, TContext>> {
    return this.client.indices.exists(params, options);
  }

  async addDocuments(documents: Document[]): Promise<void> {
    await this.vectorStore.addDocuments(documents);
  }
  async similaritySearch(query: string, k: number): Promise<Document[]> {
    return this.vectorStore.similaritySearch(query, k);
  }
}
