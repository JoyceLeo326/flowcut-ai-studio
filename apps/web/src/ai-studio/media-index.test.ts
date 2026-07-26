import { describe, expect, test } from "bun:test";
import {
	MEDIA_INDEX_ALGORITHM_VERSION,
	MEDIA_INDEX_CAPTURE_METHODS,
	MEDIA_INDEX_CONFIDENCE_SEMANTICS_ID,
	MEDIA_INDEX_THRESHOLDS,
	MediaIndexInvariantError,
	assertMediaIndexInvariants,
	createMediaIndex,
	deserializeMediaIndex,
	parseMediaIndex,
	serializeMediaIndex,
	type CreateMediaIndexInput,
	type MediaIndex,
} from "./media-index";

const METADATA_SOURCE = {
	sourceId: "browser-metadata-track-1",
	method: "html-media-element" as const,
};

const FRAME_SOURCE = {
	sourceId: "canvas-frame-track-1",
	method: "canvas-2d-frame-sampler" as const,
};

const AUDIO_SOURCE = {
	sourceId: "web-audio-track-1",
	method: "web-audio-api" as const,
};

const MEDIABUNNY_METADATA_SOURCE = {
	sourceId: "mediabunny-input-asset-1",
	method: "mediabunny-input" as const,
};

const MEDIABUNNY_FRAME_SOURCE = {
	sourceId: "mediabunny-canvas-sink-track-1",
	method: "mediabunny-canvas-sink" as const,
};

const MEDIABUNNY_AUDIO_SOURCE = {
	sourceId: "mediabunny-audio-buffer-sink-track-1",
	method: "mediabunny-audio-buffer-sink" as const,
};

function completeInput(): CreateMediaIndexInput {
	return {
		assetId: "asset-interview-01",
		metadata: {
			durationSeconds: 8,
			hasVideo: true,
			hasAudio: true,
			videoWidth: 1920,
			videoHeight: 1080,
			nominalFrameRate: 30,
			fileSizeBytes: 8_000_000,
			mimeType: "video/mp4",
			source: METADATA_SOURCE,
		},
		videoFrameSamples: [
			{
				atSeconds: 0,
				differenceFromPrevious: 0,
				meanLuminance: 0.4,
				source: FRAME_SOURCE,
			},
			{
				atSeconds: 1,
				differenceFromPrevious: 0.04,
				meanLuminance: 0.42,
				source: FRAME_SOURCE,
			},
			{
				atSeconds: 2,
				differenceFromPrevious: 0.72,
				meanLuminance: 0.7,
				source: FRAME_SOURCE,
			},
			{
				atSeconds: 3,
				differenceFromPrevious: 0.07,
				meanLuminance: 0.68,
				source: FRAME_SOURCE,
			},
			{
				atSeconds: 5,
				differenceFromPrevious: 0.08,
				meanLuminance: 0.65,
				source: FRAME_SOURCE,
			},
			{
				atSeconds: 6,
				differenceFromPrevious: 0.55,
				meanLuminance: 0.25,
				source: FRAME_SOURCE,
			},
			{
				atSeconds: 7.5,
				differenceFromPrevious: 0.05,
				meanLuminance: 0.24,
				source: FRAME_SOURCE,
			},
		],
		audioWindowSamples: [
			{
				startSeconds: 0,
				endSeconds: 0.2,
				rms: 0.004,
				peak: 0.01,
				source: AUDIO_SOURCE,
			},
			{
				startSeconds: 0.2,
				endSeconds: 0.4,
				rms: 0.006,
				peak: 0.015,
				source: AUDIO_SOURCE,
			},
			{
				startSeconds: 0.4,
				endSeconds: 0.6,
				rms: 0.02,
				peak: 0.04,
				source: AUDIO_SOURCE,
			},
			{
				startSeconds: 0.6,
				endSeconds: 0.8,
				rms: 0.06,
				peak: 0.2,
				source: AUDIO_SOURCE,
			},
			{
				startSeconds: 0.8,
				endSeconds: 1,
				rms: 0.07,
				peak: 0.25,
				source: AUDIO_SOURCE,
			},
		],
	};
}

function noAudioInput(): CreateMediaIndexInput {
	return {
		assetId: "asset-silent-video",
		metadata: {
			durationSeconds: 5,
			hasVideo: true,
			hasAudio: false,
			videoWidth: 1280,
			videoHeight: 720,
			source: METADATA_SOURCE,
		},
		videoFrameSamples: [
			{
				atSeconds: 0,
				differenceFromPrevious: 0,
				meanLuminance: 0.5,
				source: FRAME_SOURCE,
			},
			{
				atSeconds: 1,
				differenceFromPrevious: 0.1,
				meanLuminance: 0.52,
				source: FRAME_SOURCE,
			},
		],
		audioWindowSamples: [],
	};
}

function allFindings(index: MediaIndex) {
	return [
		...index.sceneBoundaries,
		...index.audioActivityCandidates,
		...index.qualityWarnings,
	];
}

describe("VisionCut local MediaIndex", () => {
	test("derives traceable scene and energy-activity candidates from browser samples", () => {
		const index = createMediaIndex(completeInput());

		expect(index.sceneBoundaries.map((item) => item.boundaryAtSeconds)).toEqual(
			[2, 6],
		);
		expect(
			index.audioActivityCandidates.map((item) => item.candidateType),
		).toEqual(["silence", "voice-activity"]);
		expect(index.audioActivityCandidates[0].timeRange).toEqual({
			startSeconds: 0,
			endSeconds: 0.4,
		});
		expect(index.audioActivityCandidates[1].timeRange).toEqual({
			startSeconds: 0.6,
			endSeconds: 1,
		});
		expect(index.sceneBoundaries[0]).toMatchObject({
			kind: "scene-boundary-candidate",
			algorithmVersion: MEDIA_INDEX_ALGORITHM_VERSION,
			timeRange: { startSeconds: 1, endSeconds: 2 },
		});
		expect(index.sceneBoundaries[0].evidence).toHaveLength(2);
		expect(index.sceneBoundaries[0].evidence[1]).toMatchObject({
			signal: "video-frame",
			source: FRAME_SOURCE,
			timeRange: { startSeconds: 2, endSeconds: 2 },
			measurement: {
				kind: "video-frame",
				differenceFromPrevious: 0.72,
				meanLuminance: 0.7,
			},
		});
		for (const finding of allFindings(index)) {
			expect(finding.algorithmVersion).toBe(MEDIA_INDEX_ALGORITHM_VERSION);
			expect(finding.evidence.length).toBeGreaterThan(0);
			expect(finding.confidence.semanticsId).toBe(
				MEDIA_INDEX_CONFIDENCE_SEMANTICS_ID,
			);
			expect(finding.confidence.meaning).toContain(
				"not a statistical probability",
			);
			expect(finding.timeRange.endSeconds).toBeGreaterThanOrEqual(
				finding.timeRange.startSeconds,
			);
		}
	});

	test("states the local capability boundary without semantic recognition claims", () => {
		const index = createMediaIndex(completeInput());

		expect(index.algorithm).toMatchObject({
			deterministic: true,
			execution: "local-pure-rules",
			network: false,
			paidService: false,
		});
		expect(index.capabilityBoundary).toEqual({
			asrPerformed: false,
			personRecognitionPerformed: false,
			speakerIdentificationPerformed: false,
			emotionRecognitionPerformed: false,
			semanticSceneUnderstandingPerformed: false,
			voiceActivityInterpretation: "energy-based-candidate-only",
		});
		expect(
			index.audioActivityCandidates.find(
				(item) => item.candidateType === "voice-activity",
			)?.basis.interpretation,
		).toContain("No ASR");
	});

	test("preserves exact Mediabunny Input, CanvasSink, and AudioBufferSink provenance", () => {
		const input = completeInput();
		const index = createMediaIndex({
			...input,
			metadata: {
				...input.metadata,
				source: MEDIABUNNY_METADATA_SOURCE,
			},
			videoFrameSamples: input.videoFrameSamples.map((sample) => ({
				...sample,
				source: MEDIABUNNY_FRAME_SOURCE,
			})),
			audioWindowSamples: input.audioWindowSamples.map((sample) => ({
				...sample,
				source: MEDIABUNNY_AUDIO_SOURCE,
			})),
		});

		expect(MEDIA_INDEX_CAPTURE_METHODS).toEqual({
			metadata: ["html-media-element", "mediabunny-input"],
			videoFrame: ["canvas-2d-frame-sampler", "mediabunny-canvas-sink"],
			audioWindow: ["web-audio-api", "mediabunny-audio-buffer-sink"],
		});
		expect(index.sourceSnapshot.metadata.source).toEqual(
			MEDIABUNNY_METADATA_SOURCE,
		);
		expect(index.sceneBoundaries[0].evidence[0].source).toEqual(
			MEDIABUNNY_FRAME_SOURCE,
		);
		expect(index.audioActivityCandidates[0].evidence[0].source).toEqual(
			MEDIABUNNY_AUDIO_SOURCE,
		);
	});

	test("is deterministic across input order and never mutates source arrays", () => {
		const input = completeInput();
		const original = structuredClone(input);
		const first = createMediaIndex(input);
		const reordered = createMediaIndex({
			...input,
			videoFrameSamples: [...input.videoFrameSamples].reverse(),
			audioWindowSamples: [...input.audioWindowSamples].reverse(),
		});

		expect(reordered).toEqual(first);
		expect(reordered.mediaIndexId).toBe(first.mediaIndexId);
		expect(input).toEqual(original);
		expect(Object.isFrozen(first)).toBe(true);
		expect(Object.isFrozen(first.sourceSnapshot)).toBe(true);
		expect(Object.isFrozen(first.sourceSnapshot.videoFrameSamples)).toBe(true);
		expect(Object.isFrozen(first.sceneBoundaries[0].evidence[0].source)).toBe(
			true,
		);
	});

	test("uses inclusive signal thresholds and suppresses nearby weaker boundaries", () => {
		const exactThreshold = createMediaIndex({
			...noAudioInput(),
			metadata: {
				...noAudioInput().metadata,
				durationSeconds: 2,
			},
			videoFrameSamples: [
				{
					atSeconds: 0,
					differenceFromPrevious: 0,
					meanLuminance: 0.5,
					source: FRAME_SOURCE,
				},
				{
					atSeconds: 1,
					differenceFromPrevious:
						MEDIA_INDEX_THRESHOLDS.scene.minimumFrameDifference,
					meanLuminance: 0.5,
					source: FRAME_SOURCE,
				},
			],
		});
		expect(
			exactThreshold.sceneBoundaries.map((item) => item.boundaryAtSeconds),
		).toEqual([1]);

		const nearby = createMediaIndex({
			...noAudioInput(),
			metadata: {
				...noAudioInput().metadata,
				durationSeconds: 2,
			},
			videoFrameSamples: [
				{
					atSeconds: 0,
					differenceFromPrevious: 0,
					meanLuminance: 0.4,
					source: FRAME_SOURCE,
				},
				{
					atSeconds: 0.8,
					differenceFromPrevious: 0.4,
					meanLuminance: 0.45,
					source: FRAME_SOURCE,
				},
				{
					atSeconds: 1.1,
					differenceFromPrevious: 0.8,
					meanLuminance: 0.8,
					source: FRAME_SOURCE,
				},
			],
		});
		expect(
			nearby.sceneBoundaries.map((item) => item.boundaryAtSeconds),
		).toEqual([1.1]);
	});

	test("treats RMS and peak thresholds as energy candidates only", () => {
		const index = createMediaIndex({
			assetId: "asset-audio-thresholds",
			metadata: {
				durationSeconds: 1,
				hasVideo: false,
				hasAudio: true,
				videoWidth: 0,
				videoHeight: 0,
				source: METADATA_SOURCE,
			},
			videoFrameSamples: [],
			audioWindowSamples: [
				{
					startSeconds: 0,
					endSeconds: 0.2,
					rms: MEDIA_INDEX_THRESHOLDS.audio.silenceMaximumRms,
					peak: MEDIA_INDEX_THRESHOLDS.audio.silenceMaximumPeak,
					source: AUDIO_SOURCE,
				},
				{
					startSeconds: 0.2,
					endSeconds: 0.4,
					rms: MEDIA_INDEX_THRESHOLDS.audio.voiceActivityMinimumRms,
					peak: MEDIA_INDEX_THRESHOLDS.audio.voiceActivityMinimumPeak,
					source: AUDIO_SOURCE,
				},
			],
		});

		expect(
			index.audioActivityCandidates.map((item) => item.candidateType),
		).toEqual(["silence", "voice-activity"]);
		expect(index.sceneBoundaries).toEqual([]);
		expect(index.qualityWarnings.map((item) => item.code)).toContain(
			"NO_VIDEO_TRACK",
		);
	});

	test("handles a real no-audio-track snapshot without inventing activity", () => {
		const index = createMediaIndex(noAudioInput());
		const warning = index.qualityWarnings.find(
			(item) => item.code === "NO_AUDIO_TRACK",
		);

		expect(index.audioActivityCandidates).toEqual([]);
		expect(index.summary.audioCoverage).toEqual({
			state: "no-track",
			sampleCount: 0,
			firstSampleSeconds: null,
			lastSampleSeconds: null,
			maximumGapSeconds: null,
		});
		expect(warning).toMatchObject({
			severity: "info",
			algorithmVersion: MEDIA_INDEX_ALGORITHM_VERSION,
			timeRange: { startSeconds: 0, endSeconds: 5 },
		});
		expect(warning?.evidence[0]).toMatchObject({
			signal: "media-metadata",
			source: METADATA_SOURCE,
		});
	});

	test("reports short-media and insufficient-sample boundaries honestly", () => {
		const index = createMediaIndex({
			assetId: "asset-short",
			metadata: {
				durationSeconds: 0.4,
				hasVideo: true,
				hasAudio: false,
				videoWidth: 720,
				videoHeight: 1280,
				source: METADATA_SOURCE,
			},
			videoFrameSamples: [
				{
					atSeconds: 0.2,
					differenceFromPrevious: 0,
					meanLuminance: 0.3,
					source: FRAME_SOURCE,
				},
			],
			audioWindowSamples: [],
		});
		const codes = index.qualityWarnings.map((warning) => warning.code);

		expect(index.sceneBoundaries).toEqual([]);
		expect(codes).toContain("SHORT_MEDIA");
		expect(codes).toContain("INSUFFICIENT_VIDEO_SAMPLES");
		expect(codes).toContain("NO_AUDIO_TRACK");
		expect(index.summary.videoCoverage).toMatchObject({
			state: "sampled",
			sampleCount: 1,
		});
	});

	test("emits evidence-backed brightness, resolution, clipping, and gap warnings", () => {
		const index = createMediaIndex({
			assetId: "asset-quality-signals",
			metadata: {
				durationSeconds: 10,
				hasVideo: true,
				hasAudio: true,
				videoWidth: 320,
				videoHeight: 180,
				source: METADATA_SOURCE,
			},
			videoFrameSamples: [0, 1, 2, 8].map((atSeconds) => ({
				atSeconds,
				differenceFromPrevious: 0.05,
				meanLuminance: 0.04,
				source: FRAME_SOURCE,
			})),
			audioWindowSamples: [
				{ startSeconds: 0, endSeconds: 0.1, rms: 0.7, peak: 1 },
				{ startSeconds: 0.1, endSeconds: 0.2, rms: 0.65, peak: 0.995 },
				{ startSeconds: 0.2, endSeconds: 0.3, rms: 0.08, peak: 0.2 },
				{ startSeconds: 5, endSeconds: 5.1, rms: 0.08, peak: 0.2 },
			].map((sample) => ({ ...sample, source: AUDIO_SOURCE })),
		});
		const codes = index.qualityWarnings.map((warning) => warning.code);

		expect(codes).toEqual(
			expect.arrayContaining([
				"LOW_VIDEO_RESOLUTION",
				"PREDOMINANTLY_DARK_VIDEO_SAMPLES",
				"POSSIBLE_AUDIO_CLIPPING",
				"VIDEO_SAMPLE_GAP",
				"AUDIO_SAMPLE_GAP",
			]),
		);
		for (const warning of index.qualityWarnings) {
			expect(warning.evidence.length).toBeGreaterThan(0);
			expect(warning.findingId).toMatch(/^media_finding_/u);
			expect(warning.confidence.score).toBeGreaterThanOrEqual(0);
			expect(warning.confidence.score).toBeLessThanOrEqual(1);
		}
	});

	test("rejects malformed, impossible, or non-finite browser samples", () => {
		const base = completeInput();
		const invalidInputs: readonly unknown[] = [
			{ ...base, metadata: { ...base.metadata, durationSeconds: Number.NaN } },
			{ ...base, metadata: { ...base.metadata, durationSeconds: Infinity } },
			{ ...base, metadata: { ...base.metadata, durationSeconds: 0 } },
			{ ...base, metadata: { ...base.metadata, videoWidth: 0 } },
			{
				...base,
				videoFrameSamples: [
					...base.videoFrameSamples,
					{
						atSeconds: 9,
						differenceFromPrevious: 0.1,
						meanLuminance: 0.5,
						source: FRAME_SOURCE,
					},
				],
			},
			{
				...base,
				videoFrameSamples: [
					{
						...base.videoFrameSamples[0],
						differenceFromPrevious: 1.1,
					},
				],
			},
			{
				...base,
				videoFrameSamples: [
					{ ...base.videoFrameSamples[0], meanLuminance: -0.01 },
				],
			},
			{
				...base,
				videoFrameSamples: [
					base.videoFrameSamples[0],
					{ ...base.videoFrameSamples[1], atSeconds: 0 },
				],
			},
			{
				...base,
				audioWindowSamples: [
					{ ...base.audioWindowSamples[0], rms: 0.5, peak: 0.4 },
				],
			},
			{
				...base,
				audioWindowSamples: [
					base.audioWindowSamples[0],
					{
						...base.audioWindowSamples[1],
						startSeconds: 0.1,
					},
				],
			},
			{
				...noAudioInput(),
				audioWindowSamples: [base.audioWindowSamples[0]],
			},
			{
				assetId: "asset-no-video",
				metadata: {
					durationSeconds: 2,
					hasVideo: false,
					hasAudio: false,
					source: METADATA_SOURCE,
				},
				videoFrameSamples: [base.videoFrameSamples[0]],
				audioWindowSamples: [],
			},
			{
				...base,
				videoFrameSamples: [
					{
						...base.videoFrameSamples[0],
						source: AUDIO_SOURCE,
					},
				],
			},
		];

		for (const input of invalidInputs) {
			expect(() => createMediaIndex(input)).toThrow(MediaIndexInvariantError);
		}
	});

	test("round-trips as JSON, structured-clone data, and rejects tampering", () => {
		const index = createMediaIndex(completeInput());
		const serialized = serializeMediaIndex({ index });
		const restored = deserializeMediaIndex({ serialized });
		const cloned = parseMediaIndex({ value: structuredClone(index) });

		expect(restored).toEqual(index);
		expect(cloned).toEqual(index);
		expect(JSON.parse(serialized)).toEqual(index);
		expect(Object.isFrozen(restored)).toBe(true);
		expect(() => assertMediaIndexInvariants({ index: restored })).not.toThrow();

		const changedConfidence = JSON.parse(serialized);
		changedConfidence.sceneBoundaries[0].confidence.score = 1;
		expect(() => parseMediaIndex({ value: changedConfidence })).toThrow(
			"does not match its deterministic source derivation",
		);

		const changedSource = JSON.parse(serialized);
		changedSource.sceneBoundaries[0].evidence[0].source.sourceId = "forged";
		expect(() => parseMediaIndex({ value: changedSource })).toThrow(
			MediaIndexInvariantError,
		);

		const changedAlgorithm = JSON.parse(serialized);
		changedAlgorithm.algorithm.version = "semantic-ai/99";
		expect(() => parseMediaIndex({ value: changedAlgorithm })).toThrow(
			MediaIndexInvariantError,
		);
		expect(() => deserializeMediaIndex({ serialized: "{not-json" })).toThrow(
			"not valid JSON",
		);
		expect(() => serializeMediaIndex({ index, space: 11 })).toThrow(
			"between 0 and 10",
		);
	});
});
