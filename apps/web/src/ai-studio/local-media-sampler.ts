import {
	ALL_FORMATS,
	AudioBufferSink,
	BlobSource,
	CanvasSink,
	Input,
} from "mediabunny";
import type { MediaAsset } from "@/media/types";

export const LOCAL_MEDIA_SAMPLER_VERSION = "visioncut-local-sampler-v1";

const DEFAULT_MAX_ANALYSIS_SECONDS = 30 * 60;
const DEFAULT_MAX_VIDEO_SAMPLES = 180;
const DEFAULT_MAX_AUDIO_SAMPLES = 3_600;
const DEFAULT_AUDIO_INTERVAL_SECONDS = 0.25;
const ANALYSIS_CANVAS_WIDTH = 64;

export type LocalMediaSamplingPhase =
	| "opening"
	| "video"
	| "audio"
	| "complete";

export interface LocalMediaSamplingProgress {
	readonly phase: LocalMediaSamplingPhase;
	readonly progress: number;
	readonly message: string;
}

export interface LocalFrameMetric {
	readonly requestedAtSeconds: number;
	readonly observedAtSeconds: number;
	readonly lumaMean: number;
	readonly lumaStandardDeviation: number;
	readonly darkPixelRatio: number;
	readonly lightPixelRatio: number;
	readonly differenceFromPrevious: number | null;
}

export interface LocalAudioMetric {
	readonly requestedAtSeconds: number;
	readonly observedAtSeconds: number;
	readonly durationSeconds: number;
	readonly rms: number;
	readonly peak: number;
}

export interface LocalMediaSampleCapture {
	readonly kind: "visioncut.local-media-sample-capture";
	readonly version: typeof LOCAL_MEDIA_SAMPLER_VERSION;
	readonly asset: {
		readonly id: string;
		readonly name: string;
		readonly mediaType: MediaAsset["type"];
		readonly mimeType: string;
		readonly sizeBytes: number;
		readonly lastModified: number;
		readonly durationSeconds: number;
		readonly width: number | null;
		readonly height: number | null;
		readonly fps: number | null;
		readonly hasAudio: boolean;
	};
	readonly coverage: {
		readonly startSeconds: 0;
		readonly endSeconds: number;
		readonly truncated: boolean;
	};
	readonly capabilities: {
		readonly videoTrackPresent: boolean;
		readonly videoDecoded: boolean;
		readonly audioTrackPresent: boolean;
		readonly audioDecoded: boolean;
	};
	readonly frameSamples: readonly LocalFrameMetric[];
	readonly audioSamples: readonly LocalAudioMetric[];
	readonly limitations: readonly string[];
}

export interface LocalMediaSamplerOptions {
	readonly maxAnalysisSeconds?: number;
	readonly maxVideoSamples?: number;
	readonly maxAudioSamples?: number;
	readonly audioIntervalSeconds?: number;
}

export interface FrameMeasurement {
	readonly luma: Float32Array;
	readonly lumaMean: number;
	readonly lumaStandardDeviation: number;
	readonly darkPixelRatio: number;
	readonly lightPixelRatio: number;
	readonly differenceFromPrevious: number | null;
}

export interface AudioMeasurement {
	readonly rms: number;
	readonly peak: number;
}

function assertPositiveFinite({
	value,
	label,
}: {
	value: number;
	label: string;
}) {
	if (!Number.isFinite(value) || value <= 0) {
		throw new TypeError(`${label} must be a positive finite number.`);
	}
}

function assertPositiveInteger({
	value,
	label,
}: {
	value: number;
	label: string;
}) {
	if (!Number.isSafeInteger(value) || value < 1) {
		throw new TypeError(`${label} must be a positive integer.`);
	}
}

function roundMetric(value: number): number {
	return Number(value.toFixed(6));
}

function throwIfAborted(signal: AbortSignal | undefined): void {
	if (signal?.aborted)
		throw new DOMException("Analysis cancelled", "AbortError");
}

export function createSamplingTimestamps({
	durationSeconds,
	maxSamples,
	preferredIntervalSeconds,
}: {
	durationSeconds: number;
	maxSamples: number;
	preferredIntervalSeconds: number;
}): readonly number[] {
	assertPositiveFinite({ value: durationSeconds, label: "durationSeconds" });
	assertPositiveInteger({ value: maxSamples, label: "maxSamples" });
	assertPositiveFinite({
		value: preferredIntervalSeconds,
		label: "preferredIntervalSeconds",
	});

	if (maxSamples === 1) return Object.freeze([0]);
	const safeEnd = Math.max(0, durationSeconds - 0.001);
	if (safeEnd === 0) return Object.freeze([0]);
	const interval = Math.max(
		preferredIntervalSeconds,
		safeEnd / (maxSamples - 1),
	);
	const timestamps: number[] = [];
	for (let timestamp = 0; timestamp < safeEnd; timestamp += interval) {
		timestamps.push(roundMetric(timestamp));
	}
	if (
		timestamps.length < maxSamples &&
		(safeEnd - (timestamps.at(-1) ?? 0) > interval * 0.25 ||
			timestamps.length === 1)
	) {
		timestamps.push(roundMetric(safeEnd));
	}
	return Object.freeze(timestamps.slice(0, maxSamples));
}

export function measureFramePixels({
	rgba,
	width,
	height,
	previousLuma,
}: {
	rgba: Uint8ClampedArray;
	width: number;
	height: number;
	previousLuma?: Float32Array | null;
}): FrameMeasurement {
	assertPositiveInteger({ value: width, label: "width" });
	assertPositiveInteger({ value: height, label: "height" });
	const pixelCount = width * height;
	if (rgba.length !== pixelCount * 4) {
		throw new TypeError(
			"RGBA data length does not match the frame dimensions.",
		);
	}
	if (previousLuma && previousLuma.length !== pixelCount) {
		throw new TypeError(
			"Previous luma data does not match the frame dimensions.",
		);
	}

	const luma = new Float32Array(pixelCount);
	let sum = 0;
	let sumSquares = 0;
	let darkPixels = 0;
	let lightPixels = 0;
	let absoluteDifference = 0;
	for (let pixel = 0; pixel < pixelCount; pixel++) {
		const offset = pixel * 4;
		const value =
			0.2126 * (rgba[offset] ?? 0) +
			0.7152 * (rgba[offset + 1] ?? 0) +
			0.0722 * (rgba[offset + 2] ?? 0);
		luma[pixel] = value;
		sum += value;
		sumSquares += value * value;
		if (value <= 8) darkPixels += 1;
		if (value >= 247) lightPixels += 1;
		if (previousLuma)
			absoluteDifference += Math.abs(value - previousLuma[pixel]);
	}

	const mean = sum / pixelCount;
	const variance = Math.max(0, sumSquares / pixelCount - mean * mean);
	return {
		luma,
		lumaMean: roundMetric(mean / 255),
		lumaStandardDeviation: roundMetric(Math.sqrt(variance) / 255),
		darkPixelRatio: roundMetric(darkPixels / pixelCount),
		lightPixelRatio: roundMetric(lightPixels / pixelCount),
		differenceFromPrevious: previousLuma
			? roundMetric(absoluteDifference / pixelCount / 255)
			: null,
	};
}

export function measureAudioChannels({
	channels,
}: {
	channels: readonly Float32Array[];
}): AudioMeasurement {
	if (channels.length === 0) return { peak: 0, rms: 0 };
	const sampleCount = channels[0]?.length ?? 0;
	if (channels.some((channel) => channel.length !== sampleCount)) {
		throw new TypeError("Audio channels must have equal lengths.");
	}
	if (sampleCount === 0) return { peak: 0, rms: 0 };

	let peak = 0;
	let sumSquares = 0;
	for (const channel of channels) {
		for (let index = 0; index < sampleCount; index++) {
			const sample = Math.max(-1, Math.min(1, channel[index] ?? 0));
			const magnitude = Math.abs(sample);
			if (magnitude > peak) peak = magnitude;
			sumSquares += sample * sample;
		}
	}
	return {
		peak: roundMetric(peak),
		rms: roundMetric(Math.sqrt(sumSquares / (sampleCount * channels.length))),
	};
}

function getCanvasMeasurement({
	canvas,
	previousLuma,
}: {
	canvas: HTMLCanvasElement | OffscreenCanvas;
	previousLuma: Float32Array | null;
}): FrameMeasurement {
	const context = canvas.getContext("2d", {
		willReadFrequently: true,
	}) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
	if (!context)
		throw new Error("The browser could not read the sampled frame.");
	const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
	return measureFramePixels({
		rgba: imageData.data,
		width: imageData.width,
		height: imageData.height,
		previousLuma,
	});
}

function emitProgress({
	onProgress,
	phase,
	progress,
	message,
}: LocalMediaSamplingProgress & {
	onProgress?: (progress: LocalMediaSamplingProgress) => void;
}): void {
	onProgress?.({
		phase,
		progress: Math.max(0, Math.min(100, progress)),
		message,
	});
}

function freezeCapture(
	capture: LocalMediaSampleCapture,
): LocalMediaSampleCapture {
	Object.freeze(capture.asset);
	Object.freeze(capture.coverage);
	Object.freeze(capture.capabilities);
	for (const sample of capture.frameSamples) Object.freeze(sample);
	for (const sample of capture.audioSamples) Object.freeze(sample);
	Object.freeze(capture.frameSamples);
	Object.freeze(capture.audioSamples);
	Object.freeze(capture.limitations);
	return Object.freeze(capture);
}

export async function captureLocalMediaSamples({
	asset,
	options = {},
	signal,
	onProgress,
}: {
	asset: MediaAsset;
	options?: LocalMediaSamplerOptions;
	signal?: AbortSignal;
	onProgress?: (progress: LocalMediaSamplingProgress) => void;
}): Promise<LocalMediaSampleCapture> {
	if (asset.type === "image") {
		throw new TypeError(
			"Local temporal analysis requires a video or audio asset.",
		);
	}
	const maxAnalysisSeconds =
		options.maxAnalysisSeconds ?? DEFAULT_MAX_ANALYSIS_SECONDS;
	const maxVideoSamples = options.maxVideoSamples ?? DEFAULT_MAX_VIDEO_SAMPLES;
	const maxAudioSamples = options.maxAudioSamples ?? DEFAULT_MAX_AUDIO_SAMPLES;
	const audioIntervalSeconds =
		options.audioIntervalSeconds ?? DEFAULT_AUDIO_INTERVAL_SECONDS;
	assertPositiveFinite({
		value: maxAnalysisSeconds,
		label: "maxAnalysisSeconds",
	});
	assertPositiveInteger({ value: maxVideoSamples, label: "maxVideoSamples" });
	assertPositiveInteger({ value: maxAudioSamples, label: "maxAudioSamples" });
	assertPositiveFinite({
		value: audioIntervalSeconds,
		label: "audioIntervalSeconds",
	});

	throwIfAborted(signal);
	emitProgress({
		onProgress,
		phase: "opening",
		progress: 2,
		message: "读取媒体轨道",
	});
	const input = new Input({
		source: new BlobSource(asset.file),
		formats: ALL_FORMATS,
	});
	try {
		const durationSeconds = await input.computeDuration();
		assertPositiveFinite({ value: durationSeconds, label: "media duration" });
		const coverageEndSeconds = Math.min(durationSeconds, maxAnalysisSeconds);
		const [videoTrack, audioTrack] = await Promise.all([
			input.getPrimaryVideoTrack(),
			input.getPrimaryAudioTrack(),
		]);
		const [videoDecoded, audioDecoded] = await Promise.all([
			videoTrack?.canDecode() ?? Promise.resolve(false),
			audioTrack?.canDecode() ?? Promise.resolve(false),
		]);
		const limitations: string[] = [
			"本地采样只测量帧变化、亮度与音频能量，不包含转写、人物、物体或情绪识别。",
		];
		if (coverageEndSeconds < durationSeconds) {
			limitations.push(
				`素材超过本轮 ${Math.round(maxAnalysisSeconds / 60)} 分钟采样上限，后段尚未分析。`,
			);
		}
		if (videoTrack && !videoDecoded) {
			limitations.push("当前浏览器无法解码视频轨道，因此没有生成帧变化证据。");
		}
		if (audioTrack && !audioDecoded) {
			limitations.push(
				"当前浏览器无法解码音频轨道，因此没有生成音频能量证据。",
			);
		}

		const frameSamples: LocalFrameMetric[] = [];
		if (videoTrack && videoDecoded) {
			const preferredVideoInterval = Math.max(0.5, coverageEndSeconds / 90);
			const timestamps = createSamplingTimestamps({
				durationSeconds: coverageEndSeconds,
				maxSamples: maxVideoSamples,
				preferredIntervalSeconds: preferredVideoInterval,
			});
			const sink = new CanvasSink(videoTrack, { width: ANALYSIS_CANVAS_WIDTH });
			let previousLuma: Float32Array | null = null;
			let index = 0;
			for await (const wrapped of sink.canvasesAtTimestamps(timestamps)) {
				throwIfAborted(signal);
				const requestedAtSeconds = timestamps[index] ?? wrapped?.timestamp ?? 0;
				if (wrapped) {
					const measurement = getCanvasMeasurement({
						canvas: wrapped.canvas,
						previousLuma,
					});
					previousLuma = measurement.luma;
					frameSamples.push({
						requestedAtSeconds,
						observedAtSeconds: roundMetric(wrapped.timestamp),
						lumaMean: measurement.lumaMean,
						lumaStandardDeviation: measurement.lumaStandardDeviation,
						darkPixelRatio: measurement.darkPixelRatio,
						lightPixelRatio: measurement.lightPixelRatio,
						differenceFromPrevious: measurement.differenceFromPrevious,
					});
				}
				index += 1;
				emitProgress({
					onProgress,
					phase: "video",
					progress: 8 + (index / timestamps.length) * 42,
					message: `采样画面 ${index}/${timestamps.length}`,
				});
			}
		}

		const audioSamples: LocalAudioMetric[] = [];
		if (audioTrack && audioDecoded) {
			const timestamps = createSamplingTimestamps({
				durationSeconds: coverageEndSeconds,
				maxSamples: maxAudioSamples,
				preferredIntervalSeconds: audioIntervalSeconds,
			});
			const sink = new AudioBufferSink(audioTrack);
			let index = 0;
			for await (const wrapped of sink.buffersAtTimestamps(timestamps)) {
				throwIfAborted(signal);
				const requestedAtSeconds = timestamps[index] ?? wrapped?.timestamp ?? 0;
				if (wrapped) {
					const channels = Array.from(
						{ length: wrapped.buffer.numberOfChannels },
						(_, channel) => wrapped.buffer.getChannelData(channel),
					);
					const measurement = measureAudioChannels({ channels });
					audioSamples.push({
						requestedAtSeconds,
						observedAtSeconds: roundMetric(wrapped.timestamp),
						durationSeconds: roundMetric(wrapped.duration),
						rms: measurement.rms,
						peak: measurement.peak,
					});
				}
				index += 1;
				emitProgress({
					onProgress,
					phase: "audio",
					progress: 52 + (index / timestamps.length) * 46,
					message: `采样声音 ${index}/${timestamps.length}`,
				});
			}
		}

		const capture: LocalMediaSampleCapture = {
			kind: "visioncut.local-media-sample-capture",
			version: LOCAL_MEDIA_SAMPLER_VERSION,
			asset: {
				id: asset.id,
				name: asset.name,
				mediaType: asset.type,
				mimeType: asset.file.type,
				sizeBytes: asset.file.size,
				lastModified: asset.file.lastModified,
				durationSeconds: roundMetric(durationSeconds),
				width: asset.width ?? videoTrack?.displayWidth ?? null,
				height: asset.height ?? videoTrack?.displayHeight ?? null,
				fps: asset.fps ?? null,
				hasAudio: audioTrack !== null,
			},
			coverage: {
				startSeconds: 0,
				endSeconds: roundMetric(coverageEndSeconds),
				truncated: coverageEndSeconds < durationSeconds,
			},
			capabilities: {
				videoTrackPresent: videoTrack !== null,
				videoDecoded,
				audioTrackPresent: audioTrack !== null,
				audioDecoded,
			},
			frameSamples,
			audioSamples,
			limitations,
		};
		emitProgress({
			onProgress,
			phase: "complete",
			progress: 100,
			message: "本地证据采样完成",
		});
		return freezeCapture(capture);
	} finally {
		input.dispose();
	}
}
