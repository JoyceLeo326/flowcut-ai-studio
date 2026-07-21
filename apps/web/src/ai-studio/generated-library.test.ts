import { describe, expect, test } from "bun:test";
import {
	VISIONCUT_AVAILABLE_GENERATED_LIBRARY,
	VISIONCUT_GENERATED_LIBRARY,
	VISIONCUT_LIBRARY_CATEGORIES,
	VISIONCUT_ORIGINAL_AI_LICENSE,
} from "./generated-library";

describe("VisionCut generated library", () => {
	test("keeps the 100-shot plan separate from the completed reserve", () => {
		expect(VISIONCUT_GENERATED_LIBRARY.length).toBeGreaterThanOrEqual(100);
		expect(VISIONCUT_GENERATED_LIBRARY).toHaveLength(100);
		expect(VISIONCUT_AVAILABLE_GENERATED_LIBRARY).toHaveLength(61);
		expect(
			VISIONCUT_AVAILABLE_GENERATED_LIBRARY.every((asset) =>
				VISIONCUT_GENERATED_LIBRARY.includes(asset),
			),
		).toBe(true);
	});

	test("keeps ids, slugs, paths and prompts unique", () => {
		const uniqueValues = [
			VISIONCUT_GENERATED_LIBRARY.map((asset) => asset.id),
			VISIONCUT_GENERATED_LIBRARY.map((asset) => asset.slug),
			VISIONCUT_GENERATED_LIBRARY.map((asset) => asset.path),
			VISIONCUT_GENERATED_LIBRARY.map((asset) => asset.prompt),
		];

		for (const values of uniqueValues) {
			expect(new Set(values).size).toBe(VISIONCUT_GENERATED_LIBRARY.length);
		}
	});

	test("provides ten or more assets in every required category", () => {
		expect(VISIONCUT_LIBRARY_CATEGORIES).toHaveLength(10);

		for (const category of VISIONCUT_LIBRARY_CATEGORIES) {
			const count = VISIONCUT_GENERATED_LIBRARY.filter(
				(asset) => asset.categoryId === category.id,
			).length;

			expect(count).toBeGreaterThanOrEqual(10);
		}
	});

	test("uses the public library path and complete attributable metadata", () => {
		for (const asset of VISIONCUT_GENERATED_LIBRARY) {
			expect(asset.path).toBe(
				`/visioncut/generated-library/${asset.slug}.webp`,
			);
			expect(asset.license).toBe(VISIONCUT_ORIGINAL_AI_LICENSE);
			expect(asset.title.length).toBeGreaterThan(0);
			expect(asset.category.length).toBeGreaterThan(0);
			expect(asset.scene.length).toBeGreaterThan(0);
			expect(asset.shotScale.length).toBeGreaterThan(0);
			expect(asset.useCase.length).toBeGreaterThan(0);
			expect(asset.styleWorld.length).toBeGreaterThan(0);
			expect(asset.alt.length).toBeGreaterThan(0);
			expect(asset.prompt).toMatch(/[A-Za-z]{4,}/);
		}
	});
});
