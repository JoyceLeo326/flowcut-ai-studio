"use client";

import { useState } from "react";
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
	Check,
	Clock3,
	Copy,
	Download,
	Monitor,
	RotateCcw,
	Volume2,
	VolumeX,
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

function isExportFormat(value: string): value is ExportFormat {
	return EXPORT_FORMAT_VALUES.some((formatValue) => formatValue === value);
}

function isExportQuality(value: string): value is ExportQuality {
	return EXPORT_QUALITY_VALUES.some((qualityValue) => qualityValue === value);
}

export function ExportButton() {
	const [isExportPopoverOpen, setIsExportPopoverOpen] = useState(false);
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

	return (
		<Popover
			open={isExportPopoverOpen}
			onOpenChange={(open) => handlePopoverOpenChange({ open })}
		>
			<PopoverTrigger asChild>
				<Button
					size="sm"
					className="h-8 px-3"
					disabled={!canOpenExport}
					title={canOpenExport ? "导出成片" : "先把视频或图片加入时间线"}
				>
					<Download className="size-3.5" />
					导出
				</Button>
			</PopoverTrigger>
			{hasProject && <ExportPopover onOpenChange={setIsExportPopoverOpen} />}
		</Popover>
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
		<PopoverContent className="bg-background mr-0 flex max-h-[min(82vh,42rem)] w-[min(22rem,calc(100vw-1rem))] flex-col overflow-y-auto p-0 sm:mr-2">
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
										<SectionHeader>
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
													<RadioGroupItem value="mp4" id="mp4" />
													<Label htmlFor="mp4">MP4 (H.264) · 兼容性更好</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="webm" id="webm" />
													<Label htmlFor="webm">
														WebM (VP9) · 文件通常更小
													</Label>
												</div>
											</RadioGroup>
										</SectionContent>
									</Section>

									<Section collapsible defaultOpen={false}>
										<SectionHeader>
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
													<RadioGroupItem value="low" id="low" />
													<Label htmlFor="low">低 · 文件最小</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="medium" id="medium" />
													<Label htmlFor="medium">中 · 体积与画质平衡</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="high" id="high" />
													<Label htmlFor="high">高 · 推荐</Label>
												</div>
												<div className="flex items-center space-x-2">
													<RadioGroupItem value="very_high" id="very_high" />
													<Label htmlFor="very_high">极高 · 文件最大</Label>
												</div>
											</RadioGroup>
										</SectionContent>
									</Section>

									<Section collapsible defaultOpen={false}>
										<SectionHeader>
											<SectionTitle>声音</SectionTitle>
										</SectionHeader>
										<SectionContent>
											<div className="flex items-center space-x-2">
												<Checkbox
													id="include-audio"
													checked={shouldIncludeAudio}
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
										className="w-full gap-2"
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
									className="w-full rounded-md"
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
					className="h-8 flex-1 text-xs"
					onClick={handleCopy}
				>
					{copied ? <Check className="text-constructive" /> : <Copy />}
					复制错误
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="h-8 flex-1 text-xs"
					onClick={onRetry}
				>
					<RotateCcw />
					重试
				</Button>
			</div>
		</div>
	);
}
