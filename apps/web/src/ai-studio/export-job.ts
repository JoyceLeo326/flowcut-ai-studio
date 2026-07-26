import {
	getExportMimeType,
	type ExportFormat,
	type ExportQuality,
	type ExportResult,
} from "@/export";
import {
	EXPORT_MAX_STUDIO_OUTPUT_COUNT,
	EXPORT_MIN_VARIANT_COUNT,
	type ExportManifest,
	type ExportVariantIntent,
} from "./export-manifest";

export const EXPORT_JOB_SCHEMA_VERSION = 1 as const;

export type ExportJobStatus =
	| "queued"
	| "rendering"
	| "completed"
	| "failed"
	| "cancelled";

export type ExportJobFailureKind =
	| "manifest-blocked"
	| "unsupported"
	| "stale-project"
	| "render-error"
	| "interrupted";

export type ExportJobFailureCode =
	| "MANIFEST_BLOCKED"
	| "PROJECT_ID_MISMATCH"
	| "PROJECT_VERSION_MISMATCH"
	| "SCENE_ID_MISMATCH"
	| "PROJECT_CANVAS_MISMATCH"
	| "PROJECT_DURATION_MISMATCH"
	| "REFRAME_NOT_REVIEWED"
	| "TARGET_DURATION_NOT_RENDERABLE"
	| "EXTERNAL_BURN_IN_UNSUPPORTED"
	| "SIDECAR_SUBTITLES_UNSUPPORTED"
	| "COVER_ARTIFACT_UNSUPPORTED"
	| "RENDERER_FAILED"
	| "RENDERER_RETURNED_NO_BUFFER"
	| "RENDER_INTERRUPTED";

export interface ExportJobFailure {
	readonly kind: ExportJobFailureKind;
	readonly code: ExportJobFailureCode;
	readonly message: string;
}

export interface ExportJobArtifact {
	readonly fileName: string;
	readonly mimeType: string;
	readonly blob: Blob;
	readonly byteLength: number;
	readonly createdAt: string;
}

export interface ExportJobMeasurements {
	readonly encodedByteLength: number;
	readonly renderElapsedMs: number;
	readonly loudness: {
		readonly state: "not-measured";
		readonly measuredIntegratedLufs: null;
		readonly targetIntegratedLufs: number | null;
		readonly notice: string;
	};
	readonly encodedDuration: {
		readonly state: "not-probed";
		readonly measuredSeconds: null;
	};
}

export interface ExportVariantJob {
	readonly variantId: string;
	readonly label: string;
	readonly status: ExportJobStatus;
	readonly progress: number;
	readonly output: {
		readonly fileName: string;
		readonly format: ExportFormat;
		readonly quality: ExportQuality;
		readonly width: number;
		readonly height: number;
		readonly fps: number;
		readonly includeAudio: boolean;
		readonly targetLoudnessLufs: number | null;
		readonly targetDurationSeconds: number;
	};
	readonly capability: {
		readonly state: "supported" | "rejected";
		readonly rejectionReasons: readonly string[];
		readonly notice: string;
	};
	readonly queuedAt: string;
	readonly startedAt: string | null;
	readonly finishedAt: string | null;
	readonly failure: ExportJobFailure | null;
	readonly artifact: ExportJobArtifact | null;
	readonly measurements: ExportJobMeasurements | null;
}

export interface ExportJobQueue {
	readonly kind: "visioncut.local-export-queue";
	readonly schemaVersion: typeof EXPORT_JOB_SCHEMA_VERSION;
	readonly queueId: string;
	readonly projectId: string;
	readonly projectVersion: number;
	readonly sceneId: string;
	readonly manifestId: string;
	readonly status: ExportJobStatus;
	readonly progress: number;
	readonly createdAt: string;
	readonly startedAt: string | null;
	readonly finishedAt: string | null;
	readonly updatedAt: string;
	readonly jobs: readonly ExportVariantJob[];
	readonly guarantees: {
		readonly localRendererOnly: true;
		readonly automaticUpload: false;
		readonly timelineMutation: false;
		readonly loudnessMeasurementClaimed: false;
	};
}

export interface ExportRuntimeSnapshot {
	readonly projectId: string;
	readonly projectVersion: number;
	readonly sceneId: string;
	readonly canvasSize: {
		readonly width: number;
		readonly height: number;
	};
	readonly durationSeconds: number;
}

export interface ExportVariantRenderer {
	render(input: {
		readonly job: ExportVariantJob;
		readonly signal: AbortSignal;
		readonly onProgress: (progress: number) => void;
	}): Promise<ExportResult>;
}

export class ExportJobInvariantError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ExportJobInvariantError";
	}
}

const DURATION_TOLERANCE_SECONDS = 0.05;
const OUTPUT_QUALITY: ExportQuality = "high";

function normalizeProgress(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}

function createQueueId({
	manifestId,
	createdAt,
}: {
	manifestId: string;
	createdAt: string;
}): string {
	const randomPart =
		typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
			? crypto.randomUUID()
			: Math.random().toString(36).slice(2);
	return `local_export:${manifestId}:${createdAt}:${randomPart}`;
}

function targetLoudness(variant: ExportVariantIntent): number | null {
	return variant.requirements.audio.mode === "include"
		? (variant.requirements.audio.targetLoudnessLufs ?? null)
		: null;
}

function hasSameAspectRatio({
	width,
	height,
	runtime,
}: {
	width: number;
	height: number;
	runtime: ExportRuntimeSnapshot;
}): boolean {
	return (
		width * runtime.canvasSize.height === height * runtime.canvasSize.width
	);
}

function projectRejection({
	manifest,
	runtime,
}: {
	manifest: ExportManifest;
	runtime: ExportRuntimeSnapshot;
}): ExportJobFailure | null {
	if (manifest.project.id !== runtime.projectId) {
		return {
			kind: "stale-project",
			code: "PROJECT_ID_MISMATCH",
			message: "交付清单不属于当前项目。请在当前项目中重新生成清单后再启动。",
		};
	}
	if (manifest.project.version !== runtime.projectVersion) {
		return {
			kind: "stale-project",
			code: "PROJECT_VERSION_MISMATCH",
			message: `交付清单基于项目 v${manifest.project.version}，当前为 v${runtime.projectVersion}。为避免渲染错误版本，请重新生成清单。`,
		};
	}
	if (manifest.sourceEvidence.sceneId !== runtime.sceneId) {
		return {
			kind: "stale-project",
			code: "SCENE_ID_MISMATCH",
			message: "当前场景与交付清单中的场景不一致。队列不会猜测要渲染哪个场景。",
		};
	}
	if (
		manifest.project.canvasSize.width !== runtime.canvasSize.width ||
		manifest.project.canvasSize.height !== runtime.canvasSize.height
	) {
		return {
			kind: "stale-project",
			code: "PROJECT_CANVAS_MISMATCH",
			message: "当前项目画布与交付清单快照不一致。请重新生成清单后再启动。",
		};
	}
	if (
		Math.abs(manifest.project.sourceDurationSeconds - runtime.durationSeconds) >
		DURATION_TOLERANCE_SECONDS
	) {
		return {
			kind: "stale-project",
			code: "PROJECT_DURATION_MISMATCH",
			message: "当前时间线时长已偏离交付清单快照。请重新生成清单后再启动。",
		};
	}
	const projectBlocker = manifest.preflight.blockers.find(
		(issue) => issue.scope === "project",
	);
	if (projectBlocker) {
		return {
			kind: "manifest-blocked",
			code: "MANIFEST_BLOCKED",
			message: `项目预检阻塞：${projectBlocker.message}`,
		};
	}
	return null;
}

function variantRejections({
	variant,
	runtime,
	projectFailure,
}: {
	variant: ExportVariantIntent;
	runtime: ExportRuntimeSnapshot;
	projectFailure: ExportJobFailure | null;
}): {
	failure: ExportJobFailure | null;
	reasons: string[];
} {
	if (projectFailure) {
		return { failure: projectFailure, reasons: [projectFailure.message] };
	}
	const variantBlocker = variant.preflight.blockers[0];
	if (variantBlocker) {
		const message = `变体预检阻塞：${variantBlocker.message}`;
		return {
			failure: {
				kind: "manifest-blocked",
				code: "MANIFEST_BLOCKED",
				message,
			},
			reasons: [message],
		};
	}
	if (
		!hasSameAspectRatio({
			width: variant.dimensions.width,
			height: variant.dimensions.height,
			runtime,
		})
	) {
		const message = `需要 ${variant.dimensions.width}×${variant.dimensions.height}，但当前画布为 ${runtime.canvasSize.width}×${runtime.canvasSize.height}。现有 renderer 没有经审阅的自动重构图能力，本次拒绝改变比例。`;
		return {
			failure: {
				kind: "unsupported",
				code: "REFRAME_NOT_REVIEWED",
				message,
			},
			reasons: [message],
		};
	}
	if (
		Math.abs(variant.targetDurationSeconds - runtime.durationSeconds) >
		DURATION_TOLERANCE_SECONDS
	) {
		const message = `目标时长 ${variant.targetDurationSeconds.toFixed(2)} 秒与当前完整时间线 ${runtime.durationSeconds.toFixed(2)} 秒不一致。现有 renderer 不会自动补帧或删剪，本次拒绝。`;
		return {
			failure: {
				kind: "unsupported",
				code: "TARGET_DURATION_NOT_RENDERABLE",
				message,
			},
			reasons: [message],
		};
	}
	if (
		variant.requirements.subtitles.mode === "burn-in" &&
		variant.requirements.subtitles.source === "external-file"
	) {
		const message =
			"现有 renderer 不会读取交付清单中的外部字幕文件，无法可靠烧录，本次拒绝。";
		return {
			failure: {
				kind: "unsupported",
				code: "EXTERNAL_BURN_IN_UNSUPPORTED",
				message,
			},
			reasons: [message],
		};
	}
	if (variant.requirements.subtitles.mode === "sidecar") {
		const message =
			"现有本地 renderer 只生成视频文件，尚不能从时间线可靠生成 SRT/VTT 外挂字幕，本次拒绝该变体。";
		return {
			failure: {
				kind: "unsupported",
				code: "SIDECAR_SUBTITLES_UNSUPPORTED",
				message,
			},
			reasons: [message],
		};
	}
	if (variant.requirements.cover.source !== "none") {
		const message =
			"该变体要求独立封面文件，但当前队列尚未接入可验证的封面帧导出，本次拒绝该变体。";
		return {
			failure: {
				kind: "unsupported",
				code: "COVER_ARTIFACT_UNSUPPORTED",
				message,
			},
			reasons: [message],
		};
	}
	return { failure: null, reasons: [] };
}

function deriveQueueStatus(jobs: readonly ExportVariantJob[]): ExportJobStatus {
	if (jobs.some((job) => job.status === "rendering")) return "rendering";
	if (jobs.some((job) => job.status === "queued")) return "queued";
	if (jobs.every((job) => job.status === "completed")) return "completed";
	if (jobs.some((job) => job.status === "failed")) return "failed";
	return "cancelled";
}

function deriveQueueProgress(jobs: readonly ExportVariantJob[]): number {
	if (jobs.length === 0) return 0;
	return (
		jobs.reduce((total, job) => {
			if (
				job.status === "completed" ||
				job.status === "failed" ||
				job.status === "cancelled"
			) {
				return total + 1;
			}
			return total + normalizeProgress(job.progress);
		}, 0) / jobs.length
	);
}

function isTerminal(status: ExportJobStatus): boolean {
	return (
		status === "completed" || status === "failed" || status === "cancelled"
	);
}

function updateQueue({
	queue,
	jobs,
	at,
}: {
	queue: ExportJobQueue;
	jobs: readonly ExportVariantJob[];
	at: string;
}): ExportJobQueue {
	const status = deriveQueueStatus(jobs);
	return {
		...queue,
		jobs,
		status,
		progress: deriveQueueProgress(jobs),
		updatedAt: at,
		finishedAt: isTerminal(status) ? at : null,
	};
}

function replaceJob({
	queue,
	variantId,
	update,
	at,
}: {
	queue: ExportJobQueue;
	variantId: string;
	update: (job: ExportVariantJob) => ExportVariantJob;
	at: string;
}): ExportJobQueue {
	return updateQueue({
		queue,
		jobs: queue.jobs.map((job) =>
			job.variantId === variantId ? update(job) : job,
		),
		at,
	});
}

export function createExportJobQueue({
	manifest,
	runtime,
	createdAt = new Date().toISOString(),
	queueId,
}: {
	manifest: ExportManifest;
	runtime: ExportRuntimeSnapshot;
	createdAt?: string;
	queueId?: string;
}): ExportJobQueue {
	if (
		manifest.intent.variants.length < EXPORT_MIN_VARIANT_COUNT ||
		manifest.intent.variants.length > EXPORT_MAX_STUDIO_OUTPUT_COUNT
	) {
		throw new ExportJobInvariantError(
			`本地交付队列只接受 ${EXPORT_MIN_VARIANT_COUNT}-${EXPORT_MAX_STUDIO_OUTPUT_COUNT} 个变体。`,
		);
	}
	const projectFailure = projectRejection({ manifest, runtime });
	const jobs = manifest.intent.variants.map((variant) => {
		const { failure, reasons } = variantRejections({
			variant,
			runtime,
			projectFailure,
		});
		const supported = failure === null;
		return {
			variantId: variant.id,
			label: variant.label,
			status: supported ? ("queued" as const) : ("failed" as const),
			progress: supported ? 0 : 1,
			output: {
				fileName: variant.plannedFiles.video,
				format: variant.container,
				quality: OUTPUT_QUALITY,
				width: variant.dimensions.width,
				height: variant.dimensions.height,
				fps: manifest.project.fps,
				includeAudio: variant.requirements.audio.mode === "include",
				targetLoudnessLufs: targetLoudness(variant),
				targetDurationSeconds: variant.targetDurationSeconds,
			},
			capability: {
				state: supported ? ("supported" as const) : ("rejected" as const),
				rejectionReasons: reasons,
				notice: supported
					? "使用当前项目快照、完整时长和临时输出画布调用现有浏览器 renderer；不会修改时间线或上传。"
					: "该变体不会调用 renderer，也不会伪造产物。",
			},
			queuedAt: createdAt,
			startedAt: null,
			finishedAt: supported ? null : createdAt,
			failure,
			artifact: null,
			measurements: null,
		} satisfies ExportVariantJob;
	});
	const status = deriveQueueStatus(jobs);
	return {
		kind: "visioncut.local-export-queue",
		schemaVersion: EXPORT_JOB_SCHEMA_VERSION,
		queueId:
			queueId ?? createQueueId({ manifestId: manifest.manifestId, createdAt }),
		projectId: runtime.projectId,
		projectVersion: runtime.projectVersion,
		sceneId: runtime.sceneId,
		manifestId: manifest.manifestId,
		status,
		progress: deriveQueueProgress(jobs),
		createdAt,
		startedAt: null,
		finishedAt: isTerminal(status) ? createdAt : null,
		updatedAt: createdAt,
		jobs,
		guarantees: {
			localRendererOnly: true,
			automaticUpload: false,
			timelineMutation: false,
			loudnessMeasurementClaimed: false,
		},
	};
}

function cancelQueuedJobs({
	queue,
	at,
}: {
	queue: ExportJobQueue;
	at: string;
}): ExportJobQueue {
	return updateQueue({
		queue,
		jobs: queue.jobs.map((job) =>
			job.status === "queued"
				? {
						...job,
						status: "cancelled" as const,
						progress: 1,
						finishedAt: at,
					}
				: job,
		),
		at,
	});
}

export function markInterruptedExportQueue({
	queue,
	at = new Date().toISOString(),
}: {
	queue: ExportJobQueue;
	at?: string;
}): ExportJobQueue {
	if (!queue.jobs.some((job) => job.status === "rendering")) return queue;
	return updateQueue({
		queue,
		jobs: queue.jobs.map((job) =>
			job.status === "rendering"
				? {
						...job,
						status: "failed" as const,
						progress: 1,
						finishedAt: at,
						failure: {
							kind: "interrupted" as const,
							code: "RENDER_INTERRUPTED" as const,
							message:
								"页面在渲染期间关闭或刷新，浏览器 renderer 无法恢复该编码会话。请重新启动队列。",
						},
					}
				: job.status === "queued"
					? {
							...job,
							status: "cancelled" as const,
							progress: 1,
							finishedAt: at,
						}
					: job,
		),
		at,
	});
}

export async function runExportJobQueue({
	queue: initialQueue,
	renderer,
	onChange,
	signal,
	now = () => new Date().toISOString(),
	elapsedNow = () => Date.now(),
}: {
	queue: ExportJobQueue;
	renderer: ExportVariantRenderer;
	onChange?: (queue: ExportJobQueue) => void;
	signal: AbortSignal;
	now?: () => string;
	elapsedNow?: () => number;
}): Promise<ExportJobQueue> {
	let queue = initialQueue;
	if (!queue.jobs.some((job) => job.status === "queued")) {
		onChange?.(queue);
		return queue;
	}
	const startedAt = now();
	queue = {
		...queue,
		status: "queued",
		startedAt: queue.startedAt ?? startedAt,
		finishedAt: null,
		updatedAt: startedAt,
	};
	onChange?.(queue);

	for (const pendingJob of queue.jobs) {
		if (pendingJob.status !== "queued") continue;
		if (signal.aborted) {
			queue = cancelQueuedJobs({ queue, at: now() });
			onChange?.(queue);
			break;
		}

		const jobStartedAt = now();
		const startedElapsed = elapsedNow();
		queue = replaceJob({
			queue,
			variantId: pendingJob.variantId,
			at: jobStartedAt,
			update: (job) => ({
				...job,
				status: "rendering",
				progress: 0,
				startedAt: jobStartedAt,
				finishedAt: null,
				failure: null,
			}),
		});
		onChange?.(queue);
		const runningJob = queue.jobs.find(
			(job) => job.variantId === pendingJob.variantId,
		);
		if (!runningJob) {
			throw new ExportJobInvariantError(
				`Export job ${pendingJob.variantId} disappeared from its queue.`,
			);
		}

		let lastPublishedProgress = 0;
		let result: ExportResult;
		try {
			result = await renderer.render({
				job: runningJob,
				signal,
				onProgress: (rawProgress) => {
					const progress = normalizeProgress(rawProgress);
					if (
						progress < lastPublishedProgress ||
						(progress < 1 && progress - lastPublishedProgress < 0.01)
					) {
						return;
					}
					lastPublishedProgress = progress;
					queue = replaceJob({
						queue,
						variantId: runningJob.variantId,
						at: now(),
						update: (job) => ({
							...job,
							progress,
						}),
					});
					onChange?.(queue);
				},
			});
		} catch (error) {
			result = {
				success: false,
				error:
					error instanceof Error ? error.message : "Unknown renderer error",
			};
		}

		const finishedAt = now();
		if (signal.aborted || result.cancelled) {
			queue = replaceJob({
				queue,
				variantId: runningJob.variantId,
				at: finishedAt,
				update: (job) => ({
					...job,
					status: "cancelled",
					progress: 1,
					finishedAt,
				}),
			});
			queue = cancelQueuedJobs({ queue, at: finishedAt });
			onChange?.(queue);
			break;
		}

		if (!result.success || !result.buffer) {
			const missingBuffer = result.success && !result.buffer;
			queue = replaceJob({
				queue,
				variantId: runningJob.variantId,
				at: finishedAt,
				update: (job) => ({
					...job,
					status: "failed",
					progress: 1,
					finishedAt,
					failure: {
						kind: "render-error",
						code: missingBuffer
							? "RENDERER_RETURNED_NO_BUFFER"
							: "RENDERER_FAILED",
						message:
							result.error ??
							(missingBuffer
								? "renderer 没有返回视频数据。"
								: "renderer 执行失败。"),
					},
				}),
			});
			onChange?.(queue);
			continue;
		}

		const mimeType = getExportMimeType({ format: runningJob.output.format });
		const artifactBlob = new Blob([result.buffer], { type: mimeType });
		const elapsedMs = Math.max(0, elapsedNow() - startedElapsed);
		queue = replaceJob({
			queue,
			variantId: runningJob.variantId,
			at: finishedAt,
			update: (job) => ({
				...job,
				status: "completed",
				progress: 1,
				finishedAt,
				artifact: {
					fileName: job.output.fileName,
					mimeType,
					blob: artifactBlob,
					byteLength: artifactBlob.size,
					createdAt: finishedAt,
				},
				measurements: {
					encodedByteLength: artifactBlob.size,
					renderElapsedMs: elapsedMs,
					loudness: {
						state: "not-measured",
						measuredIntegratedLufs: null,
						targetIntegratedLufs: job.output.targetLoudnessLufs,
						notice:
							"当前 renderer 只做峰值保护，没有执行 EBU R128 / BS.1770 响度测量；目标 LUFS 不是实测值。",
					},
					encodedDuration: {
						state: "not-probed",
						measuredSeconds: null,
					},
				},
			}),
		});
		onChange?.(queue);
	}

	if (queue.jobs.some((job) => job.status === "queued")) {
		queue = cancelQueuedJobs({ queue, at: now() });
	}
	onChange?.(queue);
	return queue;
}
