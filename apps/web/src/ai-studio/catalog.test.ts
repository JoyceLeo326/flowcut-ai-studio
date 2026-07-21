import { describe, expect, test } from "bun:test";
import {
	AUTOMATION_RECIPES,
	VISUAL_WORLDS,
	createAutomationRun,
	createVisualGenerationJobs,
	getRecipeBriefPatch,
	recommendAutomationRecipes,
} from "./catalog";

describe("AI product studio catalog", () => {
	test("offers a broad workflow and visual-world catalog", () => {
		expect(AUTOMATION_RECIPES.length).toBeGreaterThanOrEqual(12);
		expect(VISUAL_WORLDS.length).toBeGreaterThanOrEqual(8);
		expect(new Set(AUTOMATION_RECIPES.map((recipe) => recipe.id)).size).toBe(
			AUTOMATION_RECIPES.length,
		);
	});

	test("recommends talking-head cleanup from beginner language", () => {
		const matches = recommendAutomationRecipes(
			"我有一段知识口播，帮我去掉停顿、嗯啊和说错重来的部分",
		);

		expect(matches[0]?.id).toBe("talking-head-cleanup");
		expect(matches[0]?.beginnerOutcome).toContain("口播");
	});

	test("builds a reviewable talking-head run with local and ChatCut nodes", () => {
		const run = createAutomationRun({
			recipeId: "talking-head-cleanup",
			experience: "guided",
			assetCount: 3,
		});

		expect(run.nodes.length).toBeGreaterThanOrEqual(10);
		expect(run.nodes.map((node) => node.id)).toContain("remove-fillers");
		expect(run.nodes.map((node) => node.id)).toContain("insert-broll");
		expect(run.groups.map((group) => group.id)).toEqual([
			"understand",
			"structure",
			"polish",
			"deliver",
		]);
		expect(run.summary.localCount).toBeGreaterThan(0);
		expect(run.summary.chatCutCount).toBeGreaterThan(0);
		expect(run.summary.blockedCount).toBe(0);
	});

	test("keeps professional overrides bounded and visible in the run", () => {
		const run = createAutomationRun({
			recipeId: "talking-head-cleanup",
			experience: "pro",
			assetCount: 1,
			settings: {
				silenceThresholdMs: 80,
				brollDensity: 140,
				targetLufs: -2,
			},
		});

		expect(run.settings.silenceThresholdMs).toBe(150);
		expect(run.settings.brollDensity).toBe(100);
		expect(run.settings.targetLufs).toBe(-6);
		expect(run.experience).toBe("pro");
	});

	test("marks media-dependent work blocked before files are imported", () => {
		const run = createAutomationRun({
			recipeId: "event-recap",
			experience: "guided",
			assetCount: 0,
		});

		expect(run.summary.blockedCount).toBe(run.nodes.length);
		expect(run.nodes.every((node) => node.availability === "blocked")).toBe(
			true,
		);
	});

	test("creates a capped multi-purpose, multi-ratio visual generation batch", () => {
		const jobs = createVisualGenerationJobs({
			prompt: "一位创作者在城市夜色中讲述创业故事",
			worldId: "electric-noir",
			useCases: ["broll", "cover"],
			aspectRatios: ["9:16", "16:9"],
			count: 20,
		});

		expect(jobs).toHaveLength(12);
		expect(new Set(jobs.map((job) => job.id)).size).toBe(12);
		expect(new Set(jobs.map((job) => job.useCase))).toEqual(
			new Set(["broll", "cover"]),
		);
		expect(new Set(jobs.map((job) => job.aspectRatio))).toEqual(
			new Set(["9:16", "16:9"]),
		);
		expect(jobs[0]?.prompt).toContain("城市夜色");
		expect(jobs[0]?.prompt).toContain("Electric Noir");
	});

	test("maps a studio workflow back into the existing director brief", () => {
		const patch = getRecipeBriefPatch("talking-head-cleanup");

		expect(patch.recipeId).toBe("talking-head");
		expect(patch.styleId).toBe("clean-knowledge");
		expect(patch.captionId).toBe("keyword");
		expect(patch.audioId).toBe("voice-first");
		expect(patch.extraRequest).toContain("口头禅");
		expect(patch.extraRequest).toContain("B-roll");
	});
});
