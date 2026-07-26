import { describe, expect, test } from "bun:test";
import { createMediaIndex } from "./media-index";
import {
	createRoughCutPlanFromMediaIndex,
	mediaIndexToRoughCutEvidence,
} from "./media-index-rough-cut";

const source = {
	sourceId: "capture-audio",
	method: "mediabunny-audio-buffer-sink" as const,
};

function index() {
	return createMediaIndex({
		assetId: "asset-1",
		metadata: {
			durationSeconds: 6,
			hasVideo: false,
			hasAudio: true,
			source: { sourceId: "capture", method: "mediabunny-input" },
		},
		videoFrameSamples: [],
		audioWindowSamples: [
			{ startSeconds: 1, endSeconds: 1.25, rms: 0.002, peak: 0.01, source },
			{
				startSeconds: 1.25,
				endSeconds: 1.5,
				rms: 0.003,
				peak: 0.012,
				source,
			},
			{ startSeconds: 2, endSeconds: 2.25, rms: 0.05, peak: 0.1, source },
		],
	});
}

describe("MediaIndex rough-cut bridge", () => {
	test("uses only low-energy candidates and preserves finding ids", () => {
		const mediaIndex = index();
		const evidence = mediaIndexToRoughCutEvidence({ index: mediaIndex });
		expect(evidence).toHaveLength(1);
		expect(evidence[0]).toMatchObject({
			assetId: "asset-1",
			kind: "low-audio-energy",
			startSeconds: 1,
			endSeconds: 1.5,
		});
		expect(evidence[0].evidenceId).toBe(
			mediaIndex.audioActivityCandidates[0].findingId,
		);
	});

	test("binds the plan to the exact MediaIndex and source fingerprint", () => {
		const mediaIndex = index();
		const plan = createRoughCutPlanFromMediaIndex({
			index: mediaIndex,
			assetFingerprint: "visioncut-asset-v1-test",
			clip: {
				projectId: "project-1",
				sceneId: "scene-1",
				trackId: "main",
				elementId: "clip-1",
				assetId: "asset-1",
				timelineStartSeconds: 4,
				sourceStartSeconds: 0,
				durationSeconds: 6,
				playbackRate: 1,
			},
			options: {
				minimumEvidenceSeconds: 0.3,
				cutPaddingSeconds: 0.05,
			},
			createdAt: "2026-07-23T00:00:00.000Z",
		});
		expect(plan.operations).toHaveLength(1);
		expect(plan.operations[0].timelineRange).toEqual({
			startSeconds: 5.05,
			endSeconds: 5.45,
		});
		expect(plan.evidenceArtifact).toEqual({
			mediaIndexId: mediaIndex.mediaIndexId,
			assetFingerprint: "visioncut-asset-v1-test",
			algorithmVersion: mediaIndex.algorithm.version,
		});
	});

	test("rejects cross-asset plans", () => {
		expect(() =>
			createRoughCutPlanFromMediaIndex({
				index: index(),
				assetFingerprint: "visioncut-asset-v1-test",
				clip: {
					projectId: "project-1",
					sceneId: "scene-1",
					trackId: "main",
					elementId: "clip-1",
					assetId: "asset-2",
					timelineStartSeconds: 0,
					sourceStartSeconds: 0,
					durationSeconds: 6,
					playbackRate: 1,
				},
				createdAt: "2026-07-23T00:00:00.000Z",
			}),
		).toThrow("same asset");
	});
});
