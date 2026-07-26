import { z } from "zod";
import {
	fingerprintJson,
	stableJson,
	type Sha256Fingerprint,
} from "./chatcut-fingerprint";

export const TRANSCRIPT_ARTIFACT_KIND =
	"visioncut.timeline-transcript-artifact" as const;
export const TRANSCRIPT_ARTIFACT_SCHEMA_VERSION = 1 as const;
export const TRANSCRIPT_HISTORY_KIND =
	"visioncut.timeline-transcript-history" as const;
export const TRANSCRIPT_HISTORY_SCHEMA_VERSION = 1 as const;
export const TRANSCRIPT_ARTIFACT_UPDATED_EVENT =
	"visioncut:transcript-artifact-updated" as const;

const TRANSCRIPT_LIMITATION_STATEMENT =
	"Only segment-level transcript text and time ranges are evidence. Word timestamps, speaker identity, person identity, emotion, and language verification are not available.";

export type TranscriptProvenance = "local-whisper" | "imported-subtitle";
export type TranscriptLanguageBasis =
	| "user-selected"
	| "auto-requested-not-returned"
	| "subtitle-file-not-declared";

export interface TranscriptLanguage {
	readonly code: string;
	readonly basis: TranscriptLanguageBasis;
	readonly verified: false;
}

export interface LocalWhisperSourceMetadata {
	readonly kind: "local-whisper";
	readonly runtimePackage: "@huggingface/transformers";
	readonly modelId: string;
	readonly modelRepository: string;
	readonly audioSource: "active-timeline-mix";
	readonly mediaStored: false;
	readonly apiKeyStored: false;
}

export interface ImportedSubtitleSourceMetadata {
	readonly kind: "imported-subtitle";
	readonly fileName: string;
	readonly format: "srt" | "ass";
	readonly mimeType: string | null;
	readonly sizeBytes: number;
	readonly lastModified: number;
	readonly fileContentStored: false;
	readonly apiKeyStored: false;
}

export type TranscriptSourceMetadata =
	| LocalWhisperSourceMetadata
	| ImportedSubtitleSourceMetadata;

export interface TranscriptArtifactSegment {
	readonly id: string;
	readonly index: number;
	readonly text: string;
	readonly startSeconds: number;
	readonly endSeconds: number;
}

export interface TranscriptArtifactLimitations {
	readonly timestampGranularity: "segment";
	readonly wordTimestamps: false;
	readonly speakerDiarization: false;
	readonly personIdentification: false;
	readonly emotionInference: false;
	readonly languageVerified: false;
	readonly accuracyGuaranteed: false;
	readonly statement: typeof TRANSCRIPT_LIMITATION_STATEMENT;
}

export interface TranscriptArtifactDataPolicy {
	readonly transcriptOnly: true;
	readonly originalMediaStored: false;
	readonly importedFileStored: false;
	readonly apiKeysStored: false;
}

export interface TimelineTranscriptArtifact {
	readonly kind: typeof TRANSCRIPT_ARTIFACT_KIND;
	readonly schemaVersion: typeof TRANSCRIPT_ARTIFACT_SCHEMA_VERSION;
	readonly artifactId: string;
	readonly projectId: string;
	readonly sceneId: string;
	readonly timelineId: string;
	readonly captionTrackId: string;
	readonly revision: number;
	readonly createdAt: string;
	readonly language: TranscriptLanguage;
	readonly provenance: TranscriptProvenance;
	readonly sourceMetadata: TranscriptSourceMetadata;
	readonly fullText: string;
	readonly segments: readonly TranscriptArtifactSegment[];
	readonly previousArtifactFingerprint: Sha256Fingerprint | null;
	readonly contentFingerprint: Sha256Fingerprint;
	readonly limitations: TranscriptArtifactLimitations;
	readonly dataPolicy: TranscriptArtifactDataPolicy;
}

export interface TranscriptArtifactUpdatedEventDetail {
	readonly projectId: string;
	readonly sceneId: string;
	readonly timelineId: string;
	readonly artifactId: string;
	readonly revision: number;
	readonly contentFingerprint: Sha256Fingerprint;
}

export function emitTimelineTranscriptArtifactUpdated({
	artifact,
}: {
	artifact: TimelineTranscriptArtifact;
}): void {
	if (typeof window === "undefined") return;
	const detail: TranscriptArtifactUpdatedEventDetail = Object.freeze({
		projectId: artifact.projectId,
		sceneId: artifact.sceneId,
		timelineId: artifact.timelineId,
		artifactId: artifact.artifactId,
		revision: artifact.revision,
		contentFingerprint: artifact.contentFingerprint,
	});
	window.dispatchEvent(
		new CustomEvent<TranscriptArtifactUpdatedEventDetail>(
			TRANSCRIPT_ARTIFACT_UPDATED_EVENT,
			{ detail },
		),
	);
}

export interface TranscriptArtifactSegmentInput {
	readonly text: string;
	readonly startSeconds: number;
	readonly endSeconds: number;
}

export interface TimelineTranscriptArtifactDraft {
	readonly projectId: string;
	readonly sceneId: string;
	readonly timelineId: string;
	readonly captionTrackId: string;
	readonly language: TranscriptLanguage;
	readonly provenance: TranscriptProvenance;
	readonly sourceMetadata: TranscriptSourceMetadata;
	readonly fullText: string;
	readonly segments: readonly TranscriptArtifactSegmentInput[];
}

export interface TimelineTranscriptHistory {
	readonly kind: typeof TRANSCRIPT_HISTORY_KIND;
	readonly schemaVersion: typeof TRANSCRIPT_HISTORY_SCHEMA_VERSION;
	readonly projectId: string;
	readonly revision: number;
	readonly artifacts: readonly TimelineTranscriptArtifact[];
	readonly contentFingerprint: Sha256Fingerprint;
	readonly guarantees: {
		readonly appendOnly: true;
		readonly indexedDbPreferred: true;
		readonly memoryFallback: true;
		readonly projectScoped: true;
		readonly originalMediaStored: false;
		readonly importedFileStored: false;
		readonly apiKeysStored: false;
	};
}

export interface TranscriptArtifactStorageAdapter {
	readProject({ projectId }: { projectId: string }): Promise<unknown | null>;
	writeProject({
		projectId,
		value,
		expectedRevision,
	}: {
		projectId: string;
		value: TimelineTranscriptHistory;
		expectedRevision: number;
	}): Promise<void>;
}

export class TranscriptArtifactValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TranscriptArtifactValidationError";
	}
}

export class TranscriptArtifactCorruptionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TranscriptArtifactCorruptionError";
	}
}

export class TranscriptArtifactConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TranscriptArtifactConflictError";
	}
}

export class TranscriptArtifactStorageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TranscriptArtifactStorageError";
	}
}

const canonicalIdentifierSchema = z
	.string()
	.min(1)
	.max(240)
	.refine(
		(value) =>
			value === value.normalize("NFKC").trim() &&
			/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(value),
		"Expected a canonical identifier.",
	);

const fingerprintSchema = z.custom<Sha256Fingerprint>(
	(value) => typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value),
	"Expected a SHA-256 fingerprint.",
);

const canonicalTimestampSchema = z.string().refine((value) => {
	const milliseconds = Date.parse(value);
	return (
		Number.isFinite(milliseconds) &&
		new Date(milliseconds).toISOString() === value
	);
}, "Expected a canonical ISO-8601 timestamp.");

const languageSchema = z
	.object({
		code: z
			.string()
			.min(2)
			.max(35)
			.regex(/^(?:und|[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)$/u),
		basis: z.enum([
			"user-selected",
			"auto-requested-not-returned",
			"subtitle-file-not-declared",
		]),
		verified: z.literal(false),
	})
	.strict();

const localWhisperSourceSchema = z
	.object({
		kind: z.literal("local-whisper"),
		runtimePackage: z.literal("@huggingface/transformers"),
		modelId: z.string().min(1).max(120),
		modelRepository: z
			.string()
			.min(1)
			.max(240)
			.regex(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u),
		audioSource: z.literal("active-timeline-mix"),
		mediaStored: z.literal(false),
		apiKeyStored: z.literal(false),
	})
	.strict();

function hasControlCharacter({ value }: { value: string }): boolean {
	for (const character of value) {
		const codePoint = character.codePointAt(0);
		if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) {
			return true;
		}
	}
	return false;
}

const importedSubtitleSourceSchema = z
	.object({
		kind: z.literal("imported-subtitle"),
		fileName: z
			.string()
			.min(1)
			.max(255)
			.refine(
				(value) =>
					value === value.normalize("NFKC").trim() &&
					!value.includes("\\") &&
					!value.includes("/") &&
					!hasControlCharacter({ value }),
				"Expected a base file name without path or control characters.",
			),
		format: z.enum(["srt", "ass"]),
		mimeType: z
			.string()
			.max(200)
			.regex(/^[\x20-\x7e]*$/u)
			.nullable(),
		sizeBytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
		lastModified: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
		fileContentStored: z.literal(false),
		apiKeyStored: z.literal(false),
	})
	.strict();

const sourceMetadataSchema = z.discriminatedUnion("kind", [
	localWhisperSourceSchema,
	importedSubtitleSourceSchema,
]);

const transcriptSegmentSchema = z
	.object({
		id: canonicalIdentifierSchema,
		index: z.number().int().nonnegative().max(999_999),
		text: z.string().min(1).max(100_000),
		startSeconds: z.number().finite().nonnegative(),
		endSeconds: z.number().finite().positive(),
	})
	.strict()
	.refine((segment) => segment.endSeconds > segment.startSeconds, {
		message: "Segment end must be after segment start.",
	});

const limitationsSchema = z
	.object({
		timestampGranularity: z.literal("segment"),
		wordTimestamps: z.literal(false),
		speakerDiarization: z.literal(false),
		personIdentification: z.literal(false),
		emotionInference: z.literal(false),
		languageVerified: z.literal(false),
		accuracyGuaranteed: z.literal(false),
		statement: z.literal(TRANSCRIPT_LIMITATION_STATEMENT),
	})
	.strict();

const dataPolicySchema = z
	.object({
		transcriptOnly: z.literal(true),
		originalMediaStored: z.literal(false),
		importedFileStored: z.literal(false),
		apiKeysStored: z.literal(false),
	})
	.strict();

const transcriptArtifactSchema = z
	.object({
		kind: z.literal(TRANSCRIPT_ARTIFACT_KIND),
		schemaVersion: z.literal(TRANSCRIPT_ARTIFACT_SCHEMA_VERSION),
		artifactId: canonicalIdentifierSchema,
		projectId: canonicalIdentifierSchema,
		sceneId: canonicalIdentifierSchema,
		timelineId: canonicalIdentifierSchema,
		captionTrackId: canonicalIdentifierSchema,
		revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
		createdAt: canonicalTimestampSchema,
		language: languageSchema,
		provenance: z.enum(["local-whisper", "imported-subtitle"]),
		sourceMetadata: sourceMetadataSchema,
		fullText: z.string().min(1).max(20_000_000),
		segments: z.array(transcriptSegmentSchema).min(1).max(100_000),
		previousArtifactFingerprint: fingerprintSchema.nullable(),
		contentFingerprint: fingerprintSchema,
		limitations: limitationsSchema,
		dataPolicy: dataPolicySchema,
	})
	.strict()
	.superRefine((artifact, context) => {
		if (artifact.provenance !== artifact.sourceMetadata.kind) {
			context.addIssue({
				code: "custom",
				path: ["sourceMetadata", "kind"],
				message: "Source metadata must match transcript provenance.",
			});
		}
		if (
			artifact.provenance === "local-whisper" &&
			artifact.language.basis === "subtitle-file-not-declared"
		) {
			context.addIssue({
				code: "custom",
				path: ["language", "basis"],
				message: "Local Whisper cannot use imported subtitle language basis.",
			});
		}
		if (
			artifact.provenance === "imported-subtitle" &&
			artifact.language.basis !== "subtitle-file-not-declared"
		) {
			context.addIssue({
				code: "custom",
				path: ["language", "basis"],
				message: "Imported subtitles must not claim language verification.",
			});
		}

		let previousStart = -Infinity;
		for (const [index, segment] of artifact.segments.entries()) {
			const expectedId = transcriptSegmentId({ index });
			if (segment.index !== index || segment.id !== expectedId) {
				context.addIssue({
					code: "custom",
					path: ["segments", index],
					message: "Transcript segments must use canonical indexes and ids.",
				});
			}
			if (segment.text !== segment.text.trim()) {
				context.addIssue({
					code: "custom",
					path: ["segments", index, "text"],
					message: "Transcript segment text must be trimmed.",
				});
			}
			if (segment.startSeconds < previousStart) {
				context.addIssue({
					code: "custom",
					path: ["segments", index, "startSeconds"],
					message: "Transcript segments must be ordered by start time.",
				});
			}
			previousStart = segment.startSeconds;
		}
		if (artifact.fullText !== artifact.fullText.trim()) {
			context.addIssue({
				code: "custom",
				path: ["fullText"],
				message: "Full transcript text must be trimmed.",
			});
		}
	});

const historyGuaranteesSchema = z
	.object({
		appendOnly: z.literal(true),
		indexedDbPreferred: z.literal(true),
		memoryFallback: z.literal(true),
		projectScoped: z.literal(true),
		originalMediaStored: z.literal(false),
		importedFileStored: z.literal(false),
		apiKeysStored: z.literal(false),
	})
	.strict();

const transcriptHistorySchema = z
	.object({
		kind: z.literal(TRANSCRIPT_HISTORY_KIND),
		schemaVersion: z.literal(TRANSCRIPT_HISTORY_SCHEMA_VERSION),
		projectId: canonicalIdentifierSchema,
		revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
		artifacts: z.array(transcriptArtifactSchema).min(1),
		contentFingerprint: fingerprintSchema,
		guarantees: historyGuaranteesSchema,
	})
	.strict();

const LIMITATIONS: TranscriptArtifactLimitations = Object.freeze({
	timestampGranularity: "segment",
	wordTimestamps: false,
	speakerDiarization: false,
	personIdentification: false,
	emotionInference: false,
	languageVerified: false,
	accuracyGuaranteed: false,
	statement: TRANSCRIPT_LIMITATION_STATEMENT,
});

const DATA_POLICY: TranscriptArtifactDataPolicy = Object.freeze({
	transcriptOnly: true,
	originalMediaStored: false,
	importedFileStored: false,
	apiKeysStored: false,
});

const HISTORY_GUARANTEES: TimelineTranscriptHistory["guarantees"] =
	Object.freeze({
		appendOnly: true,
		indexedDbPreferred: true,
		memoryFallback: true,
		projectScoped: true,
		originalMediaStored: false,
		importedFileStored: false,
		apiKeysStored: false,
	});

function deepFreeze<T>(value: T): T {
	if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
		return value;
	}
	for (const key of Reflect.ownKeys(value)) {
		deepFreeze(Reflect.get(value, key));
	}
	return Object.freeze(value);
}

function cloneValue<T>(value: T): T {
	return structuredClone(value);
}

function normalizeIdentifier({
	value,
	label,
}: {
	value: string;
	label: string;
}): string {
	if (typeof value !== "string") {
		throw new TranscriptArtifactValidationError(`${label} must be a string.`);
	}
	const normalized = value.normalize("NFKC").trim();
	if (!canonicalIdentifierSchema.safeParse(normalized).success) {
		throw new TranscriptArtifactValidationError(`${label} is invalid.`);
	}
	return normalized;
}

function normalizeTimestamp({ value }: { value: string }): string {
	if (!canonicalTimestampSchema.safeParse(value).success) {
		throw new TranscriptArtifactValidationError(
			"Transcript creation time must be a canonical ISO-8601 timestamp.",
		);
	}
	return value;
}

function transcriptSegmentId({ index }: { index: number }): string {
	return `segment_${String(index + 1).padStart(6, "0")}`;
}

function artifactIdentityPayload({
	artifact,
}: {
	artifact: Omit<
		TimelineTranscriptArtifact,
		"artifactId" | "contentFingerprint"
	>;
}): unknown {
	return artifact;
}

function expectedArtifactId({
	artifact,
}: {
	artifact: Omit<
		TimelineTranscriptArtifact,
		"artifactId" | "contentFingerprint"
	>;
}): string {
	const seed = fingerprintJson(artifactIdentityPayload({ artifact }));
	return `transcript_${seed.slice("sha256:".length, "sha256:".length + 24)}_r${artifact.revision}`;
}

function expectedArtifactFingerprint({
	artifact,
}: {
	artifact: Omit<TimelineTranscriptArtifact, "contentFingerprint">;
}): Sha256Fingerprint {
	return fingerprintJson(artifact);
}

function expectedHistoryFingerprint({
	history,
}: {
	history: Omit<TimelineTranscriptHistory, "contentFingerprint">;
}): Sha256Fingerprint {
	return fingerprintJson(history);
}

export function parseTimelineTranscriptArtifact({
	value,
}: {
	value: unknown;
}): TimelineTranscriptArtifact | null {
	const parsed = transcriptArtifactSchema.safeParse(value);
	if (!parsed.success) return null;

	const candidate = parsed.data as TimelineTranscriptArtifact;
	const { artifactId, contentFingerprint, ...identity } = candidate;
	if (
		artifactId !==
		expectedArtifactId({
			artifact: identity,
		})
	) {
		return null;
	}
	const { contentFingerprint: omitted, ...fingerprintPayload } = candidate;
	void omitted;
	if (
		contentFingerprint !==
		expectedArtifactFingerprint({
			artifact: fingerprintPayload,
		})
	) {
		return null;
	}
	return deepFreeze(cloneValue(candidate));
}

export function createTimelineTranscriptArtifact({
	draft,
	revision,
	createdAt,
	previousArtifactFingerprint,
}: {
	draft: TimelineTranscriptArtifactDraft;
	revision: number;
	createdAt: string;
	previousArtifactFingerprint: Sha256Fingerprint | null;
}): TimelineTranscriptArtifact {
	if (!Number.isSafeInteger(revision) || revision < 1) {
		throw new TranscriptArtifactValidationError(
			"Transcript revision must be a positive safe integer.",
		);
	}
	const normalizedSegments = draft.segments.map((segment, index) => ({
		id: transcriptSegmentId({ index }),
		index,
		text: segment.text.trim(),
		startSeconds: segment.startSeconds,
		endSeconds: segment.endSeconds,
	}));
	const identity: Omit<
		TimelineTranscriptArtifact,
		"artifactId" | "contentFingerprint"
	> = {
		kind: TRANSCRIPT_ARTIFACT_KIND,
		schemaVersion: TRANSCRIPT_ARTIFACT_SCHEMA_VERSION,
		projectId: normalizeIdentifier({
			value: draft.projectId,
			label: "Project id",
		}),
		sceneId: normalizeIdentifier({ value: draft.sceneId, label: "Scene id" }),
		timelineId: normalizeIdentifier({
			value: draft.timelineId,
			label: "Timeline id",
		}),
		captionTrackId: normalizeIdentifier({
			value: draft.captionTrackId,
			label: "Caption track id",
		}),
		revision,
		createdAt: normalizeTimestamp({ value: createdAt }),
		language: cloneValue(draft.language),
		provenance: draft.provenance,
		sourceMetadata: cloneValue(draft.sourceMetadata),
		fullText: draft.fullText.trim(),
		segments: normalizedSegments,
		previousArtifactFingerprint,
		limitations: LIMITATIONS,
		dataPolicy: DATA_POLICY,
	};
	const artifactId = expectedArtifactId({ artifact: identity });
	const withoutFingerprint: Omit<
		TimelineTranscriptArtifact,
		"contentFingerprint"
	> = {
		...identity,
		artifactId,
	};
	const candidate: TimelineTranscriptArtifact = {
		...withoutFingerprint,
		contentFingerprint: expectedArtifactFingerprint({
			artifact: withoutFingerprint,
		}),
	};
	const artifact = parseTimelineTranscriptArtifact({ value: candidate });
	if (artifact === null) {
		throw new TranscriptArtifactValidationError(
			"Transcript artifact failed strict validation.",
		);
	}
	return artifact;
}

export function parseTimelineTranscriptHistory({
	value,
	expectedProjectId,
}: {
	value: unknown;
	expectedProjectId?: string;
}): TimelineTranscriptHistory | null {
	const parsed = transcriptHistorySchema.safeParse(value);
	if (!parsed.success) return null;

	const normalizedExpectedProjectId =
		expectedProjectId === undefined
			? null
			: normalizeIdentifier({
					value: expectedProjectId,
					label: "Expected project id",
				});
	if (
		normalizedExpectedProjectId !== null &&
		parsed.data.projectId !== normalizedExpectedProjectId
	) {
		return null;
	}
	if (
		parsed.data.revision !== parsed.data.artifacts.length ||
		parsed.data.artifacts.length < 1
	) {
		return null;
	}

	const artifacts: TimelineTranscriptArtifact[] = [];
	const artifactIds = new Set<string>();
	const scopeHeads = new Map<string, TimelineTranscriptArtifact>();
	for (const valueArtifact of parsed.data.artifacts) {
		const artifact = parseTimelineTranscriptArtifact({
			value: valueArtifact,
		});
		if (
			artifact === null ||
			artifact.projectId !== parsed.data.projectId ||
			artifactIds.has(artifact.artifactId)
		) {
			return null;
		}
		const scopeKey = `${artifact.sceneId}\u0000${artifact.timelineId}`;
		const previous = scopeHeads.get(scopeKey);
		if (
			artifact.revision !== (previous?.revision ?? 0) + 1 ||
			artifact.previousArtifactFingerprint !==
				(previous?.contentFingerprint ?? null)
		) {
			return null;
		}
		artifactIds.add(artifact.artifactId);
		scopeHeads.set(scopeKey, artifact);
		artifacts.push(artifact);
	}

	const historyWithoutFingerprint: Omit<
		TimelineTranscriptHistory,
		"contentFingerprint"
	> = {
		kind: TRANSCRIPT_HISTORY_KIND,
		schemaVersion: TRANSCRIPT_HISTORY_SCHEMA_VERSION,
		projectId: parsed.data.projectId,
		revision: parsed.data.revision,
		artifacts,
		guarantees: HISTORY_GUARANTEES,
	};
	if (
		parsed.data.contentFingerprint !==
		expectedHistoryFingerprint({ history: historyWithoutFingerprint })
	) {
		return null;
	}
	return deepFreeze({
		...historyWithoutFingerprint,
		contentFingerprint: parsed.data.contentFingerprint,
	});
}

function createTimelineTranscriptHistory({
	projectId,
	revision,
	artifacts,
}: {
	projectId: string;
	revision: number;
	artifacts: readonly TimelineTranscriptArtifact[];
}): TimelineTranscriptHistory {
	const withoutFingerprint: Omit<
		TimelineTranscriptHistory,
		"contentFingerprint"
	> = {
		kind: TRANSCRIPT_HISTORY_KIND,
		schemaVersion: TRANSCRIPT_HISTORY_SCHEMA_VERSION,
		projectId,
		revision,
		artifacts,
		guarantees: HISTORY_GUARANTEES,
	};
	const candidate: TimelineTranscriptHistory = {
		...withoutFingerprint,
		contentFingerprint: expectedHistoryFingerprint({
			history: withoutFingerprint,
		}),
	};
	const history = parseTimelineTranscriptHistory({
		value: candidate,
		expectedProjectId: projectId,
	});
	if (history === null) {
		throw new TranscriptArtifactValidationError(
			"Transcript history failed strict validation.",
		);
	}
	return history;
}

function storedHistoryRevision({
	value,
	projectId,
}: {
	value: unknown | null;
	projectId: string;
}): number {
	if (value === null) return 0;
	const history = parseTimelineTranscriptHistory({
		value,
		expectedProjectId: projectId,
	});
	if (history === null) {
		throw new TranscriptArtifactCorruptionError(
			"Stored transcript history is malformed or failed integrity checks.",
		);
	}
	return history.revision;
}

function assertAppendOnlyTransition({
	previousValue,
	nextValue,
	projectId,
	expectedRevision,
}: {
	previousValue: unknown | null;
	nextValue: TimelineTranscriptHistory;
	projectId: string;
	expectedRevision: number;
}): void {
	const previous =
		previousValue === null
			? null
			: parseTimelineTranscriptHistory({
					value: previousValue,
					expectedProjectId: projectId,
				});
	if (previousValue !== null && previous === null) {
		throw new TranscriptArtifactCorruptionError(
			"Stored transcript history is malformed or failed integrity checks.",
		);
	}
	const next = parseTimelineTranscriptHistory({
		value: nextValue,
		expectedProjectId: projectId,
	});
	if (next === null) {
		throw new TranscriptArtifactValidationError(
			"Transcript history update failed validation.",
		);
	}
	if ((previous?.revision ?? 0) !== expectedRevision) {
		throw new TranscriptArtifactConflictError(
			"Transcript history changed before this revision was saved.",
		);
	}
	if (
		next.revision !== expectedRevision + 1 ||
		next.artifacts.length !== (previous?.artifacts.length ?? 0) + 1
	) {
		throw new TranscriptArtifactConflictError(
			"Transcript history revisions must be contiguous and append exactly once.",
		);
	}
	for (const [index, artifact] of (previous?.artifacts ?? []).entries()) {
		if (stableJson(artifact) !== stableJson(next.artifacts[index])) {
			throw new TranscriptArtifactConflictError(
				"Previously saved transcript artifacts are immutable.",
			);
		}
	}
}

export class MemoryTranscriptArtifactStorage implements TranscriptArtifactStorageAdapter {
	private readonly values = new Map<string, unknown>();

	async readProject({
		projectId,
	}: {
		projectId: string;
	}): Promise<unknown | null> {
		const normalizedProjectId = normalizeIdentifier({
			value: projectId,
			label: "Project id",
		});
		const value = this.values.get(normalizedProjectId);
		return value === undefined ? null : cloneValue(value);
	}

	async writeProject({
		projectId,
		value,
		expectedRevision,
	}: {
		projectId: string;
		value: TimelineTranscriptHistory;
		expectedRevision: number;
	}): Promise<void> {
		const normalizedProjectId = normalizeIdentifier({
			value: projectId,
			label: "Project id",
		});
		const previousValue = this.values.get(normalizedProjectId) ?? null;
		assertAppendOnlyTransition({
			previousValue,
			nextValue: value,
			projectId: normalizedProjectId,
			expectedRevision,
		});
		this.values.set(normalizedProjectId, cloneValue(value));
	}
}

export class IndexedDBTranscriptArtifactStorage implements TranscriptArtifactStorageAdapter {
	private readonly fallback: TranscriptArtifactStorageAdapter;

	constructor(
		private readonly options: {
			readonly databaseName?: string;
			readonly storeName?: string;
			readonly indexedDBFactory?: IDBFactory | null;
			readonly fallback?: TranscriptArtifactStorageAdapter;
		} = {},
	) {
		this.fallback = options.fallback ?? new MemoryTranscriptArtifactStorage();
	}

	private factory(): IDBFactory | null {
		if (this.options.indexedDBFactory !== undefined) {
			return this.options.indexedDBFactory;
		}
		return typeof indexedDB === "undefined" ? null : indexedDB;
	}

	private storeName(): string {
		return this.options.storeName ?? "project-transcript-artifacts";
	}

	private async open(): Promise<IDBDatabase | null> {
		const factory = this.factory();
		if (factory === null) return null;
		return new Promise((resolve, reject) => {
			const request = factory.open(
				this.options.databaseName ?? "visioncut-transcript-artifacts",
				1,
			);
			request.onerror = () => reject(request.error);
			request.onblocked = () =>
				reject(
					new TranscriptArtifactStorageError(
						"Transcript evidence storage is blocked.",
					),
				);
			request.onupgradeneeded = () => {
				if (!request.result.objectStoreNames.contains(this.storeName())) {
					request.result.createObjectStore(this.storeName());
				}
			};
			request.onsuccess = () => resolve(request.result);
		});
	}

	async readProject({
		projectId,
	}: {
		projectId: string;
	}): Promise<unknown | null> {
		const normalizedProjectId = normalizeIdentifier({
			value: projectId,
			label: "Project id",
		});
		const database = await this.open().catch(() => null);
		if (database === null) {
			return this.fallback.readProject({ projectId: normalizedProjectId });
		}
		try {
			return await new Promise<unknown | null>((resolve, reject) => {
				const request = database
					.transaction(this.storeName(), "readonly")
					.objectStore(this.storeName())
					.get(normalizedProjectId);
				request.onerror = () =>
					reject(
						request.error ??
							new TranscriptArtifactStorageError(
								"Transcript evidence could not be read.",
							),
					);
				request.onsuccess = () =>
					resolve(request.result === undefined ? null : request.result);
			});
		} finally {
			database.close();
		}
	}

	async writeProject({
		projectId,
		value,
		expectedRevision,
	}: {
		projectId: string;
		value: TimelineTranscriptHistory;
		expectedRevision: number;
	}): Promise<void> {
		const normalizedProjectId = normalizeIdentifier({
			value: projectId,
			label: "Project id",
		});
		const database = await this.open().catch(() => null);
		if (database === null) {
			await this.fallback.writeProject({
				projectId: normalizedProjectId,
				value,
				expectedRevision,
			});
			return;
		}
		try {
			await new Promise<void>((resolve, reject) => {
				const transaction = database.transaction(this.storeName(), "readwrite");
				const store = transaction.objectStore(this.storeName());
				const readRequest = store.get(normalizedProjectId);
				let settled = false;
				const fail = (error: unknown) => {
					if (settled) return;
					settled = true;
					reject(error);
				};
				readRequest.onerror = () =>
					fail(
						readRequest.error ??
							new TranscriptArtifactStorageError(
								"Transcript evidence could not be read before append.",
							),
					);
				readRequest.onsuccess = () => {
					try {
						assertAppendOnlyTransition({
							previousValue: readRequest.result ?? null,
							nextValue: value,
							projectId: normalizedProjectId,
							expectedRevision,
						});
						store.put(value, normalizedProjectId);
					} catch (error) {
						fail(error);
						transaction.abort();
					}
				};
				transaction.onerror = () =>
					fail(
						transaction.error ??
							new TranscriptArtifactStorageError(
								"Transcript evidence transaction failed.",
							),
					);
				transaction.onabort = () =>
					fail(
						transaction.error ??
							new TranscriptArtifactStorageError(
								"Transcript evidence transaction was aborted.",
							),
					);
				transaction.oncomplete = () => {
					if (settled) return;
					settled = true;
					resolve();
				};
			});
		} finally {
			database.close();
		}
	}
}

const defaultTranscriptArtifactStorage =
	new IndexedDBTranscriptArtifactStorage();

async function readTimelineTranscriptHistory({
	projectId,
	storage,
}: {
	projectId: string;
	storage: TranscriptArtifactStorageAdapter;
}): Promise<TimelineTranscriptHistory | null> {
	const normalizedProjectId = normalizeIdentifier({
		value: projectId,
		label: "Project id",
	});
	const value = await storage.readProject({ projectId: normalizedProjectId });
	if (value === null) return null;
	const history = parseTimelineTranscriptHistory({
		value,
		expectedProjectId: normalizedProjectId,
	});
	if (history === null) {
		throw new TranscriptArtifactCorruptionError(
			"Stored transcript history is malformed, belongs to another project, or failed integrity checks.",
		);
	}
	return history;
}

export async function appendTimelineTranscriptArtifact({
	draft,
	createdAt = new Date().toISOString(),
	storage = defaultTranscriptArtifactStorage,
}: {
	draft: TimelineTranscriptArtifactDraft;
	createdAt?: string;
	storage?: TranscriptArtifactStorageAdapter;
}): Promise<TimelineTranscriptArtifact> {
	const projectId = normalizeIdentifier({
		value: draft.projectId,
		label: "Project id",
	});
	const sceneId = normalizeIdentifier({
		value: draft.sceneId,
		label: "Scene id",
	});
	const timelineId = normalizeIdentifier({
		value: draft.timelineId,
		label: "Timeline id",
	});
	const current = await readTimelineTranscriptHistory({ projectId, storage });
	const scopeArtifacts =
		current?.artifacts.filter(
			(artifact) =>
				artifact.sceneId === sceneId && artifact.timelineId === timelineId,
		) ?? [];
	const previous = scopeArtifacts.at(-1) ?? null;
	const artifact = createTimelineTranscriptArtifact({
		draft,
		revision: (previous?.revision ?? 0) + 1,
		createdAt,
		previousArtifactFingerprint: previous?.contentFingerprint ?? null,
	});
	const expectedRevision = current?.revision ?? 0;
	const nextHistory = createTimelineTranscriptHistory({
		projectId,
		revision: expectedRevision + 1,
		artifacts: [...(current?.artifacts ?? []), artifact],
	});
	await storage.writeProject({
		projectId,
		value: nextHistory,
		expectedRevision,
	});
	return artifact;
}

export async function listTimelineTranscriptArtifacts({
	projectId,
	sceneId,
	timelineId,
	storage = defaultTranscriptArtifactStorage,
}: {
	projectId: string;
	sceneId?: string;
	timelineId?: string;
	storage?: TranscriptArtifactStorageAdapter;
}): Promise<readonly TimelineTranscriptArtifact[]> {
	const history = await readTimelineTranscriptHistory({ projectId, storage });
	const normalizedSceneId =
		sceneId === undefined
			? undefined
			: normalizeIdentifier({ value: sceneId, label: "Scene id" });
	const normalizedTimelineId =
		timelineId === undefined
			? undefined
			: normalizeIdentifier({ value: timelineId, label: "Timeline id" });
	const artifacts =
		history?.artifacts.filter(
			(artifact) =>
				(normalizedSceneId === undefined ||
					artifact.sceneId === normalizedSceneId) &&
				(normalizedTimelineId === undefined ||
					artifact.timelineId === normalizedTimelineId),
		) ?? [];
	return deepFreeze([...artifacts]);
}

export async function loadLatestTimelineTranscriptArtifact({
	projectId,
	sceneId,
	timelineId,
	storage = defaultTranscriptArtifactStorage,
}: {
	projectId: string;
	sceneId: string;
	timelineId: string;
	storage?: TranscriptArtifactStorageAdapter;
}): Promise<TimelineTranscriptArtifact | null> {
	const artifacts = await listTimelineTranscriptArtifacts({
		projectId,
		sceneId,
		timelineId,
		storage,
	});
	return artifacts.at(-1) ?? null;
}

export async function loadTimelineTranscriptArtifactRevision({
	projectId,
	sceneId,
	timelineId,
	revision,
	storage = defaultTranscriptArtifactStorage,
}: {
	projectId: string;
	sceneId: string;
	timelineId: string;
	revision: number;
	storage?: TranscriptArtifactStorageAdapter;
}): Promise<TimelineTranscriptArtifact | null> {
	if (!Number.isSafeInteger(revision) || revision < 1) {
		throw new TranscriptArtifactValidationError(
			"Transcript revision must be a positive safe integer.",
		);
	}
	const artifacts = await listTimelineTranscriptArtifacts({
		projectId,
		sceneId,
		timelineId,
		storage,
	});
	return artifacts.find((artifact) => artifact.revision === revision) ?? null;
}

export function getStoredTranscriptHistoryRevision({
	value,
	projectId,
}: {
	value: unknown | null;
	projectId: string;
}): number {
	const normalizedProjectId = normalizeIdentifier({
		value: projectId,
		label: "Project id",
	});
	return storedHistoryRevision({
		value,
		projectId: normalizedProjectId,
	});
}
