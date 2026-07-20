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
	MousePointerClick,
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

const STYLE_PRESETS = [
	{
		name: "快节奏高光",
		tone: "强开头、短镜头、保留欢呼和反应",
		accent: "bg-sky-500",
	},
	{
		name: "清晰口播",
		tone: "删停顿、保逻辑、字幕优先",
		accent: "bg-emerald-500",
	},
	{
		name: "比赛复盘",
		tone: "按时间线叙事，穿插关键慢镜和说明",
		accent: "bg-amber-500",
	},
	{
		name: "社媒种草",
		tone: "第一秒给结果，画幅适配移动端",
		accent: "bg-rose-500",
	},
];

const WORKFLOW_STEPS = [
	{
		title: "甩入素材",
		description: "把大段视频、补充音频、封面图放到素材页。",
	},
	{
		title: "AI 识别",
		description: "读取素材数量、类型、总时长和时间线状态。",
	},
	{
		title: "设计剪法",
		description: "确定平台画幅、目标时长、节奏策略和执行步骤。",
	},
	{
		title: "确认执行",
		description: "本地步骤可撤销；字幕、停顿和语义精选交给 ChatCut。",
	},
];

const AVAILABILITY_LABELS = {
	ready: "本地可执行",
	handoff: "需 ChatCut 识别",
	blocked: "等待素材",
} as const;

const BEGINNER_STEPS = [
	{
		title: "1. 先把素材丢进来",
		body: "切到素材页，拖入几个大视频片段、解说音频或封面图。没有素材时 AI 只会给导入建议。",
	},
	{
		title: "2. 不会描述就用推荐目标",
		body: "点击“套用推荐目标”，AI 会按素材数量、时长和当前时间线自动生成一版剪辑意图。",
	},
	{
		title: "3. 先看方案再执行",
		body: "AI 会列出本地可做的步骤和需要 ChatCut 识别的步骤，你确认后才会改时间线。",
	},
	{
		title: "4. 预览满意再导出",
		body: "先执行本地剪辑，再去预览检查画面、节奏、字幕需求，最后导出成片。",
	},
] as const;

const BEGINNER_GLOSSARY = [
	"本地剪辑：只在当前浏览器处理，不会自动上传。",
	"ChatCut 识别：用于字幕、停顿、语义高光，需要你确认后再交接。",
	"时间线：视频片段最终排列的位置，可以继续手动微调。",
	"画幅：横屏、竖屏或方形，决定发到哪个平台更合适。",
] as const;

const SAFETY_PROMISES = [
	"本地步骤会作为一次操作执行，可以撤销。",
	"云端识别前会生成交接包，不会静默上传素材。",
	"导出前建议先预览完整片段，确认没有裁切错误。",
] as const;

const BEGINNER_PROMPTS = [
	"我不知道怎么剪，请帮我从这些视频里找出最精彩的片段，做成一版 60 秒以内的竖屏短视频。",
	"请先帮我整理素材顺序，删掉明显无效的开头结尾，保留自然节奏，方便我继续微调。",
	"请按比赛/活动复盘的逻辑剪：开场给结果，中间放关键过程，结尾保留最有记忆点的画面。",
] as const;

const MOTION_STYLE_NOTES = [
	"开场 3 秒用更快切换和字幕重点，先告诉观众结果。",
	"高潮片段前后留 0.3-0.8 秒呼吸，不让转场显得突兀。",
	"口播内容优先做停顿压缩，B-roll 或反应镜头用于遮挡跳切。",
	"移动端优先竖屏安全区，字幕和主体不要贴边。",
] as const;

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
	const estimatedTotalAssetDuration = assets.reduce(
		(total, asset) => total + (asset.duration ?? 0),
		0,
	);

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

	const aiInsights = useMemo(() => {
		if (!hasAssets) {
			return [
				"当前还没有素材，AI 只能生成导入提示。",
				"建议先放入 2-10 段视频，包含主镜头、反应镜头和补充素材。",
				"如果需要自动字幕或按内容挑片段，需要准备带人声的视频或音频。",
			];
		}

		const insights = [
			`已识别 ${videoAssetCount} 段视频、${audioAssetCount} 段音频、${imageAssetCount} 张图片。`,
			unusedAssetCount > 0
				? `${unusedAssetCount} 个素材还没进入时间线，AI 会优先安排它们。`
				: "素材已经在时间线上，AI 会优先做画幅、节奏和交接规划。",
		];

		if (estimatedTotalAssetDuration > 0) {
			insights.push(
				`素材总时长约 ${formatDuration(estimatedTotalAssetDuration)}，适合先做粗剪再精修。`,
			);
		}
		if (videoAssetCount >= 3) {
			insights.push("多段视频适合做自动顺排、精彩片段筛选和平台化成片。");
		}
		if (audioAssetCount > 0 || estimatedTotalAssetDuration > 120) {
			insights.push("检测停顿、转录字幕和语义精选建议交给 ChatCut 处理。");
		}
		return insights;
	}, [
		audioAssetCount,
		estimatedTotalAssetDuration,
		hasAssets,
		imageAssetCount,
		unusedAssetCount,
		videoAssetCount,
	]);

	const strategyCards = [
		{
			title: "短视频精华",
			body: "适合抖音、小红书、Shorts。优先竖屏/方形画幅、强节奏、字幕和停顿处理。",
		},
		{
			title: "横屏集锦",
			body: "适合 B 站、YouTube、比赛复盘。优先主线叙事、精彩片段和反应镜头。",
		},
		{
			title: "本地粗剪",
			body: "适合先整理素材。顺排、收紧片头片尾、设置画幅，所有本地步骤可撤销。",
		},
	];
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
	const nextActions = plan
		? [
				hasLocalSteps
					? "先点“执行本地剪辑”，让素材自动顺排、收紧并套用画幅。"
					: null,
				hasChatCutSteps
					? "再点“交给 ChatCut 识别”，把字幕、停顿、语义精选交给云端。"
					: null,
				"切到“预览”检查画面是否裁切正确，再切到“时间线”微调片段。",
				"确认后点右上角 Export 导出 MP4/WebM。",
			].filter(Boolean)
		: [];

	return (
		<div className="flowcut-ai-shell flex h-full min-h-0 flex-col">
			<ScrollArea className="min-h-0 flex-1">
				<div className="space-y-4 p-3">
					<div className="flowcut-ai-hero rounded-md border p-3">
						<div className="flex items-start gap-3">
							<div className="flowcut-ai-pulse flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
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

					<div className="flowcut-ai-card rounded-md border bg-background/75 p-3">
						<div className="mb-3 flex items-center gap-1.5 text-xs font-semibold">
							<Sparkles className="size-3.5 text-primary" />
							新手模式：不用懂剪辑术语
						</div>
						<div className="grid gap-2">
							{BEGINNER_STEPS.map((step) => (
								<div
									key={step.title}
									className="rounded-md border bg-muted/20 p-2"
								>
									<p className="text-xs font-medium">{step.title}</p>
									<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
										{step.body}
									</p>
								</div>
							))}
						</div>
						<div className="mt-3 grid gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
							{SAFETY_PROMISES.map((item) => (
								<div key={item} className="flex gap-1.5">
									<CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-600" />
									<span>{item}</span>
								</div>
							))}
						</div>
					</div>

					<div className="flowcut-ai-card rounded-md border bg-background/75 p-3">
						<div className="mb-3 flex items-center gap-1.5 text-xs font-semibold">
							<MousePointerClick className="size-3.5" />
							操作流程
						</div>
						<div className="grid gap-2">
							{WORKFLOW_STEPS.map((step, index) => (
								<div key={step.title} className="flex gap-2">
									<div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
										{index + 1}
									</div>
									<div className="min-w-0">
										<p className="text-xs font-medium">{step.title}</p>
										<p className="text-[11px] leading-relaxed text-muted-foreground">
											{step.description}
										</p>
									</div>
								</div>
							))}
						</div>
					</div>

					<div className="grid grid-cols-3 gap-2 text-[11px]">
						<div className="flowcut-ai-card rounded-md border bg-background/75 p-2">
							<p className="text-muted-foreground">视频</p>
							<p className="mt-1 text-base font-semibold">{videoAssetCount}</p>
						</div>
						<div className="flowcut-ai-card rounded-md border bg-background/75 p-2">
							<p className="text-muted-foreground">音频</p>
							<p className="mt-1 text-base font-semibold">{audioAssetCount}</p>
						</div>
						<div className="flowcut-ai-card rounded-md border bg-background/75 p-2">
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

					<div className="flowcut-ai-card rounded-md border bg-background/75 p-2.5">
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

					<div className="flowcut-ai-card rounded-md border bg-background/75 p-3">
						<div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
							<Brain className="size-3.5" />
							AI 已读到的信息
						</div>
						<ul className="space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
							{aiInsights.map((item) => (
								<li key={item} className="flex gap-1.5">
									<CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-600" />
									<span>{item}</span>
								</li>
							))}
						</ul>
					</div>

					<div className="grid gap-2">
						{strategyCards.map((item) => (
							<div
								key={item.title}
								className="flowcut-ai-card rounded-md border bg-background/75 p-3"
							>
								<p className="text-xs font-semibold">{item.title}</p>
								<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
									{item.body}
								</p>
							</div>
						))}
					</div>

					<div className="flowcut-ai-card rounded-md border bg-background/75 p-3">
						<div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
							<Info className="size-3.5" />
							小白术语翻译
						</div>
						<div className="grid gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
							{BEGINNER_GLOSSARY.map((item) => (
								<div key={item} className="rounded-md bg-muted/30 px-2 py-1.5">
									{item}
								</div>
							))}
						</div>
					</div>

					<div className="flowcut-ai-card flowcut-ai-motion-card rounded-md border bg-background/75 p-3">
						<div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
							<Timer className="size-3.5 text-primary" />
							风格和动效设计规则
						</div>
						<ul className="space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
							{MOTION_STYLE_NOTES.map((item) => (
								<li key={item} className="flex gap-1.5">
									<span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
									<span>{item}</span>
								</li>
							))}
						</ul>
					</div>

					<div className="flowcut-ai-card rounded-md border bg-background/75 p-3">
						<div className="mb-3 flex items-center gap-1.5 text-xs font-semibold">
							<Film className="size-3.5" />
							可选剪辑风格
						</div>
						<div className="grid gap-2">
							{STYLE_PRESETS.map((item) => (
								<button
									key={item.name}
									type="button"
									className="flex items-center gap-2 rounded-md border bg-muted/20 p-2 text-left transition hover:border-primary/40 hover:bg-secondary/70"
									onClick={() => handlePromptPreset(`${recommendedPrompt}，风格：${item.name}，${item.tone}`)}
								>
									<span className={cn("size-2.5 shrink-0 rounded-full", item.accent)} />
									<span className="min-w-0">
										<span className="block text-xs font-medium">{item.name}</span>
										<span className="block text-[11px] leading-relaxed text-muted-foreground">
											{item.tone}
										</span>
									</span>
								</button>
							))}
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
						<div className="grid grid-cols-2 gap-2">
							<Button
								variant="secondary"
								size="sm"
								className="h-auto min-h-9 whitespace-normal text-xs"
								onClick={() => handlePromptPreset(recommendedPrompt)}
							>
								<Sparkles className="size-3.5" />
								套用推荐目标
							</Button>
							<Button
								variant="outline"
								size="sm"
								className="h-auto min-h-9 whitespace-normal text-xs"
								onClick={() => handlePromptPreset(BEGINNER_PROMPTS[0])}
							>
								<Wand2 className="size-3.5" />
								我不知道怎么剪
							</Button>
						</div>
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
							{BEGINNER_PROMPTS.map((item) => (
								<Button
									key={item}
									variant="secondary"
									size="sm"
									className="h-auto justify-start whitespace-normal px-2 py-1.5 text-left text-[11px] leading-snug"
									onClick={() => handlePromptPreset(item)}
								>
									{item}
								</Button>
							))}
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
							<div className="flowcut-ai-card rounded-md border bg-background/75 p-3">
								<div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
									<Film className="size-3.5" />
									AI 设计结果
								</div>
								<p className="text-xs leading-relaxed text-muted-foreground">
									{plan.summary}
								</p>
								<div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
									<div className="rounded-md border bg-muted/35 p-2">
										<p className="text-muted-foreground">平台</p>
										<p className="truncate font-medium">{plan.target.label}</p>
									</div>
									<div className="rounded-md border bg-muted/35 p-2">
										<p className="text-muted-foreground">画幅</p>
										<p className="font-medium">{plan.target.aspectRatio}</p>
									</div>
									<div className="rounded-md border bg-muted/35 p-2">
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
								<div className="flowcut-ai-card rounded-md border bg-background/75 p-2">
									<div className="flex items-center gap-1 text-emerald-600">
										<HardDrive className="size-3.5" />
										本地
									</div>
									<p className="mt-1 text-base font-semibold">{readySteps.length}</p>
								</div>
								<div className="flowcut-ai-card rounded-md border bg-background/75 p-2">
									<div className="flex items-center gap-1 text-sky-600">
										<Cloud className="size-3.5" />
										识别
									</div>
									<p className="mt-1 text-base font-semibold">{chatCutSteps.length}</p>
								</div>
								<div className="flowcut-ai-card rounded-md border bg-background/75 p-2">
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

							<div className="flowcut-ai-card rounded-md border bg-background/75 p-3">
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

							<div className="flowcut-ai-card rounded-md border bg-background/75 p-3">
								<div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
									<MousePointerClick className="size-3.5" />
									下一步怎么做
								</div>
								<ol className="space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
									{nextActions.map((item, index) => (
										<li key={item} className="flex gap-1.5">
											<span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
												{index + 1}
											</span>
											<span>{item}</span>
										</li>
									))}
								</ol>
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
