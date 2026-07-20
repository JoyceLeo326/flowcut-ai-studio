"use client";

import { useMemo, useState } from "react";
import {
	Brain,
	CheckCircle2,
	ClipboardCheck,
	Cloud,
	Copy,
	Download,
	FileJson,
	Film,
	HardDrive,
	Info,
	ListChecks,
	RotateCcw,
	Sparkles,
	Timer,
	UploadCloud,
	Wand2,
	Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
	applyLocalEditPlan,
	createChatCutHandoff,
	createEditPlan,
	formatChatCutTask,
	type EditMode,
	type EditPlan,
	type HandoffMediaItem,
} from "@/ai-edit";
import { useEditor } from "@/editor/use-editor";
import { hasMediaId } from "@/timeline/element-utils";
import type { TimelineElement } from "@/timeline";
import { mediaTimeToSeconds } from "@/wasm";
import { cn } from "@/utils/ui";

const MODES: Array<{
	id: EditMode;
	label: string;
	icon: typeof HardDrive;
	description: string;
}> = [
	{
		id: "hybrid",
		label: "智能混剪",
		icon: Workflow,
		description: "本地排布和画幅先执行，字幕、停顿和语义精选交给 ChatCut。",
	},
	{
		id: "local",
		label: "本地粗剪",
		icon: HardDrive,
		description: "只做浏览器内可撤销的顺排、收紧和画幅调整。",
	},
	{
		id: "chatcut",
		label: "云端精剪",
		icon: Cloud,
		description: "优先生成 ChatCut 交接任务，适合长视频语义识别。",
	},
];

const QUICK_PROMPTS = [
	"识别所有视频，剪成 60 秒竖屏高光，删除停顿并生成字幕",
	"根据比赛内容自动挑精彩瞬间，做成横屏集锦",
	"把口播素材剪成小红书 1:1 精华版，保留重点，字幕清楚",
	"先把所有素材顺排成粗剪，收紧片头片尾，方便我再微调",
];

const AVAILABILITY_LABELS = {
	ready: "本地可执行",
	handoff: "需 ChatCut 识别",
	blocked: "等待素材",
} as const;

function formatDuration(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0) return "0 秒";
	const minutes = Math.floor(seconds / 60);
	const remaining = Math.round(seconds % 60);
	if (minutes === 0) return `${remaining} 秒`;
	return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

function pluralLabel({ count, label }: { count: number; label: string }) {
	return `${count} ${label}`;
}

export function AIWorkspacePanel() {
	const editor = useEditor();
	const assets = useEditor((value) => value.media.getAssets());
	const scene = useEditor((value) => value.scenes.getActiveSceneOrNull());
	const project = useEditor((value) => value.project.getActive());
	const [mode, setMode] = useState<EditMode>("hybrid");
	const [prompt, setPrompt] = useState("");
	const [plan, setPlan] = useState<EditPlan | null>(null);
	const [canUndoPlan, setCanUndoPlan] = useState(false);

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
	const unusedAssetCount = assets.filter((asset) => !usedMediaIds.has(asset.id))
		.length;
	const videoAssetCount = assets.filter((asset) => asset.type === "video").length;
	const audioAssetCount = assets.filter((asset) => asset.type === "audio").length;
	const imageAssetCount = assets.filter((asset) => asset.type === "image").length;
	const selectedMode = MODES.find((item) => item.id === mode) ?? MODES[0];
	const hasAssets = assets.length > 0;

	const recommendedPrompt = useMemo(() => {
		if (!hasAssets) return "先导入视频片段，再让 AI 识别并设计剪辑。";
		const mediaShape = [
			videoAssetCount > 0
				? pluralLabel({ count: videoAssetCount, label: "段视频" })
				: null,
			audioAssetCount > 0
				? pluralLabel({ count: audioAssetCount, label: "段音频" })
				: null,
			imageAssetCount > 0
				? pluralLabel({ count: imageAssetCount, label: "张图片" })
				: null,
		]
			.filter(Boolean)
			.join("、");
		const base = `识别 ${mediaShape}，自动设计一版节奏清楚的剪辑`;
		if (durationSeconds > 180) {
			return `${base}，剪成 60 秒精华，删除停顿，生成字幕`;
		}
		return `${base}，先顺排素材，收紧片头片尾，设置适合发布的画幅`;
	}, [audioAssetCount, durationSeconds, hasAssets, imageAssetCount, videoAssetCount]);

	const createPlanFromPrompt = ({ nextPrompt }: { nextPrompt: string }) => {
		const nextPlan = createEditPlan({
			prompt: nextPrompt,
			mode,
			assetCount: assets.length,
			unusedAssetCount,
			timelineElementCount: timelineElements.length,
			videoClipCount,
			durationSeconds,
		});
		setPrompt(nextPrompt);
		setPlan(nextPlan);
		setCanUndoPlan(false);
	};

	const handleModeChange = (nextMode: EditMode) => {
		setMode(nextMode);
		setPlan(null);
		setCanUndoPlan(false);
	};

	const handlePromptPreset = (value: string) => {
		setPrompt(value);
		setPlan(null);
		setCanUndoPlan(false);
	};

	const handleCreatePlan = () => {
		createPlanFromPrompt({
			nextPrompt: prompt || recommendedPrompt,
		});
	};

	const toggleStep = ({ id, enabled }: { id: string; enabled: boolean }) => {
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
	};

	const handleApplyLocal = () => {
		if (!plan) return;
		const result = applyLocalEditPlan({ editor, plan });
		if (result.commandCount === 0) {
			toast.info("没有可执行的本地步骤");
			return;
		}
		setCanUndoPlan(true);
		toast.success(`已执行 ${result.appliedStepCount} 个本地步骤`, {
			description: "这组修改可以一次撤销。",
		});
	};

	const handleUndo = () => {
		editor.command.undo();
		setCanUndoPlan(false);
		toast.success("已撤销本次本地方案");
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
		const handoff = buildHandoff();
		if (!handoff || handoff.requestedSteps.length === 0) return;
		try {
			await navigator.clipboard.writeText(formatChatCutTask(handoff));
			toast.success("ChatCut 任务已复制", {
				description: "粘贴到启用 ChatCut 插件的任务中即可继续云端识别。",
			});
		} catch {
			toast.error("浏览器不允许写入剪贴板，请下载交接包");
		}
	};

	const handleDownloadHandoff = () => {
		const handoff = buildHandoff();
		if (!handoff) return;
		const url = URL.createObjectURL(
			new Blob([JSON.stringify(handoff, null, 2)], {
				type: "application/json",
			}),
		);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `flowcut-chatcut-${project?.metadata.id ?? "project"}.json`;
		anchor.click();
		URL.revokeObjectURL(url);
	};

	const handleDownloadPlan = () => {
		if (!plan) return;
		const url = URL.createObjectURL(
			new Blob([JSON.stringify(plan, null, 2)], {
				type: "application/json",
			}),
		);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `flowcut-plan-${project?.metadata.id ?? "project"}.json`;
		anchor.click();
		URL.revokeObjectURL(url);
	};

	const enabledSteps = plan?.steps.filter((step) => step.enabled) ?? [];
	const readySteps = enabledSteps.filter(
		(step) => step.executor === "local" && step.availability === "ready",
	);
	const chatCutSteps = enabledSteps.filter((step) => step.executor === "chatcut");
	const blockedSteps = enabledSteps.filter((step) => step.availability === "blocked");
	const hasLocalSteps = readySteps.length > 0;
	const hasChatCutSteps = chatCutSteps.length > 0;

	return (
		<div className="flex h-full min-h-0 flex-col bg-background">
			<ScrollArea className="min-h-0 flex-1">
				<div className="space-y-4 p-3">
					<div className="rounded-md border bg-muted/30 p-3">
						<div className="flex items-start gap-3">
							<div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
								<Brain className="size-5" />
							</div>
							<div className="min-w-0 flex-1">
								<h2 className="text-sm font-semibold">AI 剪辑导演</h2>
								<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
									把视频片段导入素材区，AI 会先读素材结构，再设计剪辑方案。你确认后再执行本地步骤或交给 ChatCut 做语义识别。
								</p>
							</div>
						</div>
					</div>

					<div className="grid grid-cols-3 gap-2 text-[11px]">
						<div className="rounded-md border p-2">
							<p className="text-muted-foreground">视频</p>
							<p className="mt-1 text-base font-semibold">{videoAssetCount}</p>
						</div>
						<div className="rounded-md border p-2">
							<p className="text-muted-foreground">音频</p>
							<p className="mt-1 text-base font-semibold">{audioAssetCount}</p>
						</div>
						<div className="rounded-md border p-2">
							<p className="text-muted-foreground">时间线</p>
							<p className="mt-1 text-base font-semibold">
								{formatDuration(durationSeconds)}
							</p>
						</div>
					</div>

					<div className="grid grid-cols-3 gap-1 rounded-md border bg-muted/40 p-1">
						{MODES.map((item) => {
							const Icon = item.icon;
							return (
								<Button
									key={item.id}
									variant={mode === item.id ? "secondary" : "ghost"}
									size="sm"
									className="h-8 gap-1 px-1 text-xs"
									onClick={() => handleModeChange(item.id)}
									title={item.description}
								>
									<Icon className="size-3.5" />
									{item.label}
								</Button>
							);
						})}
					</div>

					<div className="rounded-md border bg-muted/20 p-2.5">
						<div className="flex min-w-0 items-center gap-2">
							<Sparkles className="size-4 shrink-0 text-primary" />
							<div className="min-w-0">
								<p className="truncate text-xs font-medium">
									{selectedMode.description}
								</p>
								<p className="text-[11px] text-muted-foreground">
									{assets.length} 个素材 / {unusedAssetCount} 个待上时间线
								</p>
							</div>
						</div>
					</div>

					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<label htmlFor="ai-edit-prompt" className="text-xs font-medium">
								AI 要剪成什么样
							</label>
							<span className="text-[11px] text-muted-foreground">
								可直接用推荐目标
							</span>
						</div>
						<Textarea
							id="ai-edit-prompt"
							value={prompt}
							onChange={(event) => {
								setPrompt(event.target.value);
								setPlan(null);
							}}
							placeholder={recommendedPrompt}
							className="min-h-24 resize-none text-sm"
						/>
						<Button
							className="w-full"
							onClick={() =>
								createPlanFromPrompt({ nextPrompt: prompt || recommendedPrompt })
							}
						>
							<Wand2 className="size-4" />
							AI 识别素材并设计剪辑
						</Button>
						{!hasAssets ? (
							<div className="rounded-md border border-dashed p-3 text-xs leading-relaxed text-muted-foreground">
								<div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
									<UploadCloud className="size-4" />
									先导入视频片段
								</div>
								切到“素材”页，把多个视频、音频或图片丢进去；回到 AI 页后点击上面的按钮。
							</div>
						) : null}
						<div className="grid gap-1.5">
							{QUICK_PROMPTS.map((item) => (
								<Button
									key={item}
									variant="ghost"
									size="sm"
									className="h-auto justify-start whitespace-normal px-2 py-1.5 text-left text-[11px] leading-snug text-muted-foreground"
									onClick={() => handlePromptPreset(item)}
								>
									{item}
								</Button>
							))}
						</div>
						<Button variant="outline" className="w-full" onClick={handleCreatePlan}>
							<Sparkles className="size-4" />
							只生成方案，不执行
						</Button>
					</div>

					{plan ? (
						<div className="space-y-3">
							<div className="rounded-md border p-3">
								<div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
									<Film className="size-3.5" />
									AI 设计结果
								</div>
								<p className="text-xs leading-relaxed text-muted-foreground">
									{plan.summary}
								</p>
								<div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
									<div className="rounded-md bg-muted/50 p-2">
										<p className="text-muted-foreground">平台</p>
										<p className="truncate font-medium">{plan.target.label}</p>
									</div>
									<div className="rounded-md bg-muted/50 p-2">
										<p className="text-muted-foreground">画幅</p>
										<p className="font-medium">{plan.target.aspectRatio}</p>
									</div>
									<div className="rounded-md bg-muted/50 p-2">
										<p className="text-muted-foreground">时长</p>
										<p className="font-medium">
											{plan.target.targetDurationSeconds
												? `${plan.target.targetDurationSeconds} 秒`
												: "自适应"}
										</p>
									</div>
								</div>
							</div>

							<div className="grid grid-cols-3 gap-2 text-[11px]">
								<div className="rounded-md border p-2">
									<div className="flex items-center gap-1 text-emerald-600">
										<HardDrive className="size-3.5" />
										本地
									</div>
									<p className="mt-1 text-base font-semibold">{readySteps.length}</p>
								</div>
								<div className="rounded-md border p-2">
									<div className="flex items-center gap-1 text-sky-600">
										<Cloud className="size-3.5" />
										识别
									</div>
									<p className="mt-1 text-base font-semibold">{chatCutSteps.length}</p>
								</div>
								<div className="rounded-md border p-2">
									<div className="flex items-center gap-1 text-amber-600">
										<Info className="size-3.5" />
										阻塞
									</div>
									<p className="mt-1 text-base font-semibold">{blockedSteps.length}</p>
								</div>
							</div>

							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<h3 className="flex items-center gap-1.5 text-xs font-semibold">
										<ListChecks className="size-3.5" />
										执行计划
									</h3>
									<span className="text-[11px] text-muted-foreground">
										{plan.steps.length} 步
									</span>
								</div>
								<div className="divide-y rounded-md border">
									{plan.steps.map((step) => {
										const isDisabled = step.availability === "blocked";
										return (
											<div
												key={step.id}
												className={cn(
													"flex gap-2.5 p-2.5",
													isDisabled && "opacity-60",
												)}
											>
												<Checkbox
													checked={step.enabled}
													disabled={isDisabled}
													onCheckedChange={(checked) =>
														toggleStep({ id: step.id, enabled: checked === true })
													}
													className="mt-0.5"
												/>
												<span className="min-w-0 space-y-1">
													<span className="block text-xs font-medium">
														{step.title}
													</span>
													<span className="block text-[11px] leading-relaxed text-muted-foreground">
														{step.description}
													</span>
													<span
														className={cn(
															"inline-flex items-center gap-1 text-[10px]",
															step.executor === "local"
																? "text-emerald-600"
																: "text-sky-600",
														)}
													>
														{step.executor === "local" ? (
															<CheckCircle2 className="size-3" />
														) : (
															<Cloud className="size-3" />
														)}
														{AVAILABILITY_LABELS[step.availability]}
													</span>
												</span>
											</div>
										);
									})}
								</div>
							</div>

							<div className="rounded-md border p-3">
								<div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
									<ClipboardCheck className="size-3.5" />
									交付检查
								</div>
								<ul className="space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
									{plan.reviewChecklist.map((item) => (
										<li key={item} className="flex gap-1.5">
											<CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-600" />
											<span>{item}</span>
										</li>
									))}
								</ul>
							</div>

							<div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 text-[11px] leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
								<div className="mb-1.5 flex items-center gap-1.5 font-medium">
									<Timer className="size-3.5" />
									注意
								</div>
								{plan.riskNotes.join(" ")}
							</div>
						</div>
					) : null}
				</div>
			</ScrollArea>

			{plan ? (
				<div className="grid shrink-0 gap-2 border-t bg-background p-3">
					<div className="flex gap-2">
						<Button
							className="min-w-0 flex-1"
							disabled={!hasLocalSteps}
							onClick={handleApplyLocal}
						>
							<HardDrive className="size-4" />
							执行本地剪辑
						</Button>
						<Button
							variant="outline"
							size="icon"
							disabled={!canUndoPlan}
							onClick={handleUndo}
							title="撤销本次方案"
							aria-label="撤销本次方案"
						>
							<RotateCcw className="size-4" />
						</Button>
					</div>
					<div className="flex gap-2">
						<Button
							variant="secondary"
							className="min-w-0 flex-1"
							disabled={!hasChatCutSteps}
							onClick={handleCopyHandoff}
						>
							<Copy className="size-4" />
							交给 ChatCut 识别
						</Button>
						<Button
							variant="outline"
							size="icon"
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
							disabled={!plan}
							onClick={handleDownloadPlan}
							title="下载完整方案 JSON"
							aria-label="下载完整方案 JSON"
						>
							<Download className="size-4" />
						</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}
