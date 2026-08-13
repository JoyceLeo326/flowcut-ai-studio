import { describe, expect, test } from "bun:test";
import { installMockWasm } from "@/test-utils/mock-wasm";
import type {
	SceneTracks,
	TimelineElement,
	VideoElement,
} from "@/timeline";
import type { ElementAnimations } from "@/animation/types";

installMockWasm();

const {
	buildRemoveTransitionPlan,
	buildTransitionPlan,
	getTransitionSummary,
	resolveTransitionTarget,
} = await import("./transition-model");
const { applyElementUpdate } = await import("@/timeline/update-pipeline");
const { mediaTimeFromSeconds } = await import("@/wasm");

const t = (seconds: number) => mediaTimeFromSeconds({ seconds });

function clip({
	id,
	start,
	duration = 4,
	animations,
}: {
	id: string;
	start: number;
	duration?: number;
	animations?: ElementAnimations;
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
		params: {
			"transform.positionX": 0,
			"transform.positionY": 0,
			"transform.scaleX": 1,
			"transform.scaleY": 1,
			"transform.rotate": 0,
			opacity: 1,
		},
		animations,
	};
}

function scene(...elements: VideoElement[]): SceneTracks {
	return {
		main: {
			id: "main",
			name: "Main",
			type: "video",
			muted: false,
			hidden: false,
			elements,
		},
		overlay: [],
		audio: [],
	};
}

function applyPlan({
	tracks,
	updates,
}: {
	tracks: SceneTracks;
	updates: Array<{
		trackId: string;
		elementId: string;
		patch: Partial<TimelineElement>;
	}>;
}): SceneTracks {
	let next = tracks;
	for (const update of updates) {
		next = {
			...next,
			main: {
				...next.main,
				elements: next.main.elements.map((element) =>
					element.id === update.elementId
						? (applyElementUpdate({
								element,
								patch: update.patch,
								context: { tracks: next, trackId: update.trackId },
							}) as VideoElement)
						: element,
				),
			},
		};
	}
	return next;
}

describe("transition model", () => {
	test("resolves a selected adjacent cut and picks the nearest side for one clip", () => {
		const tracks = scene(
			clip({ id: "a", start: 0 }),
			clip({ id: "b", start: 4 }),
			clip({ id: "c", start: 8 }),
		);

		const selected = resolveTransitionTarget({
			tracks,
			selection: [
				{ trackId: "main", elementId: "a" },
				{ trackId: "main", elementId: "b" },
			],
			playheadTime: t(0),
			tolerance: t(1 / 30),
		});
		expect(selected.ok && selected.pair.cutTime).toBe(t(4));
		expect(selected.ok && selected.source).toBe("selection");

		const nearest = resolveTransitionTarget({
			tracks,
			selection: [{ trackId: "main", elementId: "b" }],
			playheadTime: t(7.9),
			tolerance: t(1 / 30),
		});
		expect(nearest.ok && nearest.pair.cutTime).toBe(t(8));
	});

	test("rejects gaps and unrelated multi-selection with actionable reasons", () => {
		const tracks = scene(
			clip({ id: "a", start: 0 }),
			clip({ id: "b", start: 5 }),
		);
		const result = resolveTransitionTarget({
			tracks,
			selection: [
				{ trackId: "main", elementId: "a" },
				{ trackId: "main", elementId: "b" },
			],
			playheadTime: t(4),
			tolerance: t(1 / 30),
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toContain("adjacent");
	});

	test("creates bounded animation patches for both clips", () => {
		const tracks = scene(
			clip({ id: "a", start: 0, duration: 0.5 }),
			clip({ id: "b", start: 0.5, duration: 0.5 }),
		);
		const target = resolveTransitionTarget({
			tracks,
			selection: [],
			playheadTime: t(0.5),
			tolerance: t(1 / 30),
		});
		expect(target.ok).toBe(true);
		if (!target.ok) return;

		const plan = buildTransitionPlan({
			pair: target.pair,
			presetId: "zoom",
			requestedDuration: t(3),
			transitionId: "transition-1",
			canvasWidth: 1920,
		});
		expect(plan.ok).toBe(true);
		if (!plan.ok) return;
		expect(plan.actualDuration).toBe(t(0.45));
		expect(plan.updates).toHaveLength(2);
		expect(
			Object.keys(plan.updates[0]?.patch.animations ?? {}).sort(),
		).toEqual(["opacity", "transform.scaleX", "transform.scaleY"]);
	});

	test("preserves unrelated animation paths and refuses to overwrite custom paths", () => {
		const customOpacity: ElementAnimations = {
			opacity: {
				keys: [
					{
						id: "user-key",
						time: t(0),
						value: 1,
						segmentToNext: "linear",
						tangentMode: "flat",
					},
				],
			},
		};
		const tracks = scene(
			clip({ id: "a", start: 0, animations: customOpacity }),
			clip({ id: "b", start: 4 }),
		);
		const target = resolveTransitionTarget({
			tracks,
			selection: [],
			playheadTime: t(4),
			tolerance: t(1 / 30),
		});
		if (!target.ok) throw new Error("Expected target");

		const blocked = buildTransitionPlan({
			pair: target.pair,
			presetId: "fade",
			requestedDuration: t(0.8),
			transitionId: "transition-2",
			canvasWidth: 1920,
		});
		expect(blocked.ok).toBe(false);
		if (!blocked.ok) expect(blocked.reason).toContain("custom animation");

		const allowed = buildTransitionPlan({
			pair: target.pair,
			presetId: "push-left",
			requestedDuration: t(0.8),
			transitionId: "transition-3",
			canvasWidth: 1920,
		});
		expect(allowed.ok).toBe(true);
		if (allowed.ok) {
			expect(allowed.updates[0]?.patch.animations?.opacity).toEqual(
				customOpacity.opacity,
			);
		}
	});

	test("summarizes, replaces, and removes only managed transition data", () => {
		const original = scene(
			clip({ id: "a", start: 0 }),
			clip({ id: "b", start: 4 }),
		);
		const target = resolveTransitionTarget({
			tracks: original,
			selection: [],
			playheadTime: t(4),
			tolerance: t(1 / 30),
		});
		if (!target.ok) throw new Error("Expected target");
		const first = buildTransitionPlan({
			pair: target.pair,
			presetId: "fade",
			requestedDuration: t(0.8),
			transitionId: "stable-id",
			canvasWidth: 1920,
		});
		if (!first.ok) throw new Error(first.reason);
		const applied = applyPlan({ tracks: original, updates: first.updates });
		const appliedTarget = resolveTransitionTarget({
			tracks: applied,
			selection: [],
			playheadTime: t(4),
			tolerance: t(1 / 30),
		});
		if (!appliedTarget.ok) throw new Error("Expected applied target");
		expect(getTransitionSummary({ pair: appliedTarget.pair })).toMatchObject({
			id: "stable-id",
			type: "fade",
			complete: true,
		});

		const replacement = buildTransitionPlan({
			pair: appliedTarget.pair,
			presetId: "whip",
			requestedDuration: t(1.2),
			transitionId: "stable-id",
			canvasWidth: 1920,
		});
		if (!replacement.ok) throw new Error(replacement.reason);
		const replaced = applyPlan({ tracks: applied, updates: replacement.updates });
		const removedTarget = resolveTransitionTarget({
			tracks: replaced,
			selection: [],
			playheadTime: t(4),
			tolerance: t(1 / 30),
		});
		if (!removedTarget.ok) throw new Error("Expected replaced target");
		const removal = buildRemoveTransitionPlan({ pair: removedTarget.pair });
		if (!removal.ok) throw new Error(removal.reason);
		const cleaned = applyPlan({ tracks: replaced, updates: removal.updates });
		const finalTarget = resolveTransitionTarget({
			tracks: cleaned,
			selection: [],
			playheadTime: t(4),
			tolerance: t(1 / 30),
		});
		if (!finalTarget.ok) throw new Error("Expected final target");
		expect(getTransitionSummary({ pair: finalTarget.pair })).toBeNull();
		expect(cleaned.main.elements.every((element) => !element.animations)).toBe(
			true,
		);
	});
});
