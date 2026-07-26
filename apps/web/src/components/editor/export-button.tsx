"use client";

import { useEffect, useRef, useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/utils/ui";
import {
	getExportMimeType,
	getExportFileExtension,
	downloadBuffer,
	createExportPreflight,
} from "@/export";
import {
	AlertTriangle,
	Ban,
	Check,
	CheckCircle2,
	Clock3,
	Copy,
	Download,
	LoaderCircle,
	Monitor,
	RotateCcw,
	Volume2,
	VolumeX,
	XCircle,
	type LucideIcon,
} from "lucide-react";
import {
	EXPORT_FORMAT_VALUES,
	EXPORT_QUALITY_VALUES,
	type ExportFormat,
	type ExportQuality,
} from "@/export";
import {
	Section,
	SectionContent,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { useEditor } from "@/editor/use-editor";
import { DEFAULT_EXPORT_OPTIONS } from "@/export/defaults";
import { mediaTimeToSeconds } from "@/wasm";
import {
	CANCEL_VISIONCUT_EXPORT_QUEUE_EVENT,
	OPEN_NATIVE_EXPORT_EVENT,
	START_VISIONCUT_EXPORT_QUEUE_EVENT,
	isVisionCutExportQueueCancelRequest,
	isVisionCutExportQueueRequest,
} from "@/editor/navigation-events";
import {
	createExportJobQueue,
	runExportJobQueue,
	type ExportJobQueue,
	type ExportVariantJob,
} from "@/ai-studio/export-job";
import type { ExportManifest } from "@/ai-studio/export-manifest";
import {
	downloadExportArtifact,
	exportJobStore,
} from "@/ai-studio/export-job-store";
import { exportProjectSnapshot } from "@/services/renderer/project-exporter";

function isExportFormat(value: string): value is ExportFormat {
	return EXPORT_FORMAT_VALUES.some((formatValue) => formatValue === value);
}

function isExportQuality(value: string): value is ExportQuality {
	return EXPORT_QUALITY_VALUES.some((qualityValue) => qualityValue === value);
}

const TOUCH_RADIO_CLASS_NAME =
	"relative grid size-11 place-items-center border-0 shadow-none before:pointer-events-none before:absolute before:size-4 before:rounded-full before:border before:border-primary lg:size-4 lg:border lg:shadow-sm lg:before:hidden";

const TOUCH_CHECKBOX_CLASS_NAME =
	"relative grid size-11 cursor-pointer place-items-center border-0 bg-transparent shadow-none before:pointer-events-none before:absolute before:size-4 before:rounded-sm before:border before:border-border before:bg-background data-[state=checked]:bg-transparent data-[state=checked]:before:border-primary data-[state=checked]:before:bg-primary lg:size-4 lg:border lg:bg-background lg:shadow-xs lg:before:hidden lg:data-[state=checked]:bg-primary";

export function ExportButton() {
	const [isExportPopoverOpen, setIsExportPopoverOpen] = useState(false);
	const [queueManifest, setQueueManifest] = useState<ExportManifest | null>(
		null,
	);
	const [queue, setQueue] = useState<ExportJobQueue | null>(null);
	const [queueError, setQueueError] = useState<string | null>(null);
	const activeQueueRef = useRef<{
		readonly queueId: string;
		readonly controller: AbortController;
	} | null>(null);
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActiveOrNull());
	const activeScene = useEditor((e) => e.scenes.getActiveSceneOrNull());
	const hasProject = !!activeProject;
	const durationSeconds = mediaTimeToSeconds({
		time: editor.timeline.getTotalDuration(),
	});
	const visualElementCount = activeScene
		? activeScene.tracks.main.elements.length +
			activeScene.tracks.overlay.reduce(
				(total, track) => total + track.elements.length,
				0,
			)
		: 0;
	const canOpenExport =
		hasProject && durationSeconds > 0 && visualElementCount > 0;

	const handlePopoverOpenChange = ({ open }: { open: boolean }) => {
		if (!open) {
			editor.project.cancelExport();
			editor.project.clearExportState();
		}
		setIsExportPopoverOpen(open);
	};

	useEffect(() => {
		const handleOpenRequest = () => {
			if (!canOpenExport) return;
			if (
				activeQueueRef.current &&
				!activeQueueRef.current.controller.signal.aborted
			) {
				setQueueError("本地多规格队列正在运行，不能并行启动单次导出。");
				setIsExportPopoverOpen(true);
				return;
			}
			setQueueManifest(null);
			setQueueError(null);
			setIsExportPopoverOpen(true);
		};
		window.addEventListener(OPEN_NATIVE_EXPORT_EVENT, handleOpenRequest);
		return () =>
			window.removeEventListener(OPEN_NATIVE_EXPORT_EVENT, handleOpenRequest);
	}, [canOpenExport]);

	useEffect(() => {
		const projectId = activeProject?.metadata.id;
		if (!projectId) return;
		const syncQueue = () => setQueue(exportJobStore.getProject(projectId));
		const unsubscribe = exportJobStore.subscribe(syncQueue);
		void exportJobStore.loadProject(projectId).then(syncQueue);
		return unsubscribe;
	}, [activeProject?.metadata.id]);

	useEffect(() => {
		const startQueue = async (manifest: ExportManifest) => {
			if (
				activeQueueRef.current &&
				!activeQueueRef.current.controller.signal.aborted
			) {
				setQueueError("已有本地交付队列正在运行，请先等待完成或明确取消。");
				setQueueManifest(manifest);
				setIsExportPopoverOpen(true);
				return;
			}
			if (editor.project.getExportState().isExporting) {
				setQueueError("单次导出正在运行，不能并行启动本地多规格队列。");
				setQueueManifest(manifest);
				setIsExportPopoverOpen(true);
				return;
			}
			const project = editor.project.getActiveOrNull();
			const scene = editor.scenes.getActiveSceneOrNull();
			if (!project || !scene) {
				setQueueError("当前没有可渲染的项目场景。");
				setQueueManifest(manifest);
				setIsExportPopoverOpen(true);
				return;
			}
			const duration = editor.timeline.getTotalDuration();
			const currentDurationSeconds = mediaTimeToSeconds({ time: duration });
			const tracksSnapshot = structuredClone(scene.tracks);
			const mediaAssetsSnapshot = [...editor.media.getAssets()];
			const sourceCanvasSize = { ...project.settings.canvasSize };
			const background = structuredClone(project.settings.background);

			let nextQueue: ExportJobQueue;
			try {
				nextQueue = createExportJobQueue({
					manifest,
					runtime: {
						projectId: project.metadata.id,
						projectVersion: project.version,
						sceneId: scene.id,
						canvasSize: project.settings.canvasSize,
						durationSeconds: currentDurationSeconds,
					},
				});
			} catch (error) {
				setQueueError(
					error instanceof Error ? error.message : "无法创建本地交付队列。",
				);
				setQueueManifest(manifest);
				setIsExportPopoverOpen(true);
				return;
			}

			const controller = new AbortController();
			activeQueueRef.current = {
				queueId: nextQueue.queueId,
				controller,
			};
			setQueueManifest(manifest);
			setQueueError(null);
			setQueue(nextQueue);
			exportJobStore.setProject(nextQueue);
			setIsExportPopoverOpen(true);

			try {
				nextQueue = await runExportJobQueue({
					queue: nextQueue,
					signal: controller.signal,
					onChange: (changedQueue) => {
						setQueue(changedQueue);
						exportJobStore.setProject(changedQueue);
					},
					renderer: {
						render: ({ job, signal, onProgress }) => {
							return exportProjectSnapshot({
								tracks: tracksSnapshot,
								mediaAssets: mediaAssetsSnapshot,
								duration,
								sourceCanvasSize,
								outputCanvasSize: {
									width: job.output.width,
									height: job.output.height,
								},
								background,
								options: {
									format: job.output.format,
									quality: job.output.quality,
									fps: project.settings.fps,
									includeAudio: job.output.includeAudio,
								},
								onProgress: ({ progress }) => onProgress(progress),
								onCancel: () => signal.aborted,
							});
						},
					},
				});
				setQueue(nextQueue);
				exportJobStore.setProject(nextQueue);
				await exportJobStore.flush();
			} catch (error) {
				setQueueError(
					error instanceof Error ? error.message : "本地交付队列执行失败。",
				);
			} finally {
				if (activeQueueRef.current?.queueId === nextQueue.queueId) {
					activeQueueRef.current = null;
				}
			}
		};

		const handleQueueRequest = (event: Event) => {
			if (
				!(event instanceof CustomEvent) ||
				!isVisionCutExportQueueRequest(event.detail)
			) {
				return;
			}
			void startQueue(event.detail.manifest);
		};
		const handleCancelRequest = (event: Event) => {
			if (
				!(event instanceof CustomEvent) ||
				!isVisionCutExportQueueCancelRequest(event.detail)
			) {
				return;
			}
			if (activeQueueRef.current?.queueId === event.detail.queueId) {
				activeQueueRef.current.controller.abort();
			}
		};
		window.addEventListener(
			START_VISIONCUT_EXPORT_QUEUE_EVENT,
			handleQueueRequest,
		);
		window.addEventListener(
			CANCEL_VISIONCUT_EXPORT_QUEUE_EVENT,
			handleCancelRequest,
		);
		return () => {
			window.removeEventListener(
				START_VISIONCUT_EXPORT_QUEUE_EVENT,
				handleQueueRequest,
			);
			window.removeEventListener(
				CANCEL_VISIONCUT_EXPORT_QUEUE_EVENT,
				handleCancelRequest,
			);
		};
	}, [editor]);

	useEffect(
		() => () => {
			activeQueueRef.current?.controller.abort();
		},
		[],
	);

	const visibleQueue =
		queueManifest &&
		queue?.manifestId === queueManifest.manifestId &&
		queue.projectId === activeProject?.metadata.id
			? queue
			: null;

	return (
		<Popover
			open={isExportPopoverOpen}
			onOpenChange={(open) => handlePopoverOpenChange({ open })}
		>
			<PopoverTrigger asChild>
				<Button
					size="sm"
					className="h-11 px-3 lg:h-8"
					disabled={!canOpenExport}
					title={canOpenExport ? "导出成片" : "先把视频或图片加入时间线"}
				>
					<Download className="size-3.5" />
					导出
				</Button>
			</PopoverTrigger>
			{hasProject && queueManifest ? (
				visibleQueue ? (
					<ExportQueuePopover
						queue={visibleQueue}
						error={queueError}
						onCancel={() => {
							if (activeQueueRef.current?.queueId === visibleQueue.queueId) {
								activeQueueRef.current.controller.abort();
							}
						}}
						onOpenNativeExport={() => {
							setQueueManifest(null);
							setQueueError(null);
						}}
					/>
				) : queueError ? (
					<ExportQueueLaunchErrorPopover
						error={queueError}
						onOpenNativeExport={() => {
							setQueueManifest(null);
							setQueueError(null);
						}}
					/>
				) : (
					<ExportPopover onOpenChange={setIsExportPopoverOpen} />
				)
			) : (
				hasProject && <ExportPopover onOpenChange={setIsExportPopoverOpen} />
			)}
		</Popover>
	);
}

const EXPORT_JOB_STATUS_LABELS: Record<ExportVariantJob["status"], string> = {
	queued: "排队中",
	rendering: "渲染中",
	completed: "已完成",
	failed: "失败",
	cancelled: "已取消",
};

function formatExportBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ExportJobStatusIcon({ job }: { job: ExportVariantJob }) {
	if (job.status === "rendering") {
		return (
			<LoaderCircle
				className="size-3.5 animate-spin motion-reduce:animate-none"
				aria-hidden="true"
			/>
		);
	}
	if (job.status === "completed") {
		return <CheckCircle2 className="size-3.5" aria-hidden="true" />;
	}
	if (job.status === "failed") {
		return job.capability.state === "rejected" ? (
			<Ban className="size-3.5" aria-hidden="true" />
		) : (
			<XCircle className="size-3.5" aria-hidden="true" />
		);
	}
	if (job.status === "cancelled") {
		return <XCircle className="size-3.5" aria-hidden="true" />;
	}
	return <Clock3 className="size-3.5" aria-hidden="true" />;
}

function ExportQueueLaunchErrorPopover({
	error,
	onOpenNativeExport,
}: {
	error: string;
	onOpenNativeExport: () => void;
}) {
	return (
		<PopoverContent
			collisionPadding={8}
			className="mr-0 w-[min(22rem,calc(100vw-2rem))] bg-background p-3 sm:mr-2"
		>
			<div
				className="flex items-start gap-2 rounded-[6px] border border-destructive/30 px-3 py-3 text-xs leading-relaxed text-destructive"
				role="alert"
			>
				<AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
				<span>{error}</span>
			</div>
			<Button
				type="button"
				variant="outline"
				className="mt-3 min-h-11 w-full rounded-[6px]"
				onClick={onOpenNativeExport}
			>
				<RotateCcw aria-hidden="true" />
				返回单次导出
			</Button>
		</PopoverContent>
	);
}

function ExportQueuePopover({
	queue,
	error,
	onCancel,
	onOpenNativeExport,
}: {
	queue: ExportJobQueue;
	error: string | null;
	onCancel: () => void;
	onOpenNativeExport: () => void;
}) {
	const isActive = queue.status === "queued" || queue.status === "rendering";
	const completedCount = queue.jobs.filter(
		(job) => job.status === "completed",
	).length;
	const rejectedCount = queue.jobs.filter(
		(job) => job.capability.state === "rejected",
	).length;

	return (
		<PopoverContent
			collisionPadding={8}
			className="mr-0 flex max-h-[min(84vh,44rem)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-y-auto bg-background p-0 sm:mr-2"
		>
			<header className="border-b px-3 py-3">
				<div className="flex items-center justify-between gap-3">
					<div className="min-w-0">
						<h3 className="text-sm font-medium">本地多规格交付</h3>
						<p className="mt-0.5 text-[10px] text-muted-foreground">
							{completedCount}/{queue.jobs.length} 完成
							{rejectedCount > 0 ? ` · ${rejectedCount} 个已拒绝` : ""}
						</p>
					</div>
					<span className="shrink-0 text-xs font-semibold">
						{Math.round(queue.progress * 100)}%
					</span>
				</div>
				<Progress value={queue.progress * 100} className="mt-2 h-1.5" />
			</header>

			<div className="divide-y">
				{queue.jobs.map((job) => (
					<div key={job.variantId} className="px-3 py-3">
						<div className="flex min-w-0 items-start gap-2.5">
							<div
								className={cn(
									"mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[6px] border",
									job.status === "completed" &&
										"border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
									job.status === "rendering" &&
										"border-primary/30 text-primary",
									job.status === "failed" &&
										"border-destructive/30 text-destructive",
									(job.status === "queued" || job.status === "cancelled") &&
										"text-muted-foreground",
								)}
							>
								<ExportJobStatusIcon job={job} />
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex min-w-0 items-center justify-between gap-2">
									<p className="truncate text-xs font-medium">{job.label}</p>
									<span className="shrink-0 text-[10px] text-muted-foreground">
										{job.capability.state === "rejected"
											? "已拒绝"
											: EXPORT_JOB_STATUS_LABELS[job.status]}
									</span>
								</div>
								<p className="mt-1 break-all text-[10px] text-muted-foreground">
									{job.output.fileName}
								</p>
								<p className="mt-1 text-[10px] text-muted-foreground">
									{job.output.width}×{job.output.height} ·{" "}
									{job.output.format.toUpperCase()} · 高画质
								</p>
								{job.status === "rendering" && (
									<Progress value={job.progress * 100} className="mt-2 h-1" />
								)}
								{job.failure && (
									<p className="mt-2 text-[10px] leading-relaxed text-destructive">
										{job.failure.message}
									</p>
								)}
								{job.artifact && job.measurements && (
									<div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
										<span>{formatExportBytes(job.artifact.byteLength)}</span>
										<span>
											实际渲染{" "}
											{(job.measurements.renderElapsedMs / 1000).toFixed(1)}s
										</span>
										<span>响度未测量</span>
										<Button
											type="button"
											variant="outline"
											size="icon"
											className="ml-auto size-11 rounded-[6px] lg:size-8"
											onClick={() => {
												if (job.artifact) {
													downloadExportArtifact(job.artifact);
												}
											}}
											title={`下载 ${job.artifact.fileName}`}
										>
											<Download aria-hidden="true" />
											<span className="sr-only">
												下载 {job.artifact.fileName}
											</span>
										</Button>
									</div>
								)}
							</div>
						</div>
					</div>
				))}
			</div>

			<div className="space-y-2 border-t px-3 py-3">
				{error && (
					<div
						className="flex items-start gap-2 rounded-[6px] border border-destructive/30 px-3 py-2.5 text-[10px] leading-relaxed text-destructive"
						role="alert"
					>
						<AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
						<span>{error}</span>
					</div>
				)}
				<p className="text-[10px] leading-relaxed text-muted-foreground">
					队列只调用本地浏览器
					renderer，不修改时间线、不自动上传。文件大小与渲染耗时来自实际结果；LUFS
					和编码后时长尚未测量。
				</p>
				{isActive && (
					<Button
						type="button"
						variant="outline"
						className="min-h-11 w-full rounded-[6px]"
						onClick={onCancel}
					>
						<XCircle aria-hidden="true" />
						取消整个队列
					</Button>
				)}
				<Button
					type="button"
					variant="ghost"
					className="min-h-11 w-full rounded-[6px]"
					onClick={onOpenNativeExport}
				>
					<RotateCcw aria-hidden="true" />
					返回单次导出
				</Button>
			</div>
		</PopoverContent>
	);
}

function ExportPopover({
	onOpenChange,
}: {
	onOpenChange: (open: boolean) => void;
}) {
	const editor = useEditor();
	const activeProject = useEditor((e) => e.project.getActive());
	const activeScene = useEditor((e) => e.scenes.getActiveSceneOrNull());
	const exportState = useEditor((e) => e.project.getExportState());
	const { isExporting, progress, result: exportResult } = exportState;
	const [format, setFormat] = useState<ExportFormat>(
		DEFAULT_EXPORT_OPTIONS.format,
	);
	const [quality, setQuality] = useState<ExportQuality>(
		DEFAULT_EXPORT_OPTIONS.quality,
	);
	const [shouldIncludeAudio, setShouldIncludeAudio] = useState<boolean>(
		DEFAULT_EXPORT_OPTIONS.includeAudio ?? true,
	);
	const durationSeconds = mediaTimeToSeconds({
		time: editor.timeline.getTotalDuration(),
	});
	const hasAudioSource = activeScene
		? activeScene.tracks.audio.some((track) => track.elements.length > 0) ||
			activeScene.tracks.main.elements.some(
				(element) => element.type === "video",
			)
		: false;
	const preflight = createExportPreflight({
		durationSeconds,
		canvasSize: activeProject.settings.canvasSize,
		format,
		includeAudio: shouldIncludeAudio,
		hasAudioSource,
	});
	const preflightSummaryItems: Array<{
		label: string;
		value: string;
		icon: LucideIcon;
	}> = [
		{ label: "时长", value: preflight.summary.duration, icon: Clock3 },
		{ label: "分辨率", value: preflight.summary.resolution, icon: Monitor },
		{ label: "画幅", value: preflight.summary.aspectRatio, icon: Monitor },
		{ label: "格式", value: preflight.summary.format, icon: Download },
	];

	const handleExport = async () => {
		if (!activeProject || !preflight.canExport) return;

		const result = await editor.project.export({
			options: {
				format,
				quality,
				fps: activeProject.settings.fps,
				includeAudio: shouldIncludeAudio,
			},
		});

		if (result.cancelled) {
			editor.project.clearExportState();
			return;
		}

		if (result.success && result.buffer) {
			downloadBuffer({
				buffer: result.buffer,
				filename: `${activeProject.metadata.name}${getExportFileExtension({ format })}`,
				mimeType: getExportMimeType({ format }),
			});

			editor.project.clearExportState();
			onOpenChange(false);
		}
	};

	const handleCancel = () => {
		editor.project.cancelExport();
	};

	return (
		<PopoverContent
			collisionPadding={8}
			className="bg-background mr-0 flex max-h-[min(82vh,42rem)] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-y-auto p-0 sm:mr-2"
		>
			{exportResult && !exportResult.success ? (
				<ExportError
					error={exportResult.error || "Unknown error occurred"}
					onRetry={handleExport}
				/>
			) : (
				<>
					<div className="flex items-center justify-between border-b p-3">
						<h3 className="font-medium text-sm">
							{isExporting ? "正在导出" : "导出成片"}
						</h3>
					</div>

					<div className="flex flex-col gap-4">
						{!isExporting && (
							<>
								<div className="space-y-2 border-b p-3">
									<div className="flex items-center justify-between gap-2">
										<p className="text-xs font-medium">导出预检</p>
										<span
											className={cn(
												"rounded-sm px-1.5 py-0.5 text-[10px] font-medium",
												preflight.canExport
													? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
													: "bg-destructive/10 text-destructive",
											)}
										>
											{preflight.canExport ? "可以导出" : "需要处理"}
										</span>
									</div>
									<div className="grid grid-cols-2 gap-2 text-[11px]">
										{preflightSummaryItems.map((item) => {
											const Icon = item.icon;
											return (
												<div
													key={item.label}
													className="rounded-md border bg-muted/25 p-2"
												>
													<div className="flex items-center gap-1 text-[9px] text-muted-foreground">
														<Icon className="size-3" />
														{item.label}
													</div>
													<p className="mt-1 font-medium">{item.value}</p>
												</div>
											);
										})}
									</div>
									<div className="flex items-center gap-2 rounded-md border bg-muted/25 p-2 text-[11px]">
										{shouldIncludeAudio && hasAudioSource ? (
											<Volume2 className="size-3.5 text-emerald-600" />
										) : (
											<VolumeX className="size-3.5 text-muted-foreground" />
										)}
										<span>{preflight.summary.audio}</span>
									</div>
									{[...preflight.blockers, ...preflight.warnings].map(
										(message) => (
											<div
												key={message}
												className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-[10px] leading-relaxed"
											>
												<AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-600" />
												<span>{message}</span>
											</div>
										),
									)}
								</div>
								<div className="flex flex-col">
									<Section
										collapsible
										defaultOpen={false}
										showTopBorder={false}
									>
										<SectionHeader className="[&_[aria-label]]:size-11 lg:[&_[aria-label]]:size-7">
											<SectionTitle>文件格式</SectionTitle>
										</SectionHeader>
										<SectionContent>
											<RadioGroup
												value={format}
												onValueChange={(value) => {
													if (isExportFormat(value)) {
														setFormat(value);
													}
												}}
											>
												<div className="flex items-center space-x-2">
													<RadioGroupItem
														value="mp4"
														id="mp4"
														className={TOUCH_RADIO_CLASS_NAME}
													/>
													<Label htmlFor="mp4">MP4 (H.264) · 兼容性更好</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem
														value="webm"
														id="webm"
														className={TOUCH_RADIO_CLASS_NAME}
													/>
													<Label htmlFor="webm">
														WebM (VP9) · 文件通常更小
													</Label>
												</div>
											</RadioGroup>
										</SectionContent>
									</Section>

									<Section collapsible defaultOpen={false}>
										<SectionHeader className="[&_[aria-label]]:size-11 lg:[&_[aria-label]]:size-7">
											<SectionTitle>画质</SectionTitle>
										</SectionHeader>
										<SectionContent>
											<RadioGroup
												value={quality}
												onValueChange={(value) => {
													if (isExportQuality(value)) {
														setQuality(value);
													}
												}}
											>
												<div className="flex items-center space-x-2">
													<RadioGroupItem
														value="low"
														id="low"
														className={TOUCH_RADIO_CLASS_NAME}
													/>
													<Label htmlFor="low">低 · 文件最小</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem
														value="medium"
														id="medium"
														className={TOUCH_RADIO_CLASS_NAME}
													/>
													<Label htmlFor="medium">中 · 体积与画质平衡</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem
														value="high"
														id="high"
														className={TOUCH_RADIO_CLASS_NAME}
													/>
													<Label htmlFor="high">高 · 推荐</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem
														value="very_high"
														id="very_high"
														className={TOUCH_RADIO_CLASS_NAME}
													/>
													<Label htmlFor="very_high">极高 · 文件最大</Label>
												</div>
											</RadioGroup>
										</SectionContent>
									</Section>

									<Section collapsible defaultOpen={false}>
										<SectionHeader className="[&_[aria-label]]:size-11 lg:[&_[aria-label]]:size-7">
											<SectionTitle>声音</SectionTitle>
										</SectionHeader>
										<SectionContent>
											<div className="flex items-center space-x-2">
												<Checkbox
													id="include-audio"
													checked={shouldIncludeAudio}
													className={TOUCH_CHECKBOX_CLASS_NAME}
													onCheckedChange={(checked) =>
														setShouldIncludeAudio(!!checked)
													}
												/>
												<Label htmlFor="include-audio">导出声音</Label>
											</div>
										</SectionContent>
									</Section>
								</div>

								<div className="p-3 pt-0">
									<Button
										onClick={handleExport}
										className="min-h-11 w-full gap-2 lg:min-h-9"
										disabled={!preflight.canExport}
									>
										<Download className="size-4" />
										开始导出
									</Button>
								</div>
							</>
						)}

						{isExporting && (
							<div className="space-y-4 p-3">
								<div className="flex flex-col gap-2">
									<div className="flex items-center justify-between text-center">
										<p className="text-muted-foreground text-sm">
											{Math.round(progress * 100)}%
										</p>
										<p className="text-muted-foreground text-sm">100%</p>
									</div>
									<Progress value={progress * 100} className="w-full" />
								</div>

								<Button
									variant="outline"
									className="min-h-11 w-full rounded-md lg:min-h-9"
									onClick={handleCancel}
								>
									取消
								</Button>
							</div>
						)}
					</div>
				</>
			)}
		</PopoverContent>
	);
}

function ExportError({
	error,
	onRetry,
}: {
	error: string;
	onRetry: () => void;
}) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(error);
		setCopied(true);
		setTimeout(() => setCopied(false), 1000);
	};

	return (
		<div className="space-y-4 p-3">
			<div className="flex flex-col gap-1.5">
				<p className="text-destructive text-sm font-medium">导出失败</p>
				<p className="text-muted-foreground text-xs">{error}</p>
			</div>

			<div className="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					className="h-11 flex-1 text-xs lg:h-8"
					onClick={handleCopy}
				>
					{copied ? <Check className="text-constructive" /> : <Copy />}
					复制错误
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="h-11 flex-1 text-xs lg:h-8"
					onClick={onRetry}
				>
					<RotateCcw />
					重试
				</Button>
			</div>
		</div>
	);
}
