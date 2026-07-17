"use client";

import { useMemo, useState } from "react";
import {
	CheckCircle2,
	Cloud,
	Copy,
	Download,
	ExternalLink,
	HardDrive,
	RotateCcw,
	ShieldCheck,
	Sparkles,
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
}> = [
	{ id: "local", label: "本地", icon: HardDrive },
	{ id: "hybrid", label: "混合", icon: Workflow },
	{ id: "chatcut", label: "ChatCut", icon: Cloud },
];

const AVAILABILITY_LABELS = {
	ready: "本地可执行",
	handoff: "需 ChatCut 交接",
	blocked: "等待素材",
} as const;

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

	const handleModeChange = (nextMode: EditMode) => {
		setMode(nextMode);
		setPlan(null);
		setCanUndoPlan(false);
	};

	const handleCreatePlan = () => {
		const nextPlan = createEditPlan({
			prompt: prompt || "整理现有素材并生成一版可审阅的粗剪",
			mode,
			assetCount: assets.length,
			unusedAssetCount: assets.filter((asset) => !usedMediaIds.has(asset.id))
				.length,
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
				description: "可直接粘贴到已启用 ChatCut 插件的 Codex 任务中。",
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

	const hasLocalSteps =
		plan?.steps.some(
			(step) =>
				step.enabled &&
				step.executor === "local" &&
				step.availability === "ready",
		) ?? false;
	const hasChatCutSteps =
		plan?.steps.some((step) => step.enabled && step.executor === "chatcut") ??
		false;

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
									className="h-7 gap-1 px-1 text-xs"
									onClick={() => handleModeChange(item.id)}
								>
									<Icon className="size-3.5" />
									{item.label}
								</Button>
							);
						})}
					</div>

					<div className="flex items-center justify-between border-b pb-3 text-xs">
						<div className="flex items-center gap-1.5 text-muted-foreground">
							<ShieldCheck className="size-3.5 text-emerald-600" />
							{mode === "local" ? "素材仅在本地" : "云端步骤需单独确认"}
						</div>
						<a
							href="https://github.com/ChatCut-Inc/agent-plugin"
							target="_blank"
							rel="noreferrer"
							className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
						>
							官方插件
							<ExternalLink className="size-3" />
						</a>
					</div>

					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<label htmlFor="ai-edit-prompt" className="text-xs font-medium">
								剪辑目标
							</label>
							<span className="text-[11px] text-muted-foreground">
								{assets.length} 素材 · {timelineElements.length} 片段
							</span>
						</div>
						<Textarea
							id="ai-edit-prompt"
							value={prompt}
							onChange={(event) => setPrompt(event.target.value)}
							placeholder="例如：删除停顿，剪成 60 秒竖屏精华并生成字幕"
							className="min-h-24 resize-none text-sm"
						/>
						<Button className="w-full" onClick={handleCreatePlan}>
							<Sparkles className="size-4" />
							生成剪辑方案
						</Button>
					</div>

					{plan ? (
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<h3 className="text-xs font-semibold">执行计划</h3>
								<span className="text-[11px] text-muted-foreground">
									{plan.steps.length} 步
								</span>
							</div>
							<div className="divide-y rounded-md border">
								{plan.steps.map((step) => {
									const isDisabled = step.availability === "blocked";
									return (
										<label
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
										</label>
									);
								})}
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
							<Download className="size-4" />
						</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}
