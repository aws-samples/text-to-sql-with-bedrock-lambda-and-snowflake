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

import { Callback, Context } from "aws-lambda";
import { BasicLambdaTools, defaultBasicLambdaTools, LambdaHandler, Powertools } from "../utils";

const powertools = new Powertools({
  serviceName: "TextToSql",
});

/**
 * This lambda handler queries snowflake table metadata, vectorizes the results, and stores them in opensearch
 *
 * @param event
 * @param _context
 * @param _callback
 * @param tools
 */
export const onEventHandler: LambdaHandler<Record<string, any>, Record<string, any>> = async (
  event: Record<string, any>,
  _context: Context,
  _callback: Callback<Record<string, any>>,
  tools: BasicLambdaTools = defaultBasicLambdaTools({}, powertools),
): Promise<Record<string, any>> => {
  const logger = tools.powertools.logger;
  logger.info(`Event: ${JSON.stringify(event)}`);
  const humanQuery = event.human;
  const vectorSearchResults = await tools.aoss.similaritySearch(humanQuery, 10);
  if (vectorSearchResults.length > 0) {
    const pageContents = vectorSearchResults
      .map((value) => {
        return value.pageContent;
      })
      .join(" ");
    const prompt = `It is important that the SQL query complies with ANSI sql syntax. During join if column name are same please use alias ex llm.TCONST in select statement. It is also important to respect the type of columns: if a column is string, the value should be enclosed in quotes. If you are writing CTEs then include all the required columns. Be sure to use the database, schema, and table name seperated by '.'. When searching for string values, don't apply case sensitivity. If exact match is not found, try wild card search. Please print the resulting SQL query in a sql code markdown block. The following json document represents the metadata for the tables in the database: ${pageContents}. Generate SQL answer the following question '${humanQuery}'`;
    const body = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 3000,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    };
    const response = await tools.aws.invokeModel({
      modelId: "anthropic.claude-3-haiku-20240307-v1:0",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(body),
    });
    const assistantResponse = JSON.parse(response.body.transformToString("utf-8"));
    logger.info(`Assistant Response: ${JSON.stringify(assistantResponse)}`);
    const assistantText = assistantResponse.content[0].text;
    logger.info(`Assistant Text: ${assistantText}`);
    const regexResult = new RegExp("sql\n([^\u0060]*)", "gm").exec(assistantText);
    logger.info(`Regex Result: ${JSON.stringify(regexResult)}`);
    if (regexResult != null) {
      const sql = regexResult[1];
      logger.info(`SQL: ${sql}`);
      const results = await tools.snowflake.execute(sql);
      return {
        results: results,
      };
    }
  } else {
    logger.warn(`No vector search results found for query '${humanQuery}'`);
  }

  return {
    results: "nothing",
  };
};

export const onEvent = powertools.wrap(onEventHandler);
