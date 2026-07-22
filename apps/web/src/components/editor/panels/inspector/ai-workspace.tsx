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
	Fingerprint,
	FolderOpen,
	Gauge,
	HardDrive,
	Headphones,
	Info,
	Layers3,
	ListChecks,
	Loader2,
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
import {
	hasCreatorDNAPlanEvidence,
	loadCreatorDNA,
	rememberConfirmedPlan,
} from "@/ai-studio/creator-dna";
import {
	approveAutomationRun,
	createAutomationRun as createAutomationRunRecord,
	startAutomationRun,
	submitAutomationRunForReview,
	type AutomationRun as AutomationRunRecord,
} from "@/ai-studio/automation-run";
import {
	completeWithLocalRules,
	isRemoteModelProvider,
	loadModelProviderSession,
} from "@/ai-studio/model-provider";
import { loadIntentSpec, type IntentSpec } from "@/ai-studio/intent-spec";
import {
	createAgentOrchestration,
	type AgentEvidenceInput,
	type AgentOrchestration,
} from "@/ai-studio/agent-orchestrator";
import {
	createVersionedEditPlan,
	getEditPlanOperations,
	type VersionedEditPlan,
} from "@/ai-studio/edit-plan";
import {
	deriveStoryGraph,
	type StoryGraph,
	type StoryGraphTimelineTrackSnapshot,
} from "@/ai-studio/story-graph-model";
import {
	appendStoryGraphVersion,
	loadStoryGraph,
} from "@/ai-studio/story-graph-store";
import {
	createExportManifest,
	type ExportAspectRatio,
	type ExportManifest,
	type ExportTimelineTrackSnapshot,
} from "@/ai-studio/export-manifest";
import {
	appendProjectVersion,
	type ProjectVersionReferencePatch,
	type ProjectVersionSource,
} from "@/ai-studio/project-version-store";
import {
	requestMediaImport,
	requestNativeExport,
} from "@/editor/navigation-events";
import { useEditor } from "@/editor/use-editor";
import type { TimelineElement, TimelineTrack } from "@/timeline";
import { hasMediaId } from "@/timeline/element-utils";
import { cn } from "@/utils/ui";
import { mediaTimeToSeconds } from "@/wasm";
import {
	getRecipeBriefPatch,
	type AutomationRecipeId,
	type StudioProSettings,
} from "@/ai-studio/catalog";
import type { OpenverseSearchItem } from "@/ai-studio/openverse";
import {
	AIProductStudio,
	StudioBackButton,
} from "@/components/editor/panels/inspector/ai-product-studio";
import {
	VisionCutModelCenter,
	type ModelSelectionSummary,
} from "@/components/editor/panels/inspector/visioncut-model-center";
import { VisionCutOperationReview } from "@/components/editor/panels/inspector/visioncut-operation-review";
import { processMediaAssets } from "@/media/processing";
import { frameRateToFloat } from "@/fps/utils";

const MODES: Array<{
	id: EditMode;
	label: string;
	description: string;
	icon: LucideIcon;
}> = [
	{
		id: "hybrid",
		label: "自带模型增强",
		description:
			"本机先整理；只有你主动请求时，才用当前标签页里的自有 Key 完善蓝图。",
		icon: Workflow,
	},
	{
		id: "local",
		label: "免费本地",
		description: "不调用任何模型 API，只执行当前浏览器已支持的本机步骤。",
		icon: HardDrive,
	},
	{
		id: "chatcut",
		label: "外部 ChatCut",
		description: "只生成可下载的外部交接任务，不会自动上传原素材。",
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
	handoff: "需模型或外部执行",
	blocked: "等待素材",
} as const;

interface DirectorAdvice {
	text: string;
	provider: string;
	model: string;
}

const AUTOMATION_STATUS_LABELS: Record<AutomationRunRecord["status"], string> =
	{
		queued: "排队中",
		running: "生成中",
		review: "待确认",
		failed: "失败",
		done: "已确认",
		cancelled: "已取消",
	};

function nextAutomationTimestamp(updatedAt: string): string {
	return new Date(
		Math.max(Date.now(), new Date(updatedAt).getTime() + 1),
	).toISOString();
}

type DirectorAdviceResponse =
	| { ok: true; advice: DirectorAdvice }
	| { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readDirectorAdviceResponse(
	payload: unknown,
): DirectorAdviceResponse | null {
	if (!isRecord(payload)) return null;
	if (
		payload.ok === true &&
		typeof payload.text === "string" &&
		typeof payload.provider === "string" &&
		typeof payload.model === "string"
	) {
		return {
			ok: true,
			advice: {
				text: payload.text,
				provider: payload.provider,
				model: payload.model,
			},
		};
	}
	if (
		payload.ok === false &&
		isRecord(payload.error) &&
		typeof payload.error.message === "string"
	) {
		return { ok: false, message: payload.error.message };
	}
	return null;
}

function toStoryGraphTrack(
	track: TimelineTrack,
): StoryGraphTimelineTrackSnapshot {
	const elements: StoryGraphTimelineTrackSnapshot["elements"][number][] = [];
	for (const element of track.elements) {
		elements.push({
			id: element.id,
			name: element.name,
			type: element.type,
			...(hasMediaId(element) ? { mediaId: element.mediaId } : {}),
			startTime: mediaTimeToSeconds({ time: element.startTime }),
			duration: mediaTimeToSeconds({ time: element.duration }),
		});
	}
	return {
		id: track.id,
		name: track.name,
		type: track.type,
		elements,
	};
}

function toExportTimelineTrack(
	track: TimelineTrack,
): ExportTimelineTrackSnapshot {
	return {
		id: track.id,
		name: track.name,
		type: track.type,
		...(track.type === "audio" || track.type === "video"
			? { muted: track.muted }
			: {}),
		...(track.type === "audio" ? {} : { hidden: track.hidden }),
		elements: track.elements.map((element) => ({
			id: element.id,
			name: element.name,
			type: element.type,
			...(hasMediaId(element) ? { mediaId: element.mediaId } : {}),
			startTimeSeconds: mediaTimeToSeconds({ time: element.startTime }),
			durationSeconds: mediaTimeToSeconds({ time: element.duration }),
			...("hidden" in element ? { hidden: element.hidden ?? false } : {}),
			...(element.type === "video"
				? { sourceAudioEnabled: element.isSourceAudioEnabled !== false }
				: {}),
		})),
	};
}

function nearestExportAspectRatio({
	width,
	height,
}: {
	width: number;
	height: number;
}): ExportAspectRatio {
	const ratio = width / height;
	const candidates: Array<[ExportAspectRatio, number]> = [
		["16:9", 16 / 9],
		["9:16", 9 / 16],
		["1:1", 1],
		["4:5", 4 / 5],
	];
	return candidates.reduce((nearest, candidate) =>
		Math.abs(candidate[1] - ratio) < Math.abs(nearest[1] - ratio)
			? candidate
			: nearest,
	)[0];
}

function storyGraphEvidenceSignature(graph: StoryGraph): string {
	return JSON.stringify(
		graph.nodes.map((node) => [
			node.id,
			node.assetId ?? null,
			node.timelineStart,
			node.timelineEnd,
			node.evidenceState,
		]),
	);
}

function canRefreshDerivedStoryGraph(graph: StoryGraph): boolean {
	return graph.nodes.every(
		(node) =>
			node.evidenceState !== "manual" && node.evidenceState !== "merged",
	);
}

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

const OPENVERSE_IMAGE_EXTENSIONS: Record<string, string> = {
	"image/avif": "avif",
	"image/gif": "gif",
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
};

function createOpenverseFilename({
	item,
	mimeType,
}: {
	item: OpenverseSearchItem;
	mimeType: string;
}) {
	const extension = OPENVERSE_IMAGE_EXTENSIONS[mimeType];
	if (!extension) throw new Error("该开放素材不是受支持的图片格式");
	const stem = `${item.title}-${item.creator}-${item.license}`
		.normalize("NFKC")
		.replace(/[^\p{L}\p{N}._ -]+/gu, "-")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 96);
	return `${stem || `openverse-${item.id}`}.${extension}`;
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
	const [surface, setSurface] = useState<"studio" | "director" | "models">(
		"studio",
	);
	const [startingIntent, setStartingIntent] = useState("");
	const [intentSpec, setIntentSpec] = useState<IntentSpec | null>(null);
	const [mode, setMode] = useState<EditMode>("local");
	const [brief, setBrief] = useState<CreativeBriefSelection>(() =>
		createDefaultCreativeBrief(),
	);
	const [selectedRecipeId, setSelectedRecipeId] = useState<AutomationRecipeId>(
		"talking-head-cleanup",
	);
	const [extraRequest, setExtraRequest] = useState("");
	const [plan, setPlan] = useState<EditPlan | null>(null);
	const [isPlanReviewed, setIsPlanReviewed] = useState(false);
	const [appliedPlanId, setAppliedPlanId] = useState<string | null>(null);
	const [canUndoPlan, setCanUndoPlan] = useState(false);
	const [rememberedPlanId, setRememberedPlanId] = useState<string | null>(null);
	const [directorAdvice, setDirectorAdvice] = useState<DirectorAdvice | null>(
		null,
	);
	const [isRequestingAdvice, setIsRequestingAdvice] = useState(false);
	const [modelSelection, setModelSelection] =
		useState<ModelSelectionSummary | null>(null);
	const [blueprintRun, setBlueprintRun] = useState<AutomationRunRecord | null>(
		null,
	);
	const [operationPlan, setOperationPlan] = useState<VersionedEditPlan | null>(
		null,
	);
	const [agentOrchestration, setAgentOrchestration] =
		useState<AgentOrchestration | null>(null);
	const planAnchorRef = useRef<HTMLDivElement>(null);
	const versionWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
	const storyGraphWriteQueueRef = useRef<Promise<void>>(Promise.resolve());

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
	const usedMediaCount = assets.length - unusedAssetCount;
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
	const derivedStoryGraph = useMemo(
		() =>
			deriveStoryGraph({
				projectId: project?.metadata.id ?? "local-project",
				media: assets.map((asset) => ({
					id: asset.id,
					name: asset.name,
					type: asset.type,
					...(asset.duration === undefined ? {} : { duration: asset.duration }),
					...(asset.width === undefined ? {} : { width: asset.width }),
					...(asset.height === undefined ? {} : { height: asset.height }),
					...(asset.thumbnailUrl === undefined
						? {}
						: { thumbnailUrl: asset.thumbnailUrl }),
				})),
				scenes: scene
					? [
							{
								id: scene.id,
								name: scene.name,
								isMain: scene.isMain,
								tracks: {
									main: toStoryGraphTrack(scene.tracks.main),
									overlay: scene.tracks.overlay.map(toStoryGraphTrack),
									audio: scene.tracks.audio.map(toStoryGraphTrack),
								},
							},
						]
					: [],
			}),
		[assets, project?.metadata.id, scene],
	);
	const [storyGraph, setStoryGraph] = useState<StoryGraph>(derivedStoryGraph);
	const exportManifest = useMemo<ExportManifest | null>(() => {
		if (!project || !scene) return null;
		const shortTargetSeconds = Math.max(
			1,
			Math.min(durationSeconds > 0 ? durationSeconds : 60, 60),
		);
		const primaryAspectRatio = nearestExportAspectRatio({
			width: project.settings.canvasSize.width,
			height: project.settings.canvasSize.height,
		});
		return createExportManifest({
			project: {
				id: project.metadata.id,
				name: project.metadata.name,
				version: project.version,
				durationSeconds,
				canvasSize: project.settings.canvasSize,
				fps: frameRateToFloat(project.settings.fps),
			},
			media: assets.map((asset) => ({
				id: asset.id,
				name: asset.name,
				type: asset.type,
				sizeBytes: asset.file.size,
				...(asset.duration === undefined
					? {}
					: { durationSeconds: asset.duration }),
				...(asset.width === undefined ? {} : { width: asset.width }),
				...(asset.height === undefined ? {} : { height: asset.height }),
				...(asset.fps === undefined ? {} : { fps: asset.fps }),
				...(asset.hasAudio === undefined ? {} : { hasAudio: asset.hasAudio }),
			})),
			timeline: {
				sceneId: scene.id,
				sceneName: scene.name,
				tracks: [
					toExportTimelineTrack(scene.tracks.main),
					...scene.tracks.overlay.map(toExportTimelineTrack),
					...scene.tracks.audio.map(toExportTimelineTrack),
				],
			},
			variants: [
				{
					id: "primary",
					label: "主版本",
					platform: "generic",
					aspectRatio: primaryAspectRatio,
					subtitles: { mode: "none" },
					audio: { mode: "include", required: false },
					cover: { source: "none", required: false },
				},
				{
					id: "vertical-short",
					label: "竖屏短版",
					platform: "douyin",
					aspectRatio: "9:16",
					targetDurationSeconds: shortTargetSeconds,
					subtitles: { mode: "none" },
					audio: { mode: "include", required: false },
					cover: { source: "none", required: false },
				},
				{
					id: "social-feed",
					label: "图文平台版",
					platform: "xiaohongshu",
					aspectRatio: "4:5",
					targetDurationSeconds: shortTargetSeconds,
					subtitles: { mode: "none" },
					audio: { mode: "include", required: false },
					cover: { source: "none", required: false },
				},
			],
		});
	}, [assets, durationSeconds, project, scene]);
	const agentOrchestrationSeed = useMemo<AgentOrchestration | null>(() => {
		if (!intentSpec) return null;
		const evidence: AgentEvidenceInput[] = assets.flatMap((asset) => [
			{
				evidenceId: `asset-metadata-${asset.id}`,
				kind: "asset-metadata" as const,
				label: `${asset.name} metadata`,
				referenceId: asset.id,
				origin: "project-metadata" as const,
			},
			...(asset.type === "audio" || asset.hasAudio === true
				? [
						{
							evidenceId: `audio-metadata-${asset.id}`,
							kind: "audio-metadata" as const,
							label: `${asset.name} audio metadata`,
							referenceId: asset.id,
							origin: "project-metadata" as const,
						},
					]
				: []),
		]);
		if (intentSpec.target?.platform) {
			evidence.push({
				evidenceId: `publication-target-${intentSpec.projectId}`,
				kind: "publication-target",
				label: intentSpec.target.platform,
				referenceId: `intent-revision-${intentSpec.revision}`,
				origin: "user-provided",
			});
		}
		return createAgentOrchestration({
			intentSpec,
			evidence,
			createdAt: intentSpec.updatedAt,
		});
	}, [assets, intentSpec]);
	const activeAgentOrchestration =
		agentOrchestration?.orchestrationId ===
		agentOrchestrationSeed?.orchestrationId
			? agentOrchestration
			: agentOrchestrationSeed;
	const selectedMode = MODES.find((item) => item.id === mode) ?? MODES[0];
	const selectedBriefOptions = getSelectedCreativeBriefOptions(brief);
	const briefProgress = getCreativeBriefProgress(brief);
	const briefProgressPercent =
		(briefProgress.completed / briefProgress.total) * 100;
	const composedPrompt = useMemo(
		() => composeCreativeBriefPrompt({ brief, extraRequest }),
		[brief, extraRequest],
	);

	useEffect(() => {
		const projectId = project?.metadata.id;
		if (!projectId) return;
		const key = `visioncut:intent:${projectId}`;
		let active = true;
		void loadIntentSpec({ projectId }).then((spec) => {
			if (!active) return;
			setIntentSpec(spec);
			const fallbackIntent = window.sessionStorage.getItem(key)?.trim();
			const intent = spec?.userIntent ?? fallbackIntent;
			if (intent) setStartingIntent(intent);
			window.sessionStorage.removeItem(key);
		});
		return () => {
			active = false;
		};
	}, [project?.metadata.id]);

	useEffect(() => {
		const projectId = project?.metadata.id;
		if (!projectId) return;
		let active = true;
		storyGraphWriteQueueRef.current = storyGraphWriteQueueRef.current
			.then(async () => {
				const stored = await loadStoryGraph({ projectId });
				let nextGraph = stored;
				if (!stored) {
					nextGraph = await appendStoryGraphVersion({
						projectId,
						graph: derivedStoryGraph,
						expectedCurrentVersion: 0,
					});
				} else if (
					canRefreshDerivedStoryGraph(stored) &&
					storyGraphEvidenceSignature(stored) !==
						storyGraphEvidenceSignature(derivedStoryGraph)
				) {
					nextGraph = await appendStoryGraphVersion({
						projectId,
						graph: {
							...derivedStoryGraph,
							version: stored.version + 1,
						},
						expectedCurrentVersion: stored.version,
					});
				}
				if (active && nextGraph) setStoryGraph(nextGraph);
			})
			.catch(async (error: unknown) => {
				const latest = await loadStoryGraph({ projectId }).catch(() => null);
				if (!active) return;
				if (latest) setStoryGraph(latest);
				toast.error("Story Graph could not be synchronized", {
					description: error instanceof Error ? error.message : undefined,
				});
			});
		return () => {
			active = false;
		};
	}, [derivedStoryGraph, project?.metadata.id]);

	const invalidatePlan = () => {
		setPlan(null);
		setIsPlanReviewed(false);
		setAppliedPlanId(null);
		setCanUndoPlan(false);
		setRememberedPlanId(null);
		setDirectorAdvice(null);
		setBlueprintRun(null);
		setOperationPlan(null);
	};

	const handleUseRecipe = ({
		intent,
		recipeId,
		settings,
	}: {
		intent?: string;
		recipeId: AutomationRecipeId;
		settings: StudioProSettings;
	}) => {
		const patch = getRecipeBriefPatch(recipeId);
		setSelectedRecipeId(recipeId);
		setBrief((current) => ({
			...current,
			recipeId: patch.recipeId,
			styleId: patch.styleId,
			captionId: patch.captionId,
			motionId: patch.motionId,
			audioId: patch.audioId,
		}));
		setExtraRequest(
			[
				intent ? `用户目标：${intent}` : null,
				patch.extraRequest,
				`专业控制：最短静音 ${settings.silenceThresholdMs} ms；切口余量 ${settings.cutPaddingMs} ms；场景敏感度 ${settings.sceneSensitivity}%；B-roll 密度 ${settings.brollDensity}%；字幕密度 ${settings.captionDensity}%；推近强度 ${settings.punchInIntensity}%；目标响度 ${settings.targetLufs} LUFS；输出 ${settings.outputCount} 个版本；填充词策略 ${settings.fillerHandling}。`,
			]
				.filter((line): line is string => Boolean(line))
				.join("\n"),
		);
		setMode("local");
		invalidatePlan();
		setSurface("director");
	};

	const handleImportOpenverse = async (item: OpenverseSearchItem) => {
		if (!project) {
			toast.error("请先打开一个项目");
			return;
		}

		try {
			const response = await fetch(
				`/api/media/openverse/${encodeURIComponent(item.id)}`,
			);
			if (!response.ok) throw new Error("开放素材下载失败");
			const blob = await response.blob();
			const file = new File(
				[blob],
				createOpenverseFilename({ item, mimeType: blob.type }),
				{ lastModified: Date.now(), type: blob.type },
			);
			const processedAssets = await processMediaAssets({ files: [file] });
			if (processedAssets.length === 0) {
				throw new Error("浏览器无法处理这张图片");
			}
			for (const asset of processedAssets) {
				await editor.media.addMediaAsset({
					projectId: project.metadata.id,
					asset,
				});
			}
			toast.success("已加入项目素材库", {
				description: `${item.creator} · ${item.license}，来源链接保留在开放素材卡中。`,
			});
		} catch (error) {
			toast.error("无法加入开放素材", {
				description: error instanceof Error ? error.message : undefined,
			});
		}
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

	const recordProjectVersion = ({
		label,
		createdAt,
		source,
		refs,
	}: {
		label: string;
		createdAt: string;
		source: ProjectVersionSource;
		refs: ProjectVersionReferencePatch;
	}) => {
		const projectId = project?.metadata.id;
		if (!projectId) return;
		versionWriteQueueRef.current = versionWriteQueueRef.current
			.then(async () => {
				await appendProjectVersion({
					projectId,
					label,
					createdAt,
					source,
					refs,
				});
			})
			.catch((error: unknown) => {
				toast.error("Version history could not be updated", {
					description: error instanceof Error ? error.message : undefined,
				});
			});
	};

	const handleStoryGraphChange = (nextGraph: StoryGraph) => {
		const projectId = project?.metadata.id;
		if (!projectId) return;
		const expectedCurrentVersion = storyGraph.version;
		setStoryGraph(nextGraph);
		storyGraphWriteQueueRef.current = storyGraphWriteQueueRef.current
			.then(async () => {
				const persisted = await appendStoryGraphVersion({
					projectId,
					graph: nextGraph,
					expectedCurrentVersion,
				});
				recordProjectVersion({
					label: "Updated Story Graph",
					createdAt: new Date().toISOString(),
					source: "story-graph",
					refs: {
						storyGraph: {
							kind: persisted.kind,
							projectId,
							graphId: persisted.graphId,
							version: persisted.version,
						},
					},
				});
			})
			.catch(async (error: unknown) => {
				const latest = await loadStoryGraph({ projectId }).catch(() => null);
				if (latest) setStoryGraph(latest);
				toast.error("Story Graph update conflicted with a newer version", {
					description: error instanceof Error ? error.message : undefined,
				});
			});
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
		setRememberedPlanId(null);
		setDirectorAdvice(null);
		const nextOperationPlan = createVersionedEditPlan({
			intent: composedPrompt,
			workflow: selectedRecipeId,
		});
		setOperationPlan(nextOperationPlan);
		const createdAt = new Date().toISOString();
		const queuedRun = createAutomationRunRecord({
			runId: `blueprint-${nextPlan.id}`,
			projectId: project?.metadata.id ?? "local-project",
			automationId: "director-blueprint",
			title: "生成成片蓝图",
			createdAt,
		});
		const runningRun = startAutomationRun({
			run: queuedRun,
			at: nextAutomationTimestamp(queuedRun.updatedAt),
			message: "本地规则正在生成可审阅蓝图",
		});
		const reviewRun = submitAutomationRunForReview({
			run: runningRun,
			at: nextAutomationTimestamp(runningRun.updatedAt),
			resultReferences: [
				{ kind: "edit-plan", id: nextPlan.id, label: "成片蓝图" },
			],
			message: "蓝图已生成，等待用户检查",
		});
		setBlueprintRun(reviewRun);
		const projectId = project?.metadata.id;
		if (projectId) {
			recordProjectVersion({
				label: "AI blueprint ready for review",
				createdAt: reviewRun.updatedAt,
				source: "edit-plan",
				refs: {
					editPlan: {
						kind: nextOperationPlan.kind,
						projectId,
						planId: nextOperationPlan.planId,
						revision: nextOperationPlan.revision,
						versionId: nextOperationPlan.versionId,
					},
					storyGraph: {
						kind: storyGraph.kind,
						projectId,
						graphId: storyGraph.graphId,
						version: storyGraph.version,
					},
					automationRun: {
						kind: reviewRun.kind,
						projectId,
						runId: reviewRun.runId,
						status: reviewRun.status,
						updatedAt: reviewRun.updatedAt,
					},
				},
			});
		}
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

	const handleRequestDirectorAdvice = async () => {
		if (!plan || isRequestingAdvice) return;
		const session = loadModelProviderSession();
		const prompt = [
			`用户意图：${plan.prompt}`,
			`当前本地蓝图：${plan.summary}`,
			`素材证据：${plan.source.assetCount} 个素材，时间线 ${plan.source.timelineElementCount} 个元素，总时长 ${formatDuration(plan.source.durationSeconds)}。`,
			"请指出结构、节奏、声音与交付上的改进建议。不得声称已经分析对白、人物、场景、情绪或画面内容。",
		].join("\n");

		if (!isRemoteModelProvider(session.selectedProvider)) {
			const result = completeWithLocalRules({ prompt });
			setDirectorAdvice({
				text: result.text,
				provider: result.provider,
				model: result.model,
			});
			return;
		}

		const connection = session.connections[session.selectedProvider];
		if (!connection) {
			toast.info("请先保存当前模型的 API Key");
			setSurface("models");
			return;
		}

		setIsRequestingAdvice(true);
		try {
			const response = await fetch("/api/ai/complete", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				cache: "no-store",
				body: JSON.stringify({
					provider: session.selectedProvider,
					apiKey: connection.apiKey,
					model: connection.model,
					prompt,
					systemPrompt:
						"你是 VisionCut 的导演顾问。只基于用户意图和明确提供的项目元数据提出可审阅建议，绝不虚构视频理解结果。使用简洁中文。",
					maxOutputTokens: 900,
					purpose: "completion",
				}),
			});
			const payload: unknown = await response.json().catch(() => null);
			const parsed = readDirectorAdviceResponse(payload);
			if (!parsed) throw new Error("模型返回了无法识别的响应");
			if (!parsed.ok) throw new Error(parsed.message);
			setDirectorAdvice(parsed.advice);
			toast.success("导演建议已生成", {
				description: "建议不会自动修改时间线。",
			});
		} catch (error) {
			toast.error("无法生成导演建议", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setIsRequestingAdvice(false);
		}
	};

	const handleRememberDirection = async () => {
		if (!plan || !isPlanReviewed) return;
		try {
			const current = await loadCreatorDNA();
			if (!current.enabled) {
				toast.info("Creator DNA 已暂停", {
					description: "可以在工作室的 DNA 页面重新开启。",
				});
				return;
			}
			if (hasCreatorDNAPlanEvidence({ profile: current, planId: plan.id })) {
				setRememberedPlanId(plan.id);
				toast.info("这版方向已经记住了");
				return;
			}
			await rememberConfirmedPlan(plan);
			setRememberedPlanId(plan.id);
			toast.success("已记住这版创作方向", {
				description: "只保存可解释的偏好，不保存原视频。",
			});
		} catch (error) {
			toast.error("无法更新 Creator DNA", {
				description: error instanceof Error ? error.message : undefined,
			});
		}
	};

	const approveBlueprintRunIfReview = (): AutomationRunRecord | null => {
		if (blueprintRun?.status !== "review") return blueprintRun;
		const approvedRun = approveAutomationRun({
			run: blueprintRun,
			at: nextAutomationTimestamp(blueprintRun.updatedAt),
			approvedBy: "local-user",
		});
		setBlueprintRun(approvedRun);
		return approvedRun;
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
		const approvedRun = approveBlueprintRunIfReview();
		const projectId = project?.metadata.id;
		if (projectId && operationPlan) {
			recordProjectVersion({
				label: "Applied approved local changes",
				createdAt: approvedRun?.updatedAt ?? new Date().toISOString(),
				source: "timeline",
				refs: {
					editPlan: {
						kind: operationPlan.kind,
						projectId,
						planId: operationPlan.planId,
						revision: operationPlan.revision,
						versionId: operationPlan.versionId,
					},
					...(approvedRun
						? {
								automationRun: {
									kind: approvedRun.kind,
									projectId,
									runId: approvedRun.runId,
									status: approvedRun.status,
									updatedAt: approvedRun.updatedAt,
								},
							}
						: {}),
				},
			});
		}
		toast.success(`已执行 ${result.appliedStepCount} 个本机步骤`, {
			description: "整组修改可以一次撤销。",
		});
	};

	const handleUndo = () => {
		editor.command.undo();
		setAppliedPlanId(null);
		setCanUndoPlan(false);
		const projectId = project?.metadata.id;
		if (projectId && operationPlan) {
			recordProjectVersion({
				label: "Undid the latest local change set",
				createdAt: new Date().toISOString(),
				source: "user",
				refs: {
					editPlan: {
						kind: operationPlan.kind,
						projectId,
						planId: operationPlan.planId,
						revision: operationPlan.revision,
						versionId: operationPlan.versionId,
					},
				},
			});
		}
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
			const approvedRun = approveBlueprintRunIfReview();
			const projectId = project?.metadata.id;
			if (projectId && operationPlan && approvedRun) {
				recordProjectVersion({
					label: "Approved external edit handoff",
					createdAt: approvedRun.updatedAt,
					source: "automation-run",
					refs: {
						editPlan: {
							kind: operationPlan.kind,
							projectId,
							planId: operationPlan.planId,
							revision: operationPlan.revision,
							versionId: operationPlan.versionId,
						},
						automationRun: {
							kind: approvedRun.kind,
							projectId,
							runId: approvedRun.runId,
							status: approvedRun.status,
							updatedAt: approvedRun.updatedAt,
						},
					},
				});
			}
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
	const operationReviewOperations = operationPlan
		? getEditPlanOperations(operationPlan)
		: [];
	const operationReviewComplete =
		operationReviewOperations.length > 0 &&
		operationReviewOperations.every(
			(operation) => operation.status !== "proposed",
		);
	const hasLocalSteps = readySteps.length > 0;
	const hasChatCutSteps = chatCutSteps.length > 0;
	const hasAppliedLocal = plan?.id === appliedPlanId;

	if (surface === "studio") {
		return (
			<AIProductStudio
				assetCount={assets.length}
				projectId={project?.metadata.id ?? null}
				projectSnapshot={{
					assets,
					timelineElementCount: timelineElements.length,
					usedMediaCount,
					durationSeconds,
				}}
				storyGraph={storyGraph}
				exportManifest={exportManifest}
				agentOrchestration={activeAgentOrchestration}
				initialIntent={startingIntent}
				onImportMedia={requestMediaImport}
				onImportOpenverse={handleImportOpenverse}
				onOpenDirector={() => setSurface("director")}
				onOpenModels={() => setSurface("models")}
				onOpenNativeExport={requestNativeExport}
				onModelSelectionChange={setModelSelection}
				onAgentOrchestrationChange={setAgentOrchestration}
				onStoryGraphChange={handleStoryGraphChange}
				onUseRecipe={handleUseRecipe}
			/>
		);
	}

	if (surface === "models") {
		return (
			<div className="flowcut-ai-shell flex h-full min-h-0 flex-col">
				<div className="shrink-0 border-b px-3 py-1">
					<StudioBackButton onClick={() => setSurface("studio")} />
				</div>
				<ScrollArea className="min-h-0 flex-1">
					<div className="p-3">
						<VisionCutModelCenter onSelectionChange={setModelSelection} />
					</div>
				</ScrollArea>
			</div>
		);
	}

	return (
		<div className="flowcut-ai-shell flex h-full min-h-0 flex-col">
			<div className="shrink-0 border-b px-3 py-1">
				<StudioBackButton onClick={() => setSurface("studio")} />
			</div>
			<ScrollArea className="min-h-0 flex-1">
				<div className="space-y-4 p-3">
					<section className="flowcut-director-console overflow-hidden rounded-[8px] border">
						<div className="flex items-start gap-3.5 p-3.5">
							<div className="flowcut-director-mark flex size-10 shrink-0 items-center justify-center rounded-[8px] border">
								<Brain className="size-5" />
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center justify-between gap-2">
									<h2 className="text-[15px] font-semibold">
										VisionCut AI 导演
									</h2>
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
							当前只读取素材类型、数量和时长。自带模型可以辅助推演蓝图，但对白、停顿、语义高光与逐镜头内容仍需真实分析结果。
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
										<span
											className={cn(
												"text-[9px] font-medium",
												blueprintRun?.status === "done"
													? "text-emerald-700 dark:text-emerald-300"
													: "text-cyan-700 dark:text-cyan-300",
											)}
										>
											{blueprintRun
												? AUTOMATION_STATUS_LABELS[blueprintRun.status]
												: "待确认"}
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

							<section className="rounded-[8px] border p-3">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<h3 className="flex items-center gap-1.5 text-xs font-semibold">
											<Brain className="size-3.5" />
											导演推演
										</h3>
										<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
											基于意图和项目元数据复核蓝图，不会自动改动时间线。
										</p>
									</div>
									<span className="max-w-28 truncate text-[9px] text-muted-foreground">
										{modelSelection
											? modelSelection.local
												? "本地免费"
												: modelSelection.connected
													? modelSelection.model
													: "模型未连接"
											: "本地免费"}
									</span>
								</div>
								{directorAdvice ? (
									<div className="mt-3 border-t pt-3">
										<p className="whitespace-pre-wrap text-[10px] leading-relaxed">
											{directorAdvice.text}
										</p>
										<p className="mt-2 text-[8px] text-muted-foreground">
											{directorAdvice.provider} · {directorAdvice.model}
										</p>
									</div>
								) : null}
								<div className="mt-3 grid grid-cols-2 gap-2">
									<Button
										variant="outline"
										className="h-10"
										disabled={isRequestingAdvice}
										onClick={() => void handleRequestDirectorAdvice()}
									>
										{isRequestingAdvice ? (
											<Loader2 className="size-4 animate-spin" />
										) : (
											<Brain className="size-4" />
										)}
										{directorAdvice ? "重新推演" : "复核蓝图"}
									</Button>
									<Button
										variant="outline"
										className="h-10"
										onClick={() => setSurface("models")}
									>
										<Cloud className="size-4" />
										模型设置
									</Button>
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
											外部 {chatCutSteps.length}
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

							{operationPlan ? (
								<section className="overflow-hidden rounded-[8px] border">
									<VisionCutOperationReview
										plan={operationPlan}
										disabled={hasAppliedLocal}
										onPlanChange={(next) => {
											setOperationPlan(next);
											setIsPlanReviewed(false);
										}}
									/>
								</section>
							) : null}

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
								className={cn(
									"flowcut-review-gate flex items-start gap-2 rounded-[8px] border p-3",
									operationReviewComplete
										? "cursor-pointer"
										: "cursor-not-allowed opacity-65",
								)}
							>
								<Checkbox
									id="ai-plan-reviewed"
									checked={isPlanReviewed}
									disabled={!operationReviewComplete}
									onCheckedChange={(checked) =>
										setIsPlanReviewed(
											operationReviewComplete && checked === true,
										)
									}
									className="mt-0.5"
								/>
								<span className="min-w-0">
									<span className="block text-xs font-medium">
										{operationReviewComplete
											? "这版方向可以执行"
											: "先完成逐项审阅"}
									</span>
									<span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
										我已检查画幅、风格、步骤，以及所有需要外部处理的内容。
									</span>
								</span>
							</label>
							<Button
								variant="outline"
								className="h-11 w-full"
								disabled={!isPlanReviewed || rememberedPlanId === plan.id}
								onClick={() => void handleRememberDirection()}
							>
								<Fingerprint className="size-4" />
								{rememberedPlanId === plan.id
									? "已记住这版方向"
									: "记住这版方向"}
							</Button>
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
