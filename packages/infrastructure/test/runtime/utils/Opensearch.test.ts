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

import {describe, it} from "vitest";
import {OpenSearch} from "../../../src/runtime/utils/Opensearch";
import {Create} from "@opensearch-project/opensearch/api/requestParams";
import {Powertools} from "../../../src/runtime/utils";

describe('Opensearch', () => {
	it("Can create an index", async () => {
		const powertools = new Powertools({
			serviceName: "Opensearch",
		});

		const aoss = OpenSearch.instance({
			node: "https://lo7u9djth0hlckqvcd6.us-east-2.aoss.amazonaws.com",
			region: "us-east-2"
		},powertools)
		var settings:Record<string,any> = {
			"settings": {
				"index.knn": "true",
				"number_of_shards": 1,
				"knn.algo_param.ef_search": 512,
				"number_of_replicas": 0,
			},
			"mappings": {
				"properties": {
					"vector": {
						"type": "knn_vector",
						"dimension": 1536,
						"method": {
							"name": "hnsw",
							"engine": "faiss"
						},
					},
					"text": {
						"type": "text"
					},
					"text-metadata": {
						"type": "text"         }
				}
			}
		};
		await aoss.create({
			index: "test",
			body: settings
		} as Create<Record<string, any>>)
	})
})