"use client";

import { useState } from "react";
import {
	AlertTriangle,
	CheckCircle2,
	ChevronDown,
	CircleAlert,
	Download,
	FileJson2,
	FileText,
	FileVideo2,
	Image as ImageIcon,
	Info,
	MonitorUp,
	PackageCheck,
	ShieldCheck,
	Subtitles,
	Volume2,
	type LucideIcon,
} from "lucide-react";
import {
	serializeExportManifest,
	type ExportIssue,
	type ExportManifest,
} from "@/ai-studio/export-manifest";
import { Button } from "@/components/ui/button";
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
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const exponent = Math.min(
		Math.floor(Math.log(bytes) / Math.log(1024)),
		units.length - 1,
	);
	const value = bytes / 1024 ** exponent;
	return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
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
	const { preflight, project, sourceEvidence } = exportManifest;
	const isReadyForHandoff = preflight.readyForVideoRenderHandoff;
	const canOpenNativeExport = isReadyForHandoff && Boolean(onOpenNativeExport);
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

	function handleNativeExport() {
		if (!isReadyForHandoff || !onOpenNativeExport) return;
		onOpenNativeExport();
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
							从真实项目快照生成交付预检与文件计划，不代替视频渲染。
						</p>
					</div>
				</div>
			</header>

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
								? `没有阻塞项；仍有 ${preflight.warnings.length} 条提醒需要在正式交付前复核。`
								: `${preflight.blockers.length} 个阻塞项必须处理后，才能把任务交给现有导出器。`}
						</p>
					</div>
				</div>

				<dl className="grid grid-cols-2 border-t sm:grid-cols-4">
					{[
						["交付变体", `${exportManifest.intent.variants.length}`],
						["源时长", formatDuration(project.sourceDurationSeconds)],
						["时间线元素", `${sourceEvidence.timeline.elementCount}`],
						["已知素材", formatBytes(sourceEvidence.media.totalKnownBytes)],
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
							文件名均为预计结果，当前尚未生成视频。
						</p>
					</div>
					<span className="shrink-0 text-[10px] text-muted-foreground">
						{exportManifest.intent.variants.length} 个版本
					</span>
				</div>

				<div className="mt-3 overflow-hidden rounded-[8px] border">
					{exportManifest.intent.variants.map((variant, index) => {
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

						return (
							<details
								key={variant.id}
								className={cn("group", index > 0 && "border-t")}
							>
								<summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3 py-2.5 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
									<div
										className={cn(
											"flex size-7 shrink-0 items-center justify-center rounded-[6px] border",
											variant.preflight.readyForRenderHandoff
												? "text-emerald-700 dark:text-emerald-300"
												: "text-destructive",
										)}
									>
										{variant.preflight.readyForRenderHandoff ? (
											<CheckCircle2 className="size-3.5" aria-hidden="true" />
										) : (
											<CircleAlert className="size-3.5" aria-hidden="true" />
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
										<p className="text-[10px] font-medium">预计文件 · 未生成</p>
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
							阻塞项会禁止导出器交接，提醒项不会自动忽略。
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
							本地能力边界
						</h3>
						<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
							这份模型只生成项目
							JSON、制作清单与预检结果。视频渲染状态为“未执行”，预计文件名不代表文件已经生成；真正的视频需要现有渲染引擎或外部
							Worker 完成。
						</p>
					</div>
				</div>

				<div className="mt-3 border-y">
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
				</div>
			</section>

			<div className="space-y-2 px-3 pt-4 sm:px-4">
				<Button
					className="min-h-11 w-full rounded-[6px]"
					disabled={!canOpenNativeExport}
					onClick={handleNativeExport}
					title={
						!isReadyForHandoff
							? "先处理全部预检阻塞项"
							: onOpenNativeExport
								? "打开现有视频导出器"
								: "当前界面尚未连接现有导出器"
					}
				>
					<MonitorUp aria-hidden="true" />
					交给现有导出器
				</Button>
				<Button
					variant="outline"
					className="min-h-11 w-full rounded-[6px]"
					onClick={handleManifestDownload}
				>
					<Download aria-hidden="true" />
					下载制作清单 JSON
				</Button>

				<p className="text-[10px] leading-relaxed text-muted-foreground">
					{!isReadyForHandoff
						? "现有导出器入口已锁定：请先解决上方阻塞项。"
						: onOpenNativeExport
							? "预检已通过，可以把项目交给现有导出器；此处不会伪造渲染进度。"
							: "预检已通过，但当前界面尚未接入现有导出器回调。"}
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
