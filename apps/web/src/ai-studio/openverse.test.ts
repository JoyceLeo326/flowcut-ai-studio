import { describe, expect, test } from "bun:test";
import { buildOpenverseUrl, normalizeOpenverseResponse } from "./openverse";

describe("Openverse media search", () => {
	test("builds a bounded commercial-use image query", () => {
		const url = buildOpenverseUrl({
			query: "night city",
			page: 0,
			pageSize: 100,
		});

		expect(url.origin).toBe("https://api.openverse.org");
		expect(url.pathname).toBe("/v1/images/");
		expect(url.searchParams.get("q")).toBe("night city");
		expect(url.searchParams.get("page")).toBe("1");
		expect(url.searchParams.get("page_size")).toBe("40");
		expect(url.searchParams.get("license_type")).toBe("commercial");
	});

	test("keeps attribution and drops unusable results", () => {
		const results = normalizeOpenverseResponse({
			result_count: 2,
			results: [
				{
					id: "asset-1",
					title: "Night road",
					creator: "Lin",
					license: "by",
					license_version: "4.0",
					thumbnail: "https://api.openverse.org/thumb/1",
					url: "https://images.example/1.jpg",
					foreign_landing_url: "https://source.example/1",
				},
				{
					id: "asset-2",
					title: "Broken",
					creator: null,
					license: "cc0",
					thumbnail: null,
					url: null,
					foreign_landing_url: null,
				},
			],
		});

		expect(results.items).toHaveLength(1);
		expect(results.total).toBe(2);
		expect(results.items[0]).toEqual({
			id: "asset-1",
			title: "Night road",
			creator: "Lin",
			license: "CC BY 4.0",
			thumbnailUrl: "https://api.openverse.org/thumb/1",
			assetUrl: "https://images.example/1.jpg",
			sourceUrl: "https://source.example/1",
		});
	});
});
