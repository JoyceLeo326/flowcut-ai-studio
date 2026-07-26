"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	AudioLines,
	Brain,
	Check,
	CheckCircle2,
	CircleStop,
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
	CREATOR_DNA_UPDATED_EVENT,
	createEditPlanReviewDecisionEvents,
	createPlanDecisionEvent,
	createCreatorDNAPlanningContext,
	loadCreatorDNA,
	recordConfirmedPlanDecision,
	recordCreatorDNADecisionEvent,
	type CreatorDNAPlanningConstraint,
	type CreatorDNAPlanningContext,
} from "@/ai-studio/creator-dna";
import type { CreatorDecisionEventSource } from "@/ai-studio/creator-decision-ledger";
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
import {
	createIntentSpec,
	loadIntentSpec,
	saveIntentSpec,
	updateIntentSpec,
	type IntentSpec,
} from "@/ai-studio/intent-spec";
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
	appendRestoredStoryGraphVersion,
	appendStoryGraphVersion,
	loadStoryGraph,
} from "@/ai-studio/story-graph-store";
import {
	createExportManifest,
	type ExportAspectRatio,
	type ExportManifest,
	type ExportTimelineTrackSnapshot,
	type ExportVariantIntentInput,
} from "@/ai-studio/export-manifest";
import {
	appendProjectVersion,
	type ProjectVersionReferencePatch,
	type ProjectVersionSource,
} from "@/ai-studio/project-version-store";
import { captureProjectVersionRestorePayload } from "@/ai-studio/project-version-restore";
import {
	createProjectCreativeStateSnapshot,
	loadLatestProjectCreativeStateSnapshot,
	parseProjectCreativeStateSnapshot,
	PROJECT_CREATIVE_STATE_RESTORED_EVENT,
	type ProjectCreativeStateSnapshot,
} from "@/ai-studio/project-creative-state";
import {
	requestMediaImport,
	requestNativeExport,
} from "@/editor/navigation-events";
import { useEditor } from "@/editor/use-editor";
import { useVisionCutWorkspaceStore } from "@/editor/visioncut-workspace-store";
import type { TimelineElement, TimelineTrack } from "@/timeline";
import { hasMediaId } from "@/timeline/element-utils";
import { cn } from "@/utils/ui";
import { mediaTimeToSeconds } from "@/wasm";
import {
	DEFAULT_STUDIO_PRO_SETTINGS,
	getRecipeBriefPatch,
	type AutomationRecipeId,
	type StudioProSettings,
} from "@/ai-studio/catalog";
import type { OpenverseSearchItem } from "@/ai-studio/openverse";
import type { MediaIndex } from "@/ai-studio/media-index";
import {
	loadMediaIndexHistory,
	saveMediaIndex,
} from "@/ai-studio/media-index-store";
import {
	createLocalAssetFingerprint,
	createLocalAssetFingerprintForMediaAsset,
	createMediaIndexFromLocalCapture,
} from "@/ai-studio/media-index-adapter";
import { captureLocalMediaSamples } from "@/ai-studio/local-media-sampler";
import {
	createEditDecisionOperationReviewPayload,
	orchestrateLocalEditDecision,
	type LocalEditDecisionOrchestration,
} from "@/ai-studio/edit-decision-orchestrator";
import { ApplyEditDecisionCommand } from "@/ai-studio/apply-edit-decision-command";
import { inspectEditDecisionApplicability } from "@/ai-studio/edit-decision-executor";
import { createRoughCutPlanFromMediaIndex } from "@/ai-studio/media-index-rough-cut";
import {
	createStudioExecutionPolicy,
	type StudioExecutionEvidence,
	type StudioExecutionPolicy,
} from "@/ai-studio/studio-execution-policy";
import {
	loadLatestTimelineTranscriptArtifact,
	TRANSCRIPT_ARTIFACT_UPDATED_EVENT,
	type TimelineTranscriptArtifact,
} from "@/ai-studio/transcript-artifact";
import { listProjectChatCutImportEntries } from "@/ai-studio/chatcut-import-store";
import type { ChatCutImportApplyReceipt } from "@/ai-studio/chatcut-result";
import { createChatCutTargetState } from "@/ai-studio/chatcut-timeline-adapter";
import {
	AIProductStudio,
	StudioBackButton,
} from "@/components/editor/panels/inspector/ai-product-studio";
import {
	VisionCutModelCenter,
	type ModelSelectionSummary,
} from "@/components/editor/panels/inspector/visioncut-model-center";
import { VisionCutOperationReview } from "@/components/editor/panels/inspector/visioncut-operation-review";
import { VisionCutChatCutBridge } from "@/components/editor/panels/inspector/visioncut-chatcut-bridge";
import { VisionCutEditDecisionReview } from "@/components/editor/panels/inspector/visioncut-edit-decision-review";
import { processMediaAssets } from "@/media/processing";
import type { MediaAsset } from "@/media/types";
import { frameRateToFloat } from "@/fps/utils";
import type { Command } from "@/commands";

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

interface CreatorDNAPlanPrompt {
	readonly prompt: string;
	readonly constraints: readonly CreatorDNAPlanningConstraint[];
}

const CREATOR_DNA_EXPLICIT_PATTERNS: Record<
	CreatorDNAPlanningConstraint["preference"],
	RegExp
> = {
	rhythm: /(节奏|快切|慢剪|慢节奏|留白|卡点|rhythm|pace|fast|calm)/iu,
	captionDensity:
		/(字幕|大字|关键词|逐字|极简字幕|caption|subtitle|word.?by.?word)/iu,
	audioPriority:
		/(人声|对白|音乐|配乐|环境声|现场声|audio|voice|dialogue|music|ambient)/iu,
	visualStyle:
		/(视觉|风格|纪录片|电影|高燃|科技|社媒|调色|色彩|visual|style|cinematic)/iu,
	platform:
		/(抖音|快手|小红书|b站|哔哩|youtube|tiktok|reels|shorts|播客|podcast)/iu,
	aspectRatio:
		/(16\s*:\s*9|9\s*:\s*16|4\s*:\s*5|1\s*:\s*1|横屏|竖屏|方形|画幅)/iu,
};

function usesAutomaticBriefChoice({
	brief,
	preference,
}: {
	brief: CreativeBriefSelection;
	preference: CreatorDNAPlanningConstraint["preference"];
}): boolean {
	switch (preference) {
		case "rhythm":
			return brief.motionId === "clean-cut";
		case "captionDensity":
			return brief.captionId === "smart";
		case "audioPriority":
			return brief.audioId === "balanced";
		case "visualStyle":
			return brief.styleId === "auto";
		case "platform":
		case "aspectRatio":
			return brief.platformId === "auto";
	}
}

function creatorDNAPromptLine(
	constraint: CreatorDNAPlanningConstraint,
): string {
	const value = constraint.normalizedValue;
	switch (constraint.preference) {
		case "rhythm":
			return value === "fast"
				? "已确认节奏偏好：高燃快切，但每个切点仍需内容或声音依据。"
				: value === "calm"
					? "已确认节奏偏好：纪录片式留白与较长有效镜头。"
					: "已确认节奏偏好：信息清晰与节奏推进保持平衡。";
		case "captionDensity":
			return value === "dense"
				? "已确认字幕偏好：大字高能字幕与关键词强调，逐屏检查安全区。"
				: value === "minimal"
					? "已确认字幕偏好：极简电影字幕，只在理解所需处出现。"
					: "已确认字幕偏好：核心语句有字幕，次要信息保持克制。";
		case "audioPriority":
			return value === "music"
				? "已确认声音偏好：音乐卡点参与段落组织，人声出现时自动闪避。"
				: value === "voice"
					? "已确认声音偏好：人声优先，再安排降噪、音乐闪避与环境声。"
					: "已确认声音偏好：保留能证明现场关系的环境声。";
		case "visualStyle":
			return `已确认视觉偏好：${value}；结合当前素材复核色彩、包装与转场。`;
		case "platform":
			return `已确认发布偏好：${value}；据此复核观看场景、信息密度和安全区。`;
		case "aspectRatio":
			return `已确认画幅偏好：${value}；逐镜检查人物、字幕和关键物体裁切。`;
	}
}

function composeCreatorDNAPlanPrompt({
	basePrompt,
	currentIntent,
	brief,
	context,
}: {
	basePrompt: string;
	currentIntent: string;
	brief: CreativeBriefSelection;
	context: CreatorDNAPlanningContext | null;
}): CreatorDNAPlanPrompt {
	if (context?.status !== "ready") {
		return { prompt: basePrompt, constraints: [] };
	}
	const constraints = context.constraints.filter(
		(constraint) =>
			usesAutomaticBriefChoice({ brief, preference: constraint.preference }) &&
			!CREATOR_DNA_EXPLICIT_PATTERNS[constraint.preference].test(currentIntent),
	);
	if (constraints.length === 0) {
		return { prompt: basePrompt, constraints };
	}
	return {
		prompt: [
			basePrompt,
			"Creator DNA 规划参考（当前意图优先，以下内容只参与蓝图推演，禁止自动执行）：",
			...constraints.map(creatorDNAPromptLine),
		].join("\n"),
		constraints,
	};
}

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
	const captionElementIds = new Set(
		track.type === "text"
			? track.elements
					.filter((element) => /^Caption \d+$/u.test(element.name))
					.map((element) => element.id)
			: [],
	);
	const isCaptionTrack =
		track.type === "text" &&
		track.elements.length > 0 &&
		captionElementIds.size === track.elements.length;
	return {
		id: track.id,
		name: track.name,
		type: track.type,
		...(isCaptionTrack ? { role: "captions" as const } : {}),
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
			...(captionElementIds.has(element.id)
				? { role: "caption" as const }
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

function buildStudioExecutionEvidence({
	indexes,
	approvedPlan,
}: {
	indexes: readonly MediaIndex[];
	approvedPlan?: EditPlan | null;
}): readonly StudioExecutionEvidence[] {
	const evidence = indexes.flatMap((index): StudioExecutionEvidence[] => [
		...(index.sourceSnapshot.audioWindowSamples.length > 0
			? [
					{
						kind: "audio-energy-intervals" as const,
						artifactId: `audio-${index.mediaIndexId}`,
						fingerprint: index.mediaIndexId,
					},
				]
			: []),
		...(index.sourceSnapshot.videoFrameSamples.length > 1
			? [
					{
						kind: "video-frame-differences" as const,
						artifactId: `frames-${index.mediaIndexId}`,
						fingerprint: index.mediaIndexId,
					},
				]
			: []),
	]);
	if (approvedPlan) {
		evidence.push({
			kind: "approved-base-plan",
			artifactId: approvedPlan.id,
			fingerprint: `${approvedPlan.id}:${approvedPlan.createdAt}`,
		});
	}
	return evidence;
}

function transcriptPromptEvidence(
	artifact: TimelineTranscriptArtifact,
): string {
	const maximumCharacters = 8_000;
	const lines: string[] = [];
	let usedCharacters = 0;
	for (const segment of artifact.segments) {
		const text = segment.text.replace(/\s+/gu, " ").trim();
		if (!text) continue;
		const line = `[${segment.startSeconds.toFixed(2)}-${segment.endSeconds.toFixed(
			2,
		)}] ${text}`;
		if (usedCharacters + line.length > maximumCharacters) break;
		lines.push(line);
		usedCharacters += line.length;
	}
	return lines.join("\n");
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

function getMediaAssetFingerprint(asset: MediaAsset): string {
	return createLocalAssetFingerprintForMediaAsset({ asset });
}

export function AIWorkspacePanel() {
	const editor = useEditor();
	const publishStoryGraph = useVisionCutWorkspaceStore(
		(state) => state.publishStoryGraph,
	);
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
	const [studioProSettings, setStudioProSettings] = useState<StudioProSettings>(
		DEFAULT_STUDIO_PRO_SETTINGS,
	);
	const [extraRequest, setExtraRequest] = useState("");
	const [plan, setPlan] = useState<EditPlan | null>(null);
	const [isPlanReviewed, setIsPlanReviewed] = useState(false);
	const [appliedPlanId, setAppliedPlanId] = useState<string | null>(null);
	const [appliedPlanCommand, setAppliedPlanCommand] = useState<{
		command: Command;
		sceneId: string;
	} | null>(null);
	const [appliedPlanDecision, setAppliedPlanDecision] = useState<{
		eventId: string;
		source: CreatorDecisionEventSource;
	} | null>(null);
	const [rememberedPlanId, setRememberedPlanId] = useState<string | null>(null);
	const [creatorDNAPlanningContext, setCreatorDNAPlanningContext] =
		useState<CreatorDNAPlanningContext | null>(null);
	const [appliedCreatorDNAConstraints, setAppliedCreatorDNAConstraints] =
		useState<readonly CreatorDNAPlanningConstraint[]>([]);
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
	const [mediaIndexes, setMediaIndexes] = useState<
		Readonly<Record<string, MediaIndex>>
	>({});
	const [transcriptArtifact, setTranscriptArtifact] =
		useState<TimelineTranscriptArtifact | null>(null);
	const [editDecisionOrchestration, setEditDecisionOrchestration] =
		useState<LocalEditDecisionOrchestration | null>(null);
	const [
		approvedEditDecisionOperationIds,
		setApprovedEditDecisionOperationIds,
	] = useState<ReadonlySet<string>>(() => new Set());
	const [appliedEditDecisionCommand, setAppliedEditDecisionCommand] =
		useState<ApplyEditDecisionCommand | null>(null);
	const [appliedEditDecision, setAppliedEditDecision] = useState<{
		eventId: string;
		source: CreatorDecisionEventSource;
	} | null>(null);
	const [blueprintAnalysisProgress, setBlueprintAnalysisProgress] = useState<{
		readonly current: number;
		readonly total: number;
		readonly assetName: string;
	} | null>(null);
	const studioExecutionPolicy = useMemo<StudioExecutionPolicy | null>(() => {
		try {
			return createStudioExecutionPolicy({
				settings: studioProSettings,
				evidence: buildStudioExecutionEvidence({
					indexes: Object.values(mediaIndexes),
					approvedPlan: isPlanReviewed ? plan : null,
				}),
			});
		} catch {
			return null;
		}
	}, [isPlanReviewed, mediaIndexes, plan, studioProSettings]);
	const planAnchorRef = useRef<HTMLDivElement>(null);
	const blueprintAnalysisAbortRef = useRef<AbortController | null>(null);
	const versionWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
	const storyGraphWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
	useEffect(
		() => () => {
			blueprintAnalysisAbortRef.current?.abort();
		},
		[],
	);
	const handleMediaIndexChange = useCallback(
		({ assetId, index }: { assetId: string; index: MediaIndex | null }) => {
			setMediaIndexes((current) => {
				if (index === null) {
					if (!(assetId in current)) return current;
					const next = { ...current };
					delete next[assetId];
					return next;
				}
				if (current[assetId]?.mediaIndexId === index.mediaIndexId) {
					return current;
				}
				return { ...current, [assetId]: index };
			});
		},
		[],
	);

	useEffect(() => {
		const projectId = project?.metadata.id;
		let active = true;
		if (!projectId) {
			void Promise.resolve().then(() => {
				if (active) setMediaIndexes({});
			});
			return () => {
				active = false;
			};
		}
		void Promise.all(
			assets
				.filter((asset) => asset.type !== "image")
				.map(async (asset) => {
					const history = await loadMediaIndexHistory({
						projectId,
						assetId: asset.id,
					}).catch(() => null);
					const record = history?.records.at(-1) ?? null;
					if (record?.assetFingerprint !== getMediaAssetFingerprint(asset)) {
						return null;
					}
					return [asset.id, record.index] as const;
				}),
		).then((entries) => {
			if (!active) return;
			setMediaIndexes(
				Object.fromEntries(
					entries.filter(
						(entry): entry is readonly [string, MediaIndex] => entry !== null,
					),
				),
			);
		});
		return () => {
			active = false;
		};
	}, [assets, project?.metadata.id]);

	useEffect(() => {
		const projectId = project?.metadata.id;
		const sceneId = scene?.id;
		let active = true;
		if (!projectId || !sceneId) {
			void Promise.resolve().then(() => {
				if (active) setTranscriptArtifact(null);
			});
			return () => {
				active = false;
			};
		}
		const refresh = () => {
			void loadLatestTimelineTranscriptArtifact({
				projectId,
				sceneId,
				timelineId: sceneId,
			})
				.then((artifact) => {
					if (active) setTranscriptArtifact(artifact);
				})
				.catch(() => {
					if (active) setTranscriptArtifact(null);
				});
		};
		const handleTranscriptUpdated = (event: Event) => {
			if (!(event instanceof CustomEvent)) return;
			const detail: unknown = event.detail;
			if (typeof detail !== "object" || detail === null) return;
			if (
				Reflect.get(detail, "projectId") === projectId &&
				Reflect.get(detail, "sceneId") === sceneId &&
				Reflect.get(detail, "timelineId") === sceneId
			) {
				refresh();
			}
		};
		refresh();
		window.addEventListener(
			TRANSCRIPT_ARTIFACT_UPDATED_EVENT,
			handleTranscriptUpdated,
		);
		return () => {
			active = false;
			window.removeEventListener(
				TRANSCRIPT_ARTIFACT_UPDATED_EVENT,
				handleTranscriptUpdated,
			);
		};
	}, [project?.metadata.id, scene?.id]);

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
	useEffect(() => {
		publishStoryGraph({ graph: storyGraph });
	}, [publishStoryGraph, storyGraph]);
	const applyRestoredCreativeState = useCallback(
		(snapshot: ProjectCreativeStateSnapshot) => {
			if (snapshot.projectId !== project?.metadata.id) return;
			setStartingIntent(snapshot.studio.startingIntent);
			setMode(snapshot.studio.mode);
			setBrief(snapshot.studio.brief);
			setSelectedRecipeId(snapshot.studio.selectedRecipeId);
			setStudioProSettings(snapshot.studio.settings);
			setExtraRequest(snapshot.studio.extraRequest);
			setIntentSpec(snapshot.artifacts.intentSpec);
			setPlan(snapshot.artifacts.editPlan);
			setIsPlanReviewed(snapshot.studio.isPlanReviewed);
			setAppliedPlanId(snapshot.studio.appliedPlanId);
			setRememberedPlanId(snapshot.studio.rememberedPlanId);
			if (snapshot.artifacts.storyGraph !== null) {
				setStoryGraph(snapshot.artifacts.storyGraph);
			}
			setAgentOrchestration(snapshot.artifacts.agentOrchestration);
			setTranscriptArtifact(snapshot.artifacts.transcriptArtifact);

			// Pending approvals and runtime command instances cannot be replayed safely.
			setAppliedPlanCommand(null);
			setAppliedPlanDecision(null);
			setOperationPlan(null);
			setBlueprintRun(null);
			setDirectorAdvice(null);
			setEditDecisionOrchestration(null);
			setApprovedEditDecisionOperationIds(new Set());
			setAppliedEditDecisionCommand(null);
			setAppliedEditDecision(null);
			setAppliedCreatorDNAConstraints([]);
		},
		[project?.metadata.id],
	);
	const persistAndApplyRestoredCreativeState = useCallback(
		(snapshot: ProjectCreativeStateSnapshot) => {
			const restoredGraph = snapshot.artifacts.storyGraph;
			if (restoredGraph === null) {
				applyRestoredCreativeState(snapshot);
				return;
			}
			storyGraphWriteQueueRef.current = storyGraphWriteQueueRef.current
				.then(async () => {
					const persistedGraph = await appendRestoredStoryGraphVersion({
						projectId: snapshot.projectId,
						graph: restoredGraph,
					});
					applyRestoredCreativeState({
						...snapshot,
						artifacts: {
							...snapshot.artifacts,
							storyGraph: persistedGraph,
						},
					});
				})
				.catch(async (error: unknown) => {
					const latest = await loadStoryGraph({
						projectId: snapshot.projectId,
					}).catch(() => null);
					applyRestoredCreativeState({
						...snapshot,
						artifacts: {
							...snapshot.artifacts,
							storyGraph: latest,
						},
					});
					toast.error("Story Graph restore could not be persisted", {
						description:
							error instanceof Error ? error.message : undefined,
					});
				});
		},
		[applyRestoredCreativeState],
	);
	useEffect(() => {
		const projectId = project?.metadata.id;
		if (!projectId) return;
		let active = true;
		const handleCreativeStateRestored = (event: Event) => {
			if (!(event instanceof CustomEvent)) return;
			const detail: unknown = event.detail;
			if (typeof detail !== "object" || detail === null) return;
			const snapshot = parseProjectCreativeStateSnapshot({
				value: Reflect.get(detail, "snapshot"),
			});
			if (snapshot?.projectId === projectId) {
				persistAndApplyRestoredCreativeState(snapshot);
			}
		};
		void loadLatestProjectCreativeStateSnapshot({ projectId })
			.then((snapshot) => {
				if (active && snapshot !== null) {
					applyRestoredCreativeState(snapshot);
				}
			})
			.catch(() => undefined);
		window.addEventListener(
			PROJECT_CREATIVE_STATE_RESTORED_EVENT,
			handleCreativeStateRestored,
		);
		return () => {
			active = false;
			window.removeEventListener(
				PROJECT_CREATIVE_STATE_RESTORED_EVENT,
				handleCreativeStateRestored,
			);
		};
	}, [
		applyRestoredCreativeState,
		persistAndApplyRestoredCreativeState,
		project?.metadata.id,
	]);
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
		const timelineTracks = [
			toExportTimelineTrack(scene.tracks.main),
			...scene.tracks.overlay.map(toExportTimelineTrack),
			...scene.tracks.audio.map(toExportTimelineTrack),
		];
		const hasTimelineCaptions = timelineTracks.some(
			(track) =>
				track.role === "captions" &&
				track.elements.some((element) => element.role === "caption"),
		);
		const transcriptLanguage =
			transcriptArtifact?.projectId === project.metadata.id &&
			transcriptArtifact.sceneId === scene.id
				? transcriptArtifact.language.code
				: "und";
		const subtitleRequirement: ExportVariantIntentInput["subtitles"] =
			hasTimelineCaptions
				? {
						mode: "burn-in",
						language: transcriptLanguage,
						source: "timeline-captions",
					}
				: { mode: "none" };
		const availableVariants: readonly ExportVariantIntentInput[] = [
			{
				id: "primary",
				label: "主版本",
				platform: "generic",
				aspectRatio: primaryAspectRatio,
				subtitles: subtitleRequirement,
				audio: {
					mode: "include",
					required: false,
					targetLoudnessLufs: studioProSettings.targetLufs,
				},
				cover: { source: "none", required: false },
			},
			{
				id: "vertical-short",
				label: "竖屏短版",
				platform: "douyin",
				aspectRatio: "9:16",
				targetDurationSeconds: shortTargetSeconds,
				subtitles: subtitleRequirement,
				audio: {
					mode: "include",
					required: false,
					targetLoudnessLufs: studioProSettings.targetLufs,
				},
				cover: { source: "none", required: false },
			},
			{
				id: "social-feed",
				label: "图文平台版",
				platform: "xiaohongshu",
				aspectRatio: "4:5",
				targetDurationSeconds: shortTargetSeconds,
				subtitles: subtitleRequirement,
				audio: {
					mode: "include",
					required: false,
					targetLoudnessLufs: studioProSettings.targetLufs,
				},
				cover: { source: "none", required: false },
			},
			{
				id: "square-social",
				label: "方形社媒版",
				platform: "generic",
				aspectRatio: "1:1",
				targetDurationSeconds: shortTargetSeconds,
				subtitles: subtitleRequirement,
				audio: {
					mode: "include",
					required: false,
					targetLoudnessLufs: studioProSettings.targetLufs,
				},
				cover: { source: "none", required: false },
			},
			{
				id: "bilibili-landscape",
				label: "哔哩哔哩横版",
				platform: "bilibili",
				aspectRatio: "16:9",
				subtitles: subtitleRequirement,
				audio: {
					mode: "include",
					required: false,
					targetLoudnessLufs: studioProSettings.targetLufs,
				},
				cover: { source: "none", required: false },
			},
			{
				id: "youtube-landscape",
				label: "YouTube 横版",
				platform: "youtube",
				aspectRatio: "16:9",
				subtitles: subtitleRequirement,
				audio: {
					mode: "include",
					required: false,
					targetLoudnessLufs: studioProSettings.targetLufs,
				},
				cover: { source: "none", required: false },
			},
		];
		const variants = availableVariants.slice(0, studioProSettings.outputCount);
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
				tracks: timelineTracks,
			},
			variants,
			studioProSettings: {
				targetLufs: studioProSettings.targetLufs,
				outputCount: studioProSettings.outputCount,
			},
		});
	}, [
		assets,
		durationSeconds,
		project,
		scene,
		studioProSettings,
		transcriptArtifact,
	]);
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
		for (const index of Object.values(mediaIndexes)) {
			if (index.sceneBoundaries.length > 0) {
				evidence.push({
					evidenceId: `scene-analysis-${index.assetId}-${index.mediaIndexId}`,
					kind: "scene-analysis",
					label: `${index.sceneBoundaries.length} frame-change candidates`,
					referenceId: index.mediaIndexId,
					origin: "imported-result",
				});
			}
			if (index.audioActivityCandidates.length > 0) {
				evidence.push({
					evidenceId: `audio-analysis-${index.assetId}-${index.mediaIndexId}`,
					kind: "audio-analysis",
					label: `${index.audioActivityCandidates.length} energy-activity candidates`,
					referenceId: index.mediaIndexId,
					origin: "imported-result",
				});
			}
		}
		if (
			transcriptArtifact &&
			transcriptArtifact.projectId === intentSpec.projectId &&
			transcriptArtifact.sceneId === scene?.id
		) {
			evidence.push({
				evidenceId: `transcript-${transcriptArtifact.artifactId}`,
				kind: "transcript",
				label: `${transcriptArtifact.segments.length} segment transcript revision ${transcriptArtifact.revision}`,
				referenceId: transcriptArtifact.artifactId,
				origin: "imported-result",
			});
		}
		return createAgentOrchestration({
			intentSpec,
			evidence,
			createdAt: intentSpec.updatedAt,
		});
	}, [assets, intentSpec, mediaIndexes, scene?.id, transcriptArtifact]);
	const activeAgentOrchestration =
		agentOrchestration?.orchestrationId ===
		agentOrchestrationSeed?.orchestrationId
			? agentOrchestration
			: agentOrchestrationSeed;
	const currentEditDecisionAssets = useMemo(
		() =>
			Object.values(mediaIndexes).map((index) => {
				const asset = assets.find(
					(candidate) => candidate.id === index.assetId,
				);
				return {
					assetId: index.assetId,
					inputFingerprint: asset
						? getMediaAssetFingerprint(asset)
						: "missing-asset",
					mediaIndexId: index.mediaIndexId,
				};
			}),
		[assets, mediaIndexes],
	);
	const activeEditDecisionOrchestration =
		useMemo<LocalEditDecisionOrchestration | null>(() => {
			if (!editDecisionOrchestration) return null;
			return Object.freeze({
				plan: editDecisionOrchestration.plan,
				review: createEditDecisionOperationReviewPayload({
					plan: editDecisionOrchestration.plan,
					currentAssets: currentEditDecisionAssets,
				}),
			});
		}, [currentEditDecisionAssets, editDecisionOrchestration]);
	const editDecisionAssetNames = useMemo(
		() =>
			Object.fromEntries(
				assets.map((asset) => [asset.id, asset.name] as const),
			),
		[assets],
	);
	const editDecisionOperationApplicability = useMemo(() => {
		if (!activeEditDecisionOrchestration || !scene) return {};
		return Object.fromEntries(
			activeEditDecisionOrchestration.review.items.flatMap(({ operation }) => {
				if (operation.kind !== "trim" && operation.kind !== "remove") {
					return [];
				}
				const applicability = inspectEditDecisionApplicability({
					tracks: scene.tracks,
					plan: activeEditDecisionOrchestration.plan,
					approvedOperationIds: [operation.operationId],
					currentAssets: currentEditDecisionAssets,
					hasTimelineBookmarks: scene.bookmarks.length > 0,
				});
				return [
					[
						operation.operationId,
						{
							canApply: applicability.canApply,
							reason:
								applicability.blockers
									.slice(0, 2)
									.map((blocker) => blocker.message)
									.join(" ") || null,
						},
					] as const,
				];
			}),
		);
	}, [activeEditDecisionOrchestration, currentEditDecisionAssets, scene]);
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
		let active = true;
		const refresh = () => {
			void loadCreatorDNA()
				.then((profile) => {
					if (active) {
						setCreatorDNAPlanningContext(
							createCreatorDNAPlanningContext(profile),
						);
					}
				})
				.catch(() => {
					if (active) setCreatorDNAPlanningContext(null);
				});
		};
		refresh();
		window.addEventListener(CREATOR_DNA_UPDATED_EVENT, refresh);
		return () => {
			active = false;
			window.removeEventListener(CREATOR_DNA_UPDATED_EVENT, refresh);
		};
	}, []);

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
		setAppliedPlanCommand(null);
		setAppliedPlanDecision(null);
		setRememberedPlanId(null);
		setAppliedCreatorDNAConstraints([]);
		setDirectorAdvice(null);
		setBlueprintRun(null);
		setOperationPlan(null);
		setAgentOrchestration(null);
		setEditDecisionOrchestration(null);
		setApprovedEditDecisionOperationIds(new Set());
		setAppliedEditDecisionCommand(null);
		setAppliedEditDecision(null);
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
		setStudioProSettings(settings);
		if (intent?.trim()) setStartingIntent(intent.trim());
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
		creativeState: suppliedCreativeState,
	}: {
		label: string;
		createdAt: string;
		source: ProjectVersionSource;
		refs: ProjectVersionReferencePatch;
		creativeState?: ProjectCreativeStateSnapshot;
	}) => {
		const projectId = project?.metadata.id;
		if (!projectId) return;
		let restorePayload:
			| ReturnType<typeof captureProjectVersionRestorePayload>
			| undefined;
		try {
			const activeProject = editor.project.getActive();
			if (activeProject.metadata.id === projectId) {
				const creativeState =
					suppliedCreativeState ??
					createProjectCreativeStateSnapshot({
						projectId,
						capturedAt: createdAt,
						studio: {
							startingIntent,
							mode,
							brief,
							selectedRecipeId,
							settings: studioProSettings,
							extraRequest,
							isPlanReviewed,
							appliedPlanId,
							rememberedPlanId,
						},
						artifacts: {
							intentSpec,
							editPlan: plan,
							storyGraph,
							agentOrchestration,
							transcriptArtifact,
						},
					});
				restorePayload = captureProjectVersionRestorePayload({
					project: activeProject,
					assets: editor.media.getAssets(),
					snapshotId: `snapshot-${crypto.randomUUID()}`,
					capturedAt: createdAt,
					creativeState,
				});
			}
		} catch (error) {
			console.warn(
				"[visioncut] Project version saved as references only because a restorable snapshot could not be created.",
				error,
			);
		}
		versionWriteQueueRef.current = versionWriteQueueRef.current
			.then(async () => {
				await appendProjectVersion({
					projectId,
					label,
					createdAt,
					source,
					refs,
					restorePayload,
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
				const versionCreatedAt = new Date().toISOString();
				recordProjectVersion({
					label: "Updated Story Graph",
					createdAt: versionCreatedAt,
					source: "story-graph",
					creativeState: createProjectCreativeStateSnapshot({
						projectId,
						capturedAt: versionCreatedAt,
						studio: {
							startingIntent,
							mode,
							brief,
							selectedRecipeId,
							settings: studioProSettings,
							extraRequest,
							isPlanReviewed,
							appliedPlanId,
							rememberedPlanId,
						},
						artifacts: {
							intentSpec,
							editPlan: plan,
							storyGraph: persisted,
							agentOrchestration,
							transcriptArtifact,
						},
					}),
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

	const handleCreatePlan = async () => {
		if (blueprintAnalysisAbortRef.current) {
			blueprintAnalysisAbortRef.current.abort();
			return;
		}
		if (!hasMedia) {
			requestMediaImport();
			toast.info("先选择要剪辑的视频片段");
			return;
		}
		const projectId = project?.metadata.id;
		if (!projectId) {
			toast.error("项目尚未加载完成");
			return;
		}

		const creatorDNAPlanPrompt = composeCreatorDNAPlanPrompt({
			basePrompt: composedPrompt,
			currentIntent: extraRequest,
			brief,
			context: creatorDNAPlanningContext,
		});
		const analyzableAssets = assets.filter((asset) => asset.type !== "image");
		const indexesForPlan: Record<string, MediaIndex> = { ...mediaIndexes };
		const missingIndexes = analyzableAssets.filter((asset) => {
			const current = indexesForPlan[asset.id];
			const fingerprint = getMediaAssetFingerprint(asset);
			return (
				!current ||
				!current.sourceSnapshot.metadata.source.sourceId.includes(
					`:${fingerprint}:${asset.id}:metadata`,
				)
			);
		});
		const failedAnalysisNames: string[] = [];

		if (missingIndexes.length > 0) {
			const controller = new AbortController();
			blueprintAnalysisAbortRef.current = controller;
			try {
				for (const [index, asset] of missingIndexes.entries()) {
					setBlueprintAnalysisProgress({
						current: index + 1,
						total: missingIndexes.length,
						assetName: asset.name,
					});
					try {
						const capture = await captureLocalMediaSamples({
							asset,
							signal: controller.signal,
						});
						const mediaIndex = createMediaIndexFromLocalCapture({ capture });
						await saveMediaIndex({
							projectId,
							assetFingerprint: createLocalAssetFingerprint({ capture }),
							createdAt: new Date().toISOString(),
							index: mediaIndex,
						});
						indexesForPlan[asset.id] = mediaIndex;
						handleMediaIndexChange({ assetId: asset.id, index: mediaIndex });
					} catch (error) {
						if (controller.signal.aborted) throw error;
						failedAnalysisNames.push(asset.name);
					}
				}
			} catch (error) {
				if (controller.signal.aborted) {
					toast.info("已取消素材理解");
					return;
				}
				toast.error("素材理解未完成", {
					description: error instanceof Error ? error.message : undefined,
				});
			} finally {
				if (blueprintAnalysisAbortRef.current === controller) {
					blueprintAnalysisAbortRef.current = null;
				}
				setBlueprintAnalysisProgress(null);
			}
		}

		const nextPlan = createEditPlan({
			prompt: creatorDNAPlanPrompt.prompt,
			mode,
			assetCount: assets.length,
			unusedAssetCount,
			timelineElementCount: timelineElements.length,
			videoClipCount,
			durationSeconds,
		});
		const intentTarget = {
			platform: nextPlan.target.platform,
			aspectRatio: nextPlan.target.aspectRatio,
			...(nextPlan.target.targetDurationSeconds === undefined
				? {}
				: { durationSeconds: nextPlan.target.targetDurationSeconds }),
			style: nextPlan.target.style,
		};
		const intentUpdatedAt = new Date(
			Math.max(Date.now(), Date.parse(intentSpec?.updatedAt ?? "0") + 1),
		).toISOString();
		let nextIntentSpec =
			intentSpec ??
			createIntentSpec({
				projectId,
				userIntent:
					startingIntent.trim() ||
					extraRequest.trim() ||
					"根据当前创作简报生成一版可审查成片",
				target: intentTarget,
				source: "editor",
				createdAt: intentUpdatedAt,
			});
		if (intentSpec) {
			nextIntentSpec = updateIntentSpec({
				spec: intentSpec,
				changes: {
					...(startingIntent.trim() &&
					startingIntent.trim() !== intentSpec.userIntent
						? { userIntent: startingIntent.trim() }
						: {}),
					target: {
						platform: nextPlan.target.platform,
						aspectRatio: nextPlan.target.aspectRatio,
						durationSeconds: nextPlan.target.targetDurationSeconds ?? null,
						style: nextPlan.target.style,
					},
				},
				source: "editor",
				updatedAt: intentUpdatedAt,
			});
		}
		try {
			nextIntentSpec = await saveIntentSpec({ spec: nextIntentSpec });
		} catch (error) {
			toast.warning("创作意图仅保留在当前会话", {
				description: error instanceof Error ? error.message : undefined,
			});
		}
		setIntentSpec(nextIntentSpec);

		let planningExecutionPolicy: StudioExecutionPolicy;
		try {
			planningExecutionPolicy = createStudioExecutionPolicy({
				settings: studioProSettings,
				evidence: buildStudioExecutionEvidence({
					indexes: Object.values(indexesForPlan),
				}),
			});
		} catch (error) {
			toast.error("专业控制参数存在冲突", {
				description: error instanceof Error ? error.message : undefined,
			});
			return;
		}

		const decisionAssets = analyzableAssets.flatMap((asset) => {
			const index = indexesForPlan[asset.id];
			if (!index) return [];
			const inputFingerprint = getMediaAssetFingerprint(asset);
			let roughCutPlan;
			const matchingMainElements =
				scene?.tracks.main.elements.filter(
					(element) =>
						element.type === "video" &&
						element.mediaId === asset.id &&
						(element.retime?.rate ?? 1) === 1,
				) ?? [];
			const timelineElement = matchingMainElements[0];
			if (
				scene &&
				matchingMainElements.length === 1 &&
				timelineElement?.type === "video" &&
				planningExecutionPolicy.roughCut.candidateGenerationStatus !== "blocked"
			) {
				try {
					roughCutPlan = createRoughCutPlanFromMediaIndex({
						index,
						assetFingerprint: inputFingerprint,
						clip: {
							projectId,
							sceneId: scene.id,
							trackId: scene.tracks.main.id,
							elementId: timelineElement.id,
							assetId: asset.id,
							timelineStartSeconds: mediaTimeToSeconds({
								time: timelineElement.startTime,
							}),
							sourceStartSeconds: mediaTimeToSeconds({
								time: timelineElement.trimStart,
							}),
							durationSeconds: mediaTimeToSeconds({
								time: timelineElement.duration,
							}),
							playbackRate: 1,
						},
						options: planningExecutionPolicy.roughCut.options,
						createdAt: nextPlan.createdAt,
					});
				} catch {
					roughCutPlan = undefined;
				}
			}
			return [
				{
					assetId: asset.id,
					inputFingerprint,
					mediaIndex: index,
					...(roughCutPlan ? { roughCutPlan } : {}),
				},
			];
		});
		let nextEditDecision: LocalEditDecisionOrchestration | null = null;
		if (decisionAssets.length > 0) {
			try {
				nextEditDecision = orchestrateLocalEditDecision({
					intentSpec: nextIntentSpec,
					editPlan: nextPlan,
					assets: decisionAssets,
					storyGraph,
					createdAt: nextPlan.createdAt,
				});
			} catch (error) {
				toast.warning("素材决策需要重新生成", {
					description: error instanceof Error ? error.message : undefined,
				});
			}
		}

		setPlan(nextPlan);
		setIsPlanReviewed(false);
		setAppliedPlanId(null);
		setAppliedPlanCommand(null);
		setAppliedPlanDecision(null);
		setRememberedPlanId(null);
		setAppliedCreatorDNAConstraints(creatorDNAPlanPrompt.constraints);
		setDirectorAdvice(null);
		setEditDecisionOrchestration(nextEditDecision);
		setApprovedEditDecisionOperationIds(new Set());
		setAppliedEditDecisionCommand(null);
		setAppliedEditDecision(null);
		const nextOperationPlan = createVersionedEditPlan({
			intent: creatorDNAPlanPrompt.prompt,
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
		recordProjectVersion({
			label: "AI blueprint ready for review",
			createdAt: reviewRun.updatedAt,
			source: "edit-plan",
			creativeState: createProjectCreativeStateSnapshot({
				projectId,
				capturedAt: reviewRun.updatedAt,
				studio: {
					startingIntent,
					mode,
					brief,
					selectedRecipeId,
					settings: studioProSettings,
					extraRequest,
					isPlanReviewed: false,
					appliedPlanId: null,
					rememberedPlanId: null,
				},
				artifacts: {
					intentSpec: nextIntentSpec,
					editPlan: nextPlan,
					storyGraph,
					agentOrchestration: null,
					transcriptArtifact,
				},
			}),
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
		if (failedAnalysisNames.length > 0) {
			toast.warning("部分素材未完成本地理解", {
				description: `${failedAnalysisNames.join("、")} 仍会保留在项目中，但不会产生内容切口。`,
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

	const handleToggleEditDecisionOperation = ({
		operationId,
		approved,
	}: {
		operationId: string;
		approved: boolean;
	}) => {
		if (
			!activeEditDecisionOrchestration ||
			activeEditDecisionOrchestration.review.freshness.state !== "current" ||
			appliedEditDecisionCommand
		) {
			return;
		}
		const item = activeEditDecisionOrchestration.review.items.find(
			(candidate) => candidate.operation.operationId === operationId,
		);
		if (
			!item ||
			(item.operation.kind !== "trim" && item.operation.kind !== "remove") ||
			item.operation.availability === "blocked" ||
			editDecisionOperationApplicability[operationId]?.canApply === false
		) {
			const reason = editDecisionOperationApplicability[operationId]?.reason;
			if (reason) {
				toast.info("当前时间线不能安全执行这个切口", {
					description: reason,
				});
			}
			return;
		}
		setApprovedEditDecisionOperationIds((current) => {
			const next = new Set(current);
			if (approved) next.add(operationId);
			else next.delete(operationId);
			return next;
		});
	};

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
		const indexedSignals = Object.values(mediaIndexes);
		const sceneCandidateCount = indexedSignals.reduce(
			(total, index) => total + index.sceneBoundaries.length,
			0,
		);
		const audioCandidateCount = indexedSignals.reduce(
			(total, index) => total + index.audioActivityCandidates.length,
			0,
		);
		const activeTranscript =
			transcriptArtifact &&
			transcriptArtifact.projectId === project?.metadata.id &&
			transcriptArtifact.sceneId === scene?.id
				? transcriptArtifact
				: null;
		const transcriptEvidence = activeTranscript
			? transcriptPromptEvidence(activeTranscript)
			: "";
		const prompt = [
			`用户意图：${plan.prompt}`,
			`当前本地蓝图：${plan.summary}`,
			`素材证据：${plan.source.assetCount} 个素材，时间线 ${plan.source.timelineElementCount} 个元素，总时长 ${formatDuration(plan.source.durationSeconds)}。`,
			`本地信号证据：${indexedSignals.length} 个素材完成采样，${sceneCandidateCount} 个帧变化候选，${audioCandidateCount} 个音频能量区间。`,
			activeTranscript
				? `段落级转写证据：修订 ${activeTranscript.revision}，共 ${activeTranscript.segments.length} 段。以下文本与区间可以引用，但不是逐字时间码，也没有说话人、人物或情绪识别：\n${transcriptEvidence}`
				: "段落级转写证据：暂无。",
			activeTranscript
				? "请基于用户意图、项目元数据、采样信号和上述段落级转写提出结构、节奏、声音与交付建议。不得虚构逐字时间码、说话人、人物、情绪、语义画面或未提供的事实。"
				: "请指出结构、节奏、声音与交付上的改进建议。只可引用上述元数据、帧变化和音频能量；不得声称识别了对白、人物、语义场景、情绪或画面内容。",
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
						"你是 VisionCut 的导演顾问。只基于用户意图和明确提供的项目元数据、采样信号及段落级转写提出可审阅建议，严格遵守证据限制，绝不虚构视频理解结果。使用简洁中文。",
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
		const projectId = project?.metadata.id;
		if (!plan || !isPlanReviewed || !projectId) return;
		try {
			const result = await recordConfirmedPlanDecision({ plan, projectId });
			if (
				result.status === "profile-disabled" ||
				result.status === "ledger-disabled"
			) {
				toast.info("Creator DNA 已暂停", {
					description: "可以在工作室的 DNA 页面重新开启。",
				});
				return;
			}
			if (result.status === "duplicate") {
				setRememberedPlanId(plan.id);
				toast.info("这版方向已经记住了");
				return;
			}
			setRememberedPlanId(plan.id);
			toast.success("已记住这版创作方向", {
				description: "已写入当前项目的明确批准记录，并重新计算偏好。",
			});
		} catch (error) {
			toast.error("无法更新 Creator DNA", {
				description: error instanceof Error ? error.message : undefined,
			});
		}
	};

	const recordPlanDecisionSafely = async ({
		action,
		eventId,
		source,
		reversesEventId,
	}: {
		action: "apply" | "undo";
		eventId: string;
		source: CreatorDecisionEventSource;
		reversesEventId?: string;
	}): Promise<string | null> => {
		const projectId = project?.metadata.id;
		if (!plan || !projectId) return null;
		try {
			const event = createPlanDecisionEvent({
				plan,
				projectId,
				action,
				eventId,
				source,
				...(reversesEventId === undefined ? {} : { reversesEventId }),
			});
			const result = await recordCreatorDNADecisionEvent(event);
			return result.status === "recorded" || result.status === "duplicate"
				? result.event.id
				: null;
		} catch (error) {
			toast.warning("剪辑已完成，但 Creator DNA 记录失败", {
				description: error instanceof Error ? error.message : undefined,
			});
			return null;
		}
	};

	const handleOperationPlanChange = (
		nextOperationPlan: VersionedEditPlan,
	) => {
		const previousOperationPlan = operationPlan;
		setOperationPlan(nextOperationPlan);
		setIsPlanReviewed(false);

		const projectId = project?.metadata.id;
		if (!plan || !projectId || !previousOperationPlan) return;

		void (async () => {
			try {
				const events = createEditPlanReviewDecisionEvents({
					plan,
					projectId,
					previousReviewPlan: previousOperationPlan,
					nextReviewPlan: nextOperationPlan,
				});
				for (const event of events) {
					await recordCreatorDNADecisionEvent(event);
				}
			} catch (error) {
				toast.warning("审阅已更新，但 Creator DNA 记录失败", {
					description: error instanceof Error ? error.message : undefined,
				});
			}
		})();
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

	const handleCreateReviewAssembly = () => {
		if (!plan || unusedAssetCount === 0) return;
		const assemblyPlan: EditPlan = {
			...plan,
			steps: plan.steps.map((step) => ({
				...step,
				enabled:
					step.kind === "arrange-media" &&
					step.executor === "local" &&
					step.availability === "ready",
			})),
		};
		const result = applyLocalEditPlan({ editor, plan: assemblyPlan });
		if (!result.command || !result.sceneId || result.commandCount === 0) {
			toast.info("当前素材已经在时间线中，或没有可安全初排的视觉素材。");
			return;
		}
		setAppliedPlanCommand({
			command: result.command,
			sceneId: result.sceneId,
		});
		setAppliedPlanDecision(null);
		setEditDecisionOrchestration(null);
		setApprovedEditDecisionOperationIds(new Set());
		setAppliedEditDecisionCommand(null);
		setAppliedEditDecision(null);
		recordProjectVersion({
			label: "Created reversible media review assembly",
			createdAt: new Date().toISOString(),
			source: "timeline",
			refs: {},
		});
		toast.success("已创建可撤销素材初排", {
			description:
				"只按导入顺序放入未使用素材，没有做语义删改。请重新生成蓝图以获得与当前时间线绑定的切口建议。",
		});
	};

	const handleApplyEditDecision = async () => {
		if (!activeEditDecisionOrchestration || !scene) return;
		const approvedOperationIds = [...approvedEditDecisionOperationIds].sort();
		const applicability = inspectEditDecisionApplicability({
			tracks: scene.tracks,
			plan: activeEditDecisionOrchestration.plan,
			approvedOperationIds,
			currentAssets: currentEditDecisionAssets,
			hasTimelineBookmarks: scene.bookmarks.length > 0,
		});
		if (!applicability.canApply) {
			toast.error("批准的初剪暂时不能执行", {
				description: applicability.blockers
					.slice(0, 3)
					.map((blocker) => blocker.message)
					.join(" "),
			});
			return;
		}
		try {
			const command = new ApplyEditDecisionCommand({
				sceneId: scene.id,
				plan: activeEditDecisionOrchestration.plan,
				approvedOperationIds,
				currentAssets: currentEditDecisionAssets,
			});
			editor.command.execute({ command });
			setAppliedEditDecisionCommand(command);
			const decisionSource = {
				kind: "edit-decision",
				sourceId: activeEditDecisionOrchestration.plan.planId,
				surface: "timeline",
			} satisfies CreatorDecisionEventSource;
			const decisionEventId = await recordPlanDecisionSafely({
				action: "apply",
				eventId: `apply:${crypto.randomUUID()}`,
				source: decisionSource,
			});
			setAppliedEditDecision(
				decisionEventId
					? { eventId: decisionEventId, source: decisionSource }
					: null,
			);
			const approvedRun = approveBlueprintRunIfReview();
			recordProjectVersion({
				label: "Applied reviewed multi-asset first cut",
				createdAt: approvedRun?.updatedAt ?? new Date().toISOString(),
				source: "timeline",
				refs:
					project && operationPlan
						? {
								editPlan: {
									kind: operationPlan.kind,
									projectId: project.metadata.id,
									planId: operationPlan.planId,
									revision: operationPlan.revision,
									versionId: operationPlan.versionId,
								},
							}
						: {},
			});
			toast.success("已应用批准的多素材初剪", {
				description: `移除 ${formatDuration(applicability.removedSeconds)}，整组修改可一次撤销。`,
			});
		} catch (error) {
			toast.error("多素材初剪没有执行", {
				description: error instanceof Error ? error.message : undefined,
			});
		}
	};

	const handleUndoEditDecision = async () => {
		if (
			!appliedEditDecisionCommand ||
			!editor.command.isLatest(appliedEditDecisionCommand) ||
			scene?.id !== appliedEditDecisionCommand.sceneId
		) {
			toast.error(
				"这次初剪已不是当前场景的最近一次编辑，不能越过后续修改撤销。",
			);
			return;
		}
		const decisionToUndo = appliedEditDecision;
		editor.command.undo();
		setAppliedEditDecisionCommand(null);
		setAppliedEditDecision(null);
		recordProjectVersion({
			label: "Undid reviewed multi-asset first cut",
			createdAt: new Date().toISOString(),
			source: "timeline",
			refs: {},
		});
		if (decisionToUndo) {
			await recordPlanDecisionSafely({
				action: "undo",
				eventId: `undo:${decisionToUndo.eventId}`,
				source: decisionToUndo.source,
				reversesEventId: decisionToUndo.eventId,
			});
		}
		toast.success("已撤销多素材初剪");
	};

	const handleApplyLocal = async () => {
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
		if (result.command && result.sceneId) {
			setAppliedPlanCommand({
				command: result.command,
				sceneId: result.sceneId,
			});
		}
		const decisionSource = {
			kind: "confirmed-plan",
			sourceId: plan.id,
			surface: "timeline",
		} satisfies CreatorDecisionEventSource;
		const decisionEventId = await recordPlanDecisionSafely({
			action: "apply",
			eventId: `apply:${crypto.randomUUID()}`,
			source: decisionSource,
		});
		setAppliedPlanDecision(
			decisionEventId
				? { eventId: decisionEventId, source: decisionSource }
				: null,
		);
		const approvedRun = approveBlueprintRunIfReview();
		const projectId = project?.metadata.id;
		if (projectId && operationPlan) {
			const versionCreatedAt =
				approvedRun?.updatedAt ?? new Date().toISOString();
			recordProjectVersion({
				label: "Applied approved local changes",
				createdAt: versionCreatedAt,
				source: "timeline",
				creativeState: createProjectCreativeStateSnapshot({
					projectId,
					capturedAt: versionCreatedAt,
					studio: {
						startingIntent,
						mode,
						brief,
						selectedRecipeId,
						settings: studioProSettings,
						extraRequest,
						isPlanReviewed,
						appliedPlanId: plan.id,
						rememberedPlanId,
					},
					artifacts: {
						intentSpec,
						editPlan: plan,
						storyGraph,
						agentOrchestration,
						transcriptArtifact,
					},
				}),
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

	const handleUndo = async () => {
		if (
			!appliedPlanCommand ||
			!editor.command.isLatest(appliedPlanCommand.command) ||
			scene?.id !== appliedPlanCommand.sceneId
		) {
			toast.error(
				"这次整理已不是当前场景的最近一次编辑，不能越过后续修改撤销。",
			);
			return;
		}
		const decisionToUndo = appliedPlanDecision;
		editor.command.undo();
		setAppliedPlanId(null);
		setAppliedPlanCommand(null);
		setAppliedPlanDecision(null);
		const projectId = project?.metadata.id;
		if (projectId && operationPlan) {
			const versionCreatedAt = new Date().toISOString();
			recordProjectVersion({
				label: "Undid the latest local change set",
				createdAt: versionCreatedAt,
				source: "user",
				creativeState: createProjectCreativeStateSnapshot({
					projectId,
					capturedAt: versionCreatedAt,
					studio: {
						startingIntent,
						mode,
						brief,
						selectedRecipeId,
						settings: studioProSettings,
						extraRequest,
						isPlanReviewed,
						appliedPlanId: null,
						rememberedPlanId,
					},
					artifacts: {
						intentSpec,
						editPlan: plan,
						storyGraph,
						agentOrchestration,
						transcriptArtifact,
					},
				}),
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
		if (decisionToUndo) {
			await recordPlanDecisionSafely({
				action: "undo",
				eventId: `undo:${decisionToUndo.eventId}`,
				source: decisionToUndo.source,
				reversesEventId: decisionToUndo.eventId,
			});
		}
		toast.success("已撤销本次本机整理");
	};

	const buildHandoff = async () => {
		if (!plan || !project || !scene) return null;
		const importHistory = await listProjectChatCutImportEntries({
			projectId: project.metadata.id,
		});
		const bundle = createChatCutTargetState({
			project,
			scene,
			assets,
			mediaIndexes: Object.values(mediaIndexes),
			appliedImports: importHistory
				.filter(({ state }) => state === "applied")
				.map(({ record }) => record.receipt),
		});
		const assetState = new Map(
			bundle.target.assets.map((asset) => [asset.assetId, asset] as const),
		);
		const media: HandoffMediaItem[] = bundle.assetIdentities.map((asset) => ({
			visionCutAssetId: asset.assetId,
			name: asset.name,
			type: asset.type,
			fingerprint: asset.fingerprint,
			durationFrames: assetState.get(asset.assetId)?.durationFrames ?? 1,
			...(asset.durationSeconds === null
				? {}
				: { durationSeconds: asset.durationSeconds }),
			sizeBytes: asset.sizeBytes,
			lastModified: asset.lastModified,
		}));
		return createChatCutHandoff({
			project: { id: project.metadata.id, name: project.metadata.name },
			media,
			plan,
			targetState: bundle.target,
			timebase: bundle.timebase,
		});
	};

	const handleCopyHandoff = async () => {
		if (!isPlanReviewed) return;
		try {
			const handoff = await buildHandoff();
			if (!handoff || handoff.requestedSteps.length === 0) return;
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
		} catch (error: unknown) {
			toast.error("无法复制 ChatCut 交接任务", {
				description:
					error instanceof Error
						? error.message
						: "浏览器不允许写入剪贴板，请下载交接包。",
			});
		}
	};

	const handleDownloadHandoff = async () => {
		try {
			const handoff = await buildHandoff();
			if (!handoff) return;
			downloadJson({
				value: handoff,
				filename: `flowcut-chatcut-${project?.metadata.id ?? "project"}.json`,
			});
		} catch (error: unknown) {
			toast.error("无法生成 ChatCut 交接包", {
				description: error instanceof Error ? error.message : undefined,
			});
		}
	};

	const handleChatCutImported = (receipt: ChatCutImportApplyReceipt) => {
		recordProjectVersion({
			label: `Applied ChatCut result (${receipt.operationIds.length} operations)`,
			createdAt: receipt.appliedAt,
			source: "import",
			refs: {
				timelineSnapshot: {
					kind: "visioncut.timeline-snapshot",
					projectId: receipt.projectId,
					snapshotId: receipt.toVersionId,
					version: receipt.toVersion,
				},
			},
		});
	};

	const handleChatCutUndone = (receipt: ChatCutImportApplyReceipt) => {
		recordProjectVersion({
			label: "Undid ChatCut import",
			createdAt: new Date().toISOString(),
			source: "user",
			refs: {
				timelineSnapshot: {
					kind: "visioncut.timeline-snapshot",
					projectId: receipt.projectId,
					snapshotId: receipt.undoReference.snapshotId,
					version: receipt.fromVersion,
				},
			},
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
	const canCreateReviewAssembly =
		unusedAssetCount > 0 &&
		plan?.steps.some(
			(step) =>
				step.kind === "arrange-media" &&
				step.executor === "local" &&
				step.availability === "ready",
		) === true;
	const canUndoPlan =
		appliedPlanCommand !== null &&
		editor.command.isLatest(appliedPlanCommand.command) &&
		scene?.id === appliedPlanCommand.sceneId;
	const canUndoEditDecision =
		appliedEditDecisionCommand !== null &&
		editor.command.isLatest(appliedEditDecisionCommand) &&
		scene?.id === appliedEditDecisionCommand.sceneId;

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
				mediaIndexes={Object.values(mediaIndexes)}
				transcriptArtifact={transcriptArtifact}
				chatCutBridge={
					project && scene ? (
						<VisionCutChatCutBridge
							project={project}
							scene={scene}
							assets={assets}
							mediaIndexes={Object.values(mediaIndexes)}
							plan={plan}
							planReviewed={isPlanReviewed}
							onImportApplied={handleChatCutImported}
							onImportUndone={handleChatCutUndone}
						/>
					) : undefined
				}
				initialIntent={startingIntent}
				onImportMedia={requestMediaImport}
				onImportOpenverse={handleImportOpenverse}
				onOpenDirector={() => setSurface("director")}
				onOpenModels={() => setSurface("models")}
				onOpenNativeExport={requestNativeExport}
				onModelSelectionChange={setModelSelection}
				onAgentOrchestrationChange={setAgentOrchestration}
				onMediaIndexChange={handleMediaIndexChange}
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

					{creatorDNAPlanningContext?.status === "ready" ? (
						<section className="border-y py-3">
							<div className="flex items-start gap-2.5">
								<Fingerprint className="mt-0.5 size-4 shrink-0 text-emerald-600" />
								<div className="min-w-0">
									<p className="text-[12px] font-semibold">
										Creator DNA 已参与候选规划
									</p>
									<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
										已读取 {creatorDNAPlanningContext.constraints.length}{" "}
										条确认偏好。仅在选项仍为自动且不与本次文字要求冲突时引用，执行前仍需审阅。
									</p>
								</div>
							</div>
						</section>
					) : null}

					<Button
						className="flowcut-generate-button h-12 w-full rounded-[8px] text-[12px]"
						onClick={() => void handleCreatePlan()}
					>
						{blueprintAnalysisProgress ? (
							<CircleStop className="size-4" />
						) : hasMedia ? (
							<Wand2 className="size-4" />
						) : (
							<UploadCloud className="size-4" />
						)}
						{blueprintAnalysisProgress
							? `理解素材 ${blueprintAnalysisProgress.current}/${blueprintAnalysisProgress.total} · 点击取消`
							: hasMedia
								? "理解素材并生成成片蓝图"
								: "导入素材开始"}
					</Button>

					<div className="flowcut-capability-row flex gap-2 px-1 text-[10px] leading-relaxed text-muted-foreground">
						<Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
						<span>
							生成时会在浏览器内采样画面变化和音频能量，不上传原素材。语义、人物与情绪结论只在有转写或明确证据时成立。
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
								{appliedCreatorDNAConstraints.length > 0 ? (
									<div className="mt-3 border-t pt-3">
										<div className="flex items-center justify-between gap-2">
											<p className="flex items-center gap-1.5 text-[11px] font-semibold">
												<Fingerprint className="size-3.5 text-emerald-600" />
												本次 Creator DNA 参考
											</p>
											<span className="text-[10px] text-muted-foreground">
												{appliedCreatorDNAConstraints.length} 条 · 待总审阅
											</span>
										</div>
										<div className="mt-2 divide-y border-y">
											{appliedCreatorDNAConstraints.map((constraint) => (
												<div key={constraint.id} className="py-2">
													<p className="text-[11px] leading-relaxed">
														{constraint.guidance}
													</p>
													<p className="mt-1 text-[10px] text-muted-foreground">
														{constraint.evidence.origin === "explicit-override"
															? "用户明确设置"
															: `${constraint.evidence.evidenceCount} 次已确认方案`}
														；当前创作意图优先，不会自动执行
													</p>
												</div>
											))}
										</div>
									</div>
								) : null}
							</section>

							{activeEditDecisionOrchestration ? (
								<VisionCutEditDecisionReview
									orchestration={activeEditDecisionOrchestration}
									assetNames={editDecisionAssetNames}
									approvedOperationIds={approvedEditDecisionOperationIds}
									onToggleOperation={handleToggleEditDecisionOperation}
									onApply={handleApplyEditDecision}
									applied={appliedEditDecisionCommand !== null}
									canUndo={canUndoEditDecision}
									onUndo={handleUndoEditDecision}
									executionPolicy={studioExecutionPolicy}
									operationApplicability={editDecisionOperationApplicability}
									canCreateAssembly={canCreateReviewAssembly}
									onCreateAssembly={handleCreateReviewAssembly}
								/>
							) : null}

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
										<p className="mt-1 text-[9px] text-muted-foreground">
											{transcriptArtifact
												? `已连接 ${transcriptArtifact.segments.length} 段本地转写；仅按段落时间码引用`
												: "尚无转写；不会猜测对白、人物或情绪"}
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
										onPlanChange={handleOperationPlanChange}
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
							title={
								canUndoPlan
									? "撤销本次本机整理"
									: "已有后续编辑或场景已切换，不能在这里撤销"
							}
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
