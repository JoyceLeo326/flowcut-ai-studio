"use client";

import { useEffect, useState } from "react";
import {
	AlertTriangle,
	Ban,
	CheckCircle2,
	ChevronDown,
	CircleAlert,
	Download,
	FileJson2,
	FileText,
	FileVideo2,
	Gauge,
	HardDriveDownload,
	Image as ImageIcon,
	Info,
	ListChecks,
	LoaderCircle,
	MonitorUp,
	PackageCheck,
	RotateCcw,
	ShieldCheck,
	Subtitles,
	UploadCloud,
	Volume2,
	XCircle,
	type LucideIcon,
} from "lucide-react";
import {
	EXPORT_MAX_STUDIO_OUTPUT_COUNT,
	serializeExportManifest,
	type ExportIssue,
	type ExportManifest,
} from "@/ai-studio/export-manifest";
import {
	hasDownloadableExportArtifact,
	isRetryableExportJob,
	type ExportJobArtifact,
	type ExportJobQueue,
	type ExportVariantJob,
} from "@/ai-studio/export-job";
import {
	downloadExportArtifact,
	downloadExportArtifactBundle,
	exportJobStore,
} from "@/ai-studio/export-job-store";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
	requestVisionCutExportQueue,
	requestVisionCutExportQueueCancel,
} from "@/editor/navigation-events";
import { cn } from "@/utils/ui";

export interface VisionCutExportCenterProps {
	exportManifest: ExportManifest;
	onOpenNativeExport?: () => void;
	className?: string;
}

const PLATFORM_LABELS: Record<
	ExportManifest["intent"]["variants"][number]["platform"],
	string
> = {
	bilibili: "哔哩哔哩",
	douyin: "抖音",
	generic: "通用交付",
	podcast: "视频播客",
	xiaohongshu: "小红书",
	youtube: "YouTube",
};

const ISSUE_LABELS: Record<ExportIssue["code"], string> = {
	AUDIO_SOURCE_MISSING: "音频来源缺失",
	COVER_FRAME_OUT_OF_RANGE: "封面帧超出时间线",
	COVER_MEDIA_MISSING: "封面素材缺失",
	COVER_MEDIA_NOT_VISUAL: "封面素材不是视觉文件",
	EMPTY_TIMELINE: "时间线为空",
	EXTERNAL_SUBTITLE_NOT_VERIFIED: "外部字幕尚未核验",
	MISSING_MEDIA_REFERENCE: "素材引用失效",
	NO_ACTIVE_VISUAL_CONTENT: "没有可见画面",
	NO_MEDIA_ASSETS: "没有源素材",
	PLATFORM_ASPECT_RATIO_UNSUPPORTED: "平台画幅不匹配",
	PLATFORM_AUDIO_REQUIRED: "平台需要音频",
	PLATFORM_CAPTIONS_RECOMMENDED: "平台建议添加字幕",
	PLATFORM_CONTAINER_UNSUPPORTED: "平台封装格式不匹配",
	PLATFORM_COVER_RECOMMENDED: "平台建议准备封面",
	PROJECT_DURATION_MISMATCH: "项目时长不一致",
	REQUIRED_AUDIO_MISSING: "必需音频缺失",
	REQUIRED_COVER_MISSING: "必需封面缺失",
	SOURCE_REFRAME_REQUIRED: "源画面需要重新构图",
	TARGET_DURATION_EXCEEDS_SOURCE: "目标时长超过源内容",
	TARGET_DURATION_REQUIRES_EDIT: "目标时长需要重新剪辑",
	TIMELINE_CAPTIONS_MISSING: "时间线字幕缺失",
};

const ARTIFACT_LABELS: Record<
	ExportManifest["localCapabilityBoundary"]["availableArtifacts"][number]["kind"],
	string
> = {
	"production-manifest-json": "制作清单 JSON",
	"project-json": "项目 JSON",
};

function formatDuration(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
	const totalSeconds = Math.round(seconds);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const remainingSeconds = totalSeconds % 60;
	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds
			.toString()
			.padStart(2, "0")}`;
	}
	return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const JOB_STATUS_LABELS: Record<ExportVariantJob["status"], string> = {
	queued: "排队中",
	rendering: "渲染中",
	completed: "已完成",
	failed: "失败",
	cancelled: "已取消",
};

function useExportJobQueue(projectId: string): ExportJobQueue | null {
	const [queue, setQueue] = useState<ExportJobQueue | null>(() =>
		exportJobStore.getProject(projectId),
	);

	useEffect(() => {
		const sync = () => setQueue(exportJobStore.getProject(projectId));
		const unsubscribe = exportJobStore.subscribe(sync);
		void exportJobStore.loadProject(projectId).then(sync);
		return unsubscribe;
	}, [projectId]);

	return queue?.projectId === projectId ? queue : null;
}

function JobStatusIcon({ job }: { job: ExportVariantJob }) {
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
	return <ListChecks className="size-3.5" aria-hidden="true" />;
}

function formatSubtitleRequirement(
	requirement: ExportManifest["intent"]["variants"][number]["requirements"]["subtitles"],
): string {
	if (requirement.mode === "none") return "不输出字幕";
	const mode = requirement.mode === "burn-in" ? "烧录字幕" : "外挂字幕";
	const source =
		requirement.source === "timeline-captions" ? "时间线字幕" : "外部文件";
	return `${mode} · ${requirement.language} · ${source}`;
}

function formatAudioRequirement(
	requirement: ExportManifest["intent"]["variants"][number]["requirements"]["audio"],
): string {
	if (requirement.mode === "mute") return "静音交付";
	const loudness =
		requirement.targetLoudnessLufs === undefined
			? ""
			: ` · ${requirement.targetLoudnessLufs} LUFS`;
	return `${requirement.required ? "必须包含" : "包含"} ${requirement.channels === "stereo" ? "立体声" : "单声道"}${loudness}`;
}

function formatCoverRequirement(
	requirement: ExportManifest["intent"]["variants"][number]["requirements"]["cover"],
): string {
	if (requirement.source === "none") {
		return requirement.required ? "需要封面，但尚未指定来源" : "不输出独立封面";
	}
	if (requirement.source === "timeline-frame") {
		return `时间线 ${formatDuration(requirement.atSeconds)} 帧 · ${requirement.format.toUpperCase()}`;
	}
	return `素材 ${requirement.mediaId} · ${requirement.format.toUpperCase()}`;
}

function getIssueScopeLabel({
	issue,
	manifest,
}: {
	issue: ExportIssue;
	manifest: ExportManifest;
}): string {
	if (issue.scope === "project") return "整个项目";
	const variant = manifest.intent.variants.find(
		(candidate) => candidate.id === issue.variantId,
	);
	return variant?.label ?? issue.variantId ?? "交付变体";
}

function getIssueEvidence(issue: ExportIssue): string[] {
	if (!issue.evidence) return [];
	const rows: string[] = [];
	if (issue.evidence.actual !== undefined) {
		rows.push(`实际：${String(issue.evidence.actual)}`);
	}
	if (issue.evidence.expected?.length) {
		rows.push(`预期：${issue.evidence.expected.join(" / ")}`);
	}
	if (issue.evidence.references?.length) {
		rows.push(`引用：${issue.evidence.references.join(" / ")}`);
	}
	return rows;
}

function IssueRow({
	issue,
	manifest,
}: {
	issue: ExportIssue;
	manifest: ExportManifest;
}) {
	const isBlocker = issue.severity === "blocker";
	const Icon = isBlocker ? CircleAlert : AlertTriangle;
	const evidence = getIssueEvidence(issue);

	return (
		<li className="flex min-w-0 items-start gap-3 border-t px-3 py-3 first:border-t-0 sm:px-4">
			<div
				className={cn(
					"mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[6px] border",
					isBlocker
						? "border-destructive/30 bg-destructive/8 text-destructive"
						: "border-amber-500/30 bg-amber-500/8 text-amber-700 dark:text-amber-300",
				)}
			>
				<Icon className="size-3.5" aria-hidden="true" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
					<p className="text-xs font-medium">{ISSUE_LABELS[issue.code]}</p>
					<span className="text-[10px] text-muted-foreground">
						{getIssueScopeLabel({ issue, manifest })}
					</span>
				</div>
				<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
					{issue.message}
				</p>
				{evidence.length > 0 && (
					<p className="mt-1.5 break-all text-[10px] leading-relaxed text-muted-foreground/80">
						{evidence.join(" · ")}
					</p>
				)}
			</div>
		</li>
	);
}

function RequirementRow({
	icon: Icon,
	label,
	value,
}: {
	icon: LucideIcon;
	label: string;
	value: string;
}) {
	return (
		<div className="flex min-w-0 items-start gap-2 py-1.5">
			<Icon
				className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
				aria-hidden="true"
			/>
			<div className="min-w-0">
				<p className="text-[10px] text-muted-foreground">{label}</p>
				<p className="mt-0.5 break-words text-[11px] leading-relaxed">
					{value}
				</p>
			</div>
		</div>
	);
}

function VariantExecutionState({
	job,
	onDownload,
}: {
	job: ExportVariantJob | undefined;
	onDownload: (artifact: ExportJobArtifact) => void;
}) {
	if (!job) {
		return (
			<div className="flex items-start gap-2 border-t pt-3 text-[10px] text-muted-foreground">
				<ListChecks className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
				<p>尚未启动本地 renderer。</p>
			</div>
		);
	}
	const isRejected = job.capability.state === "rejected";
	const isDownloadable = hasDownloadableExportArtifact(job);

	return (
		<div className="border-t pt-3">
			<div className="flex min-w-0 items-start gap-2">
				<div
					className={cn(
						"flex size-7 shrink-0 items-center justify-center rounded-[6px] border",
						job.status === "completed" &&
							"border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
						job.status === "rendering" && "border-primary/30 text-primary",
						job.status === "failed" && "border-destructive/30 text-destructive",
						(job.status === "queued" || job.status === "cancelled") &&
							"text-muted-foreground",
					)}
				>
					<JobStatusIcon job={job} />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center justify-between gap-2">
						<p className="text-[10px] font-medium">
							{isRejected ? "能力拒绝" : JOB_STATUS_LABELS[job.status]}
						</p>
						<span className="text-[10px] text-muted-foreground">
							{Math.round(job.progress * 100)}%
						</span>
					</div>
					{job.status === "rendering" && (
						<Progress value={job.progress * 100} className="mt-2 h-1" />
					)}
					{job.failure && (
						<p className="mt-1.5 text-[10px] leading-relaxed text-destructive">
							{job.failure.message}
						</p>
					)}
					{isDownloadable && job.measurements && (
						<div className="mt-2">
							<p className="break-all text-[10px] font-medium">
								{job.artifact.fileName}
							</p>
							<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
								实测 {formatBytes(job.artifact.byteLength)} · 渲染{" "}
								{(job.measurements.renderElapsedMs / 1000).toFixed(1)}s · LUFS
								未测量 · 编码后时长未探测
							</p>
							<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
								{job.artifactOrigin === "reused-local-artifact"
									? "已复用本机保存的真实产物"
									: "本次队列生成的真实产物"}
								{job.attempt && job.attempt > 1
									? ` · 第 ${job.attempt} 次尝试`
									: ""}
							</p>
							<Button
								type="button"
								variant="outline"
								className="mt-2 min-h-11 w-full rounded-[6px]"
								onClick={() => onDownload(job.artifact)}
							>
								<Download aria-hidden="true" />
								下载已渲染文件
							</Button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function DeliveryStateRow({
	icon: Icon,
	label,
	value,
	detail,
	tone,
}: {
	icon: LucideIcon;
	label: string;
	value: string;
	detail: string;
	tone: "available" | "review" | "blocked" | "unavailable";
}) {
	return (
		<div
			className="flex min-w-0 items-start gap-2.5 border-t px-3 py-3 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0 sm:px-4"
			data-delivery-state={tone}
		>
			<div
				className={cn(
					"flex size-7 shrink-0 items-center justify-center rounded-[6px] border",
					tone === "available" &&
						"border-emerald-500/30 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300",
					tone === "review" &&
						"border-amber-500/30 bg-amber-500/8 text-amber-700 dark:text-amber-300",
					tone === "blocked" &&
						"border-destructive/30 bg-destructive/8 text-destructive",
					tone === "unavailable" && "bg-muted/40 text-muted-foreground",
				)}
			>
				<Icon className="size-3.5" aria-hidden="true" />
			</div>
			<div className="min-w-0">
				<p className="text-[9px] text-muted-foreground">{label}</p>
				<p className="mt-0.5 text-[11px] font-medium">{value}</p>
				<p className="mt-0.5 text-[9px] leading-relaxed text-muted-foreground">
					{detail}
				</p>
			</div>
		</div>
	);
}

function downloadManifestJson({ manifest }: { manifest: ExportManifest }) {
	const json = serializeExportManifest({ manifest, space: 2 });
	const artifact = manifest.localCapabilityBoundary.availableArtifacts.find(
		(item) => item.kind === "production-manifest-json",
	);
	const blobUrl = window.URL.createObjectURL(
		new Blob([json], { type: "application/json;charset=utf-8" }),
	);
	const anchor = document.createElement("a");
	anchor.href = blobUrl;
	anchor.download =
		artifact?.fileName ??
		`${manifest.intent.fileNameStem}_visioncut-export-manifest.json`;
	anchor.hidden = true;
	document.body.append(anchor);
	try {
		anchor.click();
	} finally {
		anchor.remove();
		window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 0);
	}
}

export function VisionCutExportCenter({
	exportManifest,
	onOpenNativeExport,
	className,
}: VisionCutExportCenterProps) {
	const [downloadError, setDownloadError] = useState<string | null>(null);
	const [bundleState, setBundleState] = useState<
		"idle" | "preparing" | "downloaded"
	>("idle");
	const { preflight, project, sourceEvidence } = exportManifest;
	const storedQueue = useExportJobQueue(project.id);
	const activeQueue =
		storedQueue?.manifestId === exportManifest.manifestId ? storedQueue : null;
	const queueIsActive =
		activeQueue?.status === "queued" || activeQueue?.status === "rendering";
	const isReadyForHandoff = preflight.readyForVideoRenderHandoff;
	const canStartLocalQueue =
		Boolean(onOpenNativeExport) &&
		exportManifest.intent.variants.length >= 1 &&
		exportManifest.intent.variants.length <= EXPORT_MAX_STUDIO_OUTPUT_COUNT;
	const reviewCount = preflight.warnings.length;
	const downloadableJobs =
		activeQueue?.jobs.filter(hasDownloadableExportArtifact) ?? [];
	const completedCount = downloadableJobs.length;
	const failedCount =
		activeQueue?.jobs.filter((job) => job.status === "failed").length ?? 0;
	const rejectedCount =
		activeQueue?.jobs.filter(
			(job) => job.status === "failed" && job.capability.state === "rejected",
		).length ?? 0;
	const renderFailureCount = failedCount - rejectedCount;
	const cancelledCount =
		activeQueue?.jobs.filter((job) => job.status === "cancelled").length ?? 0;
	const retryableCount =
		activeQueue?.jobs.filter(isRetryableExportJob).length ?? 0;
	const isPartiallyCompleted =
		completedCount > 0 && (failedCount > 0 || cancelledCount > 0);
	const queueStatusLabel = activeQueue
		? isPartiallyCompleted
			? "部分完成"
			: JOB_STATUS_LABELS[activeQueue.status]
		: null;
	const actionCanStart =
		canStartLocalQueue && (!activeQueue || retryableCount > 0);
	const captionEvidence = sourceEvidence.timeline;
	const deliveryLoudness = exportManifest.intent.deliveryContract.loudness;
	const loudnessLabel =
		deliveryLoudness.defaultTargetIntegratedLufs !== null
			? `目标 ${deliveryLoudness.defaultTargetIntegratedLufs} LUFS · 未测`
			: deliveryLoudness.variantTargets.length > 0
				? "按变体设目标 · 未测"
				: "未指定";
	const hasLivePlatformPolicy = exportManifest.intent.variants.every(
		(variant) => variant.platformConstraint.livePlatformPolicyChecked,
	);

	function handleManifestDownload() {
		try {
			downloadManifestJson({ manifest: exportManifest });
			setDownloadError(null);
		} catch (error) {
			setDownloadError(
				error instanceof Error ? error.message : "无法生成导出清单。",
			);
		}
	}

	function handleArtifactDownload(artifact: ExportJobArtifact) {
		try {
			downloadExportArtifact(artifact);
			setDownloadError(null);
		} catch (error) {
			setDownloadError(
				error instanceof Error ? error.message : "无法下载本地产物。",
			);
		}
	}

	async function handleBundleDownload() {
		if (!activeQueue || completedCount === 0 || bundleState === "preparing") {
			return;
		}
		setBundleState("preparing");
		setDownloadError(null);
		try {
			await downloadExportArtifactBundle(activeQueue);
			setBundleState("downloaded");
		} catch (error) {
			setBundleState("idle");
			setDownloadError(
				error instanceof Error ? error.message : "无法创建本地交付包。",
			);
		}
	}

	function handleStartQueue() {
		if (!actionCanStart || queueIsActive) return;
		requestVisionCutExportQueue({ manifest: exportManifest });
	}

	function handleCancelQueue() {
		if (!activeQueue || !queueIsActive) return;
		requestVisionCutExportQueueCancel({ queueId: activeQueue.queueId });
	}

	return (
		<div className={cn("min-w-0 pb-5", className)}>
			<header className="border-b px-3 py-4 sm:px-4">
				<div className="flex min-w-0 items-start gap-3">
					<div className="flex size-10 shrink-0 items-center justify-center rounded-[7px] border bg-foreground text-background">
						<PackageCheck className="size-5" aria-hidden="true" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<h2 className="text-sm font-semibold">Export Center</h2>
							<span className="text-[10px] text-muted-foreground">
								项目 v{project.version}
							</span>
						</div>
						<p className="mt-1 truncate text-xs">{project.name}</p>
						<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
							从项目快照预检后，明确启动本地 renderer
							逐项执行；不自动上传，也不把目标响度当成实测。
						</p>
					</div>
				</div>
			</header>

			<section
				className="grid border-b sm:grid-cols-3"
				aria-label="交付能力状态"
			>
				<DeliveryStateRow
					icon={HardDriveDownload}
					label="本地成片"
					value={activeQueue ? `${completedCount} 个可下载` : "尚未启动队列"}
					detail={
						activeQueue
							? `${activeQueue.reusedArtifactCount ?? 0} 个沿用已有结果 · Blob 保存在本机浏览器存储`
							: "点击下方按钮后才会调用 renderer"
					}
					tone={completedCount > 0 ? "available" : "unavailable"}
				/>
				<DeliveryStateRow
					icon={ListChecks}
					label="执行结果"
					value={
						activeQueue
							? `${completedCount} 完成 · ${rejectedCount} 拒绝 · ${renderFailureCount} 失败${cancelledCount > 0 ? ` · ${cancelledCount} 取消` : ""}`
							: `${reviewCount} 项预检提醒`
					}
					detail={
							renderFailureCount > 0
							? `${retryableCount} 个任务可重试`
							: rejectedCount > 0
								? "不支持的规格已明确拒绝"
							: "拒绝项不会伪造成文件"
					}
					tone={
						renderFailureCount > 0
							? "blocked"
							: rejectedCount > 0 || reviewCount > 0
								? "review"
								: "available"
					}
				/>
				<DeliveryStateRow
					icon={MonitorUp}
					label="本地队列"
					value={
						activeQueue
							? `${queueStatusLabel} · ${Math.round(activeQueue.progress * 100)}%`
							: canStartLocalQueue
								? "可明确启动"
								: "导出器未接入"
					}
					detail={
						activeQueue
							? "逐项执行，不自动上传"
							: canStartLocalQueue
								? "支持 1-6 个清单变体"
								: "当前只能保存制作清单"
					}
					tone={
						activeQueue?.status === "completed"
							? "available"
							: renderFailureCount > 0
								? "blocked"
								: isPartiallyCompleted
									? "review"
								: activeQueue?.status === "queued" ||
									  activeQueue?.status === "rendering"
									? "review"
									: "unavailable"
					}
				/>
			</section>

			<section className="border-b" aria-labelledby="export-preflight-title">
				<div className="flex items-start gap-3 px-3 py-3.5 sm:px-4">
					<div
						className={cn(
							"flex size-8 shrink-0 items-center justify-center rounded-[6px] border",
							isReadyForHandoff
								? "border-emerald-500/30 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300"
								: "border-destructive/30 bg-destructive/8 text-destructive",
						)}
					>
						{isReadyForHandoff ? (
							<CheckCircle2 className="size-4" aria-hidden="true" />
						) : (
							<CircleAlert className="size-4" aria-hidden="true" />
						)}
					</div>
					<div className="min-w-0 flex-1">
						<h3 id="export-preflight-title" className="text-xs font-semibold">
							{isReadyForHandoff ? "预检就绪" : "预检未通过"}
						</h3>
						<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
							{isReadyForHandoff
								? `没有清单阻塞项；仍有 ${preflight.warnings.length} 条提醒需要在正式交付前复核。`
								: `${preflight.blockers.length} 个阻塞项会让相关变体被队列明确拒绝，不会生成假文件。`}
						</p>
					</div>
				</div>

				<dl className="grid grid-cols-2 border-t sm:grid-cols-4">
					{[
						[
							"交付变体",
							`${exportManifest.intent.deliveryContract.outputVariants.count}`,
						],
						[
							"字幕轨",
							captionEvidence.captionTrackState === "present"
								? `存在 · ${captionEvidence.captionElementCount} 条`
								: "不存在",
						],
						["目标响度", loudnessLabel],
						["源时长", formatDuration(project.sourceDurationSeconds)],
					].map(([label, value], index) => (
						<div
							key={label}
							className={cn(
								"min-w-0 border-t px-3 py-2.5 first:border-t-0 even:border-l sm:border-l sm:border-t-0 sm:first:border-l-0",
								index === 1 && "border-t-0",
							)}
						>
							<dt className="text-[9px] text-muted-foreground">{label}</dt>
							<dd className="mt-1 truncate text-xs font-semibold">{value}</dd>
						</div>
					))}
				</dl>
			</section>

			<section
				className="border-b px-3 py-4 sm:px-4"
				aria-labelledby="export-variants-title"
			>
				<div className="flex items-end justify-between gap-3">
					<div>
						<h3 id="export-variants-title" className="text-xs font-semibold">
							交付变体
						</h3>
						<p className="mt-1 text-[10px] text-muted-foreground">
							清单文件名是计划；只有带“已完成”的条目才有真实 Blob 产物。
						</p>
					</div>
					<span className="shrink-0 text-[10px] text-muted-foreground">
						{exportManifest.intent.variants.length} 个版本
					</span>
				</div>

				<div className="mt-3 overflow-hidden rounded-[8px] border">
					{exportManifest.intent.variants.map((variant, index) => {
						const executionJob = activeQueue?.jobs.find(
							(job) => job.variantId === variant.id,
						);
						const plannedFiles: Array<{
							icon: LucideIcon;
							label: string;
							fileName: string;
						}> = [
							{
								fileName: variant.plannedFiles.video,
								icon: FileVideo2,
								label: "视频",
							},
							...(variant.plannedFiles.subtitles
								? [
										{
											fileName: variant.plannedFiles.subtitles,
											icon: FileText,
											label: "字幕",
										},
									]
								: []),
							...(variant.plannedFiles.cover
								? [
										{
											fileName: variant.plannedFiles.cover,
											icon: ImageIcon,
											label: "封面",
										},
									]
								: []),
						];
						const variantIssueCount =
							variant.preflight.blockers.length +
							variant.preflight.warnings.length;
						const variantHasBlockers = variant.preflight.blockers.length > 0;
						const variantNeedsReview =
							!variantHasBlockers && variant.preflight.warnings.length > 0;

						return (
							<details
								key={variant.id}
								className={cn("group", index > 0 && "border-t")}
							>
								<summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3 py-2.5 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
									<div
										className={cn(
											"flex size-7 shrink-0 items-center justify-center rounded-[6px] border",
											variantHasBlockers
												? "border-destructive/30 text-destructive"
												: variantNeedsReview
													? "border-amber-500/30 text-amber-700 dark:text-amber-300"
													: "border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
										)}
									>
										{variantHasBlockers ? (
											<CircleAlert className="size-3.5" aria-hidden="true" />
										) : variantNeedsReview ? (
											<AlertTriangle className="size-3.5" aria-hidden="true" />
										) : (
											<CheckCircle2 className="size-3.5" aria-hidden="true" />
										)}
									</div>
									<div className="min-w-0 flex-1">
										<div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
											<p className="truncate text-xs font-medium">
												{variant.label}
											</p>
											<span className="text-[10px] text-muted-foreground">
												{PLATFORM_LABELS[variant.platform]}
											</span>
											<span
												className={cn(
													"text-[9px]",
													executionJob?.status === "failed" ||
														variantHasBlockers
														? "text-destructive"
														: executionJob?.status === "completed"
															? "text-emerald-700 dark:text-emerald-300"
															: variantNeedsReview
																? "text-amber-700 dark:text-amber-300"
																: "text-emerald-700 dark:text-emerald-300",
												)}
											>
												{executionJob
													? executionJob.capability.state === "rejected"
														? "已拒绝"
														: JOB_STATUS_LABELS[executionJob.status]
													: variantHasBlockers
														? "阻塞"
														: variantNeedsReview
															? "待审阅"
															: "可交接"}
											</span>
										</div>
										<p className="mt-1 text-[10px] text-muted-foreground">
											{variant.dimensions.width}×{variant.dimensions.height} ·{" "}
											{variant.aspectRatio} · {variant.container.toUpperCase()}{" "}
											· {formatDuration(variant.targetDurationSeconds)}
										</p>
									</div>
									{variantIssueCount > 0 && (
										<span className="shrink-0 text-[10px] text-muted-foreground">
											{variantIssueCount} 项
										</span>
									)}
									<ChevronDown
										className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
										aria-hidden="true"
									/>
								</summary>

								<div className="border-t bg-muted/20 px-3 py-3">
									<div className="grid gap-x-4 sm:grid-cols-2">
										<RequirementRow
											icon={Subtitles}
											label="字幕"
											value={formatSubtitleRequirement(
												variant.requirements.subtitles,
											)}
										/>
										<RequirementRow
											icon={Volume2}
											label="声音"
											value={formatAudioRequirement(variant.requirements.audio)}
										/>
										<RequirementRow
											icon={ImageIcon}
											label="封面"
											value={formatCoverRequirement(variant.requirements.cover)}
										/>
										<RequirementRow
											icon={ShieldCheck}
											label="平台规则"
											value={`${variant.platformConstraint.profile} · 未实时联网核验`}
										/>
									</div>

									<div className="mt-3 border-t pt-3">
										<p className="text-[10px] font-medium">
											{executionJob?.artifact ? "实际视频文件" : "计划文件"}
										</p>
										<ul className="mt-1.5 space-y-1.5">
											{plannedFiles.map((file) => {
												const FileIcon = file.icon;
												return (
													<li
														key={file.fileName}
														className="flex min-w-0 items-start gap-2 text-[10px] text-muted-foreground"
													>
														<FileIcon
															className="mt-0.5 size-3 shrink-0"
															aria-hidden="true"
														/>
														<span className="w-10 shrink-0">{file.label}</span>
														<code className="min-w-0 break-all font-sans text-foreground">
															{file.fileName}
														</code>
													</li>
												);
											})}
										</ul>
									</div>
									<div className="mt-3">
										<VariantExecutionState
											job={executionJob}
											onDownload={handleArtifactDownload}
										/>
									</div>
								</div>
							</details>
						);
					})}
				</div>
			</section>

			<section className="border-b py-4" aria-labelledby="export-issues-title">
				<div className="flex items-end justify-between gap-3 px-3 sm:px-4">
					<div>
						<h3 id="export-issues-title" className="text-xs font-semibold">
							预检问题
						</h3>
						<p className="mt-1 text-[10px] text-muted-foreground">
							阻塞项会让对应队列任务被明确拒绝，提醒项不会自动忽略。
						</p>
					</div>
					<span className="shrink-0 text-[10px] text-muted-foreground">
						{preflight.blockers.length} 阻塞 · {preflight.warnings.length} 提醒
					</span>
				</div>

				{preflight.blockers.length === 0 && preflight.warnings.length === 0 ? (
					<div className="mx-3 mt-3 flex items-start gap-2.5 rounded-[6px] border px-3 py-3 sm:mx-4">
						<CheckCircle2
							className="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-300"
							aria-hidden="true"
						/>
						<p className="text-[11px] leading-relaxed text-muted-foreground">
							当前本地规则未发现问题。正式发布前仍需人工检查画面、声音和目标平台最新要求。
						</p>
					</div>
				) : (
					<ul className="mt-3 border-y">
						{[...preflight.blockers, ...preflight.warnings].map(
							(issue, index) => (
								<IssueRow
									key={`${issue.code}-${issue.variantId ?? "project"}-${index}`}
									issue={issue}
									manifest={exportManifest}
								/>
							),
						)}
					</ul>
				)}

				{!hasLivePlatformPolicy && (
					<div className="mx-3 mt-3 flex items-start gap-2 sm:mx-4" role="note">
						<Info
							className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
						<p className="text-[10px] leading-relaxed text-muted-foreground">
							平台约束来自 VisionCut
							本地默认配置，没有联网核验平台政策；发布前请复核目标平台最新规则。
						</p>
					</div>
				)}
			</section>

			<section
				className="border-b px-3 py-4 sm:px-4"
				aria-labelledby="export-boundary-title"
			>
				<div className="flex items-start gap-3">
					<div className="flex size-8 shrink-0 items-center justify-center rounded-[6px] border text-muted-foreground">
						<MonitorUp className="size-4" aria-hidden="true" />
					</div>
					<div className="min-w-0 flex-1">
						<h3 id="export-boundary-title" className="text-xs font-semibold">
							真实执行边界
						</h3>
						<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
							清单仍是声明；本地队列只对与当前画布同画幅且完整时长一致的变体执行现有浏览器
							renderer。异画幅、改时长、外挂字幕和独立封面会被拒绝，不会永久改动时间线。
						</p>
					</div>
				</div>

				<div className="mt-3 grid border-y sm:grid-cols-3">
					{[
						{
							icon: MonitorUp,
							label: "视频渲染",
							value: activeQueue
								? `${queueStatusLabel} · ${completedCount} 个文件`
								: "未执行",
						},
						{
							icon: Gauge,
							label: "响度测量",
							value: "未测量",
						},
						{
							icon: UploadCloud,
							label: "平台上传",
							value: "未执行 · 不自动上传",
						},
					].map(({ icon: StateIcon, label, value }) => (
						<div
							key={label}
							className="flex min-w-0 items-center gap-2 border-t px-2.5 py-2.5 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0"
						>
							<StateIcon
								className="size-3.5 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
							<div className="min-w-0">
								<p className="text-[9px] text-muted-foreground">{label}</p>
								<p className="mt-0.5 text-[10px] font-medium">{value}</p>
							</div>
						</div>
					))}
				</div>

				<div className="mt-3 border-y">
					{activeQueue && completedCount > 0 && (
						<div className="flex min-w-0 items-start gap-2.5 border-t py-2.5 first:border-t-0">
							<PackageCheck
								className="mt-0.5 size-3.5 shrink-0 text-emerald-700 dark:text-emerald-300"
								aria-hidden="true"
							/>
							<div className="min-w-0 flex-1">
								<p className="text-[10px] font-medium">
									本地交付包 · {completedCount} 个真实成片
								</p>
								<code className="mt-0.5 block break-all font-sans text-[10px] text-muted-foreground">
									{activeQueue.bundleFileName ??
										`${exportManifest.intent.fileNameStem}_visioncut-delivery.zip`}
								</code>
							</div>
						</div>
					)}
					{exportManifest.localCapabilityBoundary.availableArtifacts.map(
						(artifact) => (
							<div
								key={artifact.kind}
								className="flex min-w-0 items-start gap-2.5 border-t py-2.5 first:border-t-0"
							>
								<FileJson2
									className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
									aria-hidden="true"
								/>
								<div className="min-w-0 flex-1">
									<p className="text-[10px] font-medium">
										{ARTIFACT_LABELS[artifact.kind]}
									</p>
									<code className="mt-0.5 block break-all font-sans text-[10px] text-muted-foreground">
										{artifact.fileName}
									</code>
								</div>
							</div>
						),
					)}
					{activeQueue?.jobs
						.filter(hasDownloadableExportArtifact)
						.map((job) => (
							<div
								key={job.variantId}
								className="flex min-w-0 items-start gap-2.5 border-t py-2.5"
							>
								<FileVideo2
									className="mt-0.5 size-3.5 shrink-0 text-emerald-700 dark:text-emerald-300"
									aria-hidden="true"
								/>
								<div className="min-w-0 flex-1">
									<p className="text-[10px] font-medium">
										真实本地成片 · {job.label}
									</p>
									<code className="mt-0.5 block break-all font-sans text-[10px] text-muted-foreground">
										{job.artifact?.fileName}
									</code>
								</div>
							</div>
						))}
				</div>
			</section>

			<div className="space-y-2 px-3 pt-4 sm:px-4">
				<Button
					className="min-h-11 w-full rounded-[6px]"
					onClick={handleManifestDownload}
				>
					<HardDriveDownload aria-hidden="true" />
					导出本地制作清单 JSON
				</Button>
				{activeQueue && completedCount > 0 && (
					<Button
						variant="outline"
						className="min-h-11 w-full rounded-[6px]"
						disabled={bundleState === "preparing"}
						onClick={() => void handleBundleDownload()}
					>
						{bundleState === "preparing" ? (
							<LoaderCircle className="animate-spin motion-reduce:animate-none" />
						) : (
							<Download aria-hidden="true" />
						)}
						{bundleState === "preparing"
							? "正在整理本地交付包"
							: bundleState === "downloaded"
								? `再次下载全部 ${completedCount} 个成片`
								: `下载全部 ${completedCount} 个成片`}
					</Button>
				)}
				<Button
					variant="outline"
					className="min-h-11 w-full rounded-[6px]"
					disabled={!canStartLocalQueue || (!queueIsActive && !actionCanStart)}
					onClick={queueIsActive ? handleCancelQueue : handleStartQueue}
					title={
						!canStartLocalQueue
							? "本地交付队列未接入，或清单超过 6 个变体"
							: queueIsActive
								? "取消当前任务并取消尚未开始的任务"
								: "逐项调用现有浏览器 renderer"
					}
				>
					{queueIsActive ? (
						<XCircle aria-hidden="true" />
					) : activeQueue ? (
						<RotateCcw aria-hidden="true" />
					) : (
						<MonitorUp aria-hidden="true" />
					)}
					{queueIsActive
						? "取消本地交付队列"
						: activeQueue && retryableCount > 0
							? `重试 ${retryableCount} 个未完成任务`
							: activeQueue && completedCount > 0
								? "可执行变体均已完成"
								: activeQueue
									? "没有可重试任务"
									: "启动本地多规格交付"}
				</Button>

				<p className="text-[10px] leading-relaxed text-muted-foreground">
					{queueIsActive
						? "关闭此面板不会取消；只有上方取消按钮会中止当前 renderer，并把未开始任务标为已取消。"
						: activeQueue && retryableCount > 0
							? `只重试 ${retryableCount} 个失败或取消的支持项；${completedCount} 个已完成产物通过校验后直接复用。`
							: activeQueue && completedCount > 0
								? "现有真实产物可以单个下载或打包下载；规格拒绝项不会被伪造成成片。"
								: activeQueue
									? "当前任务均因预检或能力边界被明确拒绝；请调整交付规格后生成新清单。"
									: canStartLocalQueue
										? "启动后按清单顺序处理 1-6 个变体。画幅与时长匹配的平台版本可执行；不可靠规格保留拒绝原因。"
										: "当前界面未连接本地队列，或清单变体数量超出 1-6 个执行边界。"}
				</p>
				{downloadError && (
					<div
						className="flex items-start gap-2 rounded-[6px] border border-destructive/30 px-3 py-2.5 text-[11px] text-destructive"
						role="alert"
					>
						<CircleAlert
							className="mt-0.5 size-3.5 shrink-0"
							aria-hidden="true"
						/>
						<span className="break-words">{downloadError}</span>
					</div>
				)}
			</div>
		</div>
	);
}
