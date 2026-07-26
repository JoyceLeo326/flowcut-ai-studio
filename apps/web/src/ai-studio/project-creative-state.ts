import { z } from "zod";
import type { CreativeBriefSelection, EditMode, EditPlan } from "@/ai-edit";
import type { IntentSpec } from "./intent-spec";
import { parseIntentSpec } from "./intent-spec";
import type { AgentOrchestration } from "./agent-orchestrator";
import { parseAgentOrchestration } from "./agent-orchestrator";
import type { StoryGraph } from "./story-graph-model";
import { parseStoryGraphForStorage } from "./story-graph-store";
import type { TimelineTranscriptArtifact } from "./transcript-artifact";
import { parseTimelineTranscriptArtifact } from "./transcript-artifact";
import {
	AUTOMATION_RECIPES,
	type AutomationRecipeId,
	type StudioProSettings,
} from "./catalog";
import { loadProjectVersion } from "./project-version-store";

export const PROJECT_CREATIVE_STATE_KIND =
	"visioncut.project-creative-state" as const;
export const PROJECT_CREATIVE_STATE_SCHEMA_VERSION = 1 as const;
export const PROJECT_CREATIVE_STATE_RESTORED_EVENT =
	"visioncut:project-creative-state-restored" as const;

export interface ProjectCreativeStateSnapshot {
	readonly kind: typeof PROJECT_CREATIVE_STATE_KIND;
	readonly schemaVersion: typeof PROJECT_CREATIVE_STATE_SCHEMA_VERSION;
	readonly projectId: string;
	readonly capturedAt: string;
	readonly studio: {
		readonly startingIntent: string;
		readonly mode: EditMode;
		readonly brief: CreativeBriefSelection;
		readonly selectedRecipeId: AutomationRecipeId;
		readonly settings: StudioProSettings;
		readonly extraRequest: string;
		readonly isPlanReviewed: boolean;
		readonly appliedPlanId: string | null;
		readonly rememberedPlanId: string | null;
	};
	readonly artifacts: {
		readonly intentSpec: IntentSpec | null;
		readonly editPlan: EditPlan | null;
		readonly storyGraph: StoryGraph | null;
		readonly agentOrchestration: AgentOrchestration | null;
		readonly transcriptArtifact: TimelineTranscriptArtifact | null;
	};
	readonly restorePolicy: {
		readonly pendingEditDecisionRestored: false;
		readonly creatorDNARestored: false;
		readonly creatorDNAScope: "cross-project-reference";
		readonly requiresFreshExecutionReview: true;
	};
}

export interface ProjectCreativeStateRestoredEventDetail {
	readonly projectId: string;
	readonly snapshot: ProjectCreativeStateSnapshot;
}

const canonicalTimestampSchema = z.string().refine(
	(value) => {
		const milliseconds = Date.parse(value);
		return (
			Number.isFinite(milliseconds) &&
			new Date(milliseconds).toISOString() === value
		);
	},
	{ message: "Creative state timestamp must be canonical ISO-8601." },
);
const normalizedTextSchema = z.string().max(24_000);
const nullableTextSchema = z.string().min(1).max(240).nullable();
const aspectRatioSchema = z.enum(["16:9", "9:16", "4:5", "1:1"]);
const editModeSchema = z.enum(["local", "hybrid", "chatcut"]);
const creativeBriefSchema = z
	.object({
		recipeId: z.string().nullable(),
		platformId: z.string().nullable(),
		styleId: z.string().nullable(),
		captionId: z.string().nullable(),
		motionId: z.string().nullable(),
		audioId: z.string().nullable(),
		deliveryIds: z.array(z.string()).max(50),
	})
	.strict();
const studioSettingsSchema = z
	.object({
		silenceThresholdMs: z.number().min(150).max(2_000),
		cutPaddingMs: z.number().min(0).max(800),
		sceneSensitivity: z.number().min(0).max(100),
		brollDensity: z.number().min(0).max(100),
		captionDensity: z.number().min(0).max(100),
		punchInIntensity: z.number().min(0).max(24),
		targetLufs: z.number().min(-24).max(-6),
		outputCount: z.number().int().min(1).max(6),
		fillerHandling: z.enum(["review", "remove", "keep"]),
	})
	.strict()
	.refine(
		(settings) => settings.cutPaddingMs * 2 < settings.silenceThresholdMs,
		{
			message:
				"Creative state cut padding must leave a positive silence interval.",
		},
	);
const editPlanSchema = z
	.object({
		id: z.string().min(1).max(240),
		formatVersion: z.literal("flowcut.edit-plan/v1"),
		prompt: normalizedTextSchema.min(1),
		mode: editModeSchema,
		createdAt: canonicalTimestampSchema,
		source: z
			.object({
				assetCount: z.number().int().nonnegative(),
				unusedAssetCount: z.number().int().nonnegative(),
				timelineElementCount: z.number().int().nonnegative(),
				videoClipCount: z.number().int().nonnegative(),
				durationSeconds: z.number().finite().nonnegative(),
			})
			.strict(),
		target: z
			.object({
				platform: z.enum([
					"generic",
					"douyin",
					"xiaohongshu",
					"bilibili",
					"youtube",
					"podcast",
				]),
				label: z.string().min(1).max(240),
				aspectRatio: aspectRatioSchema,
				targetDurationSeconds: z.number().positive().optional(),
				style: z.string().min(1).max(240),
			})
			.strict(),
		creativeDirection: z
			.object({
				hook: z.string().max(4_000),
				narrative: z.string().max(4_000),
				captionStyle: z.string().max(4_000),
				motionStyle: z.string().max(4_000),
				audioStrategy: z.string().max(4_000),
				colorMood: z.string().max(4_000),
				outputVariants: z
					.array(
						z
							.object({
								label: z.string().min(1).max(240),
								aspectRatio: aspectRatioSchema,
								targetDurationSeconds: z.number().positive().optional(),
							})
							.strict(),
					)
					.max(12),
			})
			.strict(),
		summary: z.string().max(8_000),
		reviewChecklist: z.array(z.string().max(2_000)).max(100),
		riskNotes: z.array(z.string().max(2_000)).max(100),
		steps: z
			.array(
				z
					.object({
						id: z.string().min(1).max(240),
						kind: z.enum([
							"import-media",
							"arrange-media",
							"tighten-clips",
							"set-aspect-ratio",
							"remove-silence",
							"transcribe-captions",
							"semantic-highlights",
							"creative-polish",
							"audio-design",
							"create-versions",
						]),
						title: z.string().min(1).max(500),
						description: z.string().max(4_000),
						executor: z.enum(["local", "chatcut"]),
						availability: z.enum(["ready", "handoff", "blocked"]),
						enabled: z.boolean(),
						params: z
							.object({ aspectRatio: aspectRatioSchema.optional() })
							.strict()
							.optional(),
					})
					.strict(),
			)
			.max(100),
	})
	.strict();
const creativeStateEnvelopeSchema = z
	.object({
		kind: z.literal(PROJECT_CREATIVE_STATE_KIND),
		schemaVersion: z.literal(PROJECT_CREATIVE_STATE_SCHEMA_VERSION),
		projectId: z.string().min(1).max(200),
		capturedAt: canonicalTimestampSchema,
		studio: z
			.object({
				startingIntent: normalizedTextSchema,
				mode: editModeSchema,
				brief: creativeBriefSchema,
				selectedRecipeId: z.string().min(1).max(120),
				settings: studioSettingsSchema,
				extraRequest: normalizedTextSchema,
				isPlanReviewed: z.boolean(),
				appliedPlanId: nullableTextSchema,
				rememberedPlanId: nullableTextSchema,
			})
			.strict(),
		artifacts: z
			.object({
				intentSpec: z.unknown().nullable(),
				editPlan: z.unknown().nullable(),
				storyGraph: z.unknown().nullable(),
				agentOrchestration: z.unknown().nullable(),
				transcriptArtifact: z.unknown().nullable(),
			})
			.strict(),
		restorePolicy: z
			.object({
				pendingEditDecisionRestored: z.literal(false),
				creatorDNARestored: z.literal(false),
				creatorDNAScope: z.literal("cross-project-reference"),
				requiresFreshExecutionReview: z.literal(true),
			})
			.strict(),
	})
	.strict();

function isAutomationRecipeId(value: string): value is AutomationRecipeId {
	return AUTOMATION_RECIPES.some((recipe) => recipe.id === value);
}

function parseEditPlan(value: unknown): EditPlan | null {
	const parsed = editPlanSchema.safeParse(value);
	return parsed.success ? parsed.data : null;
}

function projectIdsMatch({
	projectId,
	intentSpec,
	storyGraph,
	agentOrchestration,
	transcriptArtifact,
}: {
	projectId: string;
	intentSpec: IntentSpec | null;
	storyGraph: StoryGraph | null;
	agentOrchestration: AgentOrchestration | null;
	transcriptArtifact: TimelineTranscriptArtifact | null;
}): boolean {
	return (
		(intentSpec === null || intentSpec.projectId === projectId) &&
		(storyGraph === null || storyGraph.projectId === projectId) &&
		(agentOrchestration === null ||
			agentOrchestration.projectId === projectId) &&
		(transcriptArtifact === null || transcriptArtifact.projectId === projectId)
	);
}

function createRestorableStoryGraph(
	storyGraph: StoryGraph | null,
): StoryGraph | null {
	if (storyGraph === null) return null;
	return {
		...storyGraph,
		nodes: storyGraph.nodes.map((node) => {
			const restorableNode = { ...node };
			Reflect.deleteProperty(restorableNode, "thumbnail");
			return restorableNode;
		}),
	};
}

export function parseProjectCreativeStateSnapshot({
	value,
}: {
	value: unknown;
}): ProjectCreativeStateSnapshot | null {
	const parsed = creativeStateEnvelopeSchema.safeParse(value);
	if (!parsed.success) return null;
	const { artifacts, studio } = parsed.data;
	if (!isAutomationRecipeId(studio.selectedRecipeId)) return null;

	const intentSpec =
		artifacts.intentSpec === null
			? null
			: parseIntentSpec({ value: artifacts.intentSpec });
	const editPlan =
		artifacts.editPlan === null ? null : parseEditPlan(artifacts.editPlan);
	const storyGraph =
		artifacts.storyGraph === null
			? null
			: parseStoryGraphForStorage({ value: artifacts.storyGraph });
	const transcriptArtifact =
		artifacts.transcriptArtifact === null
			? null
			: parseTimelineTranscriptArtifact({
					value: artifacts.transcriptArtifact,
				});
	let agentOrchestration: AgentOrchestration | null = null;
	if (artifacts.agentOrchestration !== null) {
		try {
			agentOrchestration = parseAgentOrchestration({
				value: artifacts.agentOrchestration,
			});
		} catch {
			return null;
		}
	}
	if (
		(artifacts.intentSpec !== null && intentSpec === null) ||
		(artifacts.editPlan !== null && editPlan === null) ||
		(artifacts.storyGraph !== null && storyGraph === null) ||
		(artifacts.transcriptArtifact !== null && transcriptArtifact === null) ||
		!projectIdsMatch({
			projectId: parsed.data.projectId,
			intentSpec,
			storyGraph,
			agentOrchestration,
			transcriptArtifact,
		})
	) {
		return null;
	}
	if (studio.isPlanReviewed && editPlan === null) return null;
	if (studio.appliedPlanId !== null && studio.appliedPlanId !== editPlan?.id) {
		return null;
	}

	return Object.freeze({
		kind: parsed.data.kind,
		schemaVersion: parsed.data.schemaVersion,
		projectId: parsed.data.projectId,
		capturedAt: parsed.data.capturedAt,
		studio: Object.freeze({
			...studio,
			selectedRecipeId: studio.selectedRecipeId,
			brief: Object.freeze({
				...studio.brief,
				deliveryIds: [...studio.brief.deliveryIds],
			}),
			settings: Object.freeze({ ...studio.settings }),
		}),
		artifacts: Object.freeze({
			intentSpec,
			editPlan: editPlan === null ? null : structuredClone(editPlan),
			storyGraph,
			agentOrchestration,
			transcriptArtifact,
		}),
		restorePolicy: Object.freeze({ ...parsed.data.restorePolicy }),
	});
}

export function createProjectCreativeStateSnapshot({
	projectId,
	capturedAt,
	studio,
	artifacts,
}: Omit<
	ProjectCreativeStateSnapshot,
	"kind" | "schemaVersion" | "restorePolicy"
>): ProjectCreativeStateSnapshot {
	const parsed = parseProjectCreativeStateSnapshot({
		value: {
			kind: PROJECT_CREATIVE_STATE_KIND,
			schemaVersion: PROJECT_CREATIVE_STATE_SCHEMA_VERSION,
			projectId,
			capturedAt,
			studio,
			artifacts: {
				...artifacts,
				storyGraph: createRestorableStoryGraph(artifacts.storyGraph),
			},
			restorePolicy: {
				pendingEditDecisionRestored: false,
				creatorDNARestored: false,
				creatorDNAScope: "cross-project-reference",
				requiresFreshExecutionReview: true,
			},
		},
	});
	if (parsed === null) {
		throw new Error("Project creative state snapshot is invalid.");
	}
	return parsed;
}

export function emitProjectCreativeStateRestored({
	snapshot,
}: {
	snapshot: ProjectCreativeStateSnapshot;
}): void {
	if (typeof window === "undefined") return;
	const detail: ProjectCreativeStateRestoredEventDetail = Object.freeze({
		projectId: snapshot.projectId,
		snapshot,
	});
	window.dispatchEvent(
		new CustomEvent<ProjectCreativeStateRestoredEventDetail>(
			PROJECT_CREATIVE_STATE_RESTORED_EVENT,
			{ detail },
		),
	);
}

export async function loadLatestProjectCreativeStateSnapshot({
	projectId,
}: {
	projectId: string;
}): Promise<ProjectCreativeStateSnapshot | null> {
	const version = await loadProjectVersion({ projectId });
	const value = version?.restorePayload?.creativeState;
	if (value === undefined) return null;
	const snapshot = parseProjectCreativeStateSnapshot({ value });
	return snapshot?.projectId === projectId ? snapshot : null;
}
