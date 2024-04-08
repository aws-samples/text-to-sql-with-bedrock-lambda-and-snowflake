import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { Client, RequestParams } from "@opensearch-project/opensearch";
import { AwsSigv4Signer } from "@opensearch-project/opensearch/aws";
import { ApiResponse, Context, RequestBody, TransportRequestOptions, TransportRequestPromise } from "@opensearch-project/opensearch/lib/Transport.d.ts";
import { Powertools } from "./Powertools";

export interface OpenSearchApiCalls {
  index<TResponse = Record<string, any>, TRequestBody extends RequestBody = Record<string, any>, TContext = Context>(
    params?: RequestParams.Index<TRequestBody>,
    options?: TransportRequestOptions,
  ): TransportRequestPromise<ApiResponse<TResponse, TContext>>;
  create(params?: RequestParams.Create<Record<string, any>>, options?: TransportRequestOptions): Promise<Record<string, any>>;
}

export interface OpenSearchConfig {
  region: string;
  node: string;
}

export class OpenSearch implements OpenSearchApiCalls {
  static instance(config: OpenSearchConfig, powertools: Powertools | undefined) {
    if (this._instance == undefined) {
      this._instance = new OpenSearch(config, powertools);
    }
    return this._instance;
  }

  private static _instance: OpenSearch | undefined;

  private config: OpenSearchConfig;

  //@ts-ignore
  private _powertools: Powertools | undefined;

  private _client?: Client;

  private constructor(config: OpenSearchConfig, powertools: Powertools | undefined) {
    this.config = config;
    this._powertools = powertools;
  }

  public newInstance(config: OpenSearchConfig, powertools: Powertools | undefined): OpenSearchApiCalls {
    return new OpenSearch(config, powertools);
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

  index<TResponse = Record<string, any>, TRequestBody extends RequestBody = Record<string, any>, TContext = Context>(
    params?: RequestParams.Index<TRequestBody>,
    options?: TransportRequestOptions,
  ): TransportRequestPromise<ApiResponse<TResponse, TContext>> {
    return this.client.index(params, options);
  }

  async create(params?: RequestParams.Create<Record<string, any>>, options?: TransportRequestOptions): Promise<Record<string, any>> {
    return this.client.indices.create(params, options);
  }
}
