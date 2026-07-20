"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
	AudioLines,
	Brain,
	Check,
	CheckCircle2,
	ClipboardCheck,
	Cloud,
	Copy,
	Download,
	FileJson,
	Film,
	FolderOpen,
	Gauge,
	HardDrive,
	Headphones,
	Info,
	Layers3,
	ListChecks,
	MonitorUp,
	Palette,
	PlayCircle,
	RotateCcw,
	Subtitles,
	Timer,
	UploadCloud,
	Wand2,
	Workflow,
	type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
	applyLocalEditPlan,
	composeCreativeBriefPrompt,
	createChatCutHandoff,
	createDefaultCreativeBrief,
	createEditPlan,
	CREATIVE_BRIEF_CATALOG,
	formatChatCutTask,
	getCreativeBriefProgress,
	getSelectedCreativeBriefOptions,
	toggleCreativeBriefDelivery,
	updateCreativeBriefSelection,
	type CreativeBriefOption,
	type CreativeBriefSelection,
	type CreativeBriefSingleField,
	type EditMode,
	type EditPlan,
	type HandoffMediaItem,
} from "@/ai-edit";
import { requestMediaImport } from "@/editor/navigation-events";
import { useEditor } from "@/editor/use-editor";
import type { TimelineElement } from "@/timeline";
import { hasMediaId } from "@/timeline/element-utils";
import { cn } from "@/utils/ui";
import { mediaTimeToSeconds } from "@/wasm";

const MODES: Array<{
	id: EditMode;
	label: string;
	description: string;
	icon: LucideIcon;
}> = [
	{
		id: "hybrid",
		label: "智能协作",
		description: "本机先整理，内容识别与创意包装交给 ChatCut。",
		icon: Workflow,
	},
	{
		id: "local",
		label: "只在本机",
		description: "只执行顺排、首尾收紧和画幅调整。",
		icon: HardDrive,
	},
	{
		id: "chatcut",
		label: "ChatCut 精剪",
		description: "生成完整云端任务，适合长视频和语义剪辑。",
		icon: Cloud,
	},
];

const TONE_CLASSES: Record<NonNullable<CreativeBriefOption["tone"]>, string> = {
	cyan: "bg-cyan-500",
	emerald: "bg-emerald-500",
	amber: "bg-amber-500",
	rose: "bg-rose-500",
	violet: "bg-violet-500",
	zinc: "bg-zinc-500",
};

const AVAILABILITY_LABELS = {
	ready: "本机可执行",
	handoff: "需要 ChatCut",
	blocked: "等待素材",
} as const;

function formatDuration(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0) return "0 秒";
	const minutes = Math.floor(seconds / 60);
	const remaining = Math.round(seconds % 60);
	if (minutes === 0) return `${remaining} 秒`;
	return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

function downloadJson({
	value,
	filename,
}: {
	value: unknown;
	filename: string;
}) {
	const url = URL.createObjectURL(
		new Blob([JSON.stringify(value, null, 2)], {
			type: "application/json",
		}),
	);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}

function BriefChoiceGrid({
	options,
	selectedId,
	onSelect,
}: {
	options: readonly CreativeBriefOption[];
	selectedId: string | null;
	onSelect: (id: string) => void;
}) {
	return (
		<div className="flowcut-choice-grid grid grid-cols-1 gap-1.5 min-[420px]:grid-cols-2">
			{options.map((option) => {
				const isSelected = option.id === selectedId;
				return (
					<button
						key={option.id}
						type="button"
						aria-pressed={isSelected}
						data-selected={isSelected ? "true" : "false"}
						className="flowcut-brief-option group min-h-[64px] min-w-0 rounded-[8px] border px-3 py-2.5 text-left"
						onClick={() => onSelect(option.id)}
					>
						<span className="flex min-w-0 items-center gap-2">
							{option.tone ? (
								<span
									className={cn(
										"size-2 shrink-0 rounded-[2px]",
										TONE_CLASSES[option.tone],
									)}
								/>
							) : null}
							<span className="min-w-0 flex-1 truncate text-[12px] font-medium">
								{option.label}
							</span>
							<span
								className={cn(
									"flex size-5 shrink-0 items-center justify-center rounded-[5px] border transition",
									isSelected
										? "border-primary bg-primary text-primary-foreground"
										: "border-border text-transparent",
								)}
							>
								<Check className="size-3" />
							</span>
						</span>
						<span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
							{option.meta}
						</span>
					</button>
				);
			})}
		</div>
	);
}

function BlueprintItem({
	icon: Icon,
	label,
	value,
}: {
	icon: LucideIcon;
	label: string;
	value: string;
}) {
	return (
		<div className="flowcut-blueprint-item min-w-0 px-3 py-3">
			<div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
				<Icon className="size-3.5 text-primary/90" />
				{label}
			</div>
			<p className="mt-1.5 text-[11px] leading-relaxed text-foreground/90">
				{value}
			</p>
		</div>
	);
}

function StageCell({
	label,
	value,
	state,
}: {
	label: string;
	value: string;
	state: "done" | "current" | "idle";
}) {
	return (
		<div className="flowcut-stage-cell min-w-0" data-state={state}>
			<span className="text-[9px] font-medium text-muted-foreground">
				{label}
			</span>
			<span className="mt-1 block truncate text-[10px] font-medium">
				{value}
			</span>
		</div>
	);
}

function AspectFrame({
	ratio,
	compact = false,
}: {
	ratio: string;
	compact?: boolean;
}) {
	return (
		<span
			aria-hidden="true"
			data-ratio={ratio}
			className={cn("flowcut-aspect-frame", compact && "is-compact")}
		/>
	);
}

export function AIWorkspacePanel() {
	const editor = useEditor();
	const assets = useEditor((value) => value.media.getAssets());
	const scene = useEditor((value) => value.scenes.getActiveSceneOrNull());
	const project = useEditor((value) => value.project.getActive());
	const [mode, setMode] = useState<EditMode>("hybrid");
	const [brief, setBrief] = useState<CreativeBriefSelection>(() =>
		createDefaultCreativeBrief(),
	);
	const [extraRequest, setExtraRequest] = useState("");
	const [plan, setPlan] = useState<EditPlan | null>(null);
	const [isPlanReviewed, setIsPlanReviewed] = useState(false);
	const [appliedPlanId, setAppliedPlanId] = useState<string | null>(null);
	const [canUndoPlan, setCanUndoPlan] = useState(false);
	const planAnchorRef = useRef<HTMLDivElement>(null);

	const timelineElements = useMemo(() => {
		if (!scene) return [];
		const elements: TimelineElement[] = [];
		for (const track of [
			scene.tracks.main,
			...scene.tracks.overlay,
			...scene.tracks.audio,
		]) {
			elements.push(...(track.elements as TimelineElement[]));
		}
		return elements;
	}, [scene]);

	const usedMediaIds = useMemo(
		() =>
			new Set(
				timelineElements.filter(hasMediaId).map((element) => element.mediaId),
			),
		[timelineElements],
	);
	const videoClipCount = timelineElements.filter(
		(element) => element.type === "video",
	).length;
	const durationSeconds = mediaTimeToSeconds({
		time: editor.timeline.getTotalDuration(),
	});
	const unusedAssetCount = assets.filter(
		(asset) => !usedMediaIds.has(asset.id),
	).length;
	const videoAssetCount = assets.filter(
		(asset) => asset.type === "video",
	).length;
	const audioAssetCount = assets.filter(
		(asset) => asset.type === "audio",
	).length;
	const imageAssetCount = assets.filter(
		(asset) => asset.type === "image",
	).length;
	const estimatedTotalAssetDuration = assets.reduce(
		(total, asset) => total + (asset.duration ?? 0),
		0,
	);
	const hasMedia = assets.length > 0 || timelineElements.length > 0;
	const selectedMode = MODES.find((item) => item.id === mode) ?? MODES[0];
	const selectedBriefOptions = getSelectedCreativeBriefOptions(brief);
	const briefProgress = getCreativeBriefProgress(brief);
	const briefProgressPercent =
		(briefProgress.completed / briefProgress.total) * 100;
	const composedPrompt = useMemo(
		() => composeCreativeBriefPrompt({ brief, extraRequest }),
		[brief, extraRequest],
	);

	const invalidatePlan = () => {
		setPlan(null);
		setIsPlanReviewed(false);
		setAppliedPlanId(null);
		setCanUndoPlan(false);
	};

	const handleSingleChoice = ({
		field,
		value,
	}: {
		field: CreativeBriefSingleField;
		value: string;
	}) => {
		setBrief((current) =>
			updateCreativeBriefSelection({ brief: current, field, value }),
		);
		invalidatePlan();
	};

	const handleDeliveryChoice = (id: string) => {
		setBrief((current) => toggleCreativeBriefDelivery({ brief: current, id }));
		invalidatePlan();
	};

	const handleModeChange = (nextMode: EditMode) => {
		setMode(nextMode);
		invalidatePlan();
	};

	const handleCreatePlan = () => {
		if (!hasMedia) {
			requestMediaImport();
			toast.info("先选择要剪辑的视频片段");
			return;
		}

		const nextPlan = createEditPlan({
			prompt: composedPrompt,
			mode,
			assetCount: assets.length,
			unusedAssetCount,
			timelineElementCount: timelineElements.length,
			videoClipCount,
			durationSeconds,
		});
		setPlan(nextPlan);
		setIsPlanReviewed(false);
		setAppliedPlanId(null);
		setCanUndoPlan(false);
	};

	useEffect(() => {
		if (!plan) return;
		const frame = window.requestAnimationFrame(() => {
			const reduceMotion = window.matchMedia(
				"(prefers-reduced-motion: reduce)",
			).matches;
			planAnchorRef.current?.scrollIntoView({
				behavior: reduceMotion ? "auto" : "smooth",
				block: "start",
			});
		});
		return () => window.cancelAnimationFrame(frame);
	}, [plan]);

	const toggleStep = ({ id, enabled }: { id: string; enabled: boolean }) => {
		if (plan?.id === appliedPlanId) return;
		setPlan((current) =>
			current
				? {
						...current,
						steps: current.steps.map((step) =>
							step.id === id ? { ...step, enabled } : step,
						),
					}
				: null,
		);
		setIsPlanReviewed(false);
	};

	const handleApplyLocal = () => {
		if (!plan || !isPlanReviewed) return;
		if (appliedPlanId === plan.id) {
			toast.info("这版本地整理已经执行过了");
			return;
		}
		const result = applyLocalEditPlan({ editor, plan });
		if (result.commandCount === 0) {
			toast.info("没有可执行的本机步骤");
			return;
		}
		setAppliedPlanId(plan.id);
		setCanUndoPlan(true);
		toast.success(`已执行 ${result.appliedStepCount} 个本机步骤`, {
			description: "整组修改可以一次撤销。",
		});
	};

	const handleUndo = () => {
		editor.command.undo();
		setAppliedPlanId(null);
		setCanUndoPlan(false);
		toast.success("已撤销本次本机整理");
	};

	const buildHandoff = () => {
		if (!plan || !project) return null;
		const media: HandoffMediaItem[] = assets.map((asset) => ({
			name: asset.name,
			type: asset.type,
			...(asset.duration !== undefined
				? { durationSeconds: asset.duration }
				: {}),
		}));
		return createChatCutHandoff({
			project: { id: project.metadata.id, name: project.metadata.name },
			media,
			plan,
		});
	};

	const handleCopyHandoff = async () => {
		if (!isPlanReviewed) return;
		const handoff = buildHandoff();
		if (!handoff || handoff.requestedSteps.length === 0) return;
		try {
			await navigator.clipboard.writeText(formatChatCutTask(handoff));
			toast.success("ChatCut 任务已复制", {
				description: `继续时请一并附上 ${handoff.media.length} 个原素材文件。`,
			});
		} catch {
			toast.error("浏览器不允许写入剪贴板，请下载交接包");
		}
	};

	const handleDownloadHandoff = () => {
		const handoff = buildHandoff();
		if (!handoff) return;
		downloadJson({
			value: handoff,
			filename: `flowcut-chatcut-${project?.metadata.id ?? "project"}.json`,
		});
	};

	const handleDownloadPlan = () => {
		if (!plan) return;
		downloadJson({
			value: plan,
			filename: `flowcut-plan-${project?.metadata.id ?? "project"}.json`,
		});
	};

	const enabledSteps = plan?.steps.filter((step) => step.enabled) ?? [];
	const readySteps = enabledSteps.filter(
		(step) => step.executor === "local" && step.availability === "ready",
	);
	const chatCutSteps = enabledSteps.filter(
		(step) => step.executor === "chatcut" && step.availability === "handoff",
	);
	const blockedSteps = enabledSteps.filter(
		(step) => step.availability === "blocked",
	);
	const hasLocalSteps = readySteps.length > 0;
	const hasChatCutSteps = chatCutSteps.length > 0;
	const hasAppliedLocal = plan?.id === appliedPlanId;

	return (
		<div className="flowcut-ai-shell flex h-full min-h-0 flex-col">
			<ScrollArea className="min-h-0 flex-1">
				<div className="space-y-4 p-3">
					<section className="flowcut-director-console overflow-hidden rounded-[8px] border">
						<div className="flex items-start gap-3.5 p-3.5">
							<div className="flowcut-director-mark flex size-10 shrink-0 items-center justify-center rounded-[8px] border">
								<Brain className="size-5" />
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center justify-between gap-2">
									<h2 className="text-[15px] font-semibold">AI 剪辑导演</h2>
									<span className="inline-flex items-center gap-1.5 text-[9px] font-medium text-muted-foreground">
										<span className="size-1.5 rounded-full bg-emerald-500" />
										本地优先
									</span>
								</div>
								<p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
									选成片类型，确认风格，生成一版可以直接审阅的剪辑蓝图。
								</p>
							</div>
						</div>

						<div className="grid grid-cols-4 border-t">
							<StageCell
								label="01 素材"
								value={hasMedia ? `${assets.length} 个就绪` : "待导入"}
								state={hasMedia ? "done" : "current"}
							/>
							<StageCell
								label="02 简报"
								value={`${briefProgress.completed}/${briefProgress.total} 已选`}
								state={hasMedia ? "current" : "idle"}
							/>
							<StageCell
								label="03 蓝图"
								value={plan ? "已生成" : "待生成"}
								state={plan ? "done" : "idle"}
							/>
							<StageCell
								label="04 执行"
								value={hasAppliedLocal ? "已应用" : "待确认"}
								state={hasAppliedLocal ? "done" : "idle"}
							/>
						</div>
					</section>

					{!hasMedia ? (
						<section className="flowcut-empty-import rounded-[8px] border border-dashed p-5 text-center">
							<div className="mx-auto flex size-11 items-center justify-center rounded-[8px] border bg-background">
								<UploadCloud className="size-5 text-primary" />
							</div>
							<h3 className="mt-3 text-sm font-semibold">先把原片放进来</h3>
							<p className="mx-auto mt-1 max-w-64 text-[11px] leading-relaxed text-muted-foreground">
								支持一次选择多段视频、音频和图片，文件默认保留在当前浏览器。
							</p>
							<Button className="mt-3 w-full" onClick={requestMediaImport}>
								<FolderOpen className="size-4" />
								选择视频片段
							</Button>
						</section>
					) : (
						<section className="flowcut-material-strip grid grid-cols-4 divide-x overflow-hidden rounded-[8px] border">
							{[
								["视频", videoAssetCount],
								["音频", audioAssetCount],
								["图片", imageAssetCount],
								["总时长", formatDuration(estimatedTotalAssetDuration)],
							].map(([label, value]) => (
								<div key={label} className="min-w-0 px-2 py-2 text-center">
									<p className="text-[9px] text-muted-foreground">{label}</p>
									<p className="mt-0.5 truncate text-xs font-semibold">
										{value}
									</p>
								</div>
							))}
						</section>
					)}

					<section className="flowcut-recipe-section py-1">
						<div className="mb-3 flex items-center justify-between gap-2">
							<div>
								<h3 className="text-[13px] font-semibold">想先做成哪一种片</h3>
								<p className="mt-1 text-[11px] text-muted-foreground">
									选一个最接近的，细节可以继续调。
								</p>
							</div>
							<span className="inline-flex items-center gap-1.5 text-[9px] font-medium text-emerald-700 dark:text-emerald-300">
								<span className="size-1.5 rounded-full bg-emerald-500" />
								推荐已填好
							</span>
						</div>
						<BriefChoiceGrid
							options={CREATIVE_BRIEF_CATALOG.recipes}
							selectedId={brief.recipeId}
							onSelect={(value) =>
								handleSingleChoice({ field: "recipeId", value })
							}
						/>
					</section>

					<section className="flowcut-brief-summary overflow-hidden rounded-[8px] border">
						<div className="p-3">
							<div className="flex items-center justify-between gap-2">
								<div className="flex items-center gap-1.5 text-xs font-semibold">
									<ClipboardCheck className="size-3.5 text-primary" />
									当前创作简报
								</div>
								<span className="text-[10px] text-muted-foreground">
									{briefProgress.completed}/{briefProgress.total}
								</span>
							</div>
							<Progress value={briefProgressPercent} className="mt-2.5 h-1" />
							<div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
								{selectedBriefOptions.map((option) => (
									<span
										key={`${option.id}-${option.label}`}
										className="flowcut-brief-chip inline-flex min-w-0 items-center gap-1.5 border-t py-2 text-[10px]"
									>
										{option.tone ? (
											<span
												className={cn(
													"size-1.5 shrink-0 rounded-[2px]",
													TONE_CLASSES[option.tone],
												)}
											/>
										) : null}
										<span className="truncate">{option.label}</span>
									</span>
								))}
							</div>
						</div>

						<Accordion type="multiple" className="border-t px-3">
							<AccordionItem value="platform">
								<AccordionTrigger className="py-3 text-xs hover:no-underline">
									<span className="flex items-center gap-2">
										<MonitorUp className="size-3.5 text-primary" />
										发布方向
										<span className="font-normal text-muted-foreground">
											{selectedBriefOptions[1]?.label}
										</span>
									</span>
								</AccordionTrigger>
								<AccordionContent>
									<BriefChoiceGrid
										options={CREATIVE_BRIEF_CATALOG.platforms}
										selectedId={brief.platformId}
										onSelect={(value) =>
											handleSingleChoice({ field: "platformId", value })
										}
									/>
								</AccordionContent>
							</AccordionItem>

							<AccordionItem value="style">
								<AccordionTrigger className="py-3 text-xs hover:no-underline">
									<span className="flex items-center gap-2">
										<Palette className="size-3.5 text-primary" />
										视觉风格
										<span className="font-normal text-muted-foreground">
											{selectedBriefOptions[2]?.label}
										</span>
									</span>
								</AccordionTrigger>
								<AccordionContent>
									<BriefChoiceGrid
										options={CREATIVE_BRIEF_CATALOG.styles}
										selectedId={brief.styleId}
										onSelect={(value) =>
											handleSingleChoice({ field: "styleId", value })
										}
									/>
								</AccordionContent>
							</AccordionItem>

							<AccordionItem value="captions-motion">
								<AccordionTrigger className="py-3 text-xs hover:no-underline">
									<span className="flex items-center gap-2">
										<Subtitles className="size-3.5 text-primary" />
										字幕与动效
									</span>
								</AccordionTrigger>
								<AccordionContent className="space-y-4">
									<div>
										<p className="mb-2 text-[10px] font-medium text-muted-foreground">
											字幕包装
										</p>
										<BriefChoiceGrid
											options={CREATIVE_BRIEF_CATALOG.captions}
											selectedId={brief.captionId}
											onSelect={(value) =>
												handleSingleChoice({ field: "captionId", value })
											}
										/>
									</div>
									<div>
										<p className="mb-2 text-[10px] font-medium text-muted-foreground">
											镜头动效
										</p>
										<BriefChoiceGrid
											options={CREATIVE_BRIEF_CATALOG.motions}
											selectedId={brief.motionId}
											onSelect={(value) =>
												handleSingleChoice({ field: "motionId", value })
											}
										/>
									</div>
								</AccordionContent>
							</AccordionItem>

							<AccordionItem value="audio-delivery" className="border-b-0">
								<AccordionTrigger className="py-3 text-xs hover:no-underline">
									<span className="flex items-center gap-2">
										<Headphones className="size-3.5 text-primary" />
										声音与交付
									</span>
								</AccordionTrigger>
								<AccordionContent className="space-y-4">
									<div>
										<p className="mb-2 text-[10px] font-medium text-muted-foreground">
											声音设计
										</p>
										<BriefChoiceGrid
											options={CREATIVE_BRIEF_CATALOG.audio}
											selectedId={brief.audioId}
											onSelect={(value) =>
												handleSingleChoice({ field: "audioId", value })
											}
										/>
									</div>
									<div>
										<p className="mb-2 text-[10px] font-medium text-muted-foreground">
											交付检查
										</p>
										<div className="grid gap-2">
											{CREATIVE_BRIEF_CATALOG.delivery.map((option) => {
												const checked = brief.deliveryIds.includes(option.id);
												return (
													<label
														key={option.id}
														htmlFor={`delivery-${option.id}`}
														className="flowcut-delivery-option flex cursor-pointer items-start gap-2 rounded-[8px] border p-2.5 transition"
													>
														<Checkbox
															id={`delivery-${option.id}`}
															checked={checked}
															onCheckedChange={() =>
																handleDeliveryChoice(option.id)
															}
															className="mt-0.5"
														/>
														<span className="min-w-0">
															<span className="block text-xs font-medium">
																{option.label}
															</span>
															<span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
																{option.meta}
															</span>
														</span>
													</label>
												);
											})}
										</div>
									</div>
								</AccordionContent>
							</AccordionItem>
						</Accordion>
					</section>

					<section className="flowcut-note-panel rounded-[8px] border p-3">
						<div className="flex items-center justify-between gap-2">
							<label
								htmlFor="ai-extra-request"
								className="text-xs font-semibold"
							>
								再补一句要求
							</label>
							<span className="text-[9px] text-muted-foreground">可选</span>
						</div>
						<Textarea
							id="ai-extra-request"
							value={extraRequest}
							onChange={(event) => {
								setExtraRequest(event.target.value);
								invalidatePlan();
							}}
							placeholder="例如：保留颁奖、观众反应和品牌 LOGO"
							className="mt-2 min-h-20 resize-none rounded-[8px] border-0 bg-background/70 text-xs shadow-none focus-visible:ring-1"
						/>

						<div className="mt-3 border-t pt-3">
							<p className="mb-2 text-[10px] font-medium text-muted-foreground">
								处理方式
							</p>
							<div className="grid grid-cols-3 gap-1 rounded-md bg-muted/50 p-1">
								{MODES.map((item) => {
									const Icon = item.icon;
									const selected = mode === item.id;
									return (
										<button
											key={item.id}
											type="button"
											aria-pressed={selected}
											className={cn(
												"flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-[6px] px-1 py-1.5 text-[9px] font-medium transition",
												selected
													? "border bg-background text-foreground"
													: "text-muted-foreground hover:bg-background/60",
											)}
											onClick={() => handleModeChange(item.id)}
											title={item.description}
										>
											<Icon className="size-3.5" />
											<span className="max-w-full truncate">{item.label}</span>
										</button>
									);
								})}
							</div>
							<p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
								{selectedMode.description}
							</p>
						</div>
					</section>

					<Button
						className="flowcut-generate-button h-12 w-full rounded-[8px] text-[12px]"
						onClick={handleCreatePlan}
					>
						{hasMedia ? (
							<Wand2 className="size-4" />
						) : (
							<UploadCloud className="size-4" />
						)}
						{hasMedia ? "生成成片蓝图" : "导入素材开始"}
					</Button>

					<div className="flowcut-capability-row flex gap-2 px-1 text-[10px] leading-relaxed text-muted-foreground">
						<Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
						<span>
							当前先读取素材类型、数量和时长；对白、停顿、语义高光与逐镜头内容会在
							ChatCut 阶段分析原文件。
						</span>
					</div>

					{plan ? (
						<div
							ref={planAnchorRef}
							className="flowcut-plan-anchor space-y-3 scroll-mt-3"
							aria-live="polite"
						>
							<section className="flowcut-plan-summary rounded-[8px] border p-3.5">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<div className="flex items-center gap-1.5 text-xs font-semibold">
											<Film className="size-3.5 text-primary" />
											成片蓝图
										</div>
										<p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
											{plan.summary}
										</p>
									</div>
									<div className="flowcut-output-signal flex shrink-0 flex-col items-center gap-1.5">
										<AspectFrame ratio={plan.target.aspectRatio} />
										<span className="text-[9px] font-medium text-cyan-700 dark:text-cyan-300">
											待确认
										</span>
									</div>
								</div>
								<div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
									{[
										["发布", plan.target.label],
										["画幅", plan.target.aspectRatio],
										[
											"时长",
											plan.target.targetDurationSeconds
												? `${plan.target.targetDurationSeconds} 秒`
												: "按内容自适应",
										],
										["风格", plan.target.style],
									].map(([label, value]) => (
										<div
											key={label}
											className="flowcut-plan-stat border-t py-2"
										>
											<p className="text-muted-foreground">{label}</p>
											<p className="mt-1 font-medium">{value}</p>
										</div>
									))}
								</div>
							</section>

							<section className="flowcut-blueprint-panel overflow-hidden rounded-[8px] border">
								<div className="flex items-center justify-between gap-2 border-b px-3 py-3">
									<h3 className="flex items-center gap-1.5 text-xs font-semibold">
										<Layers3 className="size-3.5 text-primary" />
										镜头设计
									</h3>
									<span className="text-[9px] text-muted-foreground">
										6 个维度
									</span>
								</div>
								<div className="flowcut-blueprint-grid grid grid-cols-1 min-[420px]:grid-cols-2">
									<BlueprintItem
										icon={PlayCircle}
										label="开场钩子"
										value={plan.creativeDirection.hook}
									/>
									<BlueprintItem
										icon={ListChecks}
										label="叙事结构"
										value={plan.creativeDirection.narrative}
									/>
									<BlueprintItem
										icon={Subtitles}
										label="字幕包装"
										value={plan.creativeDirection.captionStyle}
									/>
									<BlueprintItem
										icon={Gauge}
										label="镜头动效"
										value={plan.creativeDirection.motionStyle}
									/>
									<BlueprintItem
										icon={AudioLines}
										label="声音设计"
										value={plan.creativeDirection.audioStrategy}
									/>
									<BlueprintItem
										icon={Palette}
										label="色彩情绪"
										value={plan.creativeDirection.colorMood}
									/>
								</div>
							</section>

							<section className="flowcut-surface-section rounded-[8px] border p-3">
								<div className="flex items-center justify-between gap-2">
									<h3 className="flex items-center gap-1.5 text-xs font-semibold">
										<MonitorUp className="size-3.5" />
										交付版本
									</h3>
									<span className="text-[9px] text-muted-foreground">
										{plan.creativeDirection.outputVariants.length} 个
									</span>
								</div>
								<div className="mt-2 grid gap-2">
									{plan.creativeDirection.outputVariants.map((variant) => (
										<div
											key={`${variant.label}-${variant.aspectRatio}`}
											className="flowcut-variant-row flex items-center justify-between gap-2 rounded-[8px] border px-2.5 py-2 text-[10px]"
										>
											<span className="flex min-w-0 items-center gap-2 font-medium">
												<AspectFrame ratio={variant.aspectRatio} compact />
												<span className="truncate">{variant.label}</span>
											</span>
											<span className="text-muted-foreground">
												{variant.aspectRatio}
												{variant.targetDurationSeconds
													? ` · ${variant.targetDurationSeconds} 秒`
													: ""}
											</span>
										</div>
									))}
								</div>
							</section>

							<section className="flowcut-surface-section rounded-[8px] border p-3">
								<div className="flex items-center justify-between gap-2">
									<h3 className="flex items-center gap-1.5 text-xs font-semibold">
										<ListChecks className="size-3.5" />
										执行步骤
									</h3>
									<div className="flex items-center gap-1.5 text-[9px]">
										<span className="text-emerald-600">
											本机 {readySteps.length}
										</span>
										<span className="text-sky-600">
											ChatCut {chatCutSteps.length}
										</span>
										{blockedSteps.length > 0 ? (
											<span className="text-amber-600">
												等待 {blockedSteps.length}
											</span>
										) : null}
									</div>
								</div>
								<div className="flowcut-step-list mt-2 divide-y overflow-hidden rounded-[8px] border">
									{plan.steps.map((step) => {
										const isBlocked = step.availability === "blocked";
										return (
											<div key={step.id} className="flex gap-2.5 p-2.5">
												<Checkbox
													checked={step.enabled}
													disabled={isBlocked || hasAppliedLocal}
													onCheckedChange={(checked) =>
														toggleStep({
															id: step.id,
															enabled: checked === true,
														})
													}
													className="mt-0.5"
												/>
												<div className="min-w-0 flex-1">
													<p className="text-[11px] font-medium">
														{step.title}
													</p>
													<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
														{step.description}
													</p>
													<span
														className={cn(
															"mt-1.5 inline-flex items-center gap-1 text-[9px]",
															step.executor === "local"
																? "text-emerald-600"
																: "text-sky-600",
														)}
													>
														{step.executor === "local" ? (
															<HardDrive className="size-3" />
														) : (
															<Cloud className="size-3" />
														)}
														{AVAILABILITY_LABELS[step.availability]}
													</span>
												</div>
											</div>
										);
									})}
								</div>
							</section>

							{hasChatCutSteps ? (
								<section className="flowcut-surface-section rounded-[8px] border p-3">
									<div className="flex items-center gap-1.5 text-xs font-semibold">
										<Cloud className="size-3.5 text-sky-600" />
										交给 ChatCut 时需要附上
									</div>
									<div className="mt-2 max-h-28 space-y-1 overflow-y-auto rounded-[8px] border bg-background/45 p-2">
										{assets.map((asset) => (
											<div
												key={asset.id}
												className="flex min-w-0 items-center gap-2 text-[10px]"
											>
												<CheckCircle2 className="size-3 shrink-0 text-emerald-600" />
												<span className="truncate">{asset.name}</span>
											</div>
										))}
									</div>
									<p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
										复制任务只会复制方案，不会自动上传这些原文件。
									</p>
								</section>
							) : null}

							<Accordion
								type="multiple"
								className="flowcut-surface-section rounded-[8px] border px-3"
							>
								<AccordionItem value="review">
									<AccordionTrigger className="py-3 text-xs hover:no-underline">
										<span className="flex items-center gap-2">
											<ClipboardCheck className="size-3.5" />
											导出前检查
											<span className="font-normal text-muted-foreground">
												{plan.reviewChecklist.length} 项
											</span>
										</span>
									</AccordionTrigger>
									<AccordionContent>
										<ul className="space-y-2 text-[10px] leading-relaxed text-muted-foreground">
											{plan.reviewChecklist.map((item) => (
												<li key={item} className="flex gap-1.5">
													<CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-600" />
													<span>{item}</span>
												</li>
											))}
										</ul>
									</AccordionContent>
								</AccordionItem>
								<AccordionItem value="risk" className="border-b-0">
									<AccordionTrigger className="py-3 text-xs hover:no-underline">
										<span className="flex items-center gap-2">
											<Timer className="size-3.5 text-amber-600" />
											处理提醒
										</span>
									</AccordionTrigger>
									<AccordionContent>
										<p className="text-[10px] leading-relaxed text-muted-foreground">
											{plan.riskNotes.join(" ")}
										</p>
									</AccordionContent>
								</AccordionItem>
							</Accordion>

							<label
								htmlFor="ai-plan-reviewed"
								className="flowcut-review-gate flex cursor-pointer items-start gap-2 rounded-[8px] border p-3"
							>
								<Checkbox
									id="ai-plan-reviewed"
									checked={isPlanReviewed}
									onCheckedChange={(checked) =>
										setIsPlanReviewed(checked === true)
									}
									className="mt-0.5"
								/>
								<span className="min-w-0">
									<span className="block text-xs font-medium">
										这版方向可以执行
									</span>
									<span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
										我已检查画幅、风格、步骤和需要附给 ChatCut 的原素材。
									</span>
								</span>
							</label>
						</div>
					) : null}
				</div>
			</ScrollArea>

			{plan ? (
				<div className="flowcut-action-dock shrink-0 border-t p-2.5">
					<div className="flex gap-1.5">
						<Button
							className="h-10 min-w-0 flex-1"
							disabled={!hasLocalSteps || !isPlanReviewed || hasAppliedLocal}
							onClick={handleApplyLocal}
						>
							{hasAppliedLocal ? (
								<CheckCircle2 className="size-4" />
							) : (
								<HardDrive className="size-4" />
							)}
							{hasAppliedLocal ? "本机整理已应用" : "执行本机整理"}
						</Button>
						<Button
							variant="outline"
							size="icon"
							className="size-10"
							disabled={!canUndoPlan}
							onClick={handleUndo}
							title="撤销本次本机整理"
							aria-label="撤销本次本机整理"
						>
							<RotateCcw className="size-4" />
						</Button>
					</div>
					<div className="mt-1.5 flex gap-1.5">
						<Button
							variant="outline"
							className="h-10 min-w-0 flex-1"
							disabled={!hasChatCutSteps || !isPlanReviewed}
							onClick={handleCopyHandoff}
						>
							<Copy className="size-4" />
							复制 ChatCut 任务
						</Button>
						<Button
							variant="outline"
							size="icon"
							className="size-10"
							disabled={!hasChatCutSteps}
							onClick={handleDownloadHandoff}
							title="下载 ChatCut 交接包"
							aria-label="下载 ChatCut 交接包"
						>
							<FileJson className="size-4" />
						</Button>
						<Button
							variant="outline"
							size="icon"
							className="size-10"
							onClick={handleDownloadPlan}
							title="下载完整蓝图"
							aria-label="下载完整蓝图"
						>
							<Download className="size-4" />
						</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}
