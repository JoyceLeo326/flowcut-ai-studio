export const MEDIA_INDEX_SCHEMA_VERSION = 1 as const;

export const MEDIA_INDEX_ALGORITHM_VERSION =
	"visioncut.media-index.local-signals/1.0.0" as const;

export const MEDIA_INDEX_CONFIDENCE_SEMANTICS_ID =
	"visioncut.heuristic-signal-strength/1" as const;

const CONFIDENCE_MEANING =
	"The score is normalized heuristic support from the cited numeric samples. It is not a statistical probability and does not imply semantic recognition.";

export const MEDIA_INDEX_THRESHOLDS = {
	scene: {
		minimumFrameDifference: 0.3,
		combinedFrameDifference: 0.18,
		minimumLuminanceDelta: 0.25,
		minimumSeparationSeconds: 0.5,
	},
	audio: {
		silenceMaximumRms: 0.012,
		silenceMaximumPeak: 0.035,
		voiceActivityMinimumRms: 0.03,
		voiceActivityMinimumPeak: 0.06,
		maximumMergeGapSeconds: 0.025,
		minimumSilenceDurationSeconds: 0.2,
		minimumVoiceActivityDurationSeconds: 0.15,
	},
	quality: {
		shortMediaSeconds: 1,
		lowVideoWidth: 640,
		lowVideoHeight: 360,
		darkLuminance: 0.08,
		darkSampleRatio: 0.75,
		clippingPeak: 0.99,
		clippingSampleRatio: 0.1,
	},
} as const;

const MAX_SAMPLE_COUNT = 100_000;

export const MEDIA_INDEX_CAPTURE_METHODS = {
	metadata: ["html-media-element", "mediabunny-input"],
	videoFrame: ["canvas-2d-frame-sampler", "mediabunny-canvas-sink"],
	audioWindow: ["web-audio-api", "mediabunny-audio-buffer-sink"],
} as const;

export type MediaIndexMetadataCaptureMethod =
	(typeof MEDIA_INDEX_CAPTURE_METHODS.metadata)[number];

export type MediaIndexVideoFrameCaptureMethod =
	(typeof MEDIA_INDEX_CAPTURE_METHODS.videoFrame)[number];

export type MediaIndexAudioWindowCaptureMethod =
	(typeof MEDIA_INDEX_CAPTURE_METHODS.audioWindow)[number];

export type MediaIndexCaptureMethod =
	| MediaIndexMetadataCaptureMethod
	| MediaIndexVideoFrameCaptureMethod
	| MediaIndexAudioWindowCaptureMethod;

export interface MediaIndexCaptureSource<
	TMethod extends MediaIndexCaptureMethod = MediaIndexCaptureMethod,
> {
	readonly sourceId: string;
	readonly method: TMethod;
}

export interface MediaIndexMetadataSample {
	readonly durationSeconds: number;
	readonly hasVideo: boolean;
	readonly hasAudio: boolean;
	readonly videoWidth?: number;
	readonly videoHeight?: number;
	readonly nominalFrameRate?: number;
	readonly fileSizeBytes?: number;
	readonly mimeType?: string;
	readonly source: MediaIndexCaptureSource<MediaIndexMetadataCaptureMethod>;
}

export interface MediaIndexVideoFrameSample {
	readonly atSeconds: number;
	readonly differenceFromPrevious: number;
	readonly meanLuminance: number;
	readonly source: MediaIndexCaptureSource<MediaIndexVideoFrameCaptureMethod>;
}

export interface MediaIndexAudioWindowSample {
	readonly startSeconds: number;
	readonly endSeconds: number;
	readonly rms: number;
	readonly peak: number;
	readonly source: MediaIndexCaptureSource<MediaIndexAudioWindowCaptureMethod>;
}

export interface CreateMediaIndexInput {
	readonly assetId: string;
	readonly metadata: MediaIndexMetadataSample;
	readonly videoFrameSamples: readonly MediaIndexVideoFrameSample[];
	readonly audioWindowSamples: readonly MediaIndexAudioWindowSample[];
}

export interface MediaIndexTimeRange {
	readonly startSeconds: number;
	readonly endSeconds: number;
}

export type MediaIndexEvidenceMeasurement =
	| {
			readonly kind: "media-metadata";
			readonly durationSeconds: number;
			readonly hasVideo: boolean;
			readonly hasAudio: boolean;
			readonly videoWidth: number | null;
			readonly videoHeight: number | null;
	  }
	| {
			readonly kind: "video-frame";
			readonly differenceFromPrevious: number;
			readonly meanLuminance: number;
	  }
	| {
			readonly kind: "audio-window";
			readonly rms: number;
			readonly peak: number;
	  };

export interface MediaIndexEvidenceReference {
	readonly observationId: string;
	readonly signal: "media-metadata" | "video-frame" | "audio-window";
	readonly source: MediaIndexCaptureSource;
	readonly timeRange: MediaIndexTimeRange;
	readonly measurement: MediaIndexEvidenceMeasurement;
}

export type MediaIndexConfidenceLevel = "low" | "medium" | "high";

export interface MediaIndexConfidence {
	readonly score: number;
	readonly level: MediaIndexConfidenceLevel;
	readonly semanticsId: typeof MEDIA_INDEX_CONFIDENCE_SEMANTICS_ID;
	readonly meaning: typeof CONFIDENCE_MEANING;
	readonly basis: string;
}

export interface MediaIndexFindingBase {
	readonly findingId: string;
	readonly algorithmVersion: typeof MEDIA_INDEX_ALGORITHM_VERSION;
	readonly timeRange: MediaIndexTimeRange;
	readonly confidence: MediaIndexConfidence;
	readonly evidence: readonly MediaIndexEvidenceReference[];
}

export interface MediaIndexSceneBoundary extends MediaIndexFindingBase {
	readonly kind: "scene-boundary-candidate";
	readonly boundaryAtSeconds: number;
	readonly basis: {
		readonly frameDifference: number;
		readonly luminanceDelta: number;
		readonly minimumFrameDifference: number;
		readonly combinedFrameDifference: number;
		readonly minimumLuminanceDelta: number;
	};
}

export interface MediaIndexAudioActivityCandidate extends MediaIndexFindingBase {
	readonly kind: "silence-candidate" | "voice-activity-candidate";
	readonly candidateType: "silence" | "voice-activity";
	readonly basis: {
		readonly sampleCount: number;
		readonly meanRms: number;
		readonly maximumPeak: number;
		readonly interpretation: string;
	};
}

export type MediaIndexQualityWarningCode =
	| "SHORT_MEDIA"
	| "NO_VIDEO_TRACK"
	| "NO_AUDIO_TRACK"
	| "VIDEO_SAMPLES_MISSING"
	| "AUDIO_SAMPLES_MISSING"
	| "INSUFFICIENT_VIDEO_SAMPLES"
	| "LOW_VIDEO_RESOLUTION"
	| "PREDOMINANTLY_DARK_VIDEO_SAMPLES"
	| "POSSIBLE_AUDIO_CLIPPING"
	| "VIDEO_SAMPLE_GAP"
	| "AUDIO_SAMPLE_GAP";

export interface MediaIndexQualityWarning extends MediaIndexFindingBase {
	readonly kind: "quality-warning";
	readonly code: MediaIndexQualityWarningCode;
	readonly severity: "info" | "warning";
	readonly message: string;
}

export interface MediaIndexCoverageSummary {
	readonly state: "no-track" | "missing-samples" | "sampled";
	readonly sampleCount: number;
	readonly firstSampleSeconds: number | null;
	readonly lastSampleSeconds: number | null;
	readonly maximumGapSeconds: number | null;
}

export interface MediaIndex {
	readonly kind: "visioncut.media-index";
	readonly schemaVersion: typeof MEDIA_INDEX_SCHEMA_VERSION;
	readonly mediaIndexId: string;
	readonly assetId: string;
	readonly algorithm: {
		readonly version: typeof MEDIA_INDEX_ALGORITHM_VERSION;
		readonly deterministic: true;
		readonly execution: "local-pure-rules";
		readonly network: false;
		readonly paidService: false;
		readonly confidenceSemantics: {
			readonly id: typeof MEDIA_INDEX_CONFIDENCE_SEMANTICS_ID;
			readonly scoreRange: readonly [0, 1];
			readonly low: "0.000000-0.499999";
			readonly medium: "0.500000-0.799999";
			readonly high: "0.800000-1.000000";
			readonly meaning: typeof CONFIDENCE_MEANING;
		};
	};
	readonly capabilityBoundary: {
		readonly asrPerformed: false;
		readonly personRecognitionPerformed: false;
		readonly speakerIdentificationPerformed: false;
		readonly emotionRecognitionPerformed: false;
		readonly semanticSceneUnderstandingPerformed: false;
		readonly voiceActivityInterpretation: "energy-based-candidate-only";
	};
	readonly sourceSnapshot: {
		readonly metadata: MediaIndexMetadataSample;
		readonly videoFrameSamples: readonly MediaIndexVideoFrameSample[];
		readonly audioWindowSamples: readonly MediaIndexAudioWindowSample[];
	};
	readonly summary: {
		readonly durationSeconds: number;
		readonly videoCoverage: MediaIndexCoverageSummary;
		readonly audioCoverage: MediaIndexCoverageSummary;
		readonly sceneBoundaryCount: number;
		readonly audioActivityCandidateCount: number;
		readonly qualityWarningCount: number;
	};
	readonly sceneBoundaries: readonly MediaIndexSceneBoundary[];
	readonly audioActivityCandidates: readonly MediaIndexAudioActivityCandidate[];
	readonly qualityWarnings: readonly MediaIndexQualityWarning[];
}

export class MediaIndexInvariantError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MediaIndexInvariantError";
	}
}

interface NormalizedInput {
	readonly assetId: string;
	readonly sourceSnapshot: MediaIndex["sourceSnapshot"];
}

interface RawSceneCandidate {
	readonly atSeconds: number;
	readonly signalStrength: number;
	readonly previous: MediaIndexVideoFrameSample;
	readonly current: MediaIndexVideoFrameSample;
	readonly luminanceDelta: number;
}

type AudioClass = "silence" | "voice-activity" | "uncertain";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function asRecord({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): Record<string, unknown> {
	if (!isPlainRecord(value)) {
		throw new MediaIndexInvariantError(`${label} must be a plain object.`);
	}
	return value;
}

function asArray({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): readonly unknown[] {
	if (!Array.isArray(value)) {
		throw new MediaIndexInvariantError(`${label} must be an array.`);
	}
	if (value.length > MAX_SAMPLE_COUNT) {
		throw new MediaIndexInvariantError(
			`${label} cannot exceed ${MAX_SAMPLE_COUNT} samples.`,
		);
	}
	return value;
}

function normalizeRequiredText({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): string {
	if (typeof value !== "string") {
		throw new MediaIndexInvariantError(`${label} must be a string.`);
	}
	const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
	if (!normalized) {
		throw new MediaIndexInvariantError(`${label} cannot be empty.`);
	}
	if (normalized.length > 256) {
		throw new MediaIndexInvariantError(`${label} is too long.`);
	}
	return normalized;
}

function normalizeOptionalText({
	value,
	label,
}: {
	value: unknown;
	label: string;
}) {
	return value === undefined
		? undefined
		: normalizeRequiredText({ value, label });
}

function finiteNumber({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new MediaIndexInvariantError(`${label} must be a finite number.`);
	}
	return value;
}

function numberInRange({
	value,
	minimum,
	maximum,
	label,
}: {
	value: unknown;
	minimum: number;
	maximum: number;
	label: string;
}): number {
	const normalized = finiteNumber({ value, label });
	if (normalized < minimum || normalized > maximum) {
		throw new MediaIndexInvariantError(
			`${label} must be between ${minimum} and ${maximum}.`,
		);
	}
	return normalized;
}

function positiveNumber({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): number {
	const normalized = finiteNumber({ value, label });
	if (normalized <= 0) {
		throw new MediaIndexInvariantError(`${label} must be positive.`);
	}
	return normalized;
}

function optionalPositiveNumber({
	value,
	label,
}: {
	value: unknown;
	label: string;
}) {
	return value === undefined ? undefined : positiveNumber({ value, label });
}

function booleanValue({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): boolean {
	if (typeof value !== "boolean") {
		throw new MediaIndexInvariantError(`${label} must be a boolean.`);
	}
	return value;
}

function positiveSafeInteger({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
		throw new MediaIndexInvariantError(
			`${label} must be a positive safe integer.`,
		);
	}
	return value;
}

function optionalNonNegativeSafeInteger({
	value,
	label,
}: {
	value: unknown;
	label: string;
}) {
	if (value === undefined) return undefined;
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
		throw new MediaIndexInvariantError(
			`${label} must be a non-negative safe integer.`,
		);
	}
	return value;
}

function normalizeSource<TMethod extends MediaIndexCaptureMethod>({
	value,
	allowedMethods,
	label,
}: {
	value: unknown;
	allowedMethods: readonly TMethod[];
	label: string;
}): MediaIndexCaptureSource<TMethod> {
	const source = asRecord({ value, label });
	const sourceId = normalizeRequiredText({
		value: source.sourceId,
		label: `${label} sourceId`,
	});
	const method = allowedMethods.find(
		(candidate) => candidate === source.method,
	);
	if (!method) {
		throw new MediaIndexInvariantError(
			`${label} method must be one of: ${allowedMethods.join(", ")}.`,
		);
	}
	return { sourceId, method };
}

function normalizeMetadata(value: unknown): MediaIndexMetadataSample {
	const metadata = asRecord({ value, label: "Media metadata" });
	const durationSeconds = positiveNumber({
		value: metadata.durationSeconds,
		label: "Media duration",
	});
	const hasVideo = booleanValue({
		value: metadata.hasVideo,
		label: "Media hasVideo",
	});
	const hasAudio = booleanValue({
		value: metadata.hasAudio,
		label: "Media hasAudio",
	});
	let videoWidth: number | undefined;
	let videoHeight: number | undefined;
	if (hasVideo) {
		videoWidth = positiveSafeInteger({
			value: metadata.videoWidth,
			label: "Video width",
		});
		videoHeight = positiveSafeInteger({
			value: metadata.videoHeight,
			label: "Video height",
		});
	} else {
		if (metadata.videoWidth !== undefined && metadata.videoWidth !== 0) {
			throw new MediaIndexInvariantError(
				"Video width must be absent or zero when no video track exists.",
			);
		}
		if (metadata.videoHeight !== undefined && metadata.videoHeight !== 0) {
			throw new MediaIndexInvariantError(
				"Video height must be absent or zero when no video track exists.",
			);
		}
	}
	const nominalFrameRate = optionalPositiveNumber({
		value: metadata.nominalFrameRate,
		label: "Nominal frame rate",
	});
	const fileSizeBytes = optionalNonNegativeSafeInteger({
		value: metadata.fileSizeBytes,
		label: "File size",
	});
	const mimeType = normalizeOptionalText({
		value: metadata.mimeType,
		label: "MIME type",
	});
	return {
		durationSeconds,
		hasVideo,
		hasAudio,
		...(videoWidth === undefined ? {} : { videoWidth }),
		...(videoHeight === undefined ? {} : { videoHeight }),
		...(nominalFrameRate === undefined ? {} : { nominalFrameRate }),
		...(fileSizeBytes === undefined ? {} : { fileSizeBytes }),
		...(mimeType === undefined ? {} : { mimeType }),
		source: normalizeSource({
			value: metadata.source,
			allowedMethods: MEDIA_INDEX_CAPTURE_METHODS.metadata,
			label: "Media metadata source",
		}),
	};
}

function normalizeVideoFrames({
	value,
	durationSeconds,
	hasVideo,
}: {
	value: unknown;
	durationSeconds: number;
	hasVideo: boolean;
}): readonly MediaIndexVideoFrameSample[] {
	const samples = asArray({ value, label: "Video frame samples" }).map(
		(sample, index) => {
			const frame = asRecord({
				value: sample,
				label: `Video frame sample ${index}`,
			});
			return {
				atSeconds: numberInRange({
					value: frame.atSeconds,
					minimum: 0,
					maximum: durationSeconds,
					label: `Video frame sample ${index} timestamp`,
				}),
				differenceFromPrevious: numberInRange({
					value: frame.differenceFromPrevious,
					minimum: 0,
					maximum: 1,
					label: `Video frame sample ${index} frame difference`,
				}),
				meanLuminance: numberInRange({
					value: frame.meanLuminance,
					minimum: 0,
					maximum: 1,
					label: `Video frame sample ${index} mean luminance`,
				}),
				source: normalizeSource({
					value: frame.source,
					allowedMethods: MEDIA_INDEX_CAPTURE_METHODS.videoFrame,
					label: `Video frame sample ${index} source`,
				}),
			};
		},
	);
	if (!hasVideo && samples.length > 0) {
		throw new MediaIndexInvariantError(
			"Video frame samples require a video track.",
		);
	}
	const sorted = [...samples].sort(
		(left, right) =>
			left.atSeconds - right.atSeconds ||
			left.source.sourceId.localeCompare(right.source.sourceId),
	);
	for (let index = 1; index < sorted.length; index += 1) {
		if (sorted[index - 1].atSeconds === sorted[index].atSeconds) {
			throw new MediaIndexInvariantError(
				`Video frame timestamps must be unique: ${sorted[index].atSeconds}.`,
			);
		}
	}
	return sorted;
}

function normalizeAudioWindows({
	value,
	durationSeconds,
	hasAudio,
}: {
	value: unknown;
	durationSeconds: number;
	hasAudio: boolean;
}): readonly MediaIndexAudioWindowSample[] {
	const samples = asArray({ value, label: "Audio window samples" }).map(
		(sample, index) => {
			const window = asRecord({
				value: sample,
				label: `Audio window sample ${index}`,
			});
			const startSeconds = numberInRange({
				value: window.startSeconds,
				minimum: 0,
				maximum: durationSeconds,
				label: `Audio window sample ${index} start`,
			});
			const endSeconds = numberInRange({
				value: window.endSeconds,
				minimum: 0,
				maximum: durationSeconds,
				label: `Audio window sample ${index} end`,
			});
			if (endSeconds <= startSeconds) {
				throw new MediaIndexInvariantError(
					`Audio window sample ${index} must have positive duration.`,
				);
			}
			const rms = numberInRange({
				value: window.rms,
				minimum: 0,
				maximum: 1,
				label: `Audio window sample ${index} RMS`,
			});
			const peak = numberInRange({
				value: window.peak,
				minimum: 0,
				maximum: 1,
				label: `Audio window sample ${index} peak`,
			});
			if (rms > peak) {
				throw new MediaIndexInvariantError(
					`Audio window sample ${index} RMS cannot exceed its peak.`,
				);
			}
			return {
				startSeconds,
				endSeconds,
				rms,
				peak,
				source: normalizeSource({
					value: window.source,
					allowedMethods: MEDIA_INDEX_CAPTURE_METHODS.audioWindow,
					label: `Audio window sample ${index} source`,
				}),
			};
		},
	);
	if (!hasAudio && samples.length > 0) {
		throw new MediaIndexInvariantError(
			"Audio window samples require an audio track.",
		);
	}
	const sorted = [...samples].sort(
		(left, right) =>
			left.startSeconds - right.startSeconds ||
			left.endSeconds - right.endSeconds ||
			left.source.sourceId.localeCompare(right.source.sourceId),
	);
	for (let index = 1; index < sorted.length; index += 1) {
		if (sorted[index].startSeconds < sorted[index - 1].endSeconds) {
			throw new MediaIndexInvariantError(
				`Audio windows cannot overlap near ${sorted[index].startSeconds} seconds.`,
			);
		}
	}
	return sorted;
}

function normalizeCreateInput(value: unknown): NormalizedInput {
	const input = asRecord({ value, label: "MediaIndex input" });
	const assetId = normalizeRequiredText({
		value: input.assetId,
		label: "Asset ID",
	});
	const metadata = normalizeMetadata(input.metadata);
	const videoFrameSamples = normalizeVideoFrames({
		value: input.videoFrameSamples,
		durationSeconds: metadata.durationSeconds,
		hasVideo: metadata.hasVideo,
	});
	const audioWindowSamples = normalizeAudioWindows({
		value: input.audioWindowSamples,
		durationSeconds: metadata.durationSeconds,
		hasAudio: metadata.hasAudio,
	});
	return {
		assetId,
		sourceSnapshot: { metadata, videoFrameSamples, audioWindowSamples },
	};
}

function hashWithSeed({
	value,
	seed,
}: {
	value: string;
	seed: number;
}): string {
	let hash = seed >>> 0;
	for (const character of value) {
		hash ^= character.codePointAt(0) ?? 0;
		hash = Math.imul(hash, 16_777_619);
	}
	return (hash >>> 0).toString(36).padStart(7, "0");
}

function stableDigest(value: string): string {
	return `${hashWithSeed({ value, seed: 2_166_136_261 })}${hashWithSeed({ value, seed: 3_332_816_977 })}`;
}

function canonicalJson(value: unknown): string {
	if (value === undefined) {
		throw new MediaIndexInvariantError(
			"Canonical JSON cannot contain undefined values.",
		);
	}
	if (value === null || typeof value !== "object") {
		const serialized = JSON.stringify(value);
		if (serialized === undefined) {
			throw new MediaIndexInvariantError("Value is not JSON serializable.");
		}
		return serialized;
	}
	if (Array.isArray(value)) {
		return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
	}
	return `{${Object.keys(value)
		.sort()
		.map((key) => {
			const item = Object.getOwnPropertyDescriptor(value, key)?.value;
			return `${JSON.stringify(key)}:${canonicalJson(item)}`;
		})
		.join(",")}}`;
}

function deterministicId({
	prefix,
	value,
}: {
	prefix: string;
	value: unknown;
}): string {
	return `${prefix}_${stableDigest(canonicalJson(value))}`;
}

function round(value: number): number {
	return Math.round(value * 1_000_000) / 1_000_000;
}

function clamp(value: number): number {
	return Math.min(1, Math.max(0, value));
}

function confidence({
	score,
	basis,
}: {
	score: number;
	basis: string;
}): MediaIndexConfidence {
	const normalized = round(clamp(score));
	return {
		score: normalized,
		level: normalized < 0.5 ? "low" : normalized < 0.8 ? "medium" : "high",
		semanticsId: MEDIA_INDEX_CONFIDENCE_SEMANTICS_ID,
		meaning: CONFIDENCE_MEANING,
		basis,
	};
}

function metadataEvidence(
	metadata: MediaIndexMetadataSample,
): MediaIndexEvidenceReference {
	const timeRange = {
		startSeconds: 0,
		endSeconds: metadata.durationSeconds,
	};
	const measurement: MediaIndexEvidenceMeasurement = {
		kind: "media-metadata",
		durationSeconds: metadata.durationSeconds,
		hasVideo: metadata.hasVideo,
		hasAudio: metadata.hasAudio,
		videoWidth: metadata.videoWidth ?? null,
		videoHeight: metadata.videoHeight ?? null,
	};
	return {
		observationId: deterministicId({
			prefix: "media_observation",
			value: {
				signal: "media-metadata",
				source: metadata.source,
				timeRange,
				measurement,
			},
		}),
		signal: "media-metadata",
		source: { ...metadata.source },
		timeRange,
		measurement,
	};
}

function frameEvidence(
	frame: MediaIndexVideoFrameSample,
): MediaIndexEvidenceReference {
	const timeRange = {
		startSeconds: frame.atSeconds,
		endSeconds: frame.atSeconds,
	};
	const measurement: MediaIndexEvidenceMeasurement = {
		kind: "video-frame",
		differenceFromPrevious: frame.differenceFromPrevious,
		meanLuminance: frame.meanLuminance,
	};
	return {
		observationId: deterministicId({
			prefix: "media_observation",
			value: {
				signal: "video-frame",
				source: frame.source,
				timeRange,
				measurement,
			},
		}),
		signal: "video-frame",
		source: { ...frame.source },
		timeRange,
		measurement,
	};
}

function audioEvidence(
	window: MediaIndexAudioWindowSample,
): MediaIndexEvidenceReference {
	const timeRange = {
		startSeconds: window.startSeconds,
		endSeconds: window.endSeconds,
	};
	const measurement: MediaIndexEvidenceMeasurement = {
		kind: "audio-window",
		rms: window.rms,
		peak: window.peak,
	};
	return {
		observationId: deterministicId({
			prefix: "media_observation",
			value: {
				signal: "audio-window",
				source: window.source,
				timeRange,
				measurement,
			},
		}),
		signal: "audio-window",
		source: { ...window.source },
		timeRange,
		measurement,
	};
}

function findingId({
	kind,
	assetId,
	timeRange,
	evidence,
	discriminator,
}: {
	kind: string;
	assetId: string;
	timeRange: MediaIndexTimeRange;
	evidence: readonly MediaIndexEvidenceReference[];
	discriminator?: string;
}): string {
	return deterministicId({
		prefix: "media_finding",
		value: {
			kind,
			assetId,
			timeRange,
			evidenceIds: evidence.map((item) => item.observationId),
			discriminator: discriminator ?? null,
			algorithmVersion: MEDIA_INDEX_ALGORITHM_VERSION,
		},
	});
}

function sceneBoundaries({
	assetId,
	frames,
	durationSeconds,
}: {
	assetId: string;
	frames: readonly MediaIndexVideoFrameSample[];
	durationSeconds: number;
}): readonly MediaIndexSceneBoundary[] {
	const raw: RawSceneCandidate[] = [];
	for (let index = 1; index < frames.length; index += 1) {
		const previous = frames[index - 1];
		const current = frames[index];
		if (current.atSeconds <= 0 || current.atSeconds >= durationSeconds)
			continue;
		const luminanceDelta = Math.abs(
			current.meanLuminance - previous.meanLuminance,
		);
		const directDifference =
			current.differenceFromPrevious >=
			MEDIA_INDEX_THRESHOLDS.scene.minimumFrameDifference;
		const combinedDifference =
			current.differenceFromPrevious >=
				MEDIA_INDEX_THRESHOLDS.scene.combinedFrameDifference &&
			luminanceDelta >= MEDIA_INDEX_THRESHOLDS.scene.minimumLuminanceDelta;
		if (!directDifference && !combinedDifference) continue;
		const frameSupport = clamp(
			(current.differenceFromPrevious -
				MEDIA_INDEX_THRESHOLDS.scene.combinedFrameDifference) /
				(1 - MEDIA_INDEX_THRESHOLDS.scene.combinedFrameDifference),
		);
		const luminanceSupport = clamp(
			luminanceDelta / MEDIA_INDEX_THRESHOLDS.scene.minimumLuminanceDelta,
		);
		raw.push({
			atSeconds: current.atSeconds,
			signalStrength: round(0.8 * frameSupport + 0.2 * luminanceSupport),
			previous,
			current,
			luminanceDelta,
		});
	}

	const selected: RawSceneCandidate[] = [];
	for (const candidate of [...raw].sort(
		(left, right) =>
			right.signalStrength - left.signalStrength ||
			left.atSeconds - right.atSeconds,
	)) {
		if (
			selected.some(
				(item) =>
					Math.abs(item.atSeconds - candidate.atSeconds) <
					MEDIA_INDEX_THRESHOLDS.scene.minimumSeparationSeconds,
			)
		) {
			continue;
		}
		selected.push(candidate);
	}

	return selected
		.sort((left, right) => left.atSeconds - right.atSeconds)
		.map((candidate) => {
			const timeRange = {
				startSeconds: candidate.previous.atSeconds,
				endSeconds: candidate.current.atSeconds,
			};
			const evidence = [
				frameEvidence(candidate.previous),
				frameEvidence(candidate.current),
			];
			const thresholdMargin = clamp(
				(candidate.current.differenceFromPrevious -
					MEDIA_INDEX_THRESHOLDS.scene.combinedFrameDifference) /
					(1 - MEDIA_INDEX_THRESHOLDS.scene.combinedFrameDifference),
			);
			return {
				kind: "scene-boundary-candidate" as const,
				findingId: findingId({
					kind: "scene-boundary-candidate",
					assetId,
					timeRange,
					evidence,
				}),
				algorithmVersion: MEDIA_INDEX_ALGORITHM_VERSION,
				timeRange,
				boundaryAtSeconds: candidate.atSeconds,
				confidence: confidence({
					score:
						0.5 + 0.4 * thresholdMargin + 0.1 * clamp(candidate.luminanceDelta),
					basis:
						"Frame-difference threshold margin with supporting luminance delta.",
				}),
				evidence,
				basis: {
					frameDifference: candidate.current.differenceFromPrevious,
					luminanceDelta: round(candidate.luminanceDelta),
					minimumFrameDifference:
						MEDIA_INDEX_THRESHOLDS.scene.minimumFrameDifference,
					combinedFrameDifference:
						MEDIA_INDEX_THRESHOLDS.scene.combinedFrameDifference,
					minimumLuminanceDelta:
						MEDIA_INDEX_THRESHOLDS.scene.minimumLuminanceDelta,
				},
			};
		});
}

function classifyAudio(window: MediaIndexAudioWindowSample): AudioClass {
	if (
		window.rms <= MEDIA_INDEX_THRESHOLDS.audio.silenceMaximumRms &&
		window.peak <= MEDIA_INDEX_THRESHOLDS.audio.silenceMaximumPeak
	) {
		return "silence";
	}
	if (
		window.rms >= MEDIA_INDEX_THRESHOLDS.audio.voiceActivityMinimumRms &&
		window.peak >= MEDIA_INDEX_THRESHOLDS.audio.voiceActivityMinimumPeak
	) {
		return "voice-activity";
	}
	return "uncertain";
}

function audioActivityCandidates({
	assetId,
	windows,
}: {
	assetId: string;
	windows: readonly MediaIndexAudioWindowSample[];
}): readonly MediaIndexAudioActivityCandidate[] {
	const groups: {
		readonly classification: Exclude<AudioClass, "uncertain">;
		readonly windows: readonly MediaIndexAudioWindowSample[];
	}[] = [];
	let active:
		| {
				classification: Exclude<AudioClass, "uncertain">;
				windows: MediaIndexAudioWindowSample[];
		  }
		| undefined;

	for (const window of windows) {
		const classification = classifyAudio(window);
		if (classification === "uncertain") {
			if (active) groups.push(active);
			active = undefined;
			continue;
		}
		const previous = active?.windows.at(-1);
		if (
			active &&
			active.classification === classification &&
			previous &&
			window.startSeconds - previous.endSeconds <=
				MEDIA_INDEX_THRESHOLDS.audio.maximumMergeGapSeconds
		) {
			active.windows.push(window);
		} else {
			if (active) groups.push(active);
			active = { classification, windows: [window] };
		}
	}
	if (active) groups.push(active);

	return groups.flatMap((group) => {
		const first = group.windows[0];
		const last = group.windows[group.windows.length - 1];
		const timeRange = {
			startSeconds: first.startSeconds,
			endSeconds: last.endSeconds,
		};
		const duration = timeRange.endSeconds - timeRange.startSeconds;
		const minimumDuration =
			group.classification === "silence"
				? MEDIA_INDEX_THRESHOLDS.audio.minimumSilenceDurationSeconds
				: MEDIA_INDEX_THRESHOLDS.audio.minimumVoiceActivityDurationSeconds;
		if (duration < minimumDuration) return [];
		const meanRms =
			group.windows.reduce((sum, item) => sum + item.rms, 0) /
			group.windows.length;
		const maximumPeak = Math.max(...group.windows.map((item) => item.peak));
		const support =
			group.classification === "silence"
				? (clamp(1 - meanRms / MEDIA_INDEX_THRESHOLDS.audio.silenceMaximumRms) +
						clamp(
							1 - maximumPeak / MEDIA_INDEX_THRESHOLDS.audio.silenceMaximumPeak,
						)) /
					2
				: (clamp(
						(meanRms - MEDIA_INDEX_THRESHOLDS.audio.voiceActivityMinimumRms) /
							0.17,
					) +
						clamp(
							(maximumPeak -
								MEDIA_INDEX_THRESHOLDS.audio.voiceActivityMinimumPeak) /
								0.44,
						)) /
					2;
		const evidence = group.windows.map(audioEvidence);
		const kind =
			group.classification === "silence"
				? "silence-candidate"
				: "voice-activity-candidate";
		return [
			{
				kind,
				candidateType: group.classification,
				findingId: findingId({ kind, assetId, timeRange, evidence }),
				algorithmVersion: MEDIA_INDEX_ALGORITHM_VERSION,
				timeRange,
				confidence: confidence({
					score: 0.55 + 0.45 * support,
					basis:
						group.classification === "silence"
							? "RMS and peak are below fixed local silence thresholds."
							: "RMS and peak are above fixed local energy-activity thresholds.",
				}),
				evidence,
				basis: {
					sampleCount: group.windows.length,
					meanRms: round(meanRms),
					maximumPeak: round(maximumPeak),
					interpretation:
						"Energy-threshold candidate only. No ASR, transcript, speaker, person, or emotion inference was performed.",
				},
			} satisfies MediaIndexAudioActivityCandidate,
		];
	});
}

function qualityWarning({
	assetId,
	code,
	severity,
	message,
	timeRange,
	evidence,
	confidenceScore,
	confidenceBasis,
}: {
	assetId: string;
	code: MediaIndexQualityWarningCode;
	severity: MediaIndexQualityWarning["severity"];
	message: string;
	timeRange: MediaIndexTimeRange;
	evidence: readonly MediaIndexEvidenceReference[];
	confidenceScore: number;
	confidenceBasis: string;
}): MediaIndexQualityWarning {
	return {
		kind: "quality-warning",
		code,
		severity,
		message,
		findingId: findingId({
			kind: "quality-warning",
			assetId,
			timeRange,
			evidence,
			discriminator: code,
		}),
		algorithmVersion: MEDIA_INDEX_ALGORITHM_VERSION,
		timeRange,
		confidence: confidence({
			score: confidenceScore,
			basis: confidenceBasis,
		}),
		evidence,
	};
}

function largestVideoGap(frames: readonly MediaIndexVideoFrameSample[]) {
	let result:
		| {
				gap: number;
				left: MediaIndexVideoFrameSample;
				right: MediaIndexVideoFrameSample;
		  }
		| undefined;
	for (let index = 1; index < frames.length; index += 1) {
		const left = frames[index - 1];
		const right = frames[index];
		const gap = right.atSeconds - left.atSeconds;
		if (!result || gap > result.gap) result = { gap, left, right };
	}
	return result;
}

function largestAudioGap(windows: readonly MediaIndexAudioWindowSample[]) {
	let result:
		| {
				gap: number;
				left: MediaIndexAudioWindowSample;
				right: MediaIndexAudioWindowSample;
		  }
		| undefined;
	for (let index = 1; index < windows.length; index += 1) {
		const left = windows[index - 1];
		const right = windows[index];
		const gap = right.startSeconds - left.endSeconds;
		if (!result || gap > result.gap) result = { gap, left, right };
	}
	return result;
}

function qualityWarnings({
	assetId,
	metadata,
	frames,
	windows,
}: {
	assetId: string;
	metadata: MediaIndexMetadataSample;
	frames: readonly MediaIndexVideoFrameSample[];
	windows: readonly MediaIndexAudioWindowSample[];
}): readonly MediaIndexQualityWarning[] {
	const warnings: MediaIndexQualityWarning[] = [];
	const metadataRef = metadataEvidence(metadata);
	const fullRange = metadataRef.timeRange;
	const addMetadataWarning = ({
		code,
		severity,
		message,
	}: {
		code: MediaIndexQualityWarningCode;
		severity: MediaIndexQualityWarning["severity"];
		message: string;
	}) => {
		warnings.push(
			qualityWarning({
				assetId,
				code,
				severity,
				message,
				timeRange: fullRange,
				evidence: [metadataRef],
				confidenceScore: 1,
				confidenceBasis: "Directly reported by normalized media metadata.",
			}),
		);
	};

	if (
		metadata.durationSeconds < MEDIA_INDEX_THRESHOLDS.quality.shortMediaSeconds
	) {
		addMetadataWarning({
			code: "SHORT_MEDIA",
			severity: "info",
			message:
				"The media duration is below the local short-media threshold; sparse candidates are expected.",
		});
	}
	if (!metadata.hasVideo) {
		addMetadataWarning({
			code: "NO_VIDEO_TRACK",
			severity: "info",
			message:
				"Metadata reports no video track, so no visual boundary candidates are produced.",
		});
	} else if (frames.length === 0) {
		addMetadataWarning({
			code: "VIDEO_SAMPLES_MISSING",
			severity: "warning",
			message:
				"A video track exists, but no browser frame samples were supplied.",
		});
	} else if (frames.length < 2) {
		warnings.push(
			qualityWarning({
				assetId,
				code: "INSUFFICIENT_VIDEO_SAMPLES",
				severity: "warning",
				message:
					"At least two timestamped frame samples are required to compare visual changes.",
				timeRange: {
					startSeconds: frames[0].atSeconds,
					endSeconds: frames[0].atSeconds,
				},
				evidence: [frameEvidence(frames[0])],
				confidenceScore: 1,
				confidenceBasis: "Direct frame-sample count.",
			}),
		);
	}
	if (!metadata.hasAudio) {
		addMetadataWarning({
			code: "NO_AUDIO_TRACK",
			severity: "info",
			message:
				"Metadata reports no audio track, so no silence or voice-activity candidates are produced.",
		});
	} else if (windows.length === 0) {
		addMetadataWarning({
			code: "AUDIO_SAMPLES_MISSING",
			severity: "warning",
			message:
				"An audio track exists, but no browser RMS/peak windows were supplied.",
		});
	}
	if (
		metadata.hasVideo &&
		(metadata.videoWidth ?? 0) < MEDIA_INDEX_THRESHOLDS.quality.lowVideoWidth &&
		(metadata.videoHeight ?? 0) < MEDIA_INDEX_THRESHOLDS.quality.lowVideoHeight
	) {
		addMetadataWarning({
			code: "LOW_VIDEO_RESOLUTION",
			severity: "warning",
			message:
				"The reported video dimensions are below the local 640x360 quality threshold.",
		});
	}

	const darkFrames = frames.filter(
		(frame) =>
			frame.meanLuminance <= MEDIA_INDEX_THRESHOLDS.quality.darkLuminance,
	);
	if (
		frames.length >= 4 &&
		darkFrames.length / frames.length >=
			MEDIA_INDEX_THRESHOLDS.quality.darkSampleRatio
	) {
		const evidence = darkFrames.map(frameEvidence);
		warnings.push(
			qualityWarning({
				assetId,
				code: "PREDOMINANTLY_DARK_VIDEO_SAMPLES",
				severity: "warning",
				message:
					"Most supplied frame samples fall below the local luminance threshold; this describes sampled brightness only.",
				timeRange: {
					startSeconds: darkFrames[0].atSeconds,
					endSeconds: darkFrames[darkFrames.length - 1].atSeconds,
				},
				evidence,
				confidenceScore: darkFrames.length / frames.length,
				confidenceBasis: "Ratio of cited frames below the luminance threshold.",
			}),
		);
	}

	const clippingWindows = windows.filter(
		(window) => window.peak >= MEDIA_INDEX_THRESHOLDS.quality.clippingPeak,
	);
	if (
		windows.length >= 2 &&
		clippingWindows.length / windows.length >=
			MEDIA_INDEX_THRESHOLDS.quality.clippingSampleRatio
	) {
		const evidence = clippingWindows.map(audioEvidence);
		warnings.push(
			qualityWarning({
				assetId,
				code: "POSSIBLE_AUDIO_CLIPPING",
				severity: "warning",
				message:
					"Peak samples reach the local clipping-risk threshold; clipping is not confirmed without waveform inspection.",
				timeRange: {
					startSeconds: clippingWindows[0].startSeconds,
					endSeconds: clippingWindows[clippingWindows.length - 1].endSeconds,
				},
				evidence,
				confidenceScore: clamp(
					0.5 + clippingWindows.length / windows.length / 2,
				),
				confidenceBasis:
					"Ratio of cited audio windows at or above the peak threshold.",
			}),
		);
	}

	const videoGap = largestVideoGap(frames);
	const videoGapThreshold = Math.max(1.5, metadata.durationSeconds * 0.25);
	if (videoGap && videoGap.gap > videoGapThreshold) {
		const evidence = [
			frameEvidence(videoGap.left),
			frameEvidence(videoGap.right),
		];
		warnings.push(
			qualityWarning({
				assetId,
				code: "VIDEO_SAMPLE_GAP",
				severity: "warning",
				message:
					"A large interval between frame samples limits boundary coverage in this range.",
				timeRange: {
					startSeconds: videoGap.left.atSeconds,
					endSeconds: videoGap.right.atSeconds,
				},
				evidence,
				confidenceScore: clamp(videoGap.gap / videoGapThreshold - 0.25),
				confidenceBasis: "Largest observed frame-sampling gap.",
			}),
		);
	}

	const audioGap = largestAudioGap(windows);
	const audioGapThreshold = Math.max(0.25, metadata.durationSeconds * 0.1);
	if (audioGap && audioGap.gap > audioGapThreshold) {
		const evidence = [
			audioEvidence(audioGap.left),
			audioEvidence(audioGap.right),
		];
		warnings.push(
			qualityWarning({
				assetId,
				code: "AUDIO_SAMPLE_GAP",
				severity: "warning",
				message:
					"A large interval between audio windows limits activity coverage in this range.",
				timeRange: {
					startSeconds: audioGap.left.endSeconds,
					endSeconds: audioGap.right.startSeconds,
				},
				evidence,
				confidenceScore: clamp(audioGap.gap / audioGapThreshold - 0.25),
				confidenceBasis: "Largest observed audio-window sampling gap.",
			}),
		);
	}
	return warnings;
}

function coverageSummary({
	hasTrack,
	count,
	first,
	last,
	maximumGap,
}: {
	hasTrack: boolean;
	count: number;
	first: number | null;
	last: number | null;
	maximumGap: number | null;
}): MediaIndexCoverageSummary {
	return {
		state: !hasTrack ? "no-track" : count === 0 ? "missing-samples" : "sampled",
		sampleCount: count,
		firstSampleSeconds: first,
		lastSampleSeconds: last,
		maximumGapSeconds: maximumGap === null ? null : round(maximumGap),
	};
}

function buildMediaIndex({
	assetId,
	sourceSnapshot,
}: NormalizedInput): MediaIndex {
	const { metadata, videoFrameSamples, audioWindowSamples } = sourceSnapshot;
	const boundaries = sceneBoundaries({
		assetId,
		frames: videoFrameSamples,
		durationSeconds: metadata.durationSeconds,
	});
	const activity = audioActivityCandidates({
		assetId,
		windows: audioWindowSamples,
	});
	const warnings = qualityWarnings({
		assetId,
		metadata,
		frames: videoFrameSamples,
		windows: audioWindowSamples,
	});
	const videoGap = largestVideoGap(videoFrameSamples)?.gap ?? null;
	const audioGap = largestAudioGap(audioWindowSamples)?.gap ?? null;
	const payload: Omit<MediaIndex, "mediaIndexId"> = {
		kind: "visioncut.media-index",
		schemaVersion: MEDIA_INDEX_SCHEMA_VERSION,
		assetId,
		algorithm: {
			version: MEDIA_INDEX_ALGORITHM_VERSION,
			deterministic: true,
			execution: "local-pure-rules",
			network: false,
			paidService: false,
			confidenceSemantics: {
				id: MEDIA_INDEX_CONFIDENCE_SEMANTICS_ID,
				scoreRange: [0, 1],
				low: "0.000000-0.499999",
				medium: "0.500000-0.799999",
				high: "0.800000-1.000000",
				meaning: CONFIDENCE_MEANING,
			},
		},
		capabilityBoundary: {
			asrPerformed: false,
			personRecognitionPerformed: false,
			speakerIdentificationPerformed: false,
			emotionRecognitionPerformed: false,
			semanticSceneUnderstandingPerformed: false,
			voiceActivityInterpretation: "energy-based-candidate-only",
		},
		sourceSnapshot,
		summary: {
			durationSeconds: metadata.durationSeconds,
			videoCoverage: coverageSummary({
				hasTrack: metadata.hasVideo,
				count: videoFrameSamples.length,
				first: videoFrameSamples[0]?.atSeconds ?? null,
				last: videoFrameSamples.at(-1)?.atSeconds ?? null,
				maximumGap: videoGap,
			}),
			audioCoverage: coverageSummary({
				hasTrack: metadata.hasAudio,
				count: audioWindowSamples.length,
				first: audioWindowSamples[0]?.startSeconds ?? null,
				last: audioWindowSamples.at(-1)?.endSeconds ?? null,
				maximumGap: audioGap,
			}),
			sceneBoundaryCount: boundaries.length,
			audioActivityCandidateCount: activity.length,
			qualityWarningCount: warnings.length,
		},
		sceneBoundaries: boundaries,
		audioActivityCandidates: activity,
		qualityWarnings: warnings,
	};
	return {
		...payload,
		mediaIndexId: deterministicId({ prefix: "media_index", value: payload }),
	};
}

function assertPlainJsonValue({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): void {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "boolean"
	) {
		return;
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw new MediaIndexInvariantError(
				`${path} contains a non-finite number.`,
			);
		}
		return;
	}
	if (Array.isArray(value)) {
		value.forEach((item, index) =>
			assertPlainJsonValue({ value: item, path: `${path}[${index}]` }),
		);
		return;
	}
	if (typeof value !== "object" || value === undefined) {
		throw new MediaIndexInvariantError(`${path} is not JSON-safe.`);
	}
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		throw new MediaIndexInvariantError(`${path} must be a plain object.`);
	}
	for (const [key, item] of Object.entries(value)) {
		if (item === undefined) {
			throw new MediaIndexInvariantError(`${path}.${key} is undefined.`);
		}
		assertPlainJsonValue({ value: item, path: `${path}.${key}` });
	}
}

function deepFreeze<T>(value: T): T {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		for (const item of Object.values(value)) deepFreeze(item);
		Object.freeze(value);
	}
	return value;
}

function verifiedMediaIndex(value: unknown): MediaIndex {
	assertPlainJsonValue({ value, path: "MediaIndex" });
	const candidate = asRecord({ value, label: "MediaIndex" });
	if (
		candidate.kind !== "visioncut.media-index" ||
		candidate.schemaVersion !== MEDIA_INDEX_SCHEMA_VERSION
	) {
		throw new MediaIndexInvariantError("Unsupported MediaIndex schema.");
	}
	const snapshot = asRecord({
		value: candidate.sourceSnapshot,
		label: "MediaIndex sourceSnapshot",
	});
	const expected = buildMediaIndex(
		normalizeCreateInput({
			assetId: candidate.assetId,
			metadata: snapshot.metadata,
			videoFrameSamples: snapshot.videoFrameSamples,
			audioWindowSamples: snapshot.audioWindowSamples,
		}),
	);
	if (canonicalJson(candidate) !== canonicalJson(expected)) {
		throw new MediaIndexInvariantError(
			"MediaIndex does not match its deterministic source derivation.",
		);
	}
	return expected;
}

export function assertMediaIndexInvariants({
	index,
}: {
	index: unknown;
}): void {
	verifiedMediaIndex(index);
}

export function createMediaIndex(input: CreateMediaIndexInput): MediaIndex;
export function createMediaIndex(input: unknown): MediaIndex;
export function createMediaIndex(input: unknown): MediaIndex {
	const index = buildMediaIndex(normalizeCreateInput(input));
	assertMediaIndexInvariants({ index });
	return deepFreeze(index);
}

export function parseMediaIndex({ value }: { value: unknown }): MediaIndex {
	return deepFreeze(verifiedMediaIndex(value));
}

export function serializeMediaIndex({
	index,
	space = 2,
}: {
	index: MediaIndex;
	space?: number;
}): string {
	assertMediaIndexInvariants({ index });
	if (!Number.isSafeInteger(space) || space < 0 || space > 10) {
		throw new MediaIndexInvariantError(
			"JSON indentation must be an integer between 0 and 10.",
		);
	}
	return JSON.stringify(index, null, space);
}

export function deserializeMediaIndex({
	serialized,
}: {
	serialized: string;
}): MediaIndex {
	let value: unknown;
	try {
		value = JSON.parse(serialized);
	} catch {
		throw new MediaIndexInvariantError("MediaIndex is not valid JSON.");
	}
	return parseMediaIndex({ value });
}
