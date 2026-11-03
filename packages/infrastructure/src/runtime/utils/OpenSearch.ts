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

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { OpenSearchVectorStore } from "@langchain/community/vectorstores/opensearch";
import { Document } from "@langchain/core/documents";
import { Embeddings, EmbeddingsParams } from "@langchain/core/embeddings";
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

export const NOVA_EMBEDDINGS_MODEL_ID = "amazon.nova-2-multimodal-embeddings-v1:0";
/**
 * Vector size requested from Nova. The OpenSearch vector store creates the knn index
 * from the length of the first vector it writes, so the index is created at this size.
 */
export const NOVA_EMBEDDING_DIMENSION = 1024;

export interface NovaEmbeddingsParams extends EmbeddingsParams {
  client: BedrockRuntimeClient;
  model?: string;
  dimension?: 256 | 384 | 1024 | 3072;
}

type NovaEmbeddingPurpose = "GENERIC_INDEX" | "TEXT_RETRIEVAL";

/**
 * LangChain embeddings for Amazon Nova Multimodal Embeddings (text only).
 * LangChain's BedrockEmbeddings sends the Titan request body, which Nova rejects.
 * Documents are embedded for indexing and queries for text retrieval, as the Nova docs recommend.
 */
export class NovaEmbeddings extends Embeddings {
  private readonly client: BedrockRuntimeClient;
  private readonly model: string;
  private readonly dimension: number;

  constructor(params: NovaEmbeddingsParams) {
    super({ maxConcurrency: 5, ...params });
    this.client = params.client;
    this.model = params.model ?? NOVA_EMBEDDINGS_MODEL_ID;
    this.dimension = params.dimension ?? NOVA_EMBEDDING_DIMENSION;
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    return Promise.all(documents.map((document) => this.embed(document, "GENERIC_INDEX")));
  }

  async embedQuery(query: string): Promise<number[]> {
    return this.embed(query, "TEXT_RETRIEVAL");
  }

  private async embed(text: string, embeddingPurpose: NovaEmbeddingPurpose): Promise<number[]> {
    return this.caller.call(async () => {
      const response = await this.client.send(
        new InvokeModelCommand({
          modelId: this.model,
          contentType: "application/json",
          accept: "application/json",
          body: JSON.stringify({
            taskType: "SINGLE_EMBEDDING",
            singleEmbeddingParams: {
              embeddingPurpose,
              embeddingDimension: this.dimension,
              text: {
                truncationMode: "END",
                value: text.replace(/\n/g, " "),
              },
            },
          }),
        }),
      );
      const body = JSON.parse(new TextDecoder().decode(response.body));
      const embedding: number[] | undefined = body.embeddings?.[0]?.embedding;
      if (embedding == undefined || embedding.length != this.dimension) {
        throw new Error(`Unexpected Nova embeddings response: expected ${this.dimension} dimensions, got ${embedding?.length ?? "none"}`);
      }
      return embedding;
    });
  }
}

export interface WaitUntilSearchableOptions {
  /** Maximum time to wait. @default 120000 */
  timeoutMs?: number;
  /** Time between searches. @default 10000 */
  intervalMs?: number;
  /** Injected for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected for tests. */
  now?: () => number;
}

/**
 * Polls with a similarity search until it returns at least one document, or the timeout passes.
 *
 * OpenSearch Serverless makes newly written documents searchable about a minute after they are indexed,
 * so a question asked right after indexing finds no table metadata. Each poll makes one embeddings call.
 *
 * @returns true if the search returned a document before the timeout, false otherwise
 */
export async function waitUntilSearchable(aoss: OpenSearchApiCalls, probeQuery: string, options: WaitUntilSearchableOptions = {}): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 10_000;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const deadline = now() + timeoutMs;
  for (;;) {
    const results = await aoss.similaritySearch(probeQuery, 1);
    if (results.length > 0) {
      return true;
    }
    if (now() + intervalMs > deadline) {
      return false;
    }
    await sleep(intervalMs);
  }
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
  private _embeddings?: NovaEmbeddings;

  private constructor(config: OpenSearchConfig, aws: AwsApiCalls, powertools: Powertools | undefined) {
    this.config = config;
    this._powertools = powertools;
    this._aws = aws;
  }

  public newInstance(config: OpenSearchConfig, aws: AwsApiCalls, powertools: Powertools | undefined): OpenSearchApiCalls {
    return new OpenSearch(config, aws, powertools);
  }

  private get embeddings(): NovaEmbeddings {
    if (this._embeddings == undefined) {
      if (this._aws == undefined) {
        throw new Error("AWS API calls are required to create Nova embeddings");
      }
      this._embeddings = new NovaEmbeddings({
        client: this._aws.bedrockRuntimeClient,
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
