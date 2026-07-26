import { describe, expect, test } from "bun:test";
import {
	LOCAL_MEDIA_SAMPLER_VERSION,
	type LocalMediaSampleCapture,
} from "./local-media-sampler";
import {
	createLocalAssetFingerprint,
	createMediaIndexFromLocalCapture,
	localCaptureToMediaIndexInput,
} from "./media-index-adapter";

const capture: LocalMediaSampleCapture = {
	kind: "visioncut.local-media-sample-capture",
	version: LOCAL_MEDIA_SAMPLER_VERSION,
	asset: {
		id: "asset-1",
		name: "talk.mp4",
		mediaType: "video",
		mimeType: "video/mp4",
		sizeBytes: 1024,
		lastModified: 123,
		durationSeconds: 5,
		width: 1920,
		height: 1080,
		fps: 30,
		hasAudio: true,
	},
	coverage: { startSeconds: 0, endSeconds: 5, truncated: false },
	capabilities: {
		videoTrackPresent: true,
		videoDecoded: true,
		audioTrackPresent: true,
		audioDecoded: true,
	},
	frameSamples: [
		{
			requestedAtSeconds: 0,
			observedAtSeconds: 0,
			lumaMean: 0.4,
			lumaStandardDeviation: 0.1,
			darkPixelRatio: 0,
			lightPixelRatio: 0,
			differenceFromPrevious: null,
		},
		{
			requestedAtSeconds: 2,
			observedAtSeconds: 2.0000001,
			lumaMean: 0.8,
			lumaStandardDeviation: 0.2,
			darkPixelRatio: 0,
			lightPixelRatio: 0.1,
			differenceFromPrevious: 0.5,
		},
	],
	audioSamples: [
		{
			requestedAtSeconds: 1,
			observedAtSeconds: 1,
			durationSeconds: 0.25,
			rms: 0.002,
			peak: 0.005,
		},
		{
			requestedAtSeconds: 1,
			observedAtSeconds: 1,
			durationSeconds: 0.25,
			rms: 0.001,
			peak: 0.004,
		},
	],
	limitations: ["No ASR."],
};

describe("local media capture adapter", () => {
	test("maps observed timestamps and honest Mediabunny capture methods", () => {
		const input = localCaptureToMediaIndexInput({ capture });
		expect(input.metadata.source.method).toBe("mediabunny-input");
		expect(input.videoFrameSamples[0].differenceFromPrevious).toBe(0);
		expect(input.videoFrameSamples[1].atSeconds).toBe(2);
		expect(input.videoFrameSamples[1].source.method).toBe(
			"mediabunny-canvas-sink",
		);
		expect(input.audioWindowSamples).toHaveLength(1);
		expect(input.audioWindowSamples[0]).toMatchObject({
			startSeconds: 1,
			endSeconds: 1.25,
			rms: 0.002,
			peak: 0.005,
			source: { method: "mediabunny-audio-buffer-sink" },
		});
	});

	test("creates a deterministic MediaIndex with explicit capability limits", () => {
		const first = createMediaIndexFromLocalCapture({ capture });
		const second = createMediaIndexFromLocalCapture({
			capture: structuredClone(capture),
		});
		expect(second.mediaIndexId).toBe(first.mediaIndexId);
		expect(first.capabilityBoundary.asrPerformed).toBe(false);
		expect(first.capabilityBoundary.semanticSceneUnderstandingPerformed).toBe(
			false,
		);
	});

	test("turns sparse point samples into contiguous cadence support windows", () => {
		const cadenceCapture: LocalMediaSampleCapture = {
			...capture,
			asset: { ...capture.asset, durationSeconds: 1 },
			coverage: { startSeconds: 0, endSeconds: 1, truncated: false },
			frameSamples: [capture.frameSamples[0]],
			audioSamples: [0, 0.25, 0.5, 0.75].map((requestedAtSeconds) => ({
				requestedAtSeconds,
				observedAtSeconds: requestedAtSeconds,
				durationSeconds: 0.02,
				rms: 0,
				peak: 0,
			})),
		};
		const input = localCaptureToMediaIndexInput({ capture: cadenceCapture });
		expect(
			input.audioWindowSamples.map(({ startSeconds, endSeconds }) => [
				startSeconds,
				endSeconds,
			]),
		).toEqual([
			[0, 0.125],
			[0.125, 0.375],
			[0.375, 0.625],
			[0.625, 1],
		]);
		const index = createMediaIndexFromLocalCapture({
			capture: cadenceCapture,
		});
		expect(index.audioActivityCandidates).toHaveLength(1);
		expect(index.audioActivityCandidates[0]).toMatchObject({
			candidateType: "silence",
			timeRange: { startSeconds: 0, endSeconds: 1 },
		});
	});

	test("fingerprints source identity without including binary data", () => {
		const fingerprint = createLocalAssetFingerprint({ capture });
		expect(fingerprint).toMatch(/^visioncut-asset-v1-/u);
		expect(fingerprint).toBe(
			createLocalAssetFingerprint({ capture: structuredClone(capture) }),
		);
	});
});
