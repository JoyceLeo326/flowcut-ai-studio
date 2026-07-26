import {
	createMediaIndex,
	type CreateMediaIndexInput,
	type MediaIndex,
	type MediaIndexAudioWindowSample,
	type MediaIndexVideoFrameSample,
} from "./media-index";
import {
	LOCAL_MEDIA_SAMPLER_VERSION,
	type LocalAudioMetric,
	type LocalFrameMetric,
	type LocalMediaSampleCapture,
} from "./local-media-sampler";

export const LOCAL_CAPTURE_ADAPTER_VERSION =
	"visioncut.local-capture-media-index-adapter/1.0.0" as const;

function stableHash(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}

function rounded(value: number): number {
	return Number(value.toFixed(6));
}

export interface LocalAssetFingerprintInput {
	readonly id: string;
	readonly name: string;
	readonly mediaType: "video" | "audio" | "image";
	readonly mimeType: string;
	readonly sizeBytes: number;
	readonly lastModified: number;
	readonly durationSeconds: number;
	readonly width: number | null;
	readonly height: number | null;
	readonly fps: number | null;
	readonly hasAudio: boolean;
}

export interface FingerprintableMediaAsset {
	readonly id: string;
	readonly name: string;
	readonly type: "video" | "audio" | "image";
	readonly file: {
		readonly type: string;
		readonly size: number;
		readonly lastModified: number;
	};
	readonly duration?: number;
	readonly width?: number;
	readonly height?: number;
	readonly fps?: number;
	readonly hasAudio?: boolean;
}

export function createLocalAssetFingerprintFromIdentity({
	asset,
}: {
	asset: LocalAssetFingerprintInput;
}): string {
	const identity = JSON.stringify({ version: 1, ...asset });
	return `visioncut-asset-v1-${stableHash(identity)}`;
}

export function createLocalAssetFingerprintForMediaAsset({
	asset,
}: {
	asset: FingerprintableMediaAsset;
}): string {
	return createLocalAssetFingerprintFromIdentity({
		asset: {
			id: asset.id,
			name: asset.name,
			mediaType: asset.type,
			mimeType: asset.file.type,
			sizeBytes: asset.file.size,
			lastModified: asset.file.lastModified,
			durationSeconds: asset.duration ?? 0,
			width: asset.width ?? null,
			height: asset.height ?? null,
			fps: asset.fps ?? null,
			hasAudio: asset.hasAudio ?? asset.type === "audio",
		},
	});
}

export function createLocalAssetFingerprint({
	capture,
}: {
	capture: LocalMediaSampleCapture;
}): string {
	return createLocalAssetFingerprintFromIdentity({
		asset: {
			id: capture.asset.id,
			name: capture.asset.name,
			mediaType: capture.asset.mediaType,
			mimeType: capture.asset.mimeType,
			sizeBytes: capture.asset.sizeBytes,
			lastModified: capture.asset.lastModified,
			durationSeconds: capture.asset.durationSeconds,
			width: capture.asset.width,
			height: capture.asset.height,
			fps: capture.asset.fps,
			hasAudio: capture.asset.hasAudio,
		},
	});
}

function sourceId({
	capture,
	fingerprint,
	channel,
}: {
	capture: LocalMediaSampleCapture;
	fingerprint: string;
	channel: "metadata" | "video" | "audio";
}): string {
	return `${LOCAL_CAPTURE_ADAPTER_VERSION}:${LOCAL_MEDIA_SAMPLER_VERSION}:${fingerprint}:${capture.asset.id}:${channel}`;
}

function normalizedFrames({
	capture,
	fingerprint,
}: {
	capture: LocalMediaSampleCapture;
	fingerprint: string;
}): readonly MediaIndexVideoFrameSample[] {
	const byTimestamp = new Map<number, LocalFrameMetric>();
	for (const sample of capture.frameSamples) {
		const timestamp = rounded(sample.observedAtSeconds);
		const previous = byTimestamp.get(timestamp);
		if (
			previous === undefined ||
			(sample.differenceFromPrevious ?? 0) >
				(previous.differenceFromPrevious ?? 0)
		) {
			byTimestamp.set(timestamp, sample);
		}
	}
	return Object.freeze(
		[...byTimestamp.entries()]
			.sort(([left], [right]) => left - right)
			.map(([atSeconds, sample]) =>
				Object.freeze({
					atSeconds,
					differenceFromPrevious: rounded(sample.differenceFromPrevious ?? 0),
					meanLuminance: rounded(sample.lumaMean),
					source: Object.freeze({
						sourceId: sourceId({
							capture,
							fingerprint,
							channel: "video",
						}),
						method: "mediabunny-canvas-sink" as const,
					}),
				}),
			),
	);
}

function audioIdentity(sample: LocalAudioMetric): string {
	return `${rounded(sample.requestedAtSeconds)}:${rounded(
		sample.observedAtSeconds,
	)}:${rounded(sample.durationSeconds)}`;
}

function normalizedAudio({
	capture,
	fingerprint,
}: {
	capture: LocalMediaSampleCapture;
	fingerprint: string;
}): readonly MediaIndexAudioWindowSample[] {
	const byWindow = new Map<string, LocalAudioMetric>();
	for (const sample of capture.audioSamples) {
		const key = audioIdentity(sample);
		const previous = byWindow.get(key);
		if (
			previous === undefined ||
			sample.rms > previous.rms ||
			(sample.rms === previous.rms && sample.peak > previous.peak)
		) {
			byWindow.set(key, sample);
		}
	}
	const samples = [...byWindow.values()].sort(
		(left, right) =>
			left.requestedAtSeconds - right.requestedAtSeconds ||
			left.observedAtSeconds - right.observedAtSeconds ||
			left.durationSeconds - right.durationSeconds,
	);
	return Object.freeze(
		samples.map((sample, index) => {
				const previous = samples[index - 1];
				const next = samples[index + 1];
				const startSeconds =
					samples.length === 1
						? rounded(sample.observedAtSeconds)
						: rounded(
								previous
									? (previous.requestedAtSeconds +
											sample.requestedAtSeconds) /
											2
									: capture.coverage.startSeconds,
							);
				const endSeconds =
					samples.length === 1
						? rounded(
								Math.min(
									capture.coverage.endSeconds,
									startSeconds + sample.durationSeconds,
								),
							)
						: rounded(
								next
									? (sample.requestedAtSeconds + next.requestedAtSeconds) / 2
									: capture.coverage.endSeconds,
							);
				return Object.freeze({
					startSeconds,
					endSeconds,
					rms: rounded(sample.rms),
					peak: rounded(sample.peak),
					source: Object.freeze({
						sourceId: sourceId({
							capture,
							fingerprint,
							channel: "audio",
						}),
						method: "mediabunny-audio-buffer-sink" as const,
					}),
				});
			}),
	);
}

export function localCaptureToMediaIndexInput({
	capture,
}: {
	capture: LocalMediaSampleCapture;
}): CreateMediaIndexInput {
	if (
		capture.kind !== "visioncut.local-media-sample-capture" ||
		capture.version !== LOCAL_MEDIA_SAMPLER_VERSION
	) {
		throw new TypeError("Unsupported local media sample capture.");
	}
	const fingerprint = createLocalAssetFingerprint({ capture });
	return Object.freeze({
		assetId: capture.asset.id,
		metadata: Object.freeze({
			durationSeconds: capture.asset.durationSeconds,
			hasVideo: capture.capabilities.videoTrackPresent,
			hasAudio: capture.capabilities.audioTrackPresent,
			...(capture.asset.width === null
				? {}
				: { videoWidth: capture.asset.width }),
			...(capture.asset.height === null
				? {}
				: { videoHeight: capture.asset.height }),
			...(capture.asset.fps === null
				? {}
				: { nominalFrameRate: capture.asset.fps }),
			fileSizeBytes: capture.asset.sizeBytes,
			mimeType: capture.asset.mimeType,
			source: Object.freeze({
				sourceId: sourceId({
					capture,
					fingerprint,
					channel: "metadata",
				}),
				method: "mediabunny-input" as const,
			}),
		}),
		videoFrameSamples: normalizedFrames({ capture, fingerprint }),
		audioWindowSamples: normalizedAudio({ capture, fingerprint }),
	});
}

export function createMediaIndexFromLocalCapture({
	capture,
}: {
	capture: LocalMediaSampleCapture;
}): MediaIndex {
	return createMediaIndex(localCaptureToMediaIndexInput({ capture }));
}
