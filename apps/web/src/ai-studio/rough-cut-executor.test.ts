import { describe, expect, test } from "bun:test";
import type { SceneTracks, VideoElement } from "@/timeline";
import { installMockWasm } from "@/test-utils/mock-wasm";
import {
	createRoughCutPlan,
	reviewAllRoughCutOperations,
	type RoughCutEvidenceInterval,
} from "./rough-cut-plan";

installMockWasm();

const { mediaTimeFromSeconds, mediaTimeToSeconds } = await import("@/wasm");
const { buildRoughCutTracks, inspectRoughCutApplicability } =
	await import("./rough-cut-executor");

const params = {
	transform: {
		position: { x: 0, y: 0 },
		scale: { x: 1, y: 1 },
		rotation: 0,
	},
	opacity: 1,
};

function video({
	id,
	start,
	duration,
	trimStart = 0,
	mediaId = "asset-1",
}: {
	id: string;
	start: number;
	duration: number;
	trimStart?: number;
	mediaId?: string;
}): VideoElement {
	return {
		id,
		name: id,
		type: "video",
		mediaId,
		startTime: mediaTimeFromSeconds({ seconds: start }),
		duration: mediaTimeFromSeconds({ seconds: duration }),
		trimStart: mediaTimeFromSeconds({ seconds: trimStart }),
		trimEnd: mediaTimeFromSeconds({ seconds: 0 }),
		params,
	};
}

function tracks(elements: VideoElement[]): SceneTracks {
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

const evidence: RoughCutEvidenceInterval[] = [
	{
		evidenceId: "quiet-1",
		assetId: "asset-1",
		kind: "low-audio-energy",
		startSeconds: 2,
		endSeconds: 3,
		confidence: 0.9,
		method: "local-rms-v1",
	},
	{
		evidenceId: "quiet-2",
		assetId: "asset-1",
		kind: "low-audio-energy",
		startSeconds: 6,
		endSeconds: 7,
		confidence: 0.8,
		method: "local-rms-v1",
	},
];

const evidenceArtifact = {
	mediaIndexId: "media-index-1",
	assetFingerprint: "visioncut-asset-v1-test",
	algorithmVersion: "visioncut.media-index.local-signals/1.0.0",
} as const;

function approvedPlan() {
	const plan = createRoughCutPlan({
		clip: {
			projectId: "project-1",
			sceneId: "scene-1",
			trackId: "main",
			elementId: "target",
			assetId: "asset-1",
			timelineStartSeconds: 0,
			sourceStartSeconds: 0,
			durationSeconds: 10,
			playbackRate: 1,
		},
		evidence,
		evidenceArtifact,
		createdAt: "2026-07-23T00:00:00.000Z",
	});
	return reviewAllRoughCutOperations({
		plan,
		status: "approved",
		updatedAt: "2026-07-23T00:00:01.000Z",
	});
}

describe("VisionCut rough-cut executor", () => {
	test("blocks execution until at least one evidence-backed cut is approved", () => {
		const plan = createRoughCutPlan({
			clip: approvedPlan().baseline,
			evidence,
			evidenceArtifact,
			createdAt: "2026-07-23T00:00:00.000Z",
		});
		const applicability = inspectRoughCutApplicability({
			tracks: tracks([video({ id: "target", start: 0, duration: 10 })]),
			plan,
		});
		expect(applicability.canApply).toBe(false);
		expect(applicability.blockers[0]).toContain("批准");
	});

	test("rebuilds approved kept ranges and ripple-shifts following clips", () => {
		const plan = approvedPlan();
		const result = buildRoughCutTracks({
			tracks: tracks([
				video({ id: "target", start: 0, duration: 10 }),
				video({ id: "following", start: 10, duration: 2, mediaId: "asset-2" }),
			]),
			plan,
			elementIds: ["segment-1", "segment-2", "segment-3"],
		});
		expect(result.canApply).toBe(true);
		expect(result.approvedOperationCount).toBe(2);
		expect(result.removedSeconds).toBe(1.68);
		const output = result.tracks.main.elements;
		expect(output.map((element) => element.id)).toEqual([
			"segment-1",
			"segment-2",
			"segment-3",
			"following",
		]);
		expect(
			output
				.slice(0, 3)
				.map((element) => mediaTimeToSeconds({ time: element.duration })),
		).toEqual([2.08, 3.16, 3.08]);
		expect(mediaTimeToSeconds({ time: output[3].startTime })).toBe(8.32);
	});

	test("preserves source mapping through trimStart and trimEnd", () => {
		const basePlan = createRoughCutPlan({
			clip: {
				...approvedPlan().baseline,
				sourceStartSeconds: 1,
				durationSeconds: 8,
			},
			evidence,
			evidenceArtifact,
			createdAt: "2026-07-23T00:00:00.000Z",
		});
		const plan = reviewAllRoughCutOperations({
			plan: basePlan,
			status: "approved",
			updatedAt: "2026-07-23T00:00:01.000Z",
		});
		const result = buildRoughCutTracks({
			tracks: tracks([
				video({ id: "target", start: 0, duration: 8, trimStart: 1 }),
			]),
			plan,
			elementIds: ["a", "b", "c"],
		});
		const output = result.tracks.main.elements;
		expect(
			output.map((element) => mediaTimeToSeconds({ time: element.trimStart })),
		).toEqual([1, 2.92, 6.92]);
		expect(
			output.map((element) => mediaTimeToSeconds({ time: element.trimEnd })),
		).toEqual([6.92, 2.92, 0]);
	});

	test("blocks stale baselines, overlaps, animations, retiming and bookmarks", () => {
		const plan = approvedPlan();
		const stale = inspectRoughCutApplicability({
			tracks: tracks([video({ id: "target", start: 1, duration: 10 })]),
			plan,
		});
		expect(stale.blockers.join(" ")).toContain("变化");

		const overlapTracks = tracks([
			video({ id: "target", start: 0, duration: 10 }),
		]);
		overlapTracks.overlay.push({
			id: "overlay",
			name: "Overlay",
			type: "video",
			muted: true,
			hidden: false,
			elements: [
				video({ id: "cover", start: 4, duration: 1, mediaId: "asset-2" }),
			],
		});
		expect(
			inspectRoughCutApplicability({
				tracks: overlapTracks,
				plan,
			}).blockers.join(" "),
		).toContain("重叠");

		const animated = video({ id: "target", start: 0, duration: 10 });
		animated.animations = { opacity: { keys: [] } };
		expect(
			inspectRoughCutApplicability({
				tracks: tracks([animated]),
				plan,
			}).blockers.join(" "),
		).toContain("关键帧");

		const retimed = video({ id: "target", start: 0, duration: 10 });
		retimed.retime = { rate: 1.25 };
		expect(
			inspectRoughCutApplicability({
				tracks: tracks([retimed]),
				plan,
			}).blockers.join(" "),
		).toContain("变速");
		expect(
			inspectRoughCutApplicability({
				tracks: tracks([video({ id: "target", start: 0, duration: 10 })]),
				plan,
				hasTimelineBookmarks: true,
			}).blockers.join(" "),
		).toContain("书签");
	});

	test("requires stable unique segment ids", () => {
		expect(() =>
			buildRoughCutTracks({
				tracks: tracks([video({ id: "target", start: 0, duration: 10 })]),
				plan: approvedPlan(),
				elementIds: ["same", "same", "same"],
			}),
		).toThrow("unique");
	});

	test("blocks execution when the analyzed asset or MediaIndex changed", () => {
		const current = approvedPlan();
		const staleAsset = inspectRoughCutApplicability({
			tracks: tracks([video({ id: "target", start: 0, duration: 10 })]),
			plan: current,
			currentAssetFingerprint: "visioncut-asset-v1-replaced",
			currentMediaIndexId: current.evidenceArtifact.mediaIndexId,
		});
		expect(staleAsset.canApply).toBe(false);
		expect(staleAsset.blockers.join(" ")).toContain("素材指纹");

		const staleIndex = inspectRoughCutApplicability({
			tracks: tracks([video({ id: "target", start: 0, duration: 10 })]),
			plan: current,
			currentAssetFingerprint: current.evidenceArtifact.assetFingerprint,
			currentMediaIndexId: "media-index-new",
		});
		expect(staleIndex.canApply).toBe(false);
		expect(staleIndex.blockers.join(" ")).toContain("分析版本");
	});
});
