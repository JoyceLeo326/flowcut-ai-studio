import type { ExportFormat } from "./index";

interface ExportPreflightInput {
	durationSeconds: number;
	canvasSize: { width: number; height: number };
	format: ExportFormat;
	includeAudio: boolean;
	hasAudioSource: boolean;
}

export interface ExportPreflight {
	canExport: boolean;
	summary: {
		duration: string;
		resolution: string;
		aspectRatio: string;
		format: string;
		audio: string;
	};
	blockers: string[];
	warnings: string[];
}

function formatDuration(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
	const rounded = Math.round(seconds);
	const minutes = Math.floor(rounded / 60);
	const remaining = rounded % 60;
	return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

function greatestCommonDivisor({ a, b }: { a: number; b: number }): number {
	let left = Math.abs(Math.round(a));
	let right = Math.abs(Math.round(b));
	while (right !== 0) {
		const next = left % right;
		left = right;
		right = next;
	}
	return left || 1;
}

function formatAspectRatio({
	width,
	height,
}: {
	width: number;
	height: number;
}) {
	if (width <= 0 || height <= 0) return "无效";
	const ratio = width / height;
	const knownRatios = [
		{ label: "16:9", value: 16 / 9 },
		{ label: "9:16", value: 9 / 16 },
		{ label: "4:5", value: 4 / 5 },
		{ label: "1:1", value: 1 },
	];
	const match = knownRatios.find(
		(candidate) => Math.abs(candidate.value - ratio) < 0.015,
	);
	if (match) return match.label;

	const divisor = greatestCommonDivisor({ a: width, b: height });
	const left = Math.round(width / divisor);
	const right = Math.round(height / divisor);
	if (left <= 32 && right <= 32) return `${left}:${right}`;
	return `${ratio.toFixed(2)}:1`;
}

export function createExportPreflight({
	durationSeconds,
	canvasSize,
	format,
	includeAudio,
	hasAudioSource,
}: ExportPreflightInput): ExportPreflight {
	const blockers: string[] = [];
	const warnings: string[] = [];
	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
		blockers.push("时间线还是空的，请先加入视频或图片");
	}
	if (canvasSize.width <= 0 || canvasSize.height <= 0) {
		blockers.push("画布尺寸无效，请先检查项目设置");
	}
	if (includeAudio && !hasAudioSource && durationSeconds > 0) {
		warnings.push("当前时间线没有可用声音，成片将静音");
	}
	if (durationSeconds > 900) {
		warnings.push("成片超过 15 分钟，浏览器导出会占用较多内存");
	}

	return {
		canExport: blockers.length === 0,
		summary: {
			duration: formatDuration(durationSeconds),
			resolution: `${canvasSize.width} × ${canvasSize.height}`,
			aspectRatio: formatAspectRatio(canvasSize),
			format: format.toUpperCase(),
			audio: includeAudio
				? hasAudioSource
					? "包含声音"
					: "静音"
				: "不导出声音",
		},
		blockers,
		warnings,
	};
}
