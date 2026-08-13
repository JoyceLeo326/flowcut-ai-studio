import { describe, expect, test } from "bun:test";
import { installMockWasm } from "@/test-utils/mock-wasm";
import type { EffectElement, SceneTracks, VideoElement } from "@/timeline";

installMockWasm();

const {
	ADJUSTMENT_LAYER_MARKER,
	buildAdjustmentLayer,
	getAdjustmentLayers,
	isAdjustmentLayer,
	resolveAdjustmentRange,
} = await import("./adjustment-model");
const { mediaTimeFromSeconds } = await import("@/wasm");

const t = (seconds: number) => mediaTimeFromSeconds({ seconds });

function video({
	id,
	start,
	duration,
}: {
	id: string;
	start: number;
	duration: number;
}): VideoElement {
	return {
		id,
		type: "video",
		name: id,
		mediaId: `media-${id}`,
		startTime: t(start),
		duration: t(duration),
		trimStart: t(0),
		trimEnd: t(0),
		params: {},
	};
}

function effect({
	id,
	start,
	duration,
	managed,
}: {
	id: string;
	start: number;
	duration: number;
	managed: boolean;
}): EffectElement {
	return {
		id,
		type: "effect",
		effectType: "blur",
		name: id,
		startTime: t(start),
		duration: t(duration),
		trimStart: t(0),
		trimEnd: t(0),
		params: {
			intensity: 15,
			...(managed ? { [ADJUSTMENT_LAYER_MARKER]: true } : {}),
		},
	};
}

function tracks({
	videos = [],
	effects = [],
}: {
	videos?: VideoElement[];
	effects?: EffectElement[];
}): SceneTracks {
	return {
		main: {
			id: "main",
			name: "Main",
			type: "video",
			muted: false,
			hidden: false,
			elements: videos,
		},
		overlay: effects.length
			? [
					{
						id: "effects",
						name: "Effects",
						type: "effect",
						hidden: false,
						elements: effects,
					},
				]
			: [],
		audio: [],
	};
}

describe("adjustment layer model", () => {
	test("builds a renderer-compatible marked effect element", () => {
		const layer = buildAdjustmentLayer({
			presetId: "dream",
			startTime: t(2),
			duration: t(6),
		});
		expect(layer).toMatchObject({
			type: "effect",
			effectType: "blur",
			startTime: t(2),
			duration: t(6),
			params: { intensity: 28, [ADJUSTMENT_LAYER_MARKER]: true },
		});
	});

	test("resolves playhead, selected clip, and full scene ranges", () => {
		const scene = tracks({
			videos: [
				video({ id: "a", start: 0, duration: 4 }),
				video({ id: "b", start: 4, duration: 6 }),
			],
		});
		expect(
			resolveAdjustmentRange({
				tracks: scene,
				selection: [],
				playheadTime: t(8),
				requestedDuration: t(5),
				scope: "playhead",
			}),
		).toEqual({ ok: true, startTime: t(8), duration: t(2) });
		expect(
			resolveAdjustmentRange({
				tracks: scene,
				selection: [{ trackId: "main", elementId: "b" }],
				playheadTime: t(0),
				requestedDuration: t(1),
				scope: "selection",
			}),
		).toEqual({ ok: true, startTime: t(4), duration: t(6) });
		expect(
			resolveAdjustmentRange({
				tracks: scene,
				selection: [],
				playheadTime: t(0),
				requestedDuration: t(1),
				scope: "scene",
			}),
		).toEqual({ ok: true, startTime: t(0), duration: t(10) });
	});

	test("returns clear failures for empty scenes and invalid selection", () => {
		const empty = resolveAdjustmentRange({
			tracks: tracks({}),
			selection: [],
			playheadTime: t(0),
			requestedDuration: t(5),
			scope: "scene",
		});
		expect(empty.ok).toBe(false);
		if (!empty.ok) expect(empty.reason).toContain("visual clip");

		const invalidSelection = resolveAdjustmentRange({
			tracks: tracks({
				videos: [video({ id: "a", start: 0, duration: 4 })],
			}),
			selection: [],
			playheadTime: t(0),
			requestedDuration: t(5),
			scope: "selection",
		});
		expect(invalidSelection.ok).toBe(false);
		if (!invalidSelection.ok)
			expect(invalidSelection.reason).toContain("Select one");
	});

	test("lists only marked adjustment layers in timeline order", () => {
		const regular = effect({
			id: "regular",
			start: 0,
			duration: 2,
			managed: false,
		});
		const late = effect({ id: "late", start: 5, duration: 2, managed: true });
		const early = effect({ id: "early", start: 1, duration: 2, managed: true });
		const scene = tracks({
			videos: [video({ id: "a", start: 0, duration: 10 })],
			effects: [regular, late, early],
		});
		expect(isAdjustmentLayer(regular)).toBe(false);
		expect(isAdjustmentLayer(early)).toBe(true);
		expect(
			getAdjustmentLayers({ tracks: scene }).map((layer) => layer.element.id),
		).toEqual(["early", "late"]);
	});
});
