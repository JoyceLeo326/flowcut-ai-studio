import type { EditPlan } from "../ai-edit/types";
import type { IntentSpec } from "./intent-spec";
import {
	assertMediaIndexInvariants,
	type MediaIndex,
	type MediaIndexAudioActivityCandidate,
	type MediaIndexFindingBase,
	type MediaIndexSceneBoundary,
} from "./media-index";
import {
	assertRoughCutPlan,
	type RoughCutOperation,
	type RoughCutPlan,
} from "./rough-cut-plan";
import type { StoryGraph, StoryGraphNode } from "./story-graph-model";

export const EDIT_DECISION_PLAN_KIND = "visioncut.edit-decision-plan" as const;
export const EDIT_DECISION_PLAN_SCHEMA_VERSION = 1 as const;
export const EDIT_DECISION_REVIEW_KIND =
	"visioncut.edit-decision-review" as const;

export type EditDecisionOperationKind =
	| "trim"
	| "remove"
	| "reorder"
	| "primary"
	| "b-roll";

export type EditDecisionAvailability = "executable" | "suggestion" | "blocked";

export interface EditDecisionSourceRange {
	readonly unit: "seconds";
	readonly startSeconds: number;
	readonly endSeconds: number;
}

export interface EditDecisionAssetInput {
	readonly assetId: string;
	readonly inputFingerprint: string;
	readonly mediaIndex: MediaIndex;
	readonly roughCutPlan?: RoughCutPlan;
}

export interface CreateEditDecisionPlanInput {
	readonly intentSpec: IntentSpec;
	readonly editPlan: EditPlan;
	readonly assets: readonly EditDecisionAssetInput[];
	readonly storyGraph?: StoryGraph;
	readonly createdAt: string;
}

export interface EditDecisionAssetSnapshot {
	readonly assetId: string;
	readonly inputFingerprint: string;
	readonly mediaIndexId: string;
	readonly mediaIndexAlgorithmVersion: string;
	readonly durationSeconds: number;
	readonly sourceOrder: number;
	readonly storyGraphNodeIds: readonly string[];
	readonly roughCutPlanId?: string;
}

interface EditDecisionOperationBase {
	readonly operationId: string;
	readonly kind: EditDecisionOperationKind;
	readonly assetId: string;
	readonly sourceRange: EditDecisionSourceRange;
	readonly inputFingerprint: string;
	readonly mediaIndexId: string;
	readonly evidenceIds: readonly string[];
	readonly reason: string;
	readonly availability: EditDecisionAvailability;
	readonly availabilityReason: string;
	readonly requiresExplicitReview: true;
}

export interface EditDecisionTrimOperation extends EditDecisionOperationBase {
	readonly kind: "trim";
	readonly edge: "head" | "tail";
}

export interface EditDecisionRemoveOperation extends EditDecisionOperationBase {
	readonly kind: "remove";
}

export interface EditDecisionReorderOperation extends EditDecisionOperationBase {
	readonly kind: "reorder";
	readonly fromIndex: number;
	readonly proposedIndex: number;
}

export interface EditDecisionPrimaryOperation extends EditDecisionOperationBase {
	readonly kind: "primary";
	readonly candidateRank: number;
}

export interface EditDecisionBrollOperation extends EditDecisionOperationBase {
	readonly kind: "b-roll";
	readonly candidateRank: number;
}

export type EditDecisionOperation =
	| EditDecisionTrimOperation
	| EditDecisionRemoveOperation
	| EditDecisionReorderOperation
	| EditDecisionPrimaryOperation
	| EditDecisionBrollOperation;

export interface EditDecisionPlan {
	readonly kind: typeof EDIT_DECISION_PLAN_KIND;
	readonly schemaVersion: typeof EDIT_DECISION_PLAN_SCHEMA_VERSION;
	readonly planId: string;
	readonly projectId: string;
	readonly createdAt: string;
	readonly intent: {
		readonly revision: number;
		readonly userIntent: string;
		readonly target: IntentSpec["target"];
	};
	readonly editPlan: {
		readonly planId: string;
		readonly formatVersion: EditPlan["formatVersion"];
		readonly mode: EditPlan["mode"];
		readonly prompt: string;
		readonly target: EditPlan["target"];
	};
	readonly storyGraph: {
		readonly graphId: string;
		readonly version: number;
	} | null;
	readonly inputs: {
		readonly assets: readonly EditDecisionAssetSnapshot[];
	};
	readonly suggestedAssetOrder: readonly string[];
	readonly primaryCandidateAssetId: string | null;
	readonly operations: readonly EditDecisionOperation[];
	readonly limitations: readonly string[];
	readonly guarantees: {
		readonly localOnly: true;
		readonly deterministic: true;
		readonly network: false;
		readonly paidService: false;
		readonly mutatesProject: false;
		readonly createsCommand: false;
		readonly requiresExplicitReview: true;
		readonly semanticClaims: false;
	};
}

export interface EditDecisionCurrentAssetState {
	readonly assetId: string;
	readonly inputFingerprint: string;
	readonly mediaIndexId: string;
}

export type EditDecisionStaleReasonCode =
	| "asset-missing"
	| "asset-added"
	| "fingerprint-changed"
	| "media-index-changed";

export interface EditDecisionStaleReason {
	readonly code: EditDecisionStaleReasonCode;
	readonly assetId: string;
	readonly expected: string | null;
	readonly actual: string | null;
}

export interface EditDecisionFreshness {
	readonly state: "current" | "stale";
	readonly staleAssetIds: readonly string[];
	readonly reasons: readonly EditDecisionStaleReason[];
}

export type EditDecisionReviewChoice =
	| "approve"
	| "approve-as-suggestion"
	| "reject";

export interface EditDecisionOperationReviewItem {
	readonly operation: EditDecisionOperation;
	readonly decision: "pending";
	readonly allowedDecisions: readonly EditDecisionReviewChoice[];
	readonly executionEligible: boolean;
}

export interface EditDecisionOperationReviewPayload {
	readonly kind: typeof EDIT_DECISION_REVIEW_KIND;
	readonly schemaVersion: typeof EDIT_DECISION_PLAN_SCHEMA_VERSION;
	readonly projectId: string;
	readonly planId: string;
	readonly createdAt: string;
	readonly freshness: EditDecisionFreshness;
	readonly items: readonly EditDecisionOperationReviewItem[];
	readonly requiresExplicitConfirmation: true;
	readonly mutatesProject: false;
}

export interface LocalEditDecisionOrchestration {
	readonly plan: EditDecisionPlan;
	readonly review: EditDecisionOperationReviewPayload;
}

export class EditDecisionOrchestratorError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EditDecisionOrchestratorError";
	}
}

type OperationWithoutId = {
	[K in EditDecisionOperationKind]: Omit<
		Extract<EditDecisionOperation, { readonly kind: K }>,
		"operationId"
	>;
}[EditDecisionOperationKind];

interface NormalizedAsset {
	readonly assetId: string;
	readonly inputFingerprint: string;
	readonly mediaIndex: MediaIndex;
	readonly roughCutPlan?: RoughCutPlan;
	readonly sourceOrder: number;
	readonly graphNodes: readonly StoryGraphNode[];
}

interface RankedAsset extends NormalizedAsset {
	readonly voiceDurationSeconds: number;
	readonly sceneBoundaryCount: number;
	readonly baselineOrder: number;
}

const KIND_ORDER: Readonly<Record<EditDecisionOperationKind, number>> =
	Object.freeze({
		primary: 0,
		reorder: 1,
		trim: 2,
		remove: 3,
		"b-roll": 4,
	});

const GUARANTEES = Object.freeze({
	localOnly: true as const,
	deterministic: true as const,
	network: false as const,
	paidService: false as const,
	mutatesProject: false as const,
	createsCommand: false as const,
	requiresExplicitReview: true as const,
	semanticClaims: false as const,
});

const LIMITATIONS = Object.freeze([
	"MediaIndex provides local frame-difference, luminance, and audio-energy signals only.",
	"No transcript, speaker, person, emotion, or semantic scene understanding is available.",
	"Primary narrative, B-roll, ordering, trim, and removal results remain review suggestions or blocked decisions.",
	"This module creates no editor Command and never mutates the project.",
] as const);

function stableHash(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}

function deepFreeze<T>(value: T): T {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		for (const child of Object.values(value)) {
			deepFreeze(child);
		}
		Object.freeze(value);
	}
	return value;
}

function canonicalTimestamp(value: string): string {
	const milliseconds = Date.parse(value);
	if (
		!Number.isFinite(milliseconds) ||
		new Date(milliseconds).toISOString() !== value
	) {
		throw new EditDecisionOrchestratorError(
			"createdAt must be a canonical ISO-8601 timestamp.",
		);
	}
	return value;
}

function normalizedIdentifier({
	value,
	label,
	maxLength = 512,
}: {
	value: string;
	label: string;
	maxLength?: number;
}): string {
	const normalized = value.trim();
	if (
		!normalized ||
		normalized !== value ||
		Array.from(normalized).length > maxLength
	) {
		throw new EditDecisionOrchestratorError(`${label} is invalid.`);
	}
	return normalized;
}

function roundSeconds(value: number): number {
	return Number(value.toFixed(6));
}

function sourceRange({
	startSeconds,
	endSeconds,
	durationSeconds,
}: {
	startSeconds: number;
	endSeconds: number;
	durationSeconds: number;
}): EditDecisionSourceRange {
	if (
		!Number.isFinite(startSeconds) ||
		!Number.isFinite(endSeconds) ||
		startSeconds < 0 ||
		endSeconds < startSeconds ||
		endSeconds > durationSeconds
	) {
		throw new EditDecisionOrchestratorError(
			"Decision source range is outside the indexed asset.",
		);
	}
	return {
		unit: "seconds",
		startSeconds: roundSeconds(startSeconds),
		endSeconds: roundSeconds(endSeconds),
	};
}

function uniqueSorted(values: readonly string[]): readonly string[] {
	return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function findingEvidenceIds(finding: MediaIndexFindingBase): readonly string[] {
	return uniqueSorted([
		finding.findingId,
		...finding.evidence.map((evidence) => evidence.observationId),
	]);
}

function voiceCandidates({
	mediaIndex,
}: {
	mediaIndex: MediaIndex;
}): readonly MediaIndexAudioActivityCandidate[] {
	return mediaIndex.audioActivityCandidates.filter(
		(candidate) => candidate.candidateType === "voice-activity",
	);
}

function silenceCandidates({
	mediaIndex,
}: {
	mediaIndex: MediaIndex;
}): readonly MediaIndexAudioActivityCandidate[] {
	return mediaIndex.audioActivityCandidates.filter(
		(candidate) => candidate.candidateType === "silence",
	);
}

function voiceDuration({ mediaIndex }: { mediaIndex: MediaIndex }): number {
	return roundSeconds(
		voiceCandidates({ mediaIndex }).reduce(
			(total, candidate) =>
				total +
				(candidate.timeRange.endSeconds - candidate.timeRange.startSeconds),
			0,
		),
	);
}

function graphNodesByAsset({
	storyGraph,
}: {
	storyGraph?: StoryGraph;
}): ReadonlyMap<string, readonly StoryGraphNode[]> {
	const byAsset = new Map<string, StoryGraphNode[]>();
	for (const node of storyGraph?.nodes ?? []) {
		const assetId = node.assetId ?? node.mediaId;
		if (!assetId) continue;
		const nodes = byAsset.get(assetId) ?? [];
		nodes.push(node);
		byAsset.set(assetId, nodes);
	}
	for (const [assetId, nodes] of byAsset) {
		nodes.sort(
			(left, right) =>
				(left.timelineStart ?? Number.POSITIVE_INFINITY) -
					(right.timelineStart ?? Number.POSITIVE_INFINITY) ||
				left.id.localeCompare(right.id),
		);
		byAsset.set(assetId, nodes);
	}
	return byAsset;
}

function graphBaselineOrder({ asset }: { asset: NormalizedAsset }): number {
	const firstTimelineStart = asset.graphNodes
		.map((node) => node.timelineStart)
		.filter((value): value is number => value !== null)
		.sort((left, right) => left - right)[0];
	return firstTimelineStart ?? asset.sourceOrder;
}

function normalizeAssets({
	projectId,
	assets,
	storyGraph,
}: {
	projectId: string;
	assets: readonly EditDecisionAssetInput[];
	storyGraph?: StoryGraph;
}): readonly NormalizedAsset[] {
	if (assets.length === 0) {
		throw new EditDecisionOrchestratorError(
			"At least one indexed asset is required.",
		);
	}
	if (storyGraph && storyGraph.projectId !== projectId) {
		throw new EditDecisionOrchestratorError(
			"Story Graph belongs to another project.",
		);
	}

	const graphNodes = graphNodesByAsset({ storyGraph });
	const seenAssetIds = new Set<string>();
	const normalized = assets.map((asset, sourceOrder) => {
		const assetId = normalizedIdentifier({
			value: asset.assetId,
			label: "assetId",
		});
		const inputFingerprint = normalizedIdentifier({
			value: asset.inputFingerprint,
			label: "inputFingerprint",
		});
		if (seenAssetIds.has(assetId)) {
			throw new EditDecisionOrchestratorError(
				`Duplicate indexed asset: ${assetId}.`,
			);
		}
		seenAssetIds.add(assetId);
		assertMediaIndexInvariants({ index: asset.mediaIndex });
		if (asset.mediaIndex.assetId !== assetId) {
			throw new EditDecisionOrchestratorError(
				`MediaIndex ${asset.mediaIndex.mediaIndexId} does not belong to ${assetId}.`,
			);
		}
		if (asset.roughCutPlan) {
			assertRoughCutPlan(asset.roughCutPlan);
			if (
				asset.roughCutPlan.projectId !== projectId ||
				asset.roughCutPlan.assetId !== assetId
			) {
				throw new EditDecisionOrchestratorError(
					`Rough-cut plan ${asset.roughCutPlan.planId} belongs to another project or asset.`,
				);
			}
		}
		return {
			assetId,
			inputFingerprint,
			mediaIndex: asset.mediaIndex,
			...(asset.roughCutPlan ? { roughCutPlan: asset.roughCutPlan } : {}),
			sourceOrder,
			graphNodes: graphNodes.get(assetId) ?? [],
		};
	});
	return normalized;
}

function rankedAssets({
	assets,
}: {
	assets: readonly NormalizedAsset[];
}): readonly RankedAsset[] {
	return assets
		.map((asset) => ({
			...asset,
			voiceDurationSeconds: voiceDuration({
				mediaIndex: asset.mediaIndex,
			}),
			sceneBoundaryCount: asset.mediaIndex.sceneBoundaries.length,
			baselineOrder: graphBaselineOrder({ asset }),
		}))
		.sort(
			(left, right) =>
				right.voiceDurationSeconds - left.voiceDurationSeconds ||
				right.sceneBoundaryCount - left.sceneBoundaryCount ||
				left.baselineOrder - right.baselineOrder ||
				left.assetId.localeCompare(right.assetId),
		);
}

function finalizeOperation(
	operation: OperationWithoutId,
): EditDecisionOperation {
	const operationId = `edit_decision_${stableHash(JSON.stringify(operation))}`;
	return {
		...operation,
		operationId,
	} as EditDecisionOperation;
}

function roughCutEvidenceState({
	asset,
}: {
	asset: NormalizedAsset;
}): "absent" | "current" | "stale" {
	if (!asset.roughCutPlan) return "absent";
	return asset.roughCutPlan.evidenceArtifact.assetFingerprint ===
		asset.inputFingerprint &&
		asset.roughCutPlan.evidenceArtifact.mediaIndexId ===
			asset.mediaIndex.mediaIndexId
		? "current"
		: "stale";
}

function matchingRoughCutOperation({
	asset,
	evidenceIds,
}: {
	asset: NormalizedAsset;
	evidenceIds: readonly string[];
}): RoughCutOperation | undefined {
	if (!asset.roughCutPlan) return undefined;
	const evidenceSet = new Set(evidenceIds);
	return asset.roughCutPlan.operations.find((operation) =>
		operation.evidenceIds.some((evidenceId) => evidenceSet.has(evidenceId)),
	);
}

function trimOrRemoveOperations({
	asset,
}: {
	asset: NormalizedAsset;
}): readonly EditDecisionOperation[] {
	const durationSeconds = asset.mediaIndex.summary.durationSeconds;
	const roughCutState = roughCutEvidenceState({ asset });
	return silenceCandidates({ mediaIndex: asset.mediaIndex }).flatMap(
		(candidate): readonly EditDecisionOperation[] => {
			const candidateEvidenceIds = findingEvidenceIds(candidate);
			const roughCutOperation = matchingRoughCutOperation({
				asset,
				evidenceIds: candidateEvidenceIds,
			});
			if (roughCutState === "current" && !roughCutOperation) {
				return [];
			}
			const selectedRange =
				roughCutState === "current" && roughCutOperation
					? roughCutOperation.sourceRange
					: candidate.timeRange;
			const range = sourceRange({
				startSeconds: selectedRange.startSeconds,
				endSeconds: selectedRange.endSeconds,
				durationSeconds,
			});
			const evidenceIds = uniqueSorted([
				...candidateEvidenceIds,
				...(roughCutOperation?.evidenceIds ?? []),
			]);
			const isHead = range.startSeconds <= 0.000001;
			const isTail = !isHead && range.endSeconds >= durationSeconds - 0.000001;
			const availability =
				roughCutState === "stale"
					? ("blocked" as const)
					: ("suggestion" as const);
			const availabilityReason =
				roughCutState === "stale"
					? "The linked rough-cut evidence fingerprint or MediaIndex id is stale."
					: "Audio energy is not a transcript and cannot prove that removing this range preserves meaning.";
			const reason =
				"Local audio samples support a low-energy candidate in this exact range. No ASR, speaker, or semantic evidence was used.";

			if (isHead || isTail) {
				return [
					finalizeOperation({
						kind: "trim",
						assetId: asset.assetId,
						sourceRange: range,
						inputFingerprint: asset.inputFingerprint,
						mediaIndexId: asset.mediaIndex.mediaIndexId,
						evidenceIds,
						reason,
						availability,
						availabilityReason,
						requiresExplicitReview: true,
						edge: isHead ? "head" : "tail",
					}),
				];
			}
			return [
				finalizeOperation({
					kind: "remove",
					assetId: asset.assetId,
					sourceRange: range,
					inputFingerprint: asset.inputFingerprint,
					mediaIndexId: asset.mediaIndex.mediaIndexId,
					evidenceIds,
					reason,
					availability,
					availabilityReason,
					requiresExplicitReview: true,
				}),
			];
		},
	);
}

function primaryOperations({
	ranked,
}: {
	ranked: readonly RankedAsset[];
}): readonly EditDecisionOperation[] {
	return ranked.map((asset, index) => {
		const candidates = voiceCandidates({ mediaIndex: asset.mediaIndex });
		const strongest = [...candidates].sort(
			(left, right) =>
				right.timeRange.endSeconds -
					right.timeRange.startSeconds -
					(left.timeRange.endSeconds - left.timeRange.startSeconds) ||
				left.timeRange.startSeconds - right.timeRange.startSeconds ||
				left.findingId.localeCompare(right.findingId),
		)[0];
		const hasCandidate = strongest !== undefined;
		const range = sourceRange({
			startSeconds: strongest?.timeRange.startSeconds ?? 0,
			endSeconds:
				strongest?.timeRange.endSeconds ??
				asset.mediaIndex.summary.durationSeconds,
			durationSeconds: asset.mediaIndex.summary.durationSeconds,
		});
		return finalizeOperation({
			kind: "primary",
			assetId: asset.assetId,
			sourceRange: range,
			inputFingerprint: asset.inputFingerprint,
			mediaIndexId: asset.mediaIndex.mediaIndexId,
			evidenceIds: hasCandidate ? findingEvidenceIds(strongest) : [],
			reason: hasCandidate
				? "This candidate ranks by measured audio-activity duration only; it does not claim that speech or the intended story is present."
				: "No transcript, semantic scene evidence, or audio-activity candidate identifies a primary narrative range.",
			availability: hasCandidate ? "suggestion" : "blocked",
			availabilityReason: hasCandidate
				? "Energy-based activity can nominate a review candidate but cannot establish narrative meaning."
				: "Primary narrative selection requires transcript or explicit human semantic evidence.",
			requiresExplicitReview: true,
			candidateRank: index + 1,
		});
	});
}

function brollRange({
	boundaries,
	durationSeconds,
}: {
	boundaries: readonly MediaIndexSceneBoundary[];
	durationSeconds: number;
}): EditDecisionSourceRange {
	if (boundaries.length === 0) {
		return sourceRange({
			startSeconds: 0,
			endSeconds: durationSeconds,
			durationSeconds,
		});
	}
	const sorted = [...boundaries].sort(
		(left, right) =>
			left.boundaryAtSeconds - right.boundaryAtSeconds ||
			left.findingId.localeCompare(right.findingId),
	);
	const startSeconds = sorted[0].boundaryAtSeconds;
	const nextBoundary = sorted[1]?.boundaryAtSeconds ?? durationSeconds;
	if (nextBoundary > startSeconds) {
		return sourceRange({
			startSeconds,
			endSeconds: nextBoundary,
			durationSeconds,
		});
	}
	return sourceRange({
		startSeconds: 0,
		endSeconds: startSeconds,
		durationSeconds,
	});
}

function brollOperations({
	ranked,
}: {
	ranked: readonly RankedAsset[];
}): readonly EditDecisionOperation[] {
	const brollRanked = [...ranked].sort(
		(left, right) =>
			right.sceneBoundaryCount - left.sceneBoundaryCount ||
			left.assetId.localeCompare(right.assetId),
	);
	return brollRanked.map((asset, index) => {
		const boundaries = asset.mediaIndex.sceneBoundaries;
		const hasShotEvidence =
			asset.mediaIndex.sourceSnapshot.metadata.hasVideo &&
			boundaries.length > 0;
		return finalizeOperation({
			kind: "b-roll",
			assetId: asset.assetId,
			sourceRange: brollRange({
				boundaries,
				durationSeconds: asset.mediaIndex.summary.durationSeconds,
			}),
			inputFingerprint: asset.inputFingerprint,
			mediaIndexId: asset.mediaIndex.mediaIndexId,
			evidenceIds: hasShotEvidence
				? uniqueSorted(
						boundaries.flatMap((boundary) => findingEvidenceIds(boundary)),
					)
				: [],
			reason: hasShotEvidence
				? "Frame-difference samples delimit a shot candidate only; they do not identify subject matter or prove B-roll suitability."
				: "No local shot-boundary evidence identifies a reviewable B-roll range.",
			availability: hasShotEvidence ? "suggestion" : "blocked",
			availabilityReason: hasShotEvidence
				? "Shot evidence supports a range suggestion, while semantic suitability still requires review."
				: "B-roll selection requires shot evidence plus semantic or explicit human guidance.",
			requiresExplicitReview: true,
			candidateRank: index + 1,
		});
	});
}

function reorderOperations({
	assets,
	ranked,
}: {
	assets: readonly NormalizedAsset[];
	ranked: readonly RankedAsset[];
}): readonly EditDecisionOperation[] {
	if (assets.length < 2) return [];
	const baseline = [...assets].sort(
		(left, right) =>
			graphBaselineOrder({ asset: left }) -
				graphBaselineOrder({ asset: right }) ||
			left.assetId.localeCompare(right.assetId),
	);
	const fromIndexByAsset = new Map(
		baseline.map((asset, index) => [asset.assetId, index] as const),
	);
	return ranked.flatMap((asset, proposedIndex) => {
		const fromIndex = fromIndexByAsset.get(asset.assetId);
		if (fromIndex === undefined || fromIndex === proposedIndex) return [];
		const voiceEvidence = voiceCandidates({
			mediaIndex: asset.mediaIndex,
		}).flatMap((candidate) => findingEvidenceIds(candidate));
		const graphEvidence = asset.graphNodes.map((node) => node.id);
		const evidenceIds = uniqueSorted([...voiceEvidence, ...graphEvidence]);
		const hasRankingEvidence = voiceEvidence.length > 0;
		return [
			finalizeOperation({
				kind: "reorder",
				assetId: asset.assetId,
				sourceRange: sourceRange({
					startSeconds: 0,
					endSeconds: asset.mediaIndex.summary.durationSeconds,
					durationSeconds: asset.mediaIndex.summary.durationSeconds,
				}),
				inputFingerprint: asset.inputFingerprint,
				mediaIndexId: asset.mediaIndex.mediaIndexId,
				evidenceIds,
				reason:
					"The proposed order ranks measured audio-activity duration and shot-candidate count, with deterministic asset-id tie breaking. It is not a semantic story order.",
				availability: hasRankingEvidence ? "suggestion" : "blocked",
				availabilityReason: hasRankingEvidence
					? "Signal-based ranking can be reviewed but cannot establish narrative causality."
					: "Reordering without transcript or semantic evidence would be an unsupported guess.",
				requiresExplicitReview: true,
				fromIndex,
				proposedIndex,
			}),
		];
	});
}

function operationSort(
	...[left, right]: [EditDecisionOperation, EditDecisionOperation]
): number {
	return (
		KIND_ORDER[left.kind] - KIND_ORDER[right.kind] ||
		("candidateRank" in left ? left.candidateRank : 0) -
			("candidateRank" in right ? right.candidateRank : 0) ||
		("proposedIndex" in left ? left.proposedIndex : 0) -
			("proposedIndex" in right ? right.proposedIndex : 0) ||
		left.assetId.localeCompare(right.assetId) ||
		left.sourceRange.startSeconds - right.sourceRange.startSeconds ||
		left.operationId.localeCompare(right.operationId)
	);
}

function planIdentity({
	projectId,
	createdAt,
	intentSpec,
	editPlan,
	storyGraph,
	assets,
	operations,
}: {
	projectId: string;
	createdAt: string;
	intentSpec: IntentSpec;
	editPlan: EditPlan;
	storyGraph?: StoryGraph;
	assets: readonly EditDecisionAssetSnapshot[];
	operations: readonly EditDecisionOperation[];
}): string {
	return JSON.stringify({
		projectId,
		createdAt,
		intentRevision: intentSpec.revision,
		userIntent: intentSpec.userIntent,
		intentTarget: intentSpec.target ?? null,
		editPlanId: editPlan.id,
		editPlanPrompt: editPlan.prompt,
		storyGraph:
			storyGraph === undefined
				? null
				: { graphId: storyGraph.graphId, version: storyGraph.version },
		assets,
		operations,
	});
}

export function createEditDecisionPlan({
	intentSpec,
	editPlan,
	assets: inputAssets,
	storyGraph,
	createdAt: inputCreatedAt,
}: CreateEditDecisionPlanInput): EditDecisionPlan {
	const createdAt = canonicalTimestamp(inputCreatedAt);
	const projectId = normalizedIdentifier({
		value: intentSpec.projectId,
		label: "projectId",
		maxLength: 128,
	});
	const assets = normalizeAssets({
		projectId,
		assets: inputAssets,
		storyGraph,
	});
	const ranked = rankedAssets({ assets });
	const operations = [
		...primaryOperations({ ranked }),
		...reorderOperations({ assets, ranked }),
		...assets.flatMap((asset) => trimOrRemoveOperations({ asset })),
		...brollOperations({ ranked }),
	].sort(operationSort);
	const assetSnapshots = assets.map(
		(asset): EditDecisionAssetSnapshot => ({
			assetId: asset.assetId,
			inputFingerprint: asset.inputFingerprint,
			mediaIndexId: asset.mediaIndex.mediaIndexId,
			mediaIndexAlgorithmVersion: asset.mediaIndex.algorithm.version,
			durationSeconds: asset.mediaIndex.summary.durationSeconds,
			sourceOrder: asset.sourceOrder,
			storyGraphNodeIds: uniqueSorted(asset.graphNodes.map((node) => node.id)),
			...(asset.roughCutPlan
				? { roughCutPlanId: asset.roughCutPlan.planId }
				: {}),
		}),
	);
	const identity = planIdentity({
		projectId,
		createdAt,
		intentSpec,
		editPlan,
		storyGraph,
		assets: assetSnapshots,
		operations,
	});
	const plan: EditDecisionPlan = {
		kind: EDIT_DECISION_PLAN_KIND,
		schemaVersion: EDIT_DECISION_PLAN_SCHEMA_VERSION,
		planId: `edit_decision_plan_${stableHash(identity)}`,
		projectId,
		createdAt,
		intent: {
			revision: intentSpec.revision,
			userIntent: intentSpec.userIntent,
			target:
				intentSpec.target === undefined ? undefined : { ...intentSpec.target },
		},
		editPlan: {
			planId: editPlan.id,
			formatVersion: editPlan.formatVersion,
			mode: editPlan.mode,
			prompt: editPlan.prompt,
			target: { ...editPlan.target },
		},
		storyGraph:
			storyGraph === undefined
				? null
				: {
						graphId: storyGraph.graphId,
						version: storyGraph.version,
					},
		inputs: {
			assets: assetSnapshots,
		},
		suggestedAssetOrder: ranked.map((asset) => asset.assetId),
		primaryCandidateAssetId:
			ranked.find((asset) => asset.voiceDurationSeconds > 0)?.assetId ?? null,
		operations,
		limitations: LIMITATIONS,
		guarantees: GUARANTEES,
	};
	return deepFreeze(plan);
}

function normalizedCurrentAssets({
	currentAssets,
}: {
	currentAssets: readonly EditDecisionCurrentAssetState[];
}): ReadonlyMap<string, EditDecisionCurrentAssetState> {
	const byId = new Map<string, EditDecisionCurrentAssetState>();
	for (const asset of currentAssets) {
		const assetId = normalizedIdentifier({
			value: asset.assetId,
			label: "current assetId",
		});
		normalizedIdentifier({
			value: asset.inputFingerprint,
			label: "current inputFingerprint",
		});
		normalizedIdentifier({
			value: asset.mediaIndexId,
			label: "current mediaIndexId",
		});
		if (byId.has(assetId)) {
			throw new EditDecisionOrchestratorError(
				`Duplicate current asset: ${assetId}.`,
			);
		}
		byId.set(assetId, asset);
	}
	return byId;
}

export function inspectEditDecisionPlanFreshness({
	plan,
	currentAssets,
}: {
	plan: EditDecisionPlan;
	currentAssets: readonly EditDecisionCurrentAssetState[];
}): EditDecisionFreshness {
	const currentById = normalizedCurrentAssets({ currentAssets });
	const expectedIds = new Set(plan.inputs.assets.map((asset) => asset.assetId));
	const reasons: EditDecisionStaleReason[] = [];

	for (const expected of plan.inputs.assets) {
		const current = currentById.get(expected.assetId);
		if (!current) {
			reasons.push({
				code: "asset-missing",
				assetId: expected.assetId,
				expected: expected.inputFingerprint,
				actual: null,
			});
			continue;
		}
		if (current.inputFingerprint !== expected.inputFingerprint) {
			reasons.push({
				code: "fingerprint-changed",
				assetId: expected.assetId,
				expected: expected.inputFingerprint,
				actual: current.inputFingerprint,
			});
		}
		if (current.mediaIndexId !== expected.mediaIndexId) {
			reasons.push({
				code: "media-index-changed",
				assetId: expected.assetId,
				expected: expected.mediaIndexId,
				actual: current.mediaIndexId,
			});
		}
	}
	for (const current of currentAssets) {
		if (!expectedIds.has(current.assetId)) {
			reasons.push({
				code: "asset-added",
				assetId: current.assetId,
				expected: null,
				actual: current.inputFingerprint,
			});
		}
	}
	reasons.sort(
		(left, right) =>
			left.assetId.localeCompare(right.assetId) ||
			left.code.localeCompare(right.code),
	);
	return deepFreeze({
		state: reasons.length === 0 ? "current" : "stale",
		staleAssetIds: uniqueSorted(reasons.map((reason) => reason.assetId)),
		reasons,
	});
}

function planAssetStates({
	plan,
}: {
	plan: EditDecisionPlan;
}): readonly EditDecisionCurrentAssetState[] {
	return plan.inputs.assets.map((asset) => ({
		assetId: asset.assetId,
		inputFingerprint: asset.inputFingerprint,
		mediaIndexId: asset.mediaIndexId,
	}));
}

export function createEditDecisionOperationReviewPayload({
	plan,
	currentAssets = planAssetStates({ plan }),
}: {
	plan: EditDecisionPlan;
	currentAssets?: readonly EditDecisionCurrentAssetState[];
}): EditDecisionOperationReviewPayload {
	const freshness = inspectEditDecisionPlanFreshness({
		plan,
		currentAssets,
	});
	const items = plan.operations.map(
		(operation): EditDecisionOperationReviewItem => ({
			operation,
			decision: "pending",
			allowedDecisions:
				operation.availability === "blocked"
					? ["reject"]
					: operation.availability === "suggestion"
						? ["approve-as-suggestion", "reject"]
						: ["approve", "reject"],
			executionEligible:
				freshness.state === "current" &&
				operation.availability === "executable",
		}),
	);
	return deepFreeze({
		kind: EDIT_DECISION_REVIEW_KIND,
		schemaVersion: EDIT_DECISION_PLAN_SCHEMA_VERSION,
		projectId: plan.projectId,
		planId: plan.planId,
		createdAt: plan.createdAt,
		freshness,
		items,
		requiresExplicitConfirmation: true,
		mutatesProject: false,
	});
}

export function orchestrateLocalEditDecision(
	input: CreateEditDecisionPlanInput,
): LocalEditDecisionOrchestration {
	const plan = createEditDecisionPlan(input);
	const review = createEditDecisionOperationReviewPayload({ plan });
	return deepFreeze({ plan, review });
}
