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

import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {defaultBasicLambdaTools, KeyPairAuthentication, OAuthClientCredentialsAuthentication, Powertools} from "../../../src/runtime/utils";
import {createSandbox, SinonSandbox} from "sinon";


describe('Snowflake', () => {
	let sb: SinonSandbox;
	beforeEach(_args => {
		sb = createSandbox();
	});

	afterEach(_args => {
		sb.restore();
	});

	beforeAll(_args => {

		vi.stubEnv("SNOWFLAKE_ACCOUNT", "otzhjhy-glb64226");
		vi.stubEnv("SNOWFLAKE_DATABASE", "IMDB");
		vi.stubEnv("SNOWFLAKE_USER", "developer");
		vi.stubEnv("SNOWFLAKE_WAREHOUSE", "TEST_WH");
		vi.stubEnv("SNOWFLAKE_SCHEMA", "PUBLIC");
		vi.stubEnv("AOSS_REGION", "us-east-1");
		vi.stubEnv("AOSS_NODE", "https://y8n152ygjlu4gvq0vss6.us-east-1.aoss.amazonaws.com");
		vi.stubEnv("AOSS_INDEX_NAME", "imdb-table-metadata");
	});
	it("Can authenticate with key pair", async () => {
		vi.stubEnv("SNOWFLAKE_AUTHENTICATION", JSON.stringify(new KeyPairAuthentication("DEVELOPER@GALENDUNKLEBERGERHOTMAIL.ONMICROSOFT.COM", "/text-to-sql-with-lambda-and-snowflake/password")));

		const powertools = new Powertools({
			serviceName: "Snowflake.test.ts",
		});
		const tools = defaultBasicLambdaTools({
			region:"us-east-1"
			},
			powertools)


		const tableMetaData = await tools.snowflake.execute("show tables");
		expect(tableMetaData).toBeDefined()
	})
	it("Can authenticate with oauth", async () => {
		vi.stubEnv("SNOWFLAKE_AUTHENTICATION", JSON.stringify(new OAuthClientCredentialsAuthentication("84646402-7404-4831-9a71-a4b44dbcecdd", "/text-to-sql-with-lambda-and-snowflake/client-credentials","https://login.microsoftonline.com/4b35c00f-2bc0-4f69-b529-56debf3e163d/oauth2/v2.0/token", "99291312-a9a0-4ab7-b156-5b3e538f8c2d","https://otzhjhy-glb64226.snowflakecomputing.com/.default")));

		const powertools = new Powertools({
			serviceName: "Snowflake.test.ts",
		});
		const tools = defaultBasicLambdaTools({
				region:"us-east-1"
			},
			powertools)


		const tableMetaData = await tools.snowflake.execute("show tables");
		expect(tableMetaData).toBeDefined()
	})

})
