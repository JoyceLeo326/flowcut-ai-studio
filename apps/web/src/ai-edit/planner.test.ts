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
		expect(
			plan.steps.filter((step) => step.executor === "chatcut"),
		).toHaveLength(3);
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

	test("turns a cinematic style request into a reviewable creative blueprint", () => {
		const plan = createEditPlan({
			prompt:
				"做成高级纪录片，极简电影字幕，干净硬切，保留环境声，整体克制自然",
			mode: "hybrid",
			assetCount: 4,
			unusedAssetCount: 1,
			timelineElementCount: 3,
			videoClipCount: 3,
			durationSeconds: 210,
		});

		expect(plan.target.style).toBe("高级纪录片");
		expect(plan.creativeDirection.captionStyle).toContain("极简电影");
		expect(plan.creativeDirection.motionStyle).toContain("硬切");
		expect(plan.creativeDirection.audioStrategy).toContain("环境声");
		expect(plan.creativeDirection.narrative).toContain("纪录");
		expect(plan.steps.map((step) => step.kind)).toContain("creative-polish");
		expect(plan.steps.map((step) => step.kind)).toContain("audio-design");
	});

	test("understands energetic vertical edits and creates explicit polish work", () => {
		const plan = createEditPlan({
			prompt:
				"热血燃剪，9:16 竖屏 45 秒，大字高能字幕，鼓点快切，音乐卡点，开场直接给最强画面",
			mode: "hybrid",
			assetCount: 8,
			unusedAssetCount: 0,
			timelineElementCount: 8,
			videoClipCount: 8,
			durationSeconds: 360,
		});

		expect(plan.target.aspectRatio).toBe("9:16");
		expect(plan.target.targetDurationSeconds).toBe(45);
		expect(plan.target.style).toBe("热血燃剪");
		expect(plan.creativeDirection.hook).toContain("最强");
		expect(plan.creativeDirection.captionStyle).toContain("大字高能");
		expect(plan.creativeDirection.motionStyle).toContain("鼓点快切");
		expect(plan.creativeDirection.audioStrategy).toContain("卡点");
	});

	test("supports 4:5 social delivery and dual output variants", () => {
		const plan = createEditPlan({
			prompt:
				"小红书社媒精致感，4:5 画幅，同时交付横屏和竖屏双版本，信息卡片字幕，轻滑动效",
			mode: "chatcut",
			assetCount: 5,
			unusedAssetCount: 0,
			timelineElementCount: 5,
			videoClipCount: 5,
			durationSeconds: 120,
		});

		expect(plan.target.aspectRatio).toBe("4:5");
		expect(plan.target.style).toBe("社媒精致感");
		expect(
			plan.creativeDirection.outputVariants.map((item) => item.aspectRatio),
		).toEqual(["4:5", "9:16", "16:9"]);
		expect(plan.steps.map((step) => step.kind)).toContain("create-versions");
	});
});
