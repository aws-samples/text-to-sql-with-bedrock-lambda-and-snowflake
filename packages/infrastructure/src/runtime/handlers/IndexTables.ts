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

import { Logger } from "@aws-lambda-powertools/logger";
import { Document } from "@langchain/core/documents";
import { Callback, Context } from "aws-lambda";
import { BasicLambdaTools, defaultBasicLambdaTools, LambdaHandler, Powertools } from "../utils";
import { SnowflakeApiCalls } from "../utils/Snowflake";

const powertools = new Powertools({
  serviceName: "IndexTables",
});

/**
 * This lambda handler indexes table definitions in an OpenSearch Serverless vector database
 *
 * @param event
 * @param _context
 * @param _callback
 * @param tools
 */

export const onEventHandler: LambdaHandler<Record<string, any>, Record<string, any | undefined>> = async (
  event: Record<string, any>,
  _context: Context,
  _callback: Callback<Record<string, any | undefined>>,
  tools: BasicLambdaTools = defaultBasicLambdaTools({}, powertools),
): Promise<Record<string, any | undefined>> => {
  const logger = tools.powertools.logger;
  logger.info(`Event: ${JSON.stringify(event)}`);
  const docs = await buildTableMetaData(tools.snowflake, logger);
  await tools.aoss.addDocuments(docs);
  return docs;
};

async function buildTableMetaData(snowflake: SnowflakeApiCalls, logger: Logger): Promise<Document[]> {
  const docs: Document[] = [];
  const tableMetaData = await snowflake.execute("show tables");
  if (tableMetaData != undefined) {
    for (const t of tableMetaData) {
      const table: Record<string, any> = {
        database: t.database_name,
        table: t.name,
        schema: t.schema_name,
        comment: t.comment,
        columns: [],
      };
      logger.debug(`Table: ${JSON.stringify(table)}`);
      const columMetaData = await snowflake.execute(`show columns in table ${table.table}`);
      if (columMetaData != undefined) {
        table.columns.push(
          columMetaData.map((value) => {
            return {
              name: value.column_name,
              type: value.data_type.type,
              nullable: value.data_type.nullable,
              comment: value.comment,
            };
          }),
        );
      }
      docs.push(
        new Document({
          pageContent: JSON.stringify(table),
        }),
      );
    }
  } else {
    logger.info("No tables found");
  }
  return docs;
}

export const onEvent = powertools.wrap(onEventHandler);
