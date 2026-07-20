import { describe, expect, test } from "bun:test";
import {
	composeCreativeBriefPrompt,
	getCreativeBriefProgress,
	type CreativeBriefSelection,
} from "./brief";

describe("creative brief", () => {
	test("composes selected creative decisions into one stable prompt", () => {
		const brief: CreativeBriefSelection = {
			recipeId: "event-recap",
			platformId: "douyin",
			styleId: "documentary",
			captionId: "info-card",
			motionId: "slow-replay",
			audioId: "cinematic",
			deliveryIds: ["safe-zone", "dual-version"],
		};

		const prompt = composeCreativeBriefPrompt({
			brief,
			extraRequest: "保留颁奖和观众反应。",
		});

		expect(prompt).toContain("活动复盘");
		expect(prompt).toContain("抖音");
		expect(prompt).toContain("高级纪录片");
		expect(prompt).toContain("信息卡片字幕");
		expect(prompt).toContain("慢动作回放");
		expect(prompt).toContain("电影氛围");
		expect(prompt).toContain("横屏和竖屏双版本");
		expect(prompt).toContain("保留颁奖和观众反应");
	});

	test("reports brief readiness without treating optional delivery checks as required", () => {
		const brief: CreativeBriefSelection = {
			recipeId: "talking-head",
			platformId: "xiaohongshu",
			styleId: "clean-knowledge",
			captionId: "keyword",
			motionId: "clean-cut",
			audioId: "voice-first",
			deliveryIds: [],
		};

		expect(getCreativeBriefProgress(brief)).toEqual({ completed: 6, total: 6 });
	});
});
