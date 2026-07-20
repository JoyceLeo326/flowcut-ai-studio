import { describe, expect, test } from "bun:test";
import { createEditPlan } from "./planner";

describe("createEditPlan", () => {
	test("creates reversible local structure steps", () => {
		const plan = createEditPlan({
			prompt: "剪紧凑一点，做成 9:16 竖屏",
			mode: "local",
			assetCount: 3,
			unusedAssetCount: 2,
			timelineElementCount: 1,
			videoClipCount: 1,
			durationSeconds: 42,
		});

		expect(plan.steps.map((step) => step.kind)).toEqual([
			"arrange-media",
			"tighten-clips",
			"set-aspect-ratio",
		]);
		expect(plan.steps.every((step) => step.executor === "local")).toBe(true);
		expect(plan.target.aspectRatio).toBe("9:16");
	});

	test("routes semantic work to ChatCut", () => {
		const plan = createEditPlan({
			prompt: "删除停顿，生成字幕并剪成 60 秒精华",
			mode: "hybrid",
			assetCount: 2,
			unusedAssetCount: 0,
			timelineElementCount: 2,
			videoClipCount: 2,
			durationSeconds: 300,
		});

		expect(plan.steps.map((step) => step.kind)).toEqual([
			"set-aspect-ratio",
			"remove-silence",
			"transcribe-captions",
			"semantic-highlights",
		]);
		expect(plan.steps.filter((step) => step.executor === "chatcut")).toHaveLength(
			3,
		);
		expect(plan.target.targetDurationSeconds).toBe(60);
	});

	test("blocks an empty project", () => {
		const plan = createEditPlan({
			prompt: "自动剪辑",
			mode: "hybrid",
			assetCount: 0,
			unusedAssetCount: 0,
			timelineElementCount: 0,
			videoClipCount: 0,
			durationSeconds: 0,
		});

		expect(plan.steps).toHaveLength(1);
		expect(plan.steps[0]?.availability).toBe("blocked");
	});
});
