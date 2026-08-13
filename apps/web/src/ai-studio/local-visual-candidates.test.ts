import { describe, expect, test } from "bun:test";
import { createVisualGenerationJobs } from "./catalog";
import {
	VISIONCUT_AVAILABLE_GENERATED_LIBRARY,
	type VisionCutGeneratedAsset,
} from "./generated-library";
import { buildLocalVisualCandidates } from "./local-visual-candidates";

describe("local visual candidate board", () => {
	test("maps every requested slot to a unique, available local asset", () => {
		const jobs = createVisualGenerationJobs({
			prompt: "城市夜景中的创业者和产品细节",
			worldId: "electric-noir",
			useCases: ["broll", "cover", "product-shot"],
			aspectRatios: ["16:9", "9:16"],
			count: 12,
		});
		const candidates = buildLocalVisualCandidates({
			jobs,
			library: VISIONCUT_AVAILABLE_GENERATED_LIBRARY,
		});

		expect(candidates).toHaveLength(12);
		expect(new Set(candidates.map((item) => item.asset.id)).size).toBe(12);
		expect(candidates.every((item) => item.reasons.length > 0)).toBe(true);
	});

	test("prefers an exact aspect-ratio and intended category match", () => {
		const job = createVisualGenerationJobs({
			prompt: "premium device launch",
			worldId: "chrome-future",
			useCases: ["product-shot"],
			aspectRatios: ["16:9"],
			count: 1,
		})[0];
		if (!job) throw new Error("Expected a visual job");
		const fixtures = [
			{
				...VISIONCUT_AVAILABLE_GENERATED_LIBRARY[0],
				id: "weak",
				categoryId: "travel-place",
				aspectRatio: "9:16",
			},
			{
				...VISIONCUT_AVAILABLE_GENERATED_LIBRARY[1],
				id: "strong",
				categoryId: "tech-device",
				aspectRatio: "16:9",
			},
		] satisfies VisionCutGeneratedAsset[];

		const [candidate] = buildLocalVisualCandidates({
			jobs: [job],
			library: fixtures,
		});
		expect(candidate?.asset.id).toBe("strong");
		expect(candidate?.reasons).toContain("画幅一致");
		expect(candidate?.reasons).toContain("用途匹配");
	});

	test("never invents more candidates than available files", () => {
		const jobs = createVisualGenerationJobs({
			prompt: "documentary",
			worldId: "documentary-grain",
			useCases: ["storyboard"],
			aspectRatios: ["16:9"],
			count: 8,
		});
		const candidates = buildLocalVisualCandidates({
			jobs,
			library: VISIONCUT_AVAILABLE_GENERATED_LIBRARY.slice(0, 3),
		});

		expect(candidates).toHaveLength(3);
	});
});
