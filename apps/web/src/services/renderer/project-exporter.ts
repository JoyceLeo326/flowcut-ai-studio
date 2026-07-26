import type { ExportOptions, ExportResult } from "@/export";
import { createTimelineAudioBuffer } from "@/media/audio";
import type { MediaAsset } from "@/media/types";
import type { TBackground, TCanvasSize } from "@/project/types";
import type { SceneTracks } from "@/timeline";
import { buildScene } from "./scene-builder";
import { SceneExporter } from "./scene-exporter";

function hasSameAspectRatio({
	source,
	output,
}: {
	source: TCanvasSize;
	output: TCanvasSize;
}): boolean {
	return source.width * output.height === source.height * output.width;
}

export async function exportProjectSnapshot({
	tracks,
	mediaAssets,
	duration,
	sourceCanvasSize,
	outputCanvasSize,
	background,
	options,
	onProgress,
	onCancel,
}: {
	tracks: SceneTracks;
	mediaAssets: MediaAsset[];
	duration: number;
	sourceCanvasSize: TCanvasSize;
	outputCanvasSize: TCanvasSize;
	background: TBackground;
	options: ExportOptions;
	onProgress?: (input: { progress: number }) => void;
	onCancel?: () => boolean;
}): Promise<ExportResult> {
	if (duration <= 0) {
		return { success: false, error: "Project is empty" };
	}
	if (
		!hasSameAspectRatio({ source: sourceCanvasSize, output: outputCanvasSize })
	) {
		return {
			success: false,
			error:
				"The local snapshot renderer only supports temporary scaling within the current aspect ratio.",
		};
	}
	const fps = options.fps;
	if (!fps) {
		return { success: false, error: "Export frame rate is required." };
	}

	try {
		let audioBuffer: AudioBuffer | null = null;
		if (options.includeAudio) {
			onProgress?.({ progress: 0.05 });
			audioBuffer = await createTimelineAudioBuffer({
				tracks,
				mediaAssets,
				duration,
			});
		}
		const scene = buildScene({
			tracks,
			mediaAssets,
			duration,
			canvasSize: sourceCanvasSize,
			background,
		});
		const exporter = new SceneExporter({
			width: sourceCanvasSize.width,
			height: sourceCanvasSize.height,
			outputWidth: outputCanvasSize.width,
			outputHeight: outputCanvasSize.height,
			fps,
			format: options.format,
			quality: options.quality,
			shouldIncludeAudio: Boolean(options.includeAudio),
			audioBuffer: audioBuffer ?? undefined,
		});
		exporter.on("progress", (progress) => {
			onProgress?.({
				progress: options.includeAudio ? 0.05 + progress * 0.95 : progress,
			});
		});

		let cancelled = false;
		const cancelInterval = window.setInterval(() => {
			if (!onCancel?.()) return;
			cancelled = true;
			exporter.cancel();
		}, 100);
		try {
			const buffer = await exporter.export({ rootNode: scene });
			if (cancelled) return { success: false, cancelled: true };
			if (!buffer) {
				return { success: false, error: "Export failed to produce buffer" };
			}
			return { success: true, buffer };
		} finally {
			window.clearInterval(cancelInterval);
		}
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown export error",
		};
	}
}
