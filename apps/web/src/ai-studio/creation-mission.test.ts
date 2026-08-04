import { describe, expect, test } from "bun:test";
import {
	buildCreationMission,
	createDefaultCreationMission,
} from "./creation-mission";

describe("home creation mission", () => {
	test("turns a named creator, deadline, audience, and tradeoff into an IntentSpec-ready task", () => {
		const mission = buildCreationMission({
			intent: "把新品发布会剪成一支有证据、有高潮的短片",
			selection: {
				...createDefaultCreationMission(),
				creatorName: "林夏",
				creatorRole: "品牌内容负责人",
				audience: "通勤静音观看者",
				priority: "信息可复述",
				platform: "xiaohongshu",
				durationSeconds: 60,
				deliveryTime: "今晚 20:00",
			},
		});

		expect(mission.projectName).toBe(
			"把新品发布会剪成一支有证据、有高潮的短片",
		);
		expect(mission.userIntent).toContain("主创：林夏（品牌内容负责人）");
		expect(mission.userIntent).toContain("目标观众：通勤静音观看者");
		expect(mission.userIntent).toContain("取舍：信息可复述");
		expect(mission.target).toEqual({
			platform: "小红书",
			aspectRatio: "4:5",
			durationSeconds: 60,
			style: "信息分层、静音可读，保证观众看完能复述一个核心结论",
		});
		expect(mission.decision.conflict).toContain("60 秒");
		expect(mission.decision.choice).toContain("能复述");
		expect(mission.decision.expectedOutcome).toContain("今晚 20:00");
		expect(mission.decision.reviewPrompt).toContain("静音播放");
	});

	test("changes the downstream story and target when audience, priority, and platform change", () => {
		const base = createDefaultCreationMission();
		const emotion = buildCreationMission({
			intent: "把返乡访谈剪成人物故事",
			selection: {
				...base,
				audience: "关注人物命运的观众",
				priority: "人物情绪完整",
				platform: "bilibili",
				durationSeconds: 180,
			},
		});
		const hook = buildCreationMission({
			intent: "把返乡访谈剪成人物故事",
			selection: {
				...base,
				audience: "第一次认识主人公的人",
				priority: "三秒建立冲突",
				platform: "douyin",
				durationSeconds: 30,
			},
		});

		expect(emotion.target).not.toEqual(hook.target);
		expect(emotion.userIntent).toContain("保留犹豫、选择和代价");
		expect(hook.userIntent).toContain("前 3 秒先给冲突或结果");
		expect(emotion.decision.reviewPrompt).not.toBe(hook.decision.reviewPrompt);
	});

	test("rejects an empty editing intent instead of creating a hollow project", () => {
		expect(() =>
			buildCreationMission({
				intent: "   ",
				selection: createDefaultCreationMission(),
			}),
		).toThrow(/intent/iu);
	});
});
