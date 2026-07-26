import { z } from "zod";

export const CHATCUT_RESULT_KIND = "visioncut.chatcut-result" as const;
export const CHATCUT_RESULT_SCHEMA_VERSION = 1 as const;
export const CHATCUT_IMPORT_PLAN_KIND =
	"visioncut.chatcut-import-plan" as const;
export const CHATCUT_IMPORT_RECEIPT_KIND =
	"visioncut.chatcut-import-receipt" as const;

export interface FrameRange {
	readonly startFrame: number;
	readonly endFrame: number;
}

export interface PlaybackRate {
	readonly numerator: number;
	readonly denominator: number;
}

export interface ChatCutResultAssetBinding {
	readonly visionCutAssetId: string;
	readonly chatCutAssetId: string;
	readonly fingerprint: string;
	readonly durationFrames: number;
}

export interface TimelineItemEvidence {
	readonly kind: "timeline-item";
	readonly evidenceId: string;
	readonly assetId: string;
	readonly itemId: string;
	readonly itemFingerprint: string;
	readonly timelineFingerprint: string;
	readonly timelineRange: FrameRange;
	readonly sourceRange: FrameRange;
}

export interface TranscriptSegmentEvidence {
	readonly kind: "transcript-segment";
	readonly evidenceId: string;
	readonly assetId: string;
	readonly transcriptId: string;
	readonly transcriptRevision: number;
	readonly segmentIds: readonly string[];
	readonly sourceRange: FrameRange;
	readonly contentFingerprint: string;
}

export interface TranscriptWordEvidence {
	readonly kind: "transcript-word";
	readonly evidenceId: string;
	readonly assetId: string;
	readonly transcriptId: string;
	readonly transcriptRevision: number;
	readonly segmentId: string;
	readonly wordId: string;
	readonly sourceRange: FrameRange;
	readonly observedText: string;
	readonly contentFingerprint: string;
}

export interface SilenceEvidence {
	readonly kind: "silence-analysis";
	readonly evidenceId: string;
	readonly assetId: string;
	readonly analysisId: string;
	readonly analysisRevision: number;
	readonly sourceRange: FrameRange;
	readonly confidence: number;
	readonly analysisFingerprint: string;
}

export type ChatCutOperationEvidence =
	| TimelineItemEvidence
	| TranscriptSegmentEvidence
	| TranscriptWordEvidence
	| SilenceEvidence;

export interface ChatCutOperationScope {
	readonly projectId: string;
	readonly timelineId: string;
}

export interface ChatCutItemTarget {
	readonly itemId: string;
	readonly itemFingerprint: string;
	readonly assetId: string;
	readonly trackId: string;
	readonly playbackRate: PlaybackRate;
}

interface ChatCutOperationBase {
	readonly id: string;
	readonly sequence: number;
	readonly scope: ChatCutOperationScope;
	readonly evidence: readonly ChatCutOperationEvidence[];
}

export interface ChatCutTrimOperation extends ChatCutOperationBase {
	readonly kind: "trim";
	readonly surface: "script" | "timeline";
	readonly target: ChatCutItemTarget;
	readonly before: {
		readonly timelineRange: FrameRange;
		readonly sourceRange: FrameRange;
	};
	readonly after: {
		readonly timelineRange: FrameRange;
		readonly sourceRange: FrameRange;
	};
	readonly ripple: "none" | "same-track";
}

export interface ChatCutSplitOperation extends ChatCutOperationBase {
	readonly kind: "split";
	readonly surface: "script" | "timeline";
	readonly target: ChatCutItemTarget;
	readonly before: {
		readonly timelineRange: FrameRange;
		readonly sourceRange: FrameRange;
	};
	readonly splitAtTimelineFrame: number;
	readonly splitAtSourceFrame: number;
	readonly resultItemIds: readonly [string, string];
	readonly ripple: "none";
}

export interface ChatCutRemoveOperation extends ChatCutOperationBase {
	readonly kind: "remove";
	readonly surface: "script" | "timeline";
	readonly basis: "transcript" | "silence" | "timeline-item";
	readonly target: ChatCutItemTarget & {
		readonly timelineRange: FrameRange;
		readonly sourceRange: FrameRange;
	};
	readonly ripple: "none" | "same-track";
}

export interface ChatCutReorderSegment {
	readonly segmentId: string;
	readonly target: ChatCutItemTarget;
	readonly timelineRange: FrameRange;
	readonly sourceRange: FrameRange;
}

export interface ChatCutReorderOperation extends ChatCutOperationBase {
	readonly kind: "reorder";
	readonly surface: "script" | "timeline";
	readonly trackId: string;
	readonly segments: readonly ChatCutReorderSegment[];
	readonly beforeOrder: readonly string[];
	readonly afterOrder: readonly string[];
	readonly ripple: "same-track";
}

export interface ChatCutCaptionFixOperation extends ChatCutOperationBase {
	readonly kind: "caption-fix";
	readonly surface: "transcript";
	readonly fixType: "asr-word";
	readonly target: {
		readonly assetId: string;
		readonly transcriptId: string;
		readonly transcriptRevision: number;
		readonly segmentId: string;
		readonly wordId: string;
		readonly sourceRange: FrameRange;
		readonly wordFingerprint: string;
	};
	readonly beforeText: string;
	readonly afterText: string;
}

export type ChatCutResultOperation =
	| ChatCutTrimOperation
	| ChatCutSplitOperation
	| ChatCutRemoveOperation
	| ChatCutReorderOperation
	| ChatCutCaptionFixOperation;

export type ChatCutOperationRisk =
	| "destructive"
	| "structural"
	| "text-correction";

export interface ChatCutOperationPreviewDiff {
	readonly operationId: string;
	readonly kind: ChatCutResultOperation["kind"];
	readonly risk: ChatCutOperationRisk;
	readonly affectedTimelineRanges: readonly FrameRange[];
	readonly affectedSourceRanges: readonly FrameRange[];
	readonly removedTimelineFrames: number;
	readonly movedSegmentCount: number;
	readonly correctedWordCount: number;
}

export interface ChatCutResultPreviewDiff {
	readonly operationDiffs: readonly ChatCutOperationPreviewDiff[];
	readonly summary: {
		readonly operationCount: number;
		readonly destructiveCount: number;
		readonly structuralCount: number;
		readonly textCorrectionCount: number;
		readonly removedTimelineFrames: number;
		readonly movedSegmentCount: number;
		readonly correctedWordCount: number;
	};
}

export interface ChatCutResultEnvelope {
	readonly kind: typeof CHATCUT_RESULT_KIND;
	readonly schemaVersion: typeof CHATCUT_RESULT_SCHEMA_VERSION;
	readonly resultId: string;
	readonly handoffId: string;
	readonly idempotencyKey: string;
	readonly createdAt: string;
	readonly timebase: {
		readonly unit: "frame";
		readonly fps: PlaybackRate;
	};
	readonly baseline: {
		readonly projectId: string;
		readonly projectVersion: number;
		readonly versionId: string;
		readonly timelineId: string;
		readonly timelineSnapshotId: string;
		readonly timelineFingerprint: string;
	};
	readonly source: {
		readonly provider: "ChatCut";
		readonly projectId: string;
		readonly timelineId: string;
		readonly timelineRevision: number;
		readonly beforeTimelineFingerprint: string;
		readonly afterTimelineFingerprint: string;
		readonly applyReceipt: {
			readonly kind: "chatcut.apply-receipt";
			readonly receiptId: string;
			readonly appliedAt: string;
			readonly operationIds: readonly string[];
			readonly beforeTimelineFingerprint: string;
			readonly afterTimelineFingerprint: string;
		};
		readonly undoReference: {
			readonly kind: "chatcut.timeline-undo-reference";
			readonly projectId: string;
			readonly timelineId: string;
			readonly snapshotId: string;
			readonly timelineRevision: number;
			readonly timelineFingerprint: string;
		};
	};
	readonly assets: readonly ChatCutResultAssetBinding[];
	readonly operations: readonly ChatCutResultOperation[];
	readonly preview: ChatCutResultPreviewDiff;
	readonly guarantees: {
		readonly portableJson: true;
		readonly binaryPayloads: false;
		readonly apiKeys: false;
		readonly freeTextCommands: false;
		readonly requiresExplicitApproval: true;
	};
}

export interface ChatCutImportAssetState {
	readonly assetId: string;
	readonly fingerprint: string;
	readonly durationFrames: number;
}

export interface ChatCutImportTimelineItemState {
	readonly itemId: string;
	readonly itemFingerprint: string;
	readonly assetId: string;
	readonly trackId: string;
	readonly playbackRate: PlaybackRate;
	readonly timelineRange: FrameRange;
	readonly sourceRange: FrameRange;
}

export interface ChatCutImportTranscriptState {
	readonly transcriptId: string;
	readonly assetId: string;
	readonly revision: number;
	readonly contentFingerprint: string;
}

export interface ChatCutImportTranscriptWordState {
	readonly transcriptId: string;
	readonly assetId: string;
	readonly revision: number;
	readonly segmentId: string;
	readonly wordId: string;
	readonly sourceRange: FrameRange;
	readonly text: string;
	readonly wordFingerprint: string;
}

export interface ChatCutImportSilenceAnalysisState {
	readonly analysisId: string;
	readonly assetId: string;
	readonly revision: number;
	readonly analysisFingerprint: string;
}

export interface VisionCutTimelineUndoReference {
	readonly kind: "visioncut.timeline-undo-reference";
	readonly projectId: string;
	readonly timelineId: string;
	readonly snapshotId: string;
	readonly versionId: string;
	readonly timelineFingerprint: string;
}

export interface ChatCutImportApplyReceipt {
	readonly kind: typeof CHATCUT_IMPORT_RECEIPT_KIND;
	readonly schemaVersion: typeof CHATCUT_RESULT_SCHEMA_VERSION;
	readonly receiptId: string;
	readonly resultId: string;
	readonly idempotencyKey: string;
	readonly projectId: string;
	readonly timelineId: string;
	readonly fromVersion: number;
	readonly fromVersionId: string;
	readonly toVersion: number;
	readonly toVersionId: string;
	readonly appliedAt: string;
	readonly operationIds: readonly string[];
	readonly resultingTimelineFingerprint: string;
	readonly undoReference: VisionCutTimelineUndoReference;
}

export interface ChatCutImportTargetState {
	readonly projectId: string;
	readonly projectVersion: number;
	readonly versionId: string;
	readonly timelineId: string;
	readonly timelineSnapshotId: string;
	readonly timelineFingerprint: string;
	readonly assets: readonly ChatCutImportAssetState[];
	readonly items: readonly ChatCutImportTimelineItemState[];
	readonly transcripts: readonly ChatCutImportTranscriptState[];
	readonly transcriptWords: readonly ChatCutImportTranscriptWordState[];
	readonly silenceAnalyses: readonly ChatCutImportSilenceAnalysisState[];
	readonly appliedImports: readonly ChatCutImportApplyReceipt[];
}

export type ChatCutImportConflictCode =
	| "project-mismatch"
	| "timeline-mismatch"
	| "baseline-version-mismatch"
	| "baseline-version-id-mismatch"
	| "baseline-snapshot-mismatch"
	| "baseline-timeline-fingerprint-mismatch"
	| "asset-missing"
	| "asset-fingerprint-mismatch"
	| "asset-duration-mismatch"
	| "item-missing"
	| "item-fingerprint-mismatch"
	| "item-state-mismatch"
	| "transcript-missing"
	| "transcript-state-mismatch"
	| "transcript-word-missing"
	| "transcript-word-state-mismatch"
	| "silence-analysis-missing"
	| "silence-analysis-state-mismatch";

export interface ChatCutImportConflict {
	readonly code: ChatCutImportConflictCode;
	readonly path: string;
	readonly operationId?: string;
	readonly expected: string | number;
	readonly actual: string | number | null;
}

export type ChatCutResultComparison =
	| {
			readonly status: "ready";
			readonly conflicts: readonly [];
			readonly preview: ChatCutResultPreviewDiff;
	  }
	| {
			readonly status: "already-applied";
			readonly conflicts: readonly [];
			readonly preview: ChatCutResultPreviewDiff;
			readonly receipt: ChatCutImportApplyReceipt;
	  }
	| {
			readonly status: "conflict";
			readonly conflicts: readonly ChatCutImportConflict[];
			readonly preview: ChatCutResultPreviewDiff;
	  };

export interface ChatCutPreparedImportPlan {
	readonly kind: typeof CHATCUT_IMPORT_PLAN_KIND;
	readonly schemaVersion: typeof CHATCUT_RESULT_SCHEMA_VERSION;
	readonly preparedImportId: string;
	readonly resultId: string;
	readonly idempotencyKey: string;
	readonly projectId: string;
	readonly timelineId: string;
	readonly approvedOperationIds: readonly string[];
	readonly operations: readonly ChatCutResultOperation[];
	readonly preview: ChatCutResultPreviewDiff;
	readonly guards: {
		readonly expectedProjectVersion: number;
		readonly expectedVersionId: string;
		readonly expectedTimelineSnapshotId: string;
		readonly expectedTimelineFingerprint: string;
		readonly assetFingerprints: readonly {
			readonly assetId: string;
			readonly fingerprint: string;
		}[];
	};
	readonly undoReference: VisionCutTimelineUndoReference;
	readonly executionPolicy: {
		readonly atomic: true;
		readonly revalidateBeforeApply: true;
		readonly freeTextCommandsAllowed: false;
		readonly requiresExplicitApproval: true;
	};
}

export type ChatCutPrepareImportResult =
	| {
			readonly status: "ready";
			readonly plan: ChatCutPreparedImportPlan;
	  }
	| {
			readonly status: "already-applied";
			readonly receipt: ChatCutImportApplyReceipt;
	  }
	| {
			readonly status: "conflict";
			readonly comparison: Extract<
				ChatCutResultComparison,
				{ status: "conflict" }
			>;
	  }
	| {
			readonly status: "approval-required";
			readonly missingOperationIds: readonly string[];
	  };

export interface ChatCutResultValidationIssue {
	readonly path: string;
	readonly message: string;
}

export type ChatCutResultValidation =
	| {
			readonly ok: true;
			readonly value: ChatCutResultEnvelope;
	  }
	| {
			readonly ok: false;
			readonly issues: readonly ChatCutResultValidationIssue[];
	  };

export class ChatCutResultValidationError extends Error {
	readonly issues: readonly ChatCutResultValidationIssue[];

	constructor(issues: readonly ChatCutResultValidationIssue[]) {
		super(issues.map(({ path, message }) => `${path}: ${message}`).join("; "));
		this.name = "ChatCutResultValidationError";
		this.issues = issues;
	}
}

const MAX_JSON_LENGTH = 2_000_000;
const identifierSchema = z
	.string()
	.min(1)
	.max(200)
	.regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const fingerprintSchema = z
	.string()
	.regex(/^sha256:[a-f0-9]{64}$/u, "Expected a sha256 fingerprint.");
const positiveIntegerSchema = z.number().int().positive().max(1_000_000_000);
const nonNegativeIntegerSchema = z
	.number()
	.int()
	.nonnegative()
	.max(1_000_000_000);
const canonicalTimestampSchema = z.string().refine(isCanonicalTimestamp, {
	message: "Expected a canonical ISO-8601 timestamp.",
});
const frameRangeSchema = z
	.object({
		startFrame: nonNegativeIntegerSchema,
		endFrame: positiveIntegerSchema,
	})
	.strict()
	.refine((range) => range.endFrame > range.startFrame, {
		message: "endFrame must be greater than startFrame.",
	});
const playbackRateSchema = z
	.object({
		numerator: positiveIntegerSchema,
		denominator: positiveIntegerSchema,
	})
	.strict();
const operationScopeSchema = z
	.object({ projectId: identifierSchema, timelineId: identifierSchema })
	.strict();
const itemTargetSchema = z
	.object({
		itemId: identifierSchema,
		itemFingerprint: fingerprintSchema,
		assetId: identifierSchema,
		trackId: identifierSchema,
		playbackRate: playbackRateSchema,
	})
	.strict();
const timelineItemEvidenceSchema = z
	.object({
		kind: z.literal("timeline-item"),
		evidenceId: identifierSchema,
		assetId: identifierSchema,
		itemId: identifierSchema,
		itemFingerprint: fingerprintSchema,
		timelineFingerprint: fingerprintSchema,
		timelineRange: frameRangeSchema,
		sourceRange: frameRangeSchema,
	})
	.strict();
const transcriptSegmentEvidenceSchema = z
	.object({
		kind: z.literal("transcript-segment"),
		evidenceId: identifierSchema,
		assetId: identifierSchema,
		transcriptId: identifierSchema,
		transcriptRevision: positiveIntegerSchema,
		segmentIds: z.array(identifierSchema).min(1).max(1_000),
		sourceRange: frameRangeSchema,
		contentFingerprint: fingerprintSchema,
	})
	.strict();
const transcriptWordEvidenceSchema = z
	.object({
		kind: z.literal("transcript-word"),
		evidenceId: identifierSchema,
		assetId: identifierSchema,
		transcriptId: identifierSchema,
		transcriptRevision: positiveIntegerSchema,
		segmentId: identifierSchema,
		wordId: identifierSchema,
		sourceRange: frameRangeSchema,
		observedText: z.string().min(1).max(512),
		contentFingerprint: fingerprintSchema,
	})
	.strict();
const silenceEvidenceSchema = z
	.object({
		kind: z.literal("silence-analysis"),
		evidenceId: identifierSchema,
		assetId: identifierSchema,
		analysisId: identifierSchema,
		analysisRevision: positiveIntegerSchema,
		sourceRange: frameRangeSchema,
		confidence: z.number().min(0).max(1),
		analysisFingerprint: fingerprintSchema,
	})
	.strict();
const evidenceSchema = z.discriminatedUnion("kind", [
	timelineItemEvidenceSchema,
	transcriptSegmentEvidenceSchema,
	transcriptWordEvidenceSchema,
	silenceEvidenceSchema,
]);
const operationBaseShape = {
	id: identifierSchema,
	sequence: nonNegativeIntegerSchema,
	scope: operationScopeSchema,
	evidence: z.array(evidenceSchema).min(1).max(1_000),
};
const trimOperationSchema = z
	.object({
		...operationBaseShape,
		kind: z.literal("trim"),
		surface: z.enum(["script", "timeline"]),
		target: itemTargetSchema,
		before: z
			.object({
				timelineRange: frameRangeSchema,
				sourceRange: frameRangeSchema,
			})
			.strict(),
		after: z
			.object({
				timelineRange: frameRangeSchema,
				sourceRange: frameRangeSchema,
			})
			.strict(),
		ripple: z.enum(["none", "same-track"]),
	})
	.strict();
const splitOperationSchema = z
	.object({
		...operationBaseShape,
		kind: z.literal("split"),
		surface: z.enum(["script", "timeline"]),
		target: itemTargetSchema,
		before: z
			.object({
				timelineRange: frameRangeSchema,
				sourceRange: frameRangeSchema,
			})
			.strict(),
		splitAtTimelineFrame: positiveIntegerSchema,
		splitAtSourceFrame: positiveIntegerSchema,
		resultItemIds: z.tuple([identifierSchema, identifierSchema]),
		ripple: z.literal("none"),
	})
	.strict();
const removeOperationSchema = z
	.object({
		...operationBaseShape,
		kind: z.literal("remove"),
		surface: z.enum(["script", "timeline"]),
		basis: z.enum(["transcript", "silence", "timeline-item"]),
		target: itemTargetSchema
			.extend({
				timelineRange: frameRangeSchema,
				sourceRange: frameRangeSchema,
			})
			.strict(),
		ripple: z.enum(["none", "same-track"]),
	})
	.strict();
const reorderSegmentSchema = z
	.object({
		segmentId: identifierSchema,
		target: itemTargetSchema,
		timelineRange: frameRangeSchema,
		sourceRange: frameRangeSchema,
	})
	.strict();
const reorderOperationSchema = z
	.object({
		...operationBaseShape,
		kind: z.literal("reorder"),
		surface: z.enum(["script", "timeline"]),
		trackId: identifierSchema,
		segments: z.array(reorderSegmentSchema).min(2).max(1_000),
		beforeOrder: z.array(identifierSchema).min(2).max(1_000),
		afterOrder: z.array(identifierSchema).min(2).max(1_000),
		ripple: z.literal("same-track"),
	})
	.strict();
const captionFixOperationSchema = z
	.object({
		...operationBaseShape,
		kind: z.literal("caption-fix"),
		surface: z.literal("transcript"),
		fixType: z.literal("asr-word"),
		target: z
			.object({
				assetId: identifierSchema,
				transcriptId: identifierSchema,
				transcriptRevision: positiveIntegerSchema,
				segmentId: identifierSchema,
				wordId: identifierSchema,
				sourceRange: frameRangeSchema,
				wordFingerprint: fingerprintSchema,
			})
			.strict(),
		beforeText: z.string().min(1).max(512),
		afterText: z.string().min(1).max(512),
	})
	.strict();
const operationSchema = z.discriminatedUnion("kind", [
	trimOperationSchema,
	splitOperationSchema,
	removeOperationSchema,
	reorderOperationSchema,
	captionFixOperationSchema,
]);
const previewOperationSchema = z
	.object({
		operationId: identifierSchema,
		kind: z.enum(["trim", "split", "remove", "reorder", "caption-fix"]),
		risk: z.enum(["destructive", "structural", "text-correction"]),
		affectedTimelineRanges: z.array(frameRangeSchema).max(1_000),
		affectedSourceRanges: z.array(frameRangeSchema).max(1_000),
		removedTimelineFrames: nonNegativeIntegerSchema,
		movedSegmentCount: nonNegativeIntegerSchema,
		correctedWordCount: nonNegativeIntegerSchema,
	})
	.strict();
const previewSchema = z
	.object({
		operationDiffs: z.array(previewOperationSchema).max(10_000),
		summary: z
			.object({
				operationCount: nonNegativeIntegerSchema,
				destructiveCount: nonNegativeIntegerSchema,
				structuralCount: nonNegativeIntegerSchema,
				textCorrectionCount: nonNegativeIntegerSchema,
				removedTimelineFrames: nonNegativeIntegerSchema,
				movedSegmentCount: nonNegativeIntegerSchema,
				correctedWordCount: nonNegativeIntegerSchema,
			})
			.strict(),
	})
	.strict();
const envelopeSchema = z
	.object({
		kind: z.literal(CHATCUT_RESULT_KIND),
		schemaVersion: z.literal(CHATCUT_RESULT_SCHEMA_VERSION),
		resultId: identifierSchema,
		handoffId: identifierSchema,
		idempotencyKey: z.string().min(1).max(200),
		createdAt: canonicalTimestampSchema,
		timebase: z
			.object({ unit: z.literal("frame"), fps: playbackRateSchema })
			.strict(),
		baseline: z
			.object({
				projectId: identifierSchema,
				projectVersion: positiveIntegerSchema,
				versionId: identifierSchema,
				timelineId: identifierSchema,
				timelineSnapshotId: identifierSchema,
				timelineFingerprint: fingerprintSchema,
			})
			.strict(),
		source: z
			.object({
				provider: z.literal("ChatCut"),
				projectId: identifierSchema,
				timelineId: identifierSchema,
				timelineRevision: positiveIntegerSchema,
				beforeTimelineFingerprint: fingerprintSchema,
				afterTimelineFingerprint: fingerprintSchema,
				applyReceipt: z
					.object({
						kind: z.literal("chatcut.apply-receipt"),
						receiptId: identifierSchema,
						appliedAt: canonicalTimestampSchema,
						operationIds: z.array(identifierSchema).min(1).max(10_000),
						beforeTimelineFingerprint: fingerprintSchema,
						afterTimelineFingerprint: fingerprintSchema,
					})
					.strict(),
				undoReference: z
					.object({
						kind: z.literal("chatcut.timeline-undo-reference"),
						projectId: identifierSchema,
						timelineId: identifierSchema,
						snapshotId: identifierSchema,
						timelineRevision: positiveIntegerSchema,
						timelineFingerprint: fingerprintSchema,
					})
					.strict(),
			})
			.strict(),
		assets: z
			.array(
				z
					.object({
						visionCutAssetId: identifierSchema,
						chatCutAssetId: identifierSchema,
						fingerprint: fingerprintSchema,
						durationFrames: positiveIntegerSchema,
					})
					.strict(),
			)
			.min(1)
			.max(10_000),
		operations: z.array(operationSchema).min(1).max(10_000),
		preview: previewSchema,
		guarantees: z
			.object({
				portableJson: z.literal(true),
				binaryPayloads: z.literal(false),
				apiKeys: z.literal(false),
				freeTextCommands: z.literal(false),
				requiresExplicitApproval: z.literal(true),
			})
			.strict(),
	})
	.strict();

const undoReferenceSchema = z
	.object({
		kind: z.literal("visioncut.timeline-undo-reference"),
		projectId: identifierSchema,
		timelineId: identifierSchema,
		snapshotId: identifierSchema,
		versionId: identifierSchema,
		timelineFingerprint: fingerprintSchema,
	})
	.strict();
const applyReceiptSchema = z
	.object({
		kind: z.literal(CHATCUT_IMPORT_RECEIPT_KIND),
		schemaVersion: z.literal(CHATCUT_RESULT_SCHEMA_VERSION),
		receiptId: identifierSchema,
		resultId: identifierSchema,
		idempotencyKey: z.string().min(1).max(200),
		projectId: identifierSchema,
		timelineId: identifierSchema,
		fromVersion: positiveIntegerSchema,
		fromVersionId: identifierSchema,
		toVersion: positiveIntegerSchema,
		toVersionId: identifierSchema,
		appliedAt: canonicalTimestampSchema,
		operationIds: z.array(identifierSchema).min(1).max(10_000),
		resultingTimelineFingerprint: fingerprintSchema,
		undoReference: undoReferenceSchema,
	})
	.strict();
const targetStateSchema = z
	.object({
		projectId: identifierSchema,
		projectVersion: positiveIntegerSchema,
		versionId: identifierSchema,
		timelineId: identifierSchema,
		timelineSnapshotId: identifierSchema,
		timelineFingerprint: fingerprintSchema,
		assets: z.array(
			z
				.object({
					assetId: identifierSchema,
					fingerprint: fingerprintSchema,
					durationFrames: positiveIntegerSchema,
				})
				.strict(),
		),
		items: z.array(
			z
				.object({
					itemId: identifierSchema,
					itemFingerprint: fingerprintSchema,
					assetId: identifierSchema,
					trackId: identifierSchema,
					playbackRate: playbackRateSchema,
					timelineRange: frameRangeSchema,
					sourceRange: frameRangeSchema,
				})
				.strict(),
		),
		transcripts: z.array(
			z
				.object({
					transcriptId: identifierSchema,
					assetId: identifierSchema,
					revision: positiveIntegerSchema,
					contentFingerprint: fingerprintSchema,
				})
				.strict(),
		),
		transcriptWords: z.array(
			z
				.object({
					transcriptId: identifierSchema,
					assetId: identifierSchema,
					revision: positiveIntegerSchema,
					segmentId: identifierSchema,
					wordId: identifierSchema,
					sourceRange: frameRangeSchema,
					text: z.string().min(1).max(512),
					wordFingerprint: fingerprintSchema,
				})
				.strict(),
		),
		silenceAnalyses: z.array(
			z
				.object({
					analysisId: identifierSchema,
					assetId: identifierSchema,
					revision: positiveIntegerSchema,
					analysisFingerprint: fingerprintSchema,
				})
				.strict(),
		),
		appliedImports: z.array(applyReceiptSchema),
	})
	.strict();

function isCanonicalTimestamp(value: string): boolean {
	const milliseconds = Date.parse(value);
	return (
		Number.isFinite(milliseconds) &&
		new Date(milliseconds).toISOString() === value
	);
}

function rangeDuration(range: FrameRange): number {
	return range.endFrame - range.startFrame;
}

function rangesEqual({
	left,
	right,
}: {
	left: FrameRange;
	right: FrameRange;
}): boolean {
	return (
		left.startFrame === right.startFrame && left.endFrame === right.endFrame
	);
}

function rangeContains({
	container,
	candidate,
}: {
	container: FrameRange;
	candidate: FrameRange;
}): boolean {
	return (
		container.startFrame <= candidate.startFrame &&
		container.endFrame >= candidate.endFrame
	);
}

function hasUniqueValues(values: readonly string[]): boolean {
	return new Set(values).size === values.length;
}

function sameStringSet({
	left,
	right,
}: {
	left: readonly string[];
	right: readonly string[];
}): boolean {
	return (
		left.length === right.length &&
		new Set(left).size === left.length &&
		left.every((value) => right.includes(value))
	);
}

function rateMatchesRanges({
	timelineRange,
	sourceRange,
	rate,
}: {
	timelineRange: FrameRange;
	sourceRange: FrameRange;
	rate: PlaybackRate;
}): boolean {
	return (
		rangeDuration(sourceRange) * rate.denominator ===
		rangeDuration(timelineRange) * rate.numerator
	);
}

function stableDigest(value: string): string {
	function hash(seed: number): string {
		let result = seed >>> 0;
		for (const character of value) {
			result ^= character.codePointAt(0) ?? 0;
			result = Math.imul(result, 16_777_619);
		}
		return (result >>> 0).toString(36).padStart(7, "0");
	}

	return `${hash(2_166_136_261)}${hash(3_332_816_977)}`;
}

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) {
		return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
	}

	return `{${Object.keys(value)
		.sort()
		.map(
			(key) =>
				`${JSON.stringify(key)}:${stableStringify(Reflect.get(value, key))}`,
		)
		.join(",")}}`;
}

function deepFreeze<T>(value: T): T {
	if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
		return value;
	}

	for (const key of Object.keys(value)) {
		deepFreeze(Reflect.get(value, key));
	}
	return Object.freeze(value);
}

function assertPortableJson({
	value,
	path = "$",
	depth = 0,
}: {
	value: unknown;
	path?: string;
	depth?: number;
}): ChatCutResultValidationIssue[] {
	const issues: ChatCutResultValidationIssue[] = [];
	if (depth > 32) {
		return [{ path, message: "JSON nesting exceeds the supported depth." }];
	}
	if (value === null || typeof value === "boolean") return issues;
	if (typeof value === "string") {
		if (/^(?:blob|data|file):/iu.test(value)) {
			issues.push({
				path,
				message: "Runtime and binary URLs are not allowed.",
			});
		}
		return issues;
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			issues.push({ path, message: "JSON numbers must be finite." });
		}
		return issues;
	}
	if (typeof value !== "object") {
		return [{ path, message: "Only portable JSON values are allowed." }];
	}
	if (Array.isArray(value)) {
		value.forEach((entry, index) => {
			issues.push(
				...assertPortableJson({
					value: entry,
					path: `${path}[${index}]`,
					depth: depth + 1,
				}),
			);
		});
		return issues;
	}

	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		return [
			{
				path,
				message:
					"File, Blob, class instances, and other non-JSON objects are forbidden.",
			},
		];
	}

	for (const key of Object.keys(value)) {
		if (
			/^(?:api[-_]?key|authorization|access[-_]?token|token|secret|password)$/iu.test(
				key,
			)
		) {
			issues.push({
				path: `${path}.${key}`,
				message: "Credentials are forbidden.",
			});
			continue;
		}
		issues.push(
			...assertPortableJson({
				value: Reflect.get(value, key),
				path: `${path}.${key}`,
				depth: depth + 1,
			}),
		);
	}
	return issues;
}

function issue({
	path,
	message,
}: {
	path: string;
	message: string;
}): ChatCutResultValidationIssue {
	return { path, message };
}

function evidenceCovers({
	evidence,
	assetId,
	range,
	kinds,
}: {
	evidence: readonly ChatCutOperationEvidence[];
	assetId: string;
	range: FrameRange;
	kinds: readonly ChatCutOperationEvidence["kind"][];
}): boolean {
	return evidence.some(
		(entry) =>
			kinds.includes(entry.kind) &&
			entry.assetId === assetId &&
			"sourceRange" in entry &&
			rangeContains({ container: entry.sourceRange, candidate: range }),
	);
}

function collectOperationIssues({
	operation,
	path,
}: {
	operation: ChatCutResultOperation;
	path: string;
}): ChatCutResultValidationIssue[] {
	const issues: ChatCutResultValidationIssue[] = [];
	const requireSurfaceEvidence = ({
		assetId,
		range,
		target,
	}: {
		assetId: string;
		range: FrameRange;
		target: ChatCutItemTarget;
	}) => {
		const hasEvidence =
			operation.surface === "script"
				? evidenceCovers({
						evidence: operation.evidence,
						assetId,
						range,
						kinds: ["transcript-segment"],
					})
				: operation.evidence.some(
						(entry) =>
							entry.kind === "timeline-item" &&
							entry.assetId === assetId &&
							entry.itemId === target.itemId &&
							entry.itemFingerprint === target.itemFingerprint &&
							rangeContains({
								container: entry.sourceRange,
								candidate: range,
							}),
					);
		if (!hasEvidence) {
			issues.push(
				issue({
					path: `${path}.evidence`,
					message: `${operation.surface} operations require matching range evidence.`,
				}),
			);
		}
	};

	if (operation.kind === "trim") {
		if (
			!rangeContains({
				container: operation.before.timelineRange,
				candidate: operation.after.timelineRange,
			}) ||
			!rangeContains({
				container: operation.before.sourceRange,
				candidate: operation.after.sourceRange,
			}) ||
			rangeDuration(operation.after.timelineRange) >=
				rangeDuration(operation.before.timelineRange)
		) {
			issues.push(
				issue({
					path: `${path}.after`,
					message: "A trim must strictly shrink the evidenced range.",
				}),
			);
		}
		if (
			!rateMatchesRanges({
				timelineRange: operation.before.timelineRange,
				sourceRange: operation.before.sourceRange,
				rate: operation.target.playbackRate,
			}) ||
			!rateMatchesRanges({
				timelineRange: operation.after.timelineRange,
				sourceRange: operation.after.sourceRange,
				rate: operation.target.playbackRate,
			})
		) {
			issues.push(
				issue({
					path: `${path}.target.playbackRate`,
					message: "Ranges do not match playback rate.",
				}),
			);
		}
		requireSurfaceEvidence({
			assetId: operation.target.assetId,
			range: operation.before.sourceRange,
			target: operation.target,
		});
	}

	if (operation.kind === "split") {
		if (
			operation.splitAtTimelineFrame <=
				operation.before.timelineRange.startFrame ||
			operation.splitAtTimelineFrame >=
				operation.before.timelineRange.endFrame ||
			operation.splitAtSourceFrame <= operation.before.sourceRange.startFrame ||
			operation.splitAtSourceFrame >= operation.before.sourceRange.endFrame
		) {
			issues.push(
				issue({
					path,
					message: "Split points must be strictly inside the evidenced range.",
				}),
			);
		}
		const sourceOffset =
			operation.splitAtSourceFrame - operation.before.sourceRange.startFrame;
		const timelineOffset =
			operation.splitAtTimelineFrame -
			operation.before.timelineRange.startFrame;
		if (
			sourceOffset * operation.target.playbackRate.denominator !==
			timelineOffset * operation.target.playbackRate.numerator
		) {
			issues.push(
				issue({
					path,
					message: "Split points do not match playback rate.",
				}),
			);
		}
		if (operation.resultItemIds[0] === operation.resultItemIds[1]) {
			issues.push(
				issue({
					path: `${path}.resultItemIds`,
					message: "Split result item ids must be unique.",
				}),
			);
		}
		if (operation.resultItemIds.includes(operation.target.itemId)) {
			issues.push(
				issue({
					path: `${path}.resultItemIds`,
					message: "Split result ids cannot reuse the source item id.",
				}),
			);
		}
		requireSurfaceEvidence({
			assetId: operation.target.assetId,
			range: operation.before.sourceRange,
			target: operation.target,
		});
	}

	if (operation.kind === "remove") {
		if (
			!rateMatchesRanges({
				timelineRange: operation.target.timelineRange,
				sourceRange: operation.target.sourceRange,
				rate: operation.target.playbackRate,
			})
		) {
			issues.push(
				issue({
					path: `${path}.target.playbackRate`,
					message: "Ranges do not match playback rate.",
				}),
			);
		}
		if (
			(operation.basis === "timeline-item" &&
				operation.surface !== "timeline") ||
			(operation.basis !== "timeline-item" && operation.surface !== "script")
		) {
			issues.push(
				issue({
					path: `${path}.surface`,
					message: "Removal basis and editing surface disagree.",
				}),
			);
		}
		const evidenceKind =
			operation.basis === "timeline-item"
				? "timeline-item"
				: operation.basis === "silence"
					? "silence-analysis"
					: "transcript-segment";
		const matchingBasisEvidence =
			evidenceKind === "timeline-item"
				? operation.evidence.some(
						(entry) =>
							entry.kind === "timeline-item" &&
							entry.assetId === operation.target.assetId &&
							entry.itemId === operation.target.itemId &&
							entry.itemFingerprint === operation.target.itemFingerprint &&
							rangeContains({
								container: entry.sourceRange,
								candidate: operation.target.sourceRange,
							}),
					)
				: evidenceCovers({
						evidence: operation.evidence,
						assetId: operation.target.assetId,
						range: operation.target.sourceRange,
						kinds: [evidenceKind],
					});
		if (!matchingBasisEvidence) {
			issues.push(
				issue({
					path: `${path}.evidence`,
					message: "Removal requires matching basis evidence.",
				}),
			);
		}
	}

	if (operation.kind === "reorder") {
		const segmentIds = operation.segments.map(({ segmentId }) => segmentId);
		if (
			!hasUniqueValues(segmentIds) ||
			!sameStringSet({ left: segmentIds, right: operation.beforeOrder }) ||
			!sameStringSet({ left: segmentIds, right: operation.afterOrder }) ||
			operation.beforeOrder.every(
				(segmentId, index) => operation.afterOrder[index] === segmentId,
			)
		) {
			issues.push(
				issue({
					path,
					message:
						"Reorder must be a changed permutation of the exact evidenced segments.",
				}),
			);
		}
		for (const [index, segment] of operation.segments.entries()) {
			if (segment.target.trackId !== operation.trackId) {
				issues.push(
					issue({
						path: `${path}.segments[${index}].target.trackId`,
						message: "Reorder is same-track only.",
					}),
				);
			}
			if (
				!rateMatchesRanges({
					timelineRange: segment.timelineRange,
					sourceRange: segment.sourceRange,
					rate: segment.target.playbackRate,
				})
			) {
				issues.push(
					issue({
						path: `${path}.segments[${index}]`,
						message: "Segment ranges do not match playback rate.",
					}),
				);
			}
			requireSurfaceEvidence({
				assetId: segment.target.assetId,
				range: segment.sourceRange,
				target: segment.target,
			});
		}
	}

	if (operation.kind === "caption-fix") {
		if (operation.beforeText === operation.afterText) {
			issues.push(
				issue({
					path: `${path}.afterText`,
					message: "A caption fix must change the observed ASR word.",
				}),
			);
		}
		const matchingWordEvidence = operation.evidence.some(
			(entry) =>
				entry.kind === "transcript-word" &&
				entry.assetId === operation.target.assetId &&
				entry.transcriptId === operation.target.transcriptId &&
				entry.transcriptRevision === operation.target.transcriptRevision &&
				entry.segmentId === operation.target.segmentId &&
				entry.wordId === operation.target.wordId &&
				rangesEqual({
					left: entry.sourceRange,
					right: operation.target.sourceRange,
				}) &&
				entry.observedText === operation.beforeText &&
				entry.contentFingerprint === operation.target.wordFingerprint,
		);
		if (!matchingWordEvidence) {
			issues.push(
				issue({
					path: `${path}.evidence`,
					message: "Caption fixes require exact transcript-word evidence.",
				}),
			);
		}
	}

	return issues;
}

function collectEnvelopeIssues(
	envelope: ChatCutResultEnvelope,
): ChatCutResultValidationIssue[] {
	const issues: ChatCutResultValidationIssue[] = [];
	const operationIds = envelope.operations.map(({ id }) => id);
	if (!hasUniqueValues(operationIds)) {
		issues.push(
			issue({ path: "$.operations", message: "Operation ids must be unique." }),
		);
	}
	if (
		envelope.operations.some((operation, index) => operation.sequence !== index)
	) {
		issues.push(
			issue({
				path: "$.operations",
				message: "Operation sequence must be contiguous and zero-based.",
			}),
		);
	}

	const assetIds = envelope.assets.map(
		({ visionCutAssetId }) => visionCutAssetId,
	);
	const chatCutAssetIds = envelope.assets.map(
		({ chatCutAssetId }) => chatCutAssetId,
	);
	if (!hasUniqueValues(assetIds) || !hasUniqueValues(chatCutAssetIds)) {
		issues.push(
			issue({
				path: "$.assets",
				message: "Asset ids must be unique within each system.",
			}),
		);
	}
	const evidenceIds = envelope.operations.flatMap((operation) =>
		operation.evidence.map(({ evidenceId }) => evidenceId),
	);
	if (!hasUniqueValues(evidenceIds)) {
		issues.push(
			issue({
				path: "$.operations.evidence",
				message: "Evidence ids must be unique across the result.",
			}),
		);
	}
	for (const [index, operation] of envelope.operations.entries()) {
		if (
			operation.scope.projectId !== envelope.baseline.projectId ||
			operation.scope.timelineId !== envelope.baseline.timelineId
		) {
			issues.push(
				issue({
					path: `$.operations[${index}].scope`,
					message: "Operation is outside the result project scope.",
				}),
			);
		}
		for (const evidence of operation.evidence) {
			const binding = envelope.assets.find(
				({ visionCutAssetId }) => visionCutAssetId === evidence.assetId,
			);
			if (!binding) {
				issues.push(
					issue({
						path: `$.operations[${index}].evidence`,
						message: "Evidence references an unbound asset.",
					}),
				);
			}
			if (
				binding &&
				"sourceRange" in evidence &&
				evidence.sourceRange.endFrame > binding.durationFrames
			) {
				issues.push(
					issue({
						path: `$.operations[${index}].evidence`,
						message: "Evidence range exceeds the bound source asset.",
					}),
				);
			}
			if (
				evidence.kind === "timeline-item" &&
				evidence.timelineFingerprint !== envelope.baseline.timelineFingerprint
			) {
				issues.push(
					issue({
						path: `$.operations[${index}].evidence`,
						message: "Timeline evidence is not from the declared baseline.",
					}),
				);
			}
		}
		issues.push(
			...collectOperationIssues({
				operation,
				path: `$.operations[${index}]`,
			}),
		);
	}

	const source = envelope.source;
	if (
		source.applyReceipt.beforeTimelineFingerprint !==
			source.beforeTimelineFingerprint ||
		source.applyReceipt.afterTimelineFingerprint !==
			source.afterTimelineFingerprint
	) {
		issues.push(
			issue({
				path: "$.source.applyReceipt",
				message: "Receipt fingerprints do not match the source timeline.",
			}),
		);
	}
	if (source.beforeTimelineFingerprint === source.afterTimelineFingerprint) {
		issues.push(
			issue({
				path: "$.source.afterTimelineFingerprint",
				message: "An applied result must identify a changed source timeline.",
			}),
		);
	}
	if (
		Date.parse(envelope.createdAt) < Date.parse(source.applyReceipt.appliedAt)
	) {
		issues.push(
			issue({
				path: "$.createdAt",
				message: "Result creation cannot precede the source apply receipt.",
			}),
		);
	}
	if (
		source.undoReference.projectId !== source.projectId ||
		source.undoReference.timelineId !== source.timelineId ||
		source.undoReference.timelineRevision !== source.timelineRevision ||
		source.undoReference.timelineFingerprint !==
			source.beforeTimelineFingerprint
	) {
		issues.push(
			issue({
				path: "$.source.undoReference",
				message:
					"Undo reference must point to the exact pre-apply source state.",
			}),
		);
	}
	if (
		source.applyReceipt.operationIds.length !== operationIds.length ||
		source.applyReceipt.operationIds.some(
			(operationId, index) => operationId !== operationIds[index],
		)
	) {
		issues.push(
			issue({
				path: "$.source.applyReceipt.operationIds",
				message: "Receipt must cover every operation in order.",
			}),
		);
	}

	const expectedKey = createChatCutResultIdempotencyKey({
		sourceProjectId: source.projectId,
		sourceTimelineId: source.timelineId,
		sourceReceiptId: source.applyReceipt.receiptId,
		baselineVersionId: envelope.baseline.versionId,
	});
	if (envelope.idempotencyKey !== expectedKey) {
		issues.push(
			issue({
				path: "$.idempotencyKey",
				message:
					"Idempotency key does not match the source receipt and baseline.",
			}),
		);
	}

	const expectedPreview = buildChatCutResultPreview({
		operations: envelope.operations,
	});
	if (stableStringify(envelope.preview) !== stableStringify(expectedPreview)) {
		issues.push(
			issue({
				path: "$.preview",
				message: "Preview diff must be derived exactly from operations.",
			}),
		);
	}
	return issues;
}

function parseUnknownInput(input: string | unknown): unknown {
	if (typeof input !== "string") return input;
	if (input.length > MAX_JSON_LENGTH) {
		throw new ChatCutResultValidationError([
			issue({
				path: "$",
				message: "Serialized result exceeds the supported size.",
			}),
		]);
	}
	try {
		return JSON.parse(input) as unknown;
	} catch {
		throw new ChatCutResultValidationError([
			issue({ path: "$", message: "Invalid JSON." }),
		]);
	}
}

function parseTargetState(input: unknown): ChatCutImportTargetState {
	const portabilityIssues = assertPortableJson({ value: input });
	if (portabilityIssues.length > 0) {
		throw new ChatCutResultValidationError(portabilityIssues);
	}
	const parsed = targetStateSchema.safeParse(input);
	if (!parsed.success) {
		throw new ChatCutResultValidationError(
			parsed.error.issues.map((entry) =>
				issue({
					path: entry.path.length > 0 ? `$.${entry.path.join(".")}` : "$",
					message: entry.message,
				}),
			),
		);
	}
	const state = parsed.data as ChatCutImportTargetState;
	const uniqueGroups: readonly [string, readonly string[]][] = [
		["assets", state.assets.map(({ assetId }) => assetId)],
		["items", state.items.map(({ itemId }) => itemId)],
		[
			"transcripts",
			state.transcripts.map(
				({ transcriptId, assetId }) => `${transcriptId}:${assetId}`,
			),
		],
		[
			"transcriptWords",
			state.transcriptWords.map(
				({ transcriptId, wordId }) => `${transcriptId}:${wordId}`,
			),
		],
		[
			"silenceAnalyses",
			state.silenceAnalyses.map(
				({ analysisId, assetId }) => `${analysisId}:${assetId}`,
			),
		],
		[
			"appliedImports",
			state.appliedImports.map(({ idempotencyKey }) => idempotencyKey),
		],
	];
	const duplicate = uniqueGroups.find(([, values]) => !hasUniqueValues(values));
	if (duplicate) {
		throw new ChatCutResultValidationError([
			issue({
				path: `$.${duplicate[0]}`,
				message: "State identifiers must be unique.",
			}),
		]);
	}
	const invalidReceipt = state.appliedImports.find(
		(receipt) =>
			receipt.projectId !== state.projectId ||
			receipt.timelineId !== state.timelineId ||
			receipt.undoReference.projectId !== state.projectId ||
			receipt.undoReference.timelineId !== state.timelineId ||
			receipt.toVersion <= receipt.fromVersion ||
			receipt.toVersion > state.projectVersion ||
			!hasUniqueValues(receipt.operationIds),
	);
	if (invalidReceipt) {
		throw new ChatCutResultValidationError([
			issue({
				path: "$.appliedImports",
				message:
					"Apply receipts must be scoped, forward-only, and internally unique.",
			}),
		]);
	}
	return deepFreeze(state);
}

export function createChatCutResultIdempotencyKey({
	sourceProjectId,
	sourceTimelineId,
	sourceReceiptId,
	baselineVersionId,
}: {
	readonly sourceProjectId: string;
	readonly sourceTimelineId: string;
	readonly sourceReceiptId: string;
	readonly baselineVersionId: string;
}): string {
	return `chatcut-result:${stableDigest(
		[
			sourceProjectId,
			sourceTimelineId,
			sourceReceiptId,
			baselineVersionId,
		].join("\u001f"),
	)}`;
}

export function buildChatCutResultPreview({
	operations,
}: {
	readonly operations: readonly ChatCutResultOperation[];
}): ChatCutResultPreviewDiff {
	const operationDiffs = operations.map(
		(operation): ChatCutOperationPreviewDiff => {
			if (operation.kind === "trim") {
				return {
					operationId: operation.id,
					kind: operation.kind,
					risk: "destructive",
					affectedTimelineRanges: [operation.before.timelineRange],
					affectedSourceRanges: [operation.before.sourceRange],
					removedTimelineFrames:
						rangeDuration(operation.before.timelineRange) -
						rangeDuration(operation.after.timelineRange),
					movedSegmentCount: 0,
					correctedWordCount: 0,
				};
			}
			if (operation.kind === "split") {
				return {
					operationId: operation.id,
					kind: operation.kind,
					risk: "structural",
					affectedTimelineRanges: [operation.before.timelineRange],
					affectedSourceRanges: [operation.before.sourceRange],
					removedTimelineFrames: 0,
					movedSegmentCount: 0,
					correctedWordCount: 0,
				};
			}
			if (operation.kind === "remove") {
				return {
					operationId: operation.id,
					kind: operation.kind,
					risk: "destructive",
					affectedTimelineRanges: [operation.target.timelineRange],
					affectedSourceRanges: [operation.target.sourceRange],
					removedTimelineFrames: rangeDuration(operation.target.timelineRange),
					movedSegmentCount: 0,
					correctedWordCount: 0,
				};
			}
			if (operation.kind === "reorder") {
				return {
					operationId: operation.id,
					kind: operation.kind,
					risk: "structural",
					affectedTimelineRanges: operation.segments.map(
						({ timelineRange }) => timelineRange,
					),
					affectedSourceRanges: operation.segments.map(
						({ sourceRange }) => sourceRange,
					),
					removedTimelineFrames: 0,
					movedSegmentCount: operation.beforeOrder.filter(
						(segmentId, index) => operation.afterOrder[index] !== segmentId,
					).length,
					correctedWordCount: 0,
				};
			}
			return {
				operationId: operation.id,
				kind: operation.kind,
				risk: "text-correction",
				affectedTimelineRanges: [],
				affectedSourceRanges: [operation.target.sourceRange],
				removedTimelineFrames: 0,
				movedSegmentCount: 0,
				correctedWordCount: 1,
			};
		},
	);

	return deepFreeze({
		operationDiffs,
		summary: {
			operationCount: operationDiffs.length,
			destructiveCount: operationDiffs.filter(
				({ risk }) => risk === "destructive",
			).length,
			structuralCount: operationDiffs.filter(
				({ risk }) => risk === "structural",
			).length,
			textCorrectionCount: operationDiffs.filter(
				({ risk }) => risk === "text-correction",
			).length,
			removedTimelineFrames: operationDiffs.reduce(
				(total, diff) => total + diff.removedTimelineFrames,
				0,
			),
			movedSegmentCount: operationDiffs.reduce(
				(total, diff) => total + diff.movedSegmentCount,
				0,
			),
			correctedWordCount: operationDiffs.reduce(
				(total, diff) => total + diff.correctedWordCount,
				0,
			),
		},
	});
}

export function validateChatCutResult(
	input: string | unknown,
): ChatCutResultValidation {
	try {
		return { ok: true, value: parseChatCutResult(input) };
	} catch (error) {
		if (error instanceof ChatCutResultValidationError) {
			return { ok: false, issues: error.issues };
		}
		return {
			ok: false,
			issues: [
				issue({
					path: "$",
					message: "Unexpected result validation failure.",
				}),
			],
		};
	}
}

export function parseChatCutResult(
	input: string | unknown,
): ChatCutResultEnvelope {
	const unknownValue = parseUnknownInput(input);
	const portabilityIssues = assertPortableJson({ value: unknownValue });
	if (portabilityIssues.length > 0) {
		throw new ChatCutResultValidationError(portabilityIssues);
	}
	const parsed = envelopeSchema.safeParse(unknownValue);
	if (!parsed.success) {
		throw new ChatCutResultValidationError(
			parsed.error.issues.map((entry) =>
				issue({
					path: entry.path.length > 0 ? `$.${entry.path.join(".")}` : "$",
					message: entry.message,
				}),
			),
		);
	}
	const envelope = parsed.data as ChatCutResultEnvelope;
	const invariantIssues = collectEnvelopeIssues(envelope);
	if (invariantIssues.length > 0) {
		throw new ChatCutResultValidationError(invariantIssues);
	}
	return deepFreeze(envelope);
}

export function serializeChatCutResult(
	envelope: ChatCutResultEnvelope,
): string {
	return stableStringify(parseChatCutResult(envelope));
}

function addConflict({
	conflicts,
	conflict,
}: {
	conflicts: ChatCutImportConflict[];
	conflict: ChatCutImportConflict;
}): void {
	const key = `${conflict.code}:${conflict.operationId ?? ""}:${conflict.path}`;
	if (
		!conflicts.some(
			(entry) =>
				`${entry.code}:${entry.operationId ?? ""}:${entry.path}` === key,
		)
	) {
		conflicts.push(conflict);
	}
}

function compareExpected({
	conflicts,
	input,
}: {
	conflicts: ChatCutImportConflict[];
	input: ChatCutImportConflict;
}): void {
	if (input.expected !== input.actual) {
		addConflict({ conflicts, conflict: input });
	}
}

function compareItemTarget({
	operationId,
	target,
	expectedTimelineRange,
	expectedSourceRange,
	allowContainedRange,
	state,
	conflicts,
}: {
	operationId: string;
	target: ChatCutItemTarget;
	expectedTimelineRange: FrameRange;
	expectedSourceRange: FrameRange;
	allowContainedRange: boolean;
	state: ChatCutImportTargetState;
	conflicts: ChatCutImportConflict[];
}): void {
	const item = state.items.find(({ itemId }) => itemId === target.itemId);
	if (!item) {
		addConflict({
			conflicts,
			conflict: {
				code: "item-missing",
				path: `items.${target.itemId}`,
				operationId,
				expected: target.itemId,
				actual: null,
			},
		});
		return;
	}
	compareExpected({
		conflicts,
		input: {
			code: "item-fingerprint-mismatch",
			path: `items.${target.itemId}.fingerprint`,
			operationId,
			expected: target.itemFingerprint,
			actual: item.itemFingerprint,
		},
	});
	const stateMatches =
		item.assetId === target.assetId &&
		item.trackId === target.trackId &&
		item.playbackRate.numerator === target.playbackRate.numerator &&
		item.playbackRate.denominator === target.playbackRate.denominator &&
		(allowContainedRange
			? rangeContains({
					container: item.timelineRange,
					candidate: expectedTimelineRange,
				}) &&
				rangeContains({
					container: item.sourceRange,
					candidate: expectedSourceRange,
				})
			: rangesEqual({
					left: item.timelineRange,
					right: expectedTimelineRange,
				}) &&
				rangesEqual({
					left: item.sourceRange,
					right: expectedSourceRange,
				}));
	if (!stateMatches) {
		addConflict({
			conflicts,
			conflict: {
				code: "item-state-mismatch",
				path: `items.${target.itemId}.range`,
				operationId,
				expected: stableStringify({
					assetId: target.assetId,
					trackId: target.trackId,
					timelineRange: expectedTimelineRange,
					sourceRange: expectedSourceRange,
				}),
				actual: stableStringify({
					assetId: item.assetId,
					trackId: item.trackId,
					timelineRange: item.timelineRange,
					sourceRange: item.sourceRange,
				}),
			},
		});
	}
}

function compareEvidenceState({
	operation,
	state,
	conflicts,
}: {
	operation: ChatCutResultOperation;
	state: ChatCutImportTargetState;
	conflicts: ChatCutImportConflict[];
}): void {
	for (const evidence of operation.evidence) {
		if (evidence.kind === "transcript-segment") {
			const transcript = state.transcripts.find(
				(entry) =>
					entry.transcriptId === evidence.transcriptId &&
					entry.assetId === evidence.assetId,
			);
			if (!transcript) {
				addConflict({
					conflicts,
					conflict: {
						code: "transcript-missing",
						path: `transcripts.${evidence.transcriptId}`,
						operationId: operation.id,
						expected: evidence.transcriptId,
						actual: null,
					},
				});
			} else if (
				transcript.revision !== evidence.transcriptRevision ||
				transcript.contentFingerprint !== evidence.contentFingerprint
			) {
				addConflict({
					conflicts,
					conflict: {
						code: "transcript-state-mismatch",
						path: `transcripts.${evidence.transcriptId}`,
						operationId: operation.id,
						expected: `${evidence.transcriptRevision}:${evidence.contentFingerprint}`,
						actual: `${transcript.revision}:${transcript.contentFingerprint}`,
					},
				});
			}
		}
		if (evidence.kind === "silence-analysis") {
			const analysis = state.silenceAnalyses.find(
				(entry) =>
					entry.analysisId === evidence.analysisId &&
					entry.assetId === evidence.assetId,
			);
			if (!analysis) {
				addConflict({
					conflicts,
					conflict: {
						code: "silence-analysis-missing",
						path: `silenceAnalyses.${evidence.analysisId}`,
						operationId: operation.id,
						expected: evidence.analysisId,
						actual: null,
					},
				});
			} else if (
				analysis.revision !== evidence.analysisRevision ||
				analysis.analysisFingerprint !== evidence.analysisFingerprint
			) {
				addConflict({
					conflicts,
					conflict: {
						code: "silence-analysis-state-mismatch",
						path: `silenceAnalyses.${evidence.analysisId}`,
						operationId: operation.id,
						expected: `${evidence.analysisRevision}:${evidence.analysisFingerprint}`,
						actual: `${analysis.revision}:${analysis.analysisFingerprint}`,
					},
				});
			}
		}
	}
}

export function compareChatCutResult({
	result,
	current,
}: {
	readonly result: ChatCutResultEnvelope | string | unknown;
	readonly current: ChatCutImportTargetState | unknown;
}): ChatCutResultComparison {
	const envelope = parseChatCutResult(result);
	const state = parseTargetState(current);
	const preview = envelope.preview;
	const conflicts: ChatCutImportConflict[] = [];

	compareExpected({
		conflicts,
		input: {
			code: "project-mismatch",
			path: "projectId",
			expected: envelope.baseline.projectId,
			actual: state.projectId,
		},
	});
	if (conflicts.length > 0) {
		return deepFreeze({ status: "conflict", conflicts, preview });
	}

	const existingReceipt = state.appliedImports.find(
		(receipt) =>
			receipt.idempotencyKey === envelope.idempotencyKey &&
			receipt.resultId === envelope.resultId,
	);
	if (existingReceipt) {
		return deepFreeze({
			status: "already-applied",
			conflicts: [] as const,
			preview,
			receipt: existingReceipt,
		});
	}

	compareExpected({
		conflicts,
		input: {
			code: "timeline-mismatch",
			path: "timelineId",
			expected: envelope.baseline.timelineId,
			actual: state.timelineId,
		},
	});
	compareExpected({
		conflicts,
		input: {
			code: "baseline-version-mismatch",
			path: "projectVersion",
			expected: envelope.baseline.projectVersion,
			actual: state.projectVersion,
		},
	});
	compareExpected({
		conflicts,
		input: {
			code: "baseline-version-id-mismatch",
			path: "versionId",
			expected: envelope.baseline.versionId,
			actual: state.versionId,
		},
	});
	compareExpected({
		conflicts,
		input: {
			code: "baseline-snapshot-mismatch",
			path: "timelineSnapshotId",
			expected: envelope.baseline.timelineSnapshotId,
			actual: state.timelineSnapshotId,
		},
	});
	compareExpected({
		conflicts,
		input: {
			code: "baseline-timeline-fingerprint-mismatch",
			path: "timelineFingerprint",
			expected: envelope.baseline.timelineFingerprint,
			actual: state.timelineFingerprint,
		},
	});

	for (const binding of envelope.assets) {
		const asset = state.assets.find(
			({ assetId }) => assetId === binding.visionCutAssetId,
		);
		if (!asset) {
			addConflict({
				conflicts,
				conflict: {
					code: "asset-missing",
					path: `assets.${binding.visionCutAssetId}`,
					expected: binding.visionCutAssetId,
					actual: null,
				},
			});
			continue;
		}
		compareExpected({
			conflicts,
			input: {
				code: "asset-fingerprint-mismatch",
				path: `assets.${asset.assetId}.fingerprint`,
				expected: binding.fingerprint,
				actual: asset.fingerprint,
			},
		});
		compareExpected({
			conflicts,
			input: {
				code: "asset-duration-mismatch",
				path: `assets.${asset.assetId}.durationFrames`,
				expected: binding.durationFrames,
				actual: asset.durationFrames,
			},
		});
	}

	for (const operation of envelope.operations) {
		compareEvidenceState({ operation, state, conflicts });
		if (operation.kind === "trim" || operation.kind === "split") {
			compareItemTarget({
				operationId: operation.id,
				target: operation.target,
				expectedTimelineRange: operation.before.timelineRange,
				expectedSourceRange: operation.before.sourceRange,
				allowContainedRange: false,
				state,
				conflicts,
			});
		}
		if (operation.kind === "remove") {
			compareItemTarget({
				operationId: operation.id,
				target: operation.target,
				expectedTimelineRange: operation.target.timelineRange,
				expectedSourceRange: operation.target.sourceRange,
				allowContainedRange: true,
				state,
				conflicts,
			});
		}
		if (operation.kind === "reorder") {
			for (const segment of operation.segments) {
				compareItemTarget({
					operationId: operation.id,
					target: segment.target,
					expectedTimelineRange: segment.timelineRange,
					expectedSourceRange: segment.sourceRange,
					allowContainedRange: true,
					state,
					conflicts,
				});
			}
		}
		if (operation.kind === "caption-fix") {
			const word = state.transcriptWords.find(
				(entry) =>
					entry.transcriptId === operation.target.transcriptId &&
					entry.wordId === operation.target.wordId,
			);
			if (!word) {
				addConflict({
					conflicts,
					conflict: {
						code: "transcript-word-missing",
						path: `transcriptWords.${operation.target.wordId}`,
						operationId: operation.id,
						expected: operation.target.wordId,
						actual: null,
					},
				});
			} else if (
				word.assetId !== operation.target.assetId ||
				word.revision !== operation.target.transcriptRevision ||
				word.segmentId !== operation.target.segmentId ||
				word.text !== operation.beforeText ||
				word.wordFingerprint !== operation.target.wordFingerprint ||
				!rangesEqual({
					left: word.sourceRange,
					right: operation.target.sourceRange,
				})
			) {
				addConflict({
					conflicts,
					conflict: {
						code: "transcript-word-state-mismatch",
						path: `transcriptWords.${operation.target.wordId}`,
						operationId: operation.id,
						expected: operation.target.wordFingerprint,
						actual: word.wordFingerprint,
					},
				});
			}
		}
	}

	return conflicts.length > 0
		? deepFreeze({ status: "conflict", conflicts, preview })
		: deepFreeze({ status: "ready", conflicts: [] as const, preview });
}

export function prepareChatCutResultImport({
	result,
	current,
	approvedOperationIds,
}: {
	readonly result: ChatCutResultEnvelope | string | unknown;
	readonly current: ChatCutImportTargetState | unknown;
	readonly approvedOperationIds: readonly string[];
}): ChatCutPrepareImportResult {
	const envelope = parseChatCutResult(result);
	const state = parseTargetState(current);
	if (!hasUniqueValues(approvedOperationIds)) {
		throw new ChatCutResultValidationError([
			issue({
				path: "$.approvedOperationIds",
				message: "Approved operation ids must be unique.",
			}),
		]);
	}
	const operationIds = envelope.operations.map(({ id }) => id);
	const unknownApproval = approvedOperationIds.find(
		(operationId) => !operationIds.includes(operationId),
	);
	if (unknownApproval) {
		throw new ChatCutResultValidationError([
			issue({
				path: "$.approvedOperationIds",
				message: `Unknown operation id: ${unknownApproval}.`,
			}),
		]);
	}

	const comparison = compareChatCutResult({ result: envelope, current: state });
	if (comparison.status === "already-applied") {
		return deepFreeze({
			status: "already-applied",
			receipt: comparison.receipt,
		});
	}
	if (comparison.status === "conflict") {
		return deepFreeze({ status: "conflict", comparison });
	}

	const missingOperationIds = operationIds.filter(
		(operationId) => !approvedOperationIds.includes(operationId),
	);
	if (missingOperationIds.length > 0) {
		return deepFreeze({ status: "approval-required", missingOperationIds });
	}

	const preparedImportId = `chatcut-import-${stableDigest(
		stableStringify({
			idempotencyKey: envelope.idempotencyKey,
			approvedOperationIds: operationIds,
			versionId: state.versionId,
			timelineFingerprint: state.timelineFingerprint,
		}),
	)}`;
	const plan: ChatCutPreparedImportPlan = {
		kind: CHATCUT_IMPORT_PLAN_KIND,
		schemaVersion: CHATCUT_RESULT_SCHEMA_VERSION,
		preparedImportId,
		resultId: envelope.resultId,
		idempotencyKey: envelope.idempotencyKey,
		projectId: state.projectId,
		timelineId: state.timelineId,
		approvedOperationIds: operationIds,
		operations: envelope.operations,
		preview: envelope.preview,
		guards: {
			expectedProjectVersion: state.projectVersion,
			expectedVersionId: state.versionId,
			expectedTimelineSnapshotId: state.timelineSnapshotId,
			expectedTimelineFingerprint: state.timelineFingerprint,
			assetFingerprints: envelope.assets.map((binding) => ({
				assetId: binding.visionCutAssetId,
				fingerprint: binding.fingerprint,
			})),
		},
		undoReference: {
			kind: "visioncut.timeline-undo-reference",
			projectId: state.projectId,
			timelineId: state.timelineId,
			snapshotId: state.timelineSnapshotId,
			versionId: state.versionId,
			timelineFingerprint: state.timelineFingerprint,
		},
		executionPolicy: {
			atomic: true,
			revalidateBeforeApply: true,
			freeTextCommandsAllowed: false,
			requiresExplicitApproval: true,
		},
	};
	return deepFreeze({ status: "ready", plan: deepFreeze(plan) });
}

export function finalizeChatCutResultImport({
	plan,
	appliedAt,
	resultingVersion,
	resultingVersionId,
	resultingTimelineFingerprint,
}: {
	readonly plan: ChatCutPreparedImportPlan;
	readonly appliedAt: string;
	readonly resultingVersion: number;
	readonly resultingVersionId: string;
	readonly resultingTimelineFingerprint: string;
}): ChatCutImportApplyReceipt {
	if (!isCanonicalTimestamp(appliedAt)) {
		throw new ChatCutResultValidationError([
			issue({
				path: "$.appliedAt",
				message: "Expected a canonical ISO-8601 timestamp.",
			}),
		]);
	}
	if (
		!Number.isInteger(resultingVersion) ||
		resultingVersion <= plan.guards.expectedProjectVersion
	) {
		throw new ChatCutResultValidationError([
			issue({
				path: "$.resultingVersion",
				message: "Resulting version must advance the guarded baseline.",
			}),
		]);
	}
	if (!identifierSchema.safeParse(resultingVersionId).success) {
		throw new ChatCutResultValidationError([
			issue({
				path: "$.resultingVersionId",
				message: "Invalid resulting version id.",
			}),
		]);
	}
	if (!fingerprintSchema.safeParse(resultingTimelineFingerprint).success) {
		throw new ChatCutResultValidationError([
			issue({
				path: "$.resultingTimelineFingerprint",
				message: "Invalid timeline fingerprint.",
			}),
		]);
	}

	const receipt: ChatCutImportApplyReceipt = {
		kind: CHATCUT_IMPORT_RECEIPT_KIND,
		schemaVersion: CHATCUT_RESULT_SCHEMA_VERSION,
		receiptId: `chatcut-receipt-${stableDigest(
			stableStringify({
				preparedImportId: plan.preparedImportId,
				resultingVersion,
				resultingVersionId,
				resultingTimelineFingerprint,
			}),
		)}`,
		resultId: plan.resultId,
		idempotencyKey: plan.idempotencyKey,
		projectId: plan.projectId,
		timelineId: plan.timelineId,
		fromVersion: plan.guards.expectedProjectVersion,
		fromVersionId: plan.guards.expectedVersionId,
		toVersion: resultingVersion,
		toVersionId: resultingVersionId,
		appliedAt,
		operationIds: plan.approvedOperationIds,
		resultingTimelineFingerprint,
		undoReference: plan.undoReference,
	};
	const parsed = applyReceiptSchema.safeParse(receipt);
	if (!parsed.success) {
		throw new ChatCutResultValidationError(
			parsed.error.issues.map((entry) =>
				issue({
					path: `$.${entry.path.join(".")}`,
					message: entry.message,
				}),
			),
		);
	}
	return deepFreeze(parsed.data as ChatCutImportApplyReceipt);
}
