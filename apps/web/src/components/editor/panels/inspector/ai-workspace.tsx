"use client";

import { useMemo, useState } from "react";
import {
	CheckCircle2,
	ClipboardCheck,
	Cloud,
	Copy,
	Download,
	ExternalLink,
	FileJson,
	Film,
	HardDrive,
	Info,
	ListChecks,
	RotateCcw,
	ShieldCheck,
	Sparkles,
	Timer,
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
		id: "local",
		label: "本地",
		icon: HardDrive,
		description: "只执行浏览器内可撤销步骤",
	},
	{
		id: "hybrid",
		label: "混合",
		icon: Workflow,
		description: "本地整理 + ChatCut 语义任务",
	},
	{
		id: "chatcut",
		label: "ChatCut",
		icon: Cloud,
		description: "优先生成云端交接方案",
	},
];

const QUICK_PROMPTS = [
	"剪成 60 秒抖音竖屏高光，删除停顿，生成字幕",
	"整理成 B 站横屏比赛集锦，保留关键进球和反应镜头",
	"做成小红书 1:1 精华版，节奏紧凑，字幕清楚",
	"先把所有素材顺排成粗剪，收紧片头片尾",
];

const AVAILABILITY_LABELS = {
	ready: "本地可执行",
	handoff: "需 ChatCut 交接",
	blocked: "等待素材",
} as const;

function formatDuration(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0) return "0 秒";
	const minutes = Math.floor(seconds / 60);
	const remaining = Math.round(seconds % 60);
	if (minutes === 0) return `${remaining} 秒`;
	return `${minutes}:${remaining.toString().padStart(2, "0")}`;
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
	const selectedMode = MODES.find((item) => item.id === mode) ?? MODES[1];

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
		const nextPlan = createEditPlan({
			prompt: prompt || "整理现有素材并生成一版可审阅的粗剪",
			mode,
			assetCount: assets.length,
			unusedAssetCount,
			timelineElementCount: timelineElements.length,
			videoClipCount,
			durationSeconds,
		});
		setPlan(nextPlan);
		setCanUndoPlan(false);
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
				description: "可以粘贴到已启用 ChatCut 插件的 Codex 任务中。",
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
		<div className="flex h-full min-h-0 flex-col">
			<ScrollArea className="min-h-0 flex-1">
				<div className="space-y-4 p-3">
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
						<div className="flex items-center justify-between gap-2">
							<div className="flex min-w-0 items-center gap-2">
								<ShieldCheck className="size-4 shrink-0 text-emerald-600" />
								<div className="min-w-0">
									<p className="truncate text-xs font-medium">
										{selectedMode.description}
									</p>
									<p className="text-[11px] text-muted-foreground">
										{assets.length} 素材 / {timelineElements.length} 片段 /{" "}
										{formatDuration(durationSeconds)}
									</p>
								</div>
							</div>
							<a
								href="https://github.com/ChatCut-Inc/agent-plugin"
								target="_blank"
								rel="noreferrer"
								className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
							>
								插件
								<ExternalLink className="size-3" />
							</a>
						</div>
					</div>

					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<label htmlFor="ai-edit-prompt" className="text-xs font-medium">
								剪辑目标
							</label>
							<span className="text-[11px] text-muted-foreground">
								{unusedAssetCount} 个素材未上时间线
							</span>
						</div>
						<Textarea
							id="ai-edit-prompt"
							value={prompt}
							onChange={(event) => {
								setPrompt(event.target.value);
								setPlan(null);
							}}
							placeholder="例如：删除停顿，剪成 60 秒竖屏精华并生成字幕"
							className="min-h-24 resize-none text-sm"
						/>
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
						<Button className="w-full" onClick={handleCreatePlan}>
							<Sparkles className="size-4" />
							生成剪辑方案
						</Button>
					</div>

					{plan ? (
						<div className="space-y-3">
							<div className="rounded-md border p-3">
								<div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
									<Film className="size-3.5" />
									成片目标
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
										云端
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
							应用本地步骤
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
							复制 ChatCut 任务
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
