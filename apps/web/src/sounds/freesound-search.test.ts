import { describe, expect, test } from "bun:test";
import { buildFreesoundSearchParams } from "./freesound-search";

describe("Freesound search parameters", () => {
	test("builds a commercially reusable music search", () => {
		const params = buildFreesoundSearchParams({
			commercialOnly: true,
			minRating: 4,
			page: 2,
			pageSize: 40,
			query: "cinematic launch",
			sort: "score",
			type: "songs",
		});

		expect(params.get("sort")).toBe("score");
		expect(params.get("page")).toBe("2");
		expect(params.get("filter")).toContain("duration:[20.0 TO 600.0]");
		expect(params.get("filter")).toContain(
			'license:("Attribution" OR "Creative Commons 0")',
		);
		expect(params.get("filter")).toContain("tag:music");
		expect(params.has("token")).toBe(false);
	});

	test("allows broader effect discovery when the commercial filter is off", () => {
		const params = buildFreesoundSearchParams({
			commercialOnly: false,
			minRating: 2,
			page: 1,
			pageSize: 20,
			sort: "downloads",
			type: "effects",
		});

		expect(params.get("sort")).toBe("downloads_desc");
		expect(params.get("filter")).toContain("duration:[* TO 30.0]");
		expect(params.get("filter")).toContain("tag:foley");
		expect(params.get("filter")).not.toContain("license:");
	});
});
