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

import { request } from "node:https";
import { configure, Connection, ConnectionOptions, createConnection } from "snowflake-sdk";
import { AwsApiCalls } from "./Aws";
import { Powertools } from "./Powertools";

const VALID_PARAMETER_REGEX = /^[\w_-]*\/[\w_-]*$/;

export interface SnowflakeApiCalls {
  execute(sql: string): Promise<any[] | undefined>;
}

export enum SnowflakeAuthenticationTypes {
  UsernameAndPassword = "UsernameAndPassword",
  KeyPair = "KeyPair",
  OAuthClientCredentials = "OAuthClientCredentials",
}

export interface SnowflakeAuthentication {
  type: SnowflakeAuthenticationTypes;
  username: string;
  parameterName: string;
}

export abstract class AbstractSnowflakeAuthentication implements SnowflakeAuthentication {
  readonly username: string;
  readonly parameterName: string;

  constructor(username: string, parameterName: string) {
    this.username = username;
    //validate that the parameter name adheres to VALID_PARAMTER_REGEX
    if (!VALID_PARAMETER_REGEX.test(parameterName)) {
      throw new Error(`Invalid parameter name: ${parameterName}. Parameter name must match the pattern: ${VALID_PARAMETER_REGEX}`);
    }
    this.parameterName = parameterName;
  }

  abstract get type(): SnowflakeAuthenticationTypes;
}

/**
 * Uses native snowflake username and password authentication
 */
export class UsernameAndPasswordAuthentication extends AbstractSnowflakeAuthentication {
  readonly type: SnowflakeAuthenticationTypes = SnowflakeAuthenticationTypes.UsernameAndPassword;

  constructor(username: string, parameterName: string) {
    super(username, parameterName);
  }
}

/**
 * Uses snowflake key-pair authentication. Private key is stored in SSM Parameter Store as a SecureString
 *
 * See https://docs.snowflake.com/en/developer-guide/node-js/nodejs-driver-authenticate#using-key-pair-authentication-and-key-pair-rotation
 */
export class KeyPairAuthentication extends AbstractSnowflakeAuthentication {
  readonly type: SnowflakeAuthenticationTypes = SnowflakeAuthenticationTypes.KeyPair;

  constructor(username: string, parameterName: string) {
    super(username, parameterName);
  }
}

/**
 * Uses snowflake external OAuth authentication with Client Credentials flow. Client secret is stored in SSM Parameter Store as a SecureString
 *
 * See https://docs.snowflake.com/en/developer-guide/node-js/nodejs-driver-authenticate#using-oauth
 */
export class OAuthClientCredentialsAuthentication extends AbstractSnowflakeAuthentication {
  readonly type: SnowflakeAuthenticationTypes = SnowflakeAuthenticationTypes.OAuthClientCredentials;
  readonly tokenUrl: string;
  readonly clientId: string;
  readonly scope: string;

  constructor(username: string, parameterName: string, tokenUrl: string, clientId: string, scope: string = ".default") {
    super(username, parameterName);
    this.tokenUrl = tokenUrl;
    this.clientId = clientId;
    this.scope = scope;
  }
}

export type SnowflakeAuthenticationType = UsernameAndPasswordAuthentication | KeyPairAuthentication;

export interface SnowflakeConfig {
  account: string;
  authentication: SnowflakeAuthenticationType;
  application: string;
  warehouse: string;
  database: string;
  schema: string;
}

export class Snowflake implements SnowflakeApiCalls {
  static instance(config: SnowflakeConfig, aws: AwsApiCalls, powertools: Powertools | undefined) {
    if (this._instance == undefined) {
      this._instance = new Snowflake(config, aws, powertools);
    }
    return this._instance;
  }

  private static _instance: Snowflake | undefined;

  private config: SnowflakeConfig;

  //@ts-ignore
  private _powertools: Powertools | undefined;
  private _aws?: AwsApiCalls;
  private _connection?: Connection;

  private constructor(config: SnowflakeConfig, aws: AwsApiCalls, powertools: Powertools | undefined) {
    this.config = config;
    this._aws = aws;
    this._powertools = powertools;
  }

  public newInstance(config: SnowflakeConfig, aws: AwsApiCalls, powertools: Powertools | undefined): SnowflakeApiCalls {
    return new Snowflake(config, aws, powertools);
  }

  private async connection(): Promise<Connection> {
    if (this._connection == undefined || !(await this._connection.isValidAsync())) {
      let options: ConnectionOptions;
      const parameterName: string = this.config.authentication.parameterName.split("/")[0];
      const parameterKey: string = this.config.authentication.parameterName.split("/")[1];
      switch (this.config.authentication.type) {
        case SnowflakeAuthenticationTypes.KeyPair:
          const privateKeyPem = await this.getParameter(this._aws!, parameterName, parameterKey);

          options = {
            account: this.config.account,
            application: this.config.application,
            username: this.config.authentication.username,
            privateKey: privateKeyPem,
            authenticator: "SNOWFLAKE_JWT",
            warehouse: this.config.warehouse,
            database: this.config.database,
            schema: this.config.schema,
          };
          break;
        case SnowflakeAuthenticationTypes.UsernameAndPassword:
          const password = await this.getParameter(this._aws!, parameterName, parameterKey);
          options = {
            account: this.config.account,
            application: this.config.application,
            username: this.config.authentication.username,
            password: password,
            authenticator: "SNOWFLAKE",
            warehouse: this.config.warehouse,
            database: this.config.database,
            schema: this.config.schema,
          };
          break;
        case SnowflakeAuthenticationTypes.OAuthClientCredentials:
          const oauth = this.config.authentication as OAuthClientCredentialsAuthentication;
          const clientId = oauth.clientId;
          const clientSecret = await this.getParameter(this._aws!, parameterName, parameterKey);
          const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
          const tokenUrl = oauth.tokenUrl;
          const body = encodeURI(`${encodeURI("grant_type")}=${encodeURI("client_credentials")}&${encodeURI("scope")}=${encodeURI(oauth.scope)}`);
          const tokenString = await new Promise<string | undefined>((resolve, reject) => {
            const r = request(
              tokenUrl,
              {
                method: "POST",
                headers: {
                  Authorization: `Basic ${auth}`,
                  "Content-Type": "application/x-www-form-urlencoded",
                  "Content-Length": Buffer.byteLength(body),
                },
              },
              (res) => {
                const chunks: Uint8Array[] = [];
                res.on("data", (data) => chunks.push(data));
                res.on("end", () => {
                  let resBody = Buffer.concat(chunks);
                  resolve(resBody.toString("utf8"));
                });
              },
            );
            r.on("error", reject);
            r.write(body);
            r.end();
          });
          let token: string | undefined = undefined;
          if (tokenString != undefined) {
            token = JSON.parse(tokenString)?.access_token;
          }
          options = {
            account: this.config.account,
            application: this.config.application,
            username: this.config.authentication.username,
            token: token,
            authenticator: "OAUTH",
            warehouse: this.config.warehouse,
            database: this.config.database,
            schema: this.config.schema,
          };
          break;
      }
      this._powertools?.logger.info(`Options ${JSON.stringify(options)}`);
      const pt = this._powertools;
      this._connection = await new Promise(function (resolve, reject) {
        configure({
          // @ts-ignore
          logLevel: process.env.SNOWFLAKE_LOG_LEVEL != undefined ? process.env.SNOWFLAKE_LOG_LEVEL : "INFO",
        });
        const con = createConnection(options);
        con.connect((err, conn) => {
          if (err != undefined) {
            pt?.logger.error(`${err.name} - ${err.message}`);
            reject(err);
          } else {
            pt?.logger.info("Connected to Snowflake");
            resolve(conn);
          }
        });
      });
    }
    return this._connection;
  }

  async getParameter(aws: AwsApiCalls, parameterName: string, parameterKey: string): Promise<string> {
    const response = await aws.getSecretValue({
      SecretId: parameterName,
    });
    if (response.SecretString) {
      return JSON.parse(response.SecretString)[parameterKey];
    } else {
      throw new Error("Missing SecretString");
    }
  }

  async execute(sql: string): Promise<any[] | undefined> {
    const connection = await this.connection();

    const isConnectionValid = await connection.isValidAsync();
    if (isConnectionValid) {
      return new Promise(function (resolve, reject) {
        connection.execute({
          sqlText: sql,
          complete: (err, _stmt, rows) => {
            if (err != undefined) {
              reject(err);
            } else {
              resolve(rows);
            }
          },
        });
      });
    } else {
      throw new Error("Connection is not valid");
    }
  }
}
