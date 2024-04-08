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