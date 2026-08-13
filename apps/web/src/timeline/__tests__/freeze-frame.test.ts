import { describe, expect, test } from "bun:test";
import { installMockWasm } from "@/test-utils/mock-wasm";
import type { MediaAsset } from "@/media/types";
import type {
	ElementAnimations,
	ScalarAnimationChannel,
} from "@/animation/types";
import type { ImageElement, SceneTracks, VideoElement } from "@/timeline/types";

installMockWasm();

const { applyFreezeFrameMutation, FreezeFrameError, resolveFreezeFrameTarget } =
	await import("../freeze-frame");
const { mediaTimeFromSeconds, mediaTimeToSeconds } = await import("@/wasm");

const t = (seconds: number) => mediaTimeFromSeconds({ seconds });

function scalarChannel({
	from,
	to,
}: {
	from: number;
	to: number;
}): ScalarAnimationChannel {
	return {
		keys: [
			{
				id: "key-a",
				time: t(0),
				value: from,
				segmentToNext: "linear",
				tangentMode: "auto",
			},
			{
				id: "key-b",
				time: t(8),
				value: to,
				segmentToNext: "linear",
				tangentMode: "auto",
			},
		],
	};
}

function sourceVideo({
	start = 2,
	duration = 8,
	trimStart = 1,
	retimeRate = 1,
	animations,
}: {
	start?: number;
	duration?: number;
	trimStart?: number;
	retimeRate?: number;
	animations?: ElementAnimations;
} = {}): VideoElement {
	return {
		id: "clip-a",
		name: "Interview",
		type: "video",
		mediaId: "asset-a",
		startTime: t(start),
		duration: t(duration),
		trimStart: t(trimStart),
		trimEnd: t(3),
		sourceDuration: t(trimStart + duration * retimeRate + 3),
		retime: { rate: retimeRate },
		params: {
			"transform.positionX": 0,
			"transform.positionY": 0,
			"transform.scaleX": 1,
			"transform.scaleY": 1,
			"transform.rotate": 0,
			opacity: 1,
			blendMode: "normal",
		},
		animations,
		effects: [
			{
				id: "fx-a",
				type: "test-effect",
				enabled: true,
				params: { amount: 0 },
			},
		],
		masks: [],
	};
}

function tracks({
	video = sourceVideo(),
	after = true,
}: {
	video?: VideoElement;
	after?: boolean;
} = {}): SceneTracks {
	return {
		main: {
			id: "main",
			name: "Main",
			type: "video",
			muted: false,
			hidden: false,
			elements: [
				video,
				...(after
					? [
							{
								...sourceVideo({ start: 10, duration: 3, trimStart: 0 }),
								id: "clip-b",
								name: "Following clip",
								mediaId: "asset-b",
							},
						]
					: []),
			],
		},
		overlay: [],
		audio: [],
	};
}

function asset({
	id = "asset-a",
	type = "video",
	duration = 30,
}: {
	id?: string;
	type?: MediaAsset["type"];
	duration?: number;
} = {}): MediaAsset {
	const extension = type === "video" ? "mp4" : "png";
	const mime = type === "video" ? "video/mp4" : "image/png";
	return {
		id,
		name: `${id}.${extension}`,
		type,
		file: new File([`${id}-bytes`], `${id}.${extension}`, {
			type: mime,
			lastModified: 101,
		}),
		duration,
		width: 1920,
		height: 1080,
		fps: type === "video" ? 30 : undefined,
	};
}

function resolveTarget({
	video = sourceVideo(),
	playhead = 6,
}: {
	video?: VideoElement;
	playhead?: number;
} = {}) {
	return resolveFreezeFrameTarget({
		tracks: tracks({ video }),
		selection: [{ trackId: "main", elementId: video.id }],
		mediaAssets: [asset(), asset({ id: "asset-b" })],
		playheadTime: t(playhead),
	});
}

function expectFreezeError({
	run,
	code,
}: {
	run: () => unknown;
	code: FreezeFrameError["code"];
}) {
	try {
		run();
		expect.unreachable(`Expected ${code}`);
	} catch (error) {
		expect(error).toBeInstanceOf(FreezeFrameError);
		if (!(error instanceof FreezeFrameError)) {
			throw error;
		}
		expect(error.code).toBe(code);
	}
}

describe("freeze-frame target validation", () => {
	test("resolves the retimed source frame at the playhead", () => {
		const video = sourceVideo({ retimeRate: 2 });
		const target = resolveTarget({ video, playhead: 5 });

		expect(mediaTimeToSeconds({ time: target.clipTime })).toBe(3);
		expect(mediaTimeToSeconds({ time: target.sourceTime })).toBe(7);
		expect(target.asset.id).toBe("asset-a");
	});

	test("reports no selection and multiple selection explicitly", () => {
		const currentTracks = tracks();
		for (const [selection, code] of [
			[[], "NO_SELECTION"],
			[
				[
					{ trackId: "main", elementId: "clip-a" },
					{ trackId: "main", elementId: "clip-b" },
				],
				"MULTIPLE_SELECTION",
			],
		] as const) {
			expectFreezeError({
				run: () =>
					resolveFreezeFrameTarget({
						tracks: currentTracks,
						selection,
						mediaAssets: [asset()],
						playheadTime: t(6),
					}),
				code,
			});
		}
	});

	test("rejects non-video elements and mismatched source formats", () => {
		const imageTracks = tracks({ after: false });
		const source = sourceVideo();
		const image: ImageElement = {
			id: source.id,
			name: source.name,
			type: "image",
			mediaId: source.mediaId,
			startTime: source.startTime,
			duration: source.duration,
			trimStart: source.trimStart,
			trimEnd: source.trimEnd,
			sourceDuration: source.sourceDuration,
			params: source.params,
		};
		imageTracks.main.elements = [image];
		expectFreezeError({
			run: () =>
				resolveFreezeFrameTarget({
					tracks: imageTracks,
					selection: [{ trackId: "main", elementId: "clip-a" }],
					mediaAssets: [asset({ type: "image" })],
					playheadTime: t(6),
				}),
			code: "NOT_VIDEO",
		});

		expectFreezeError({
			run: () =>
				resolveFreezeFrameTarget({
					tracks: tracks(),
					selection: [{ trackId: "main", elementId: "clip-a" }],
					mediaAssets: [asset({ type: "image" })],
					playheadTime: t(6),
				}),
			code: "UNSUPPORTED_FORMAT",
		});
	});

	test("distinguishes start, end, and outside playhead boundaries", () => {
		for (const [playhead, code] of [
			[2, "PLAYHEAD_AT_START"],
			[10, "PLAYHEAD_AT_END"],
			[1, "PLAYHEAD_OUTSIDE_CLIP"],
		] as const) {
			expectFreezeError({
				run: () => resolveTarget({ playhead }),
				code,
			});
		}
	});

	test("rejects an overlapping source track", () => {
		const currentTracks = tracks({ after: false });
		currentTracks.main.elements.push({
			...sourceVideo({ start: 5, duration: 2, trimStart: 0 }),
			id: "overlap",
		});
		expectFreezeError({
			run: () =>
				resolveFreezeFrameTarget({
					tracks: currentTracks,
					selection: [{ trackId: "main", elementId: "clip-a" }],
					mediaAssets: [asset()],
					playheadTime: t(6),
				}),
			code: "TRACK_OVERLAP",
		});
	});
});

describe("freeze-frame timeline mutation", () => {
	test("splits the clip, inserts a still, and shifts following track content", () => {
		const original = tracks();
		const target = resolveTarget();
		const result = applyFreezeFrameMutation({
			tracks: original,
			target,
			frozenAssetId: "frozen-asset",
			freezeDuration: t(2),
			frozenElementId: "frozen-element",
			rightElementId: "right-element",
		});
		const [left, still, right, following] = result.tracks.main.elements;

		expect(original.main.elements).toHaveLength(2);
		expect(result.tracks.main.elements).toHaveLength(4);
		expect(left.id).toBe("clip-a");
		expect(mediaTimeToSeconds({ time: left.duration })).toBe(4);
		expect(mediaTimeToSeconds({ time: left.trimEnd })).toBe(7);
		expect(still).toMatchObject({
			id: "frozen-element",
			type: "image",
			mediaId: "frozen-asset",
		});
		expect(mediaTimeToSeconds({ time: still.startTime })).toBe(6);
		expect(mediaTimeToSeconds({ time: still.duration })).toBe(2);
		expect(right.id).toBe("right-element");
		expect(mediaTimeToSeconds({ time: right.startTime })).toBe(8);
		expect(mediaTimeToSeconds({ time: right.duration })).toBe(4);
		expect(mediaTimeToSeconds({ time: right.trimStart })).toBe(5);
		expect(mediaTimeToSeconds({ time: following.startTime })).toBe(12);
		expect(result.frozenElementRef).toEqual({
			trackId: "main",
			elementId: "frozen-element",
		});
	});

	test("bakes animated visual and effect values into the still", () => {
		const animations: ElementAnimations = {
			"transform.positionX": scalarChannel({ from: 0, to: 80 }),
			"effects.fx-a.params.amount": scalarChannel({ from: 0, to: 1 }),
		};
		const video = sourceVideo({ animations });
		const target = resolveTarget({ video, playhead: 6 });
		const result = applyFreezeFrameMutation({
			tracks: tracks({ video }),
			target,
			frozenAssetId: "frozen-asset",
			freezeDuration: t(2),
			frozenElementId: "still",
			rightElementId: "right",
		});
		const still = result.tracks.main.elements.find(
			(element) => element.id === "still",
		);

		expect(still?.type).toBe("image");
		if (still?.type !== "image") return;
		expect(still.animations).toBeUndefined();
		expect(still.params["transform.positionX"]).toBe(40);
		expect(still.effects?.[0].params.amount).toBe(0.5);
	});

	test("preserves source timing at 2x playback rate", () => {
		const video = sourceVideo({ duration: 4, retimeRate: 2 });
		const target = resolveTarget({ video, playhead: 4 });
		const result = applyFreezeFrameMutation({
			tracks: tracks({ video, after: false }),
			target,
			frozenAssetId: "frozen-asset",
			freezeDuration: t(1),
			frozenElementId: "still",
			rightElementId: "right",
		});
		const [left, , right] = result.tracks.main.elements;

		expect(mediaTimeToSeconds({ time: left.duration })).toBe(2);
		expect(mediaTimeToSeconds({ time: left.trimEnd })).toBe(7);
		expect(mediaTimeToSeconds({ time: right.duration })).toBe(2);
		expect(mediaTimeToSeconds({ time: right.trimStart })).toBe(5);
	});
});
