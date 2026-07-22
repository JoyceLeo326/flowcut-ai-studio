import { describe, expect, test } from "bun:test";
import { createEditPlan } from "@/ai-edit/planner";
import {
	createEmptyCreatorDNA,
	exportCreatorDNA,
	learnCreatorDNAFromConfirmedPlan,
	overrideCreatorPreference,
	setCreatorDNAEnabled,
} from "./creator-dna";

function createPlan(prompt: string) {
	return createEditPlan({
		prompt,
		mode: "local",
		assetCount: 3,
		unusedAssetCount: 3,
		timelineElementCount: 0,
		videoClipCount: 0,
		durationSeconds: 0,
	});
}

describe("Creator DNA", () => {
	test("starts empty, enabled and local-first", () => {
		const profile = createEmptyCreatorDNA("2026-07-23T00:00:00.000Z");
		expect(profile.enabled).toBe(true);
		expect(profile.explicitDecisionCount).toBe(0);
		expect(profile.preferences).toEqual({});
		expect(profile.formatVersion).toBe("visioncut.creator-dna/v1");
	});

	test("learns only from an explicitly supplied confirmed plan", () => {
		const profile = createEmptyCreatorDNA("2026-07-23T00:00:00.000Z");
		const plan = createPlan(
			"把口播做成 60 秒竖屏，清爽知识风，人声优先，关键词字幕",
		);
		const learned = learnCreatorDNAFromConfirmedPlan({
			profile,
			evidence: {
				plan,
				confirmedAt: "2026-07-23T01:00:00.000Z",
			},
		});

		expect(learned.explicitDecisionCount).toBe(1);
		expect(learned.preferences.rhythm?.value).toBe("balanced");
		expect(learned.preferences.captionDensity?.value).toBe("dense");
		expect(learned.preferences.audioPriority?.value).toBe("voice");
		expect(learned.preferences.aspectRatio?.value).toBe("9:16");
		expect(learned.preferences.platform?.value).toBe("通用成片");
		expect(learned.preferences.visualStyle?.value).toBe("清爽知识感");
	});

	test("does not learn while the profile is paused", () => {
		const paused = setCreatorDNAEnabled({
			profile: createEmptyCreatorDNA("2026-07-23T00:00:00.000Z"),
			enabled: false,
			at: "2026-07-23T00:10:00.000Z",
		});
		const result = learnCreatorDNAFromConfirmedPlan({
			profile: paused,
			evidence: { plan: createPlan("高燃赛事高光") },
		});
		expect(result).toBe(paused);
		expect(result.explicitDecisionCount).toBe(0);
	});

	test("raises confidence for repeated explicit decisions", () => {
		const first = learnCreatorDNAFromConfirmedPlan({
			profile: createEmptyCreatorDNA("2026-07-23T00:00:00.000Z"),
			evidence: {
				plan: createPlan("高燃赛事高光，音乐卡点"),
				confirmedAt: "2026-07-23T01:00:00.000Z",
			},
		});
		const second = learnCreatorDNAFromConfirmedPlan({
			profile: first,
			evidence: {
				plan: createPlan("热血燃剪，鼓点快切"),
				confirmedAt: "2026-07-23T02:00:00.000Z",
			},
		});

		expect(second.preferences.rhythm?.value).toBe("fast");
		expect(second.preferences.rhythm?.evidenceCount).toBe(2);
		expect(second.preferences.rhythm?.confidence).toBeGreaterThan(
			first.preferences.rhythm?.confidence ?? 0,
		);
		expect(second.preferences.rhythm?.sourcePlanIds).toHaveLength(2);
	});

	test("does not count the same confirmed plan twice", () => {
		const profile = createEmptyCreatorDNA("2026-07-23T00:00:00.000Z");
		const plan = createPlan("做成紧凑的竖屏人物故事");
		const first = learnCreatorDNAFromConfirmedPlan({
			profile,
			evidence: { plan, confirmedAt: "2026-07-23T01:00:00.000Z" },
		});
		const duplicate = learnCreatorDNAFromConfirmedPlan({
			profile: first,
			evidence: { plan, confirmedAt: "2026-07-23T02:00:00.000Z" },
		});
		expect(duplicate).toBe(first);
		expect(duplicate.explicitDecisionCount).toBe(1);
	});

	test("lets the user explicitly override a learned preference", () => {
		const learned = learnCreatorDNAFromConfirmedPlan({
			profile: createEmptyCreatorDNA("2026-07-23T00:00:00.000Z"),
			evidence: { plan: createPlan("高燃赛事高光") },
		});
		const overridden = overrideCreatorPreference({
			profile: learned,
			key: "rhythm",
			value: "calm",
			at: "2026-07-23T03:00:00.000Z",
		});
		expect(overridden.preferences.rhythm?.value).toBe("calm");
		expect(overridden.preferences.rhythm?.confidence).toBe(1);
	});

	test("exports plain JSON the user can inspect", () => {
		const profile = createEmptyCreatorDNA("2026-07-23T00:00:00.000Z");
		const exported: unknown = JSON.parse(exportCreatorDNA(profile));
		if (typeof exported !== "object" || exported === null) {
			throw new Error("Creator DNA export must be an object");
		}
		expect("id" in exported ? exported.id : undefined).toBe("local-creator");
		expect(
			"formatVersion" in exported ? exported.formatVersion : undefined,
		).toBe("visioncut.creator-dna/v1");
	});
});
