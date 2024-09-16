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
  tools: BasicLambdaTools = defaultBasicLambdaTools(powertools),
): Promise<Record<string, any>> => {
  const logger = tools.powertools.logger;
  logger.info(`Event: ${JSON.stringify(event)}`);
  const humanQuery = event.human;
  logger.debug("Searching vector store");
  const vectorSearchResults = await tools.aoss.similaritySearch(humanQuery, 10);
  if (vectorSearchResults.length > 0) {
    logger.debug(`Found ${vectorSearchResults.length} results`);
    const pageContents = vectorSearchResults
      .map((value) => {
        return value.pageContent;
      })
      .join(" ");
    const prompt = `Your task is to generate a SNOWFLAKE SQL query based on a given natural language query and the provided database metadata. 

      You are a SNOWFLAKE SQL generator agent. Your job is to transform the natural language query inside the QUESTION tags into SNOWFLAKE compliant SQL using the database metadata found inside the METADATA tags.
      
      Please follow these guidelines:
      
      1. During join operations, if column names are the same, use alias notation such as 'llm.TCONST' in the statement.
      2. Respect the data type of columns: if a column is a string, enclose the value in quotes.
      3. If you are writing CTEs, include all the required columns.
      4. Use the database, schema, and table names separated by '.'.
      5. If you need to compare string values, do so in a case-insensitive manner, like "WHERE LOWER(t.GENRES) LIKE '%action%'".
      6. Print the resulting SQL query in a SQL code markdown block.
      7. Ensure that all generated SQL queries are read-only and will never mutate data (no INSERT, UPDATE, DELETE, DROP, etc.).
      
      Example:
      <METADATA>
     {
        "database": "IMDB",
        "table": "TITLES",
        "schema": "PUBLIC",
        "comment": "Contains basic movie title information",
        "columns": [
            [
                {
                    "name": "TCONST",
                    "comment": "alphanumeric unique identifier of the title"
                },
                {
                    "name": "TITLETYPE",
                    "comment": "the type/format of the title (e.g. movie, short, tvseries, tvepisode, video, etc)"
                },
                {
                    "name": "PRIMARYTITLE",
                    "comment": "the more popular title / the title used by the filmmakers on promotional materials at the point of release"
                },
                {
                    "name": "ORIGINALTITLE",
                    "comment": "original title, in the original language"
                },
                {
                    "name": "ISADULT",
                    "comment": "0: non-adult title; 1: adult title"
                },
                {
                    "name": "STARTYEAR",
                    "comment": "represents the release year of a title. In the case of TV Series, it is the series start year"
                },
                {
                    "name": "ENDYEAR",
                    "comment": "TV Series end year. ‘N’ for all other title types"
                },
                {
                    "name": "RUNTIMEMINUTES",
                    "comment": "primary runtime of the title, in minutes"
                },
                {
                    "name": "GENRES",
                    "comment": "includes up to three genres associated with the title"
                }
            ]
        ]
    }
      </METADATA>
      <QUESTION>
      Find the titles with genres containing 'action'
      </QUESTION>
      
      \`\`\`sql
          SELECT t.*
          FROM IMDB.PUBLIC.TITLES t
          WHERE LOWER(t.GENRES) LIKE '%action%';
      \`\`\`
      
      If the natural language query is ambiguous or you need additional information to generate the SQL query accurately, feel free to ask for clarification.
      
      <METADATA>
      ${pageContents}
      </METADATA>
      <QUESTION>
      ${humanQuery}
      </QUESTION>`;
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
