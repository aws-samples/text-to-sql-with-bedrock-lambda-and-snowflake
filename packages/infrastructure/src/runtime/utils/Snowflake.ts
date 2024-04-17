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

import { Connection, ConnectionOptions, createConnection } from "snowflake-sdk";
import { AwsApiCalls } from "./Aws";
import { Powertools } from "./Powertools";

export interface SnowflakeApiCalls {
  execute(sql: string): Promise<any[] | undefined>;
}

export interface SnowflakeConfig {
  account: string;
  username: string;
  passwordParameterName: string;
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
      const password = await this.getSnowflakePassword(this._aws!, this.config.passwordParameterName);

      const options: ConnectionOptions = {
        account: this.config.account,
        application: this.config.application,
        username: this.config.username,
        password: password,
        authenticator: "SNOWFLAKE",
        warehouse: this.config.warehouse,
        database: this.config.database,
        schema: this.config.schema,
      };
      this._powertools?.logger.info(`Options ${JSON.stringify(options)}`);
      const pt = this._powertools;
      this._connection = await new Promise(function (resolve, reject) {
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

  async getSnowflakePassword(aws: AwsApiCalls, parameterName: string): Promise<string> {
    const response = await aws.getParameter({
      Name: parameterName,
      WithDecryption: true,
    });
    return response.Parameter?.Value!;
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
