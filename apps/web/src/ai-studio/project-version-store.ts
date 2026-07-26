import { z } from "zod";

export const PROJECT_VERSION_SCHEMA_VERSION = 1 as const;
export const PROJECT_VERSION_KIND = "visioncut.project-version" as const;
export const PROJECT_VERSION_LEDGER_KIND =
	"visioncut.project-version-ledger" as const;
export const PROJECT_VERSION_RESTORE_KIND =
	"visioncut.project-restore-payload" as const;
export const PROJECT_VERSION_RESTORE_SCHEMA_VERSION = 1 as const;
export const PROJECT_VERSION_RESTORE_INTEGRITY_ALGORITHM =
	"visioncut-stable-hash64-v1" as const;
export const PROJECT_VERSION_RESTORE_ASSET_KINDS = [
	"video",
	"audio",
	"image",
	"font",
	"sticker",
	"other",
] as const;
export const PROJECT_VERSION_SOURCES = [
	"user",
	"intent-spec",
	"edit-plan",
	"story-graph",
	"automation-run",
	"timeline",
	"import",
] as const;
export const PROJECT_VERSION_AUTOMATION_STATUSES = [
	"queued",
	"running",
	"review",
	"failed",
	"done",
	"cancelled",
] as const;

export type ProjectVersionSource = (typeof PROJECT_VERSION_SOURCES)[number];
export type ProjectVersionAutomationStatus =
	(typeof PROJECT_VERSION_AUTOMATION_STATUSES)[number];
export type ProjectVersionRestoreAssetKind =
	(typeof PROJECT_VERSION_RESTORE_ASSET_KINDS)[number];

interface ProjectVersionLocalGuaranteeBase {
	readonly localOnly: true;
	readonly accountRequired: false;
	readonly network: false;
	readonly paidService: false;
	readonly binaryPayloadsStored: false;
}

export interface ProjectVersionReferenceOnlyGuarantees extends ProjectVersionLocalGuaranteeBase {
	readonly referencesOnly: true;
}

export interface ProjectVersionRestorableGuarantees extends ProjectVersionLocalGuaranteeBase {
	readonly referencesOnly: false;
	readonly restorablePayloadsStored: true;
}

export type ProjectVersionLocalGuarantees =
	| ProjectVersionReferenceOnlyGuarantees
	| ProjectVersionRestorableGuarantees;

export type ProjectVersionRestoreJsonPrimitive =
	| string
	| number
	| boolean
	| null;
export type ProjectVersionRestoreJsonValue =
	| ProjectVersionRestoreJsonPrimitive
	| readonly ProjectVersionRestoreJsonValue[]
	| {
			readonly [key: string]: ProjectVersionRestoreJsonValue;
	  };
export type ProjectVersionRestoreJsonObject = Readonly<{
	[key: string]: ProjectVersionRestoreJsonValue;
}>;

export interface ProjectVersionRestoreAssetReference {
	readonly assetId: string;
	readonly kind: ProjectVersionRestoreAssetKind;
	readonly fingerprint: string;
	readonly name?: string;
	readonly mimeType?: string;
	readonly sizeBytes?: number;
}

export interface ProjectVersionRestoreIntegrity {
	readonly algorithm: typeof PROJECT_VERSION_RESTORE_INTEGRITY_ALGORITHM;
	readonly digest: string;
}

export interface ProjectVersionRestorePayload {
	readonly kind: typeof PROJECT_VERSION_RESTORE_KIND;
	readonly schemaVersion: typeof PROJECT_VERSION_RESTORE_SCHEMA_VERSION;
	readonly projectId: string;
	readonly snapshotId: string;
	readonly capturedAt: string;
	readonly projectState: ProjectVersionRestoreJsonObject;
	readonly timelineState: ProjectVersionRestoreJsonObject;
	readonly creativeState?: ProjectVersionRestoreJsonObject;
	readonly assets: readonly ProjectVersionRestoreAssetReference[];
	readonly integrity: ProjectVersionRestoreIntegrity;
}

export interface CreateProjectVersionRestorePayloadInput {
	readonly projectId: string;
	readonly snapshotId: string;
	readonly capturedAt: string;
	readonly projectState: ProjectVersionRestoreJsonObject;
	readonly timelineState: ProjectVersionRestoreJsonObject;
	readonly creativeState?: ProjectVersionRestoreJsonObject;
	readonly assets?: readonly ProjectVersionRestoreAssetReference[];
}

export interface IntentSpecVersionReference {
	readonly kind: "visioncut.intent-spec";
	readonly projectId: string;
	readonly revision: number;
	readonly updatedAt: string;
}

export interface EditPlanVersionReference {
	readonly kind: "visioncut.edit-plan";
	readonly projectId: string;
	readonly planId: string;
	readonly revision: number;
	readonly versionId: string;
}

export interface StoryGraphVersionReference {
	readonly kind: "visioncut.story-graph";
	readonly projectId: string;
	readonly graphId: string;
	readonly version: number;
}

export interface AutomationRunVersionReference {
	readonly kind: "visioncut.automation-run";
	readonly projectId: string;
	readonly runId: string;
	readonly status: ProjectVersionAutomationStatus;
	readonly updatedAt: string;
}

export interface TimelineSnapshotVersionReference {
	readonly kind: "visioncut.timeline-snapshot";
	readonly projectId: string;
	readonly snapshotId: string;
	readonly version: number;
}

export interface ProjectVersionReferences {
	readonly intentSpec?: IntentSpecVersionReference;
	readonly editPlan?: EditPlanVersionReference;
	readonly storyGraph?: StoryGraphVersionReference;
	readonly automationRun?: AutomationRunVersionReference;
	readonly timelineSnapshot?: TimelineSnapshotVersionReference;
}

export interface ProjectVersionReferencePatch {
	readonly intentSpec?: IntentSpecVersionReference | null;
	readonly editPlan?: EditPlanVersionReference | null;
	readonly storyGraph?: StoryGraphVersionReference | null;
	readonly automationRun?: AutomationRunVersionReference | null;
	readonly timelineSnapshot?: TimelineSnapshotVersionReference | null;
}

export interface ProjectVersion {
	readonly kind: typeof PROJECT_VERSION_KIND;
	readonly schemaVersion: typeof PROJECT_VERSION_SCHEMA_VERSION;
	readonly projectId: string;
	readonly version: number;
	readonly versionId: string;
	readonly parentVersionId: string | null;
	readonly label: string;
	readonly createdAt: string;
	readonly source: ProjectVersionSource;
	readonly refs: ProjectVersionReferences;
	readonly restorePayload?: ProjectVersionRestorePayload;
	readonly guarantees: ProjectVersionLocalGuarantees;
}

export interface ProjectVersionLedger {
	readonly kind: typeof PROJECT_VERSION_LEDGER_KIND;
	readonly schemaVersion: typeof PROJECT_VERSION_SCHEMA_VERSION;
	readonly projectId: string;
	readonly versions: readonly ProjectVersion[];
	readonly guarantees: ProjectVersionLocalGuarantees;
}

export interface ProjectVersionStorageAdapter {
	read({ projectId }: { projectId: string }): Promise<unknown | null>;
	append({
		projectId,
		version,
		expectedParentVersionId,
	}: {
		projectId: string;
		version: ProjectVersion;
		expectedParentVersionId: string | null;
	}): Promise<void>;
	deleteProject({ projectId }: { projectId: string }): Promise<void>;
}

export interface ProjectVersionStorageEntry {
	readonly projectId: string;
	readonly value: unknown;
}

export class ProjectVersionValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ProjectVersionValidationError";
	}
}

export class ProjectVersionConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ProjectVersionConflictError";
	}
}

const canonicalTimestampSchema = z.string().refine(isCanonicalTimestamp, {
	message: "Timestamp must be a canonical ISO-8601 value.",
});
const identifierSchema = z
	.string()
	.min(1)
	.max(200)
	.regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u)
	.refine((value) => !/^(?:blob|data|file):/iu.test(value), {
		message: "Reference identifiers cannot be runtime or binary URLs.",
	});
const projectIdSchema = identifierSchema;
const positiveVersionSchema = z.number().int().positive().max(1_000_000_000);
const referenceOnlyGuaranteesSchema = z
	.object({
		localOnly: z.literal(true),
		accountRequired: z.literal(false),
		network: z.literal(false),
		paidService: z.literal(false),
		referencesOnly: z.literal(true),
		binaryPayloadsStored: z.literal(false),
	})
	.strict();
const restorableGuaranteesSchema = z
	.object({
		localOnly: z.literal(true),
		accountRequired: z.literal(false),
		network: z.literal(false),
		paidService: z.literal(false),
		referencesOnly: z.literal(false),
		restorablePayloadsStored: z.literal(true),
		binaryPayloadsStored: z.literal(false),
	})
	.strict();
const localGuaranteesSchema = z.union([
	referenceOnlyGuaranteesSchema,
	restorableGuaranteesSchema,
]);
const restoreJsonValueSchema: z.ZodType<ProjectVersionRestoreJsonValue> =
	z.lazy(() =>
		z.union([
			z.string().max(100_000),
			z.number().finite(),
			z.boolean(),
			z.null(),
			z.array(restoreJsonValueSchema).max(20_000),
			z.record(z.string().min(1).max(200), restoreJsonValueSchema),
		]),
	);
const restoreJsonObjectSchema: z.ZodType<ProjectVersionRestoreJsonObject> = z
	.record(z.string().min(1).max(200), restoreJsonValueSchema)
	.refine((value) => Object.keys(value).length > 0, {
		message: "Restore state objects cannot be empty.",
	});
const restoreAssetReferenceSchema = z
	.object({
		assetId: identifierSchema,
		kind: z.enum(PROJECT_VERSION_RESTORE_ASSET_KINDS),
		fingerprint: identifierSchema,
		name: z.string().min(1).max(500).optional(),
		mimeType: z
			.string()
			.min(1)
			.max(200)
			.regex(/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/u)
			.optional(),
		sizeBytes: z
			.number()
			.int()
			.nonnegative()
			.max(Number.MAX_SAFE_INTEGER)
			.optional(),
	})
	.strict();
const restoreIntegritySchema = z
	.object({
		algorithm: z.literal(PROJECT_VERSION_RESTORE_INTEGRITY_ALGORITHM),
		digest: z.string().regex(/^[a-f0-9]{16}$/u),
	})
	.strict();
const restorePayloadSchema = z
	.object({
		kind: z.literal(PROJECT_VERSION_RESTORE_KIND),
		schemaVersion: z.literal(PROJECT_VERSION_RESTORE_SCHEMA_VERSION),
		projectId: projectIdSchema,
		snapshotId: identifierSchema,
		capturedAt: canonicalTimestampSchema,
		projectState: restoreJsonObjectSchema,
		timelineState: restoreJsonObjectSchema,
		creativeState: restoreJsonObjectSchema.optional(),
		assets: z.array(restoreAssetReferenceSchema).max(10_000),
		integrity: restoreIntegritySchema,
	})
	.strict();
const intentSpecReferenceSchema = z
	.object({
		kind: z.literal("visioncut.intent-spec"),
		projectId: projectIdSchema,
		revision: positiveVersionSchema,
		updatedAt: canonicalTimestampSchema,
	})
	.strict();
const editPlanReferenceSchema = z
	.object({
		kind: z.literal("visioncut.edit-plan"),
		projectId: projectIdSchema,
		planId: identifierSchema,
		revision: positiveVersionSchema,
		versionId: identifierSchema,
	})
	.strict();
const storyGraphReferenceSchema = z
	.object({
		kind: z.literal("visioncut.story-graph"),
		projectId: projectIdSchema,
		graphId: identifierSchema,
		version: positiveVersionSchema,
	})
	.strict();
const automationRunReferenceSchema = z
	.object({
		kind: z.literal("visioncut.automation-run"),
		projectId: projectIdSchema,
		runId: identifierSchema,
		status: z.enum(PROJECT_VERSION_AUTOMATION_STATUSES),
		updatedAt: canonicalTimestampSchema,
	})
	.strict();
const timelineSnapshotReferenceSchema = z
	.object({
		kind: z.literal("visioncut.timeline-snapshot"),
		projectId: projectIdSchema,
		snapshotId: identifierSchema,
		version: positiveVersionSchema,
	})
	.strict();
const projectVersionReferencesSchema = z
	.object({
		intentSpec: intentSpecReferenceSchema.optional(),
		editPlan: editPlanReferenceSchema.optional(),
		storyGraph: storyGraphReferenceSchema.optional(),
		automationRun: automationRunReferenceSchema.optional(),
		timelineSnapshot: timelineSnapshotReferenceSchema.optional(),
	})
	.strict()
	.refine((refs) => Object.keys(refs).length > 0, {
		message: "A project version must reference at least one project artifact.",
	});
const projectVersionSchema = z
	.object({
		kind: z.literal(PROJECT_VERSION_KIND),
		schemaVersion: z.literal(PROJECT_VERSION_SCHEMA_VERSION),
		projectId: projectIdSchema,
		version: positiveVersionSchema,
		versionId: identifierSchema,
		parentVersionId: identifierSchema.nullable(),
		label: z.string().min(1).max(240),
		createdAt: canonicalTimestampSchema,
		source: z.enum(PROJECT_VERSION_SOURCES),
		refs: projectVersionReferencesSchema,
		restorePayload: restorePayloadSchema.optional(),
		guarantees: localGuaranteesSchema,
	})
	.strict();
const projectVersionLedgerSchema = z
	.object({
		kind: z.literal(PROJECT_VERSION_LEDGER_KIND),
		schemaVersion: z.literal(PROJECT_VERSION_SCHEMA_VERSION),
		projectId: projectIdSchema,
		versions: z.array(projectVersionSchema).min(1).max(10_000),
		guarantees: localGuaranteesSchema,
	})
	.strict();

const LOCAL_REFERENCE_ONLY_GUARANTEES: ProjectVersionReferenceOnlyGuarantees =
	Object.freeze({
		localOnly: true,
		accountRequired: false,
		network: false,
		paidService: false,
		referencesOnly: true,
		binaryPayloadsStored: false,
	});
const LOCAL_RESTORABLE_GUARANTEES: ProjectVersionRestorableGuarantees =
	Object.freeze({
		localOnly: true,
		accountRequired: false,
		network: false,
		paidService: false,
		referencesOnly: false,
		restorablePayloadsStored: true,
		binaryPayloadsStored: false,
	});
const EMPTY_PROJECT_VERSIONS: readonly ProjectVersion[] = Object.freeze([]);

function isCanonicalTimestamp(value: string): boolean {
	const milliseconds = Date.parse(value);
	return (
		Number.isFinite(milliseconds) &&
		new Date(milliseconds).toISOString() === value
	);
}

function normalizeTimestamp({
	value,
	label,
}: {
	value: string;
	label: string;
}): string {
	const milliseconds = Date.parse(value);
	if (!Number.isFinite(milliseconds)) {
		throw new ProjectVersionValidationError(
			`${label} must be a valid timestamp.`,
		);
	}
	return new Date(milliseconds).toISOString();
}

function normalizeText({
	value,
	label,
	maxLength,
}: {
	value: string;
	label: string;
	maxLength: number;
}): string {
	const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
	if (!normalized) {
		throw new ProjectVersionValidationError(`${label} cannot be empty.`);
	}
	if (Array.from(normalized).length > maxLength) {
		throw new ProjectVersionValidationError(
			`${label} cannot exceed ${maxLength} characters.`,
		);
	}
	return normalized;
}

function normalizeIdentifier({
	value,
	label,
}: {
	value: string;
	label: string;
}): string {
	const normalized = normalizeText({ value, label, maxLength: 200 });
	if (
		!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(normalized) ||
		/^(?:blob|data|file):/iu.test(normalized)
	) {
		throw new ProjectVersionValidationError(
			`${label} must be a stable identifier, not a URL or runtime object reference.`,
		);
	}
	return normalized;
}

function normalizeProjectId({ projectId }: { projectId: string }): string {
	return normalizeIdentifier({ value: projectId, label: "Project id" });
}

function normalizePositiveVersion({
	value,
	label,
}: {
	value: number;
	label: string;
}): number {
	if (!Number.isSafeInteger(value) || value < 1 || value > 1_000_000_000) {
		throw new ProjectVersionValidationError(
			`${label} must be a positive safe integer.`,
		);
	}
	return value;
}

const RESTORE_MAX_DEPTH = 48;
const RESTORE_MAX_NODES = 100_000;
const RESTORE_MAX_CANONICAL_CHARACTERS = 2_000_000;
const RESTORE_FORBIDDEN_KEYS = new Set([
	"arraybuffer",
	"base64",
	"binary",
	"blob",
	"buffer",
	"bytes",
	"dataurl",
	"file",
	"objecturl",
]);
const RESTORE_RUNTIME_PROTOCOL = /^(?:blob|data|file):/iu;
const RESTORE_EXTERNAL_LOCATION_KEY = /(?:href|src|uri|url)$/iu;
const RESTORE_ANY_PROTOCOL = /^[A-Za-z][A-Za-z0-9+.-]*:/u;

function isRestoreJsonObject(
	value: unknown,
): value is Readonly<Record<string, unknown>> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isTypedRestoreJsonObject(
	value: ProjectVersionRestoreJsonValue,
): value is ProjectVersionRestoreJsonObject {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalizeRestoreJson({ value }: { value: unknown }): string {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "boolean"
	) {
		return JSON.stringify(value);
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw new ProjectVersionValidationError(
				"Canonical restore JSON cannot contain non-finite numbers.",
			);
		}
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value
			.map((item) => canonicalizeRestoreJson({ value: item }))
			.join(",")}]`;
	}
	if (!isRestoreJsonObject(value)) {
		throw new ProjectVersionValidationError(
			"Canonical restore JSON contains an unsupported value.",
		);
	}
	return `{${Object.keys(value)
		.sort()
		.map(
			(key) =>
				`${JSON.stringify(key)}:${canonicalizeRestoreJson({
					value: value[key],
				})}`,
		)
		.join(",")}}`;
}

function assertRestoreJsonSafety({
	value,
	label,
}: {
	value: ProjectVersionRestoreJsonValue;
	label: string;
}): void {
	let nodes = 0;
	const visit = ({
		current,
		path,
		depth,
		parentKey,
	}: {
		current: ProjectVersionRestoreJsonValue;
		path: string;
		depth: number;
		parentKey?: string;
	}) => {
		nodes += 1;
		if (nodes > RESTORE_MAX_NODES) {
			throw new ProjectVersionValidationError(
				`${label} exceeds the maximum JSON node count.`,
			);
		}
		if (depth > RESTORE_MAX_DEPTH) {
			throw new ProjectVersionValidationError(
				`${label} exceeds the maximum JSON depth.`,
			);
		}
		if (typeof current === "string") {
			if (RESTORE_RUNTIME_PROTOCOL.test(current.trim())) {
				throw new ProjectVersionValidationError(
					`${path} cannot contain a runtime or binary URL.`,
				);
			}
			if (
				parentKey !== undefined &&
				RESTORE_EXTERNAL_LOCATION_KEY.test(parentKey) &&
				RESTORE_ANY_PROTOCOL.test(current.trim())
			) {
				throw new ProjectVersionValidationError(
					`${path} must use a stable local asset id instead of a URL.`,
				);
			}
			return;
		}
		if (current === null || typeof current !== "object") return;
		if (Array.isArray(current)) {
			for (const [index, item] of current.entries()) {
				visit({
					current: item,
					path: `${path}[${index}]`,
					depth: depth + 1,
				});
			}
			return;
		}
		for (const [key, item] of Object.entries(current)) {
			const normalizedKey = key.toLowerCase();
			if (
				normalizedKey === "__proto__" ||
				normalizedKey === "prototype" ||
				normalizedKey === "constructor" ||
				RESTORE_FORBIDDEN_KEYS.has(normalizedKey)
			) {
				throw new ProjectVersionValidationError(
					`${path}.${key} is not allowed in a local restore payload.`,
				);
			}
			visit({
				current: item,
				path: `${path}.${key}`,
				depth: depth + 1,
				parentKey: key,
			});
		}
	};

	visit({ current: value, path: label, depth: 0 });
}

function freezeRestoreJsonValue(
	value: ProjectVersionRestoreJsonValue,
): ProjectVersionRestoreJsonValue {
	if (value === null || typeof value !== "object") return value;
	if (Array.isArray(value)) {
		return Object.freeze(value.map((item) => freezeRestoreJsonValue(item)));
	}
	if (isTypedRestoreJsonObject(value)) return freezeRestoreJsonObject(value);
	throw new ProjectVersionValidationError(
		"Restore JSON contains an unsupported object value.",
	);
}

function freezeRestoreJsonObject(
	value: ProjectVersionRestoreJsonObject,
): ProjectVersionRestoreJsonObject {
	const frozen: Record<string, ProjectVersionRestoreJsonValue> = {};
	for (const [key, item] of Object.entries(value)) {
		frozen[key] = freezeRestoreJsonValue(item);
	}
	return Object.freeze(frozen);
}

function normalizeRestoreJsonObject({
	value,
	label,
}: {
	value: ProjectVersionRestoreJsonObject;
	label: string;
}): ProjectVersionRestoreJsonObject {
	const parsed = restoreJsonObjectSchema.safeParse(value);
	if (!parsed.success) {
		throw new ProjectVersionValidationError(
			parsed.error.issues[0]?.message ?? `${label} is invalid.`,
		);
	}
	assertRestoreJsonSafety({ value: parsed.data, label });
	return freezeRestoreJsonObject(parsed.data);
}

function normalizeRestoreAssets({
	assets,
}: {
	assets: readonly ProjectVersionRestoreAssetReference[];
}): readonly ProjectVersionRestoreAssetReference[] {
	const parsed = z
		.array(restoreAssetReferenceSchema)
		.max(10_000)
		.safeParse(assets);
	if (!parsed.success) {
		throw new ProjectVersionValidationError(
			parsed.error.issues[0]?.message ?? "Restore asset manifest is invalid.",
		);
	}
	const normalized = parsed.data
		.map((asset) =>
			Object.freeze({
				assetId: normalizeIdentifier({
					value: asset.assetId,
					label: "Restore asset id",
				}),
				kind: asset.kind,
				fingerprint: normalizeIdentifier({
					value: asset.fingerprint,
					label: "Restore asset fingerprint",
				}),
				...(asset.name === undefined
					? {}
					: {
							name: normalizeText({
								value: asset.name,
								label: "Restore asset name",
								maxLength: 500,
							}),
						}),
				...(asset.mimeType === undefined
					? {}
					: { mimeType: asset.mimeType.toLowerCase() }),
				...(asset.sizeBytes === undefined
					? {}
					: { sizeBytes: asset.sizeBytes }),
			}),
		)
		.sort((left, right) => left.assetId.localeCompare(right.assetId));
	const ids = new Set<string>();
	for (const asset of normalized) {
		if (ids.has(asset.assetId)) {
			throw new ProjectVersionValidationError(
				"Restore asset ids must be unique.",
			);
		}
		ids.add(asset.assetId);
	}
	return Object.freeze(normalized);
}

function collectRestoreAssetIds({
	value,
	label,
}: {
	value: ProjectVersionRestoreJsonValue;
	label: string;
}): ReadonlySet<string> {
	const assetIds = new Set<string>();
	const visit = ({
		current,
		path,
	}: {
		current: ProjectVersionRestoreJsonValue;
		path: string;
	}) => {
		if (current === null || typeof current !== "object") return;
		if (Array.isArray(current)) {
			for (const [index, item] of current.entries()) {
				visit({ current: item, path: `${path}[${index}]` });
			}
			return;
		}
		for (const [key, item] of Object.entries(current)) {
			if (key === "mediaId" || key === "assetId") {
				if (typeof item !== "string") {
					throw new ProjectVersionValidationError(
						`${path}.${key} must be a stable local asset id.`,
					);
				}
				const normalized = normalizeIdentifier({
					value: item,
					label: `${label} asset id`,
				});
				if (normalized !== item) {
					throw new ProjectVersionValidationError(
						`${path}.${key} is not normalized.`,
					);
				}
				assetIds.add(normalized);
			}
			visit({ current: item, path: `${path}.${key}` });
		}
	};
	visit({ current: value, path: label });
	return assetIds;
}

function assertRestoreStateBindings({
	projectId,
	projectState,
	timelineState,
	assets,
}: {
	projectId: string;
	projectState: ProjectVersionRestoreJsonObject;
	timelineState: ProjectVersionRestoreJsonObject;
	assets: readonly ProjectVersionRestoreAssetReference[];
}): void {
	const stateProjectId = projectState.projectId ?? projectState.id;
	if (
		typeof stateProjectId !== "string" ||
		normalizeProjectId({ projectId: stateProjectId }) !== projectId
	) {
		throw new ProjectVersionValidationError(
			"Restore project state must identify the same project.",
		);
	}
	const sceneId = timelineState.sceneId;
	if (
		typeof sceneId !== "string" ||
		normalizeIdentifier({
			value: sceneId,
			label: "Restore timeline scene id",
		}) !== sceneId
	) {
		throw new ProjectVersionValidationError(
			"Restore timeline state must include a normalized scene id.",
		);
	}
	const manifestIds = new Set(assets.map(({ assetId }) => assetId));
	const referencedAssetIds = new Set([
		...collectRestoreAssetIds({
			value: projectState,
			label: "Restore project state",
		}),
		...collectRestoreAssetIds({
			value: timelineState,
			label: "Restore timeline state",
		}),
	]);
	for (const assetId of referencedAssetIds) {
		if (!manifestIds.has(assetId)) {
			throw new ProjectVersionValidationError(
				`Restore asset manifest is missing referenced asset ${assetId}.`,
			);
		}
	}
}

function restorePayloadDigest({
	payload,
}: {
	payload: Omit<ProjectVersionRestorePayload, "integrity">;
}): string {
	return hashIdentity({
		value: canonicalizeRestoreJson({
			value: {
				kind: payload.kind,
				schemaVersion: payload.schemaVersion,
				projectId: payload.projectId,
				snapshotId: payload.snapshotId,
				capturedAt: payload.capturedAt,
				projectState: payload.projectState,
				timelineState: payload.timelineState,
				...(payload.creativeState === undefined
					? {}
					: { creativeState: payload.creativeState }),
				assets: payload.assets.map((asset) => ({ ...asset })),
			},
		}),
	});
}

function freezeRestorePayload({
	payload,
}: {
	payload: ProjectVersionRestorePayload;
}): ProjectVersionRestorePayload {
	return Object.freeze({
		...payload,
		projectState: freezeRestoreJsonObject(payload.projectState),
		timelineState: freezeRestoreJsonObject(payload.timelineState),
		...(payload.creativeState === undefined
			? {}
			: {
					creativeState: freezeRestoreJsonObject(payload.creativeState),
				}),
		assets: Object.freeze(
			payload.assets.map((asset) => Object.freeze({ ...asset })),
		),
		integrity: Object.freeze({ ...payload.integrity }),
	});
}

export function assertProjectVersionRestorePayloadInvariants({
	payload,
}: {
	payload: ProjectVersionRestorePayload;
}): void {
	const parsed = restorePayloadSchema.safeParse(payload);
	if (!parsed.success) {
		throw new ProjectVersionValidationError(
			parsed.error.issues[0]?.message ?? "Restore payload is invalid.",
		);
	}
	const candidate = parsed.data;
	if (
		normalizeProjectId({ projectId: candidate.projectId }) !==
			candidate.projectId ||
		normalizeIdentifier({
			value: candidate.snapshotId,
			label: "Restore snapshot id",
		}) !== candidate.snapshotId
	) {
		throw new ProjectVersionValidationError(
			"Restore payload identifiers are not normalized.",
		);
	}
	assertRestoreJsonSafety({
		value: candidate.projectState,
		label: "Restore project state",
	});
	assertRestoreJsonSafety({
		value: candidate.timelineState,
		label: "Restore timeline state",
	});
	if (candidate.creativeState !== undefined) {
		assertRestoreJsonSafety({
			value: candidate.creativeState,
			label: "Restore creative state",
		});
		const creativeProjectId = candidate.creativeState.projectId;
		if (
			typeof creativeProjectId !== "string" ||
			normalizeProjectId({ projectId: creativeProjectId }) !==
				candidate.projectId
		) {
			throw new ProjectVersionValidationError(
				"Restore creative state must identify the same project.",
			);
		}
	}
	const canonicalSize = canonicalizeRestoreJson({
		value: {
			projectState: candidate.projectState,
			timelineState: candidate.timelineState,
			...(candidate.creativeState === undefined
				? {}
				: { creativeState: candidate.creativeState }),
			assets: candidate.assets,
		},
	}).length;
	if (canonicalSize > RESTORE_MAX_CANONICAL_CHARACTERS) {
		throw new ProjectVersionValidationError(
			"Restore payload exceeds the local snapshot size limit.",
		);
	}
	const normalizedAssets = normalizeRestoreAssets({ assets: candidate.assets });
	if (
		canonicalizeRestoreJson({
			value: candidate.assets.map((asset) => ({ ...asset })),
		}) !==
		canonicalizeRestoreJson({
			value: normalizedAssets.map((asset) => ({ ...asset })),
		})
	) {
		throw new ProjectVersionValidationError(
			"Restore asset manifest is not normalized and sorted.",
		);
	}
	assertRestoreStateBindings({
		projectId: candidate.projectId,
		projectState: candidate.projectState,
		timelineState: candidate.timelineState,
		assets: normalizedAssets,
	});
	const expectedDigest = restorePayloadDigest({
		payload: {
			kind: candidate.kind,
			schemaVersion: candidate.schemaVersion,
			projectId: candidate.projectId,
			snapshotId: candidate.snapshotId,
			capturedAt: candidate.capturedAt,
			projectState: candidate.projectState,
			timelineState: candidate.timelineState,
			...(candidate.creativeState === undefined
				? {}
				: { creativeState: candidate.creativeState }),
			assets: candidate.assets,
		},
	});
	if (candidate.integrity.digest !== expectedDigest) {
		throw new ProjectVersionValidationError(
			"Restore payload digest does not match its immutable content.",
		);
	}
}

export function parseProjectVersionRestorePayload({
	value,
}: {
	value: unknown;
}): ProjectVersionRestorePayload | null {
	const parsed = restorePayloadSchema.safeParse(value);
	if (!parsed.success) return null;
	try {
		assertProjectVersionRestorePayloadInvariants({ payload: parsed.data });
		return freezeRestorePayload({ payload: parsed.data });
	} catch {
		return null;
	}
}

export function createProjectVersionRestorePayload({
	projectId,
	snapshotId,
	capturedAt,
	projectState,
	timelineState,
	creativeState,
	assets = [],
}: CreateProjectVersionRestorePayloadInput): ProjectVersionRestorePayload {
	const normalizedProjectId = normalizeProjectId({ projectId });
	const normalizedProjectState = normalizeRestoreJsonObject({
		value: projectState,
		label: "Restore project state",
	});
	const normalizedTimelineState = normalizeRestoreJsonObject({
		value: timelineState,
		label: "Restore timeline state",
	});
	const normalizedCreativeState =
		creativeState === undefined
			? undefined
			: normalizeRestoreJsonObject({
					value: creativeState,
					label: "Restore creative state",
				});
	const normalizedAssets = normalizeRestoreAssets({ assets });
	const content = {
		kind: PROJECT_VERSION_RESTORE_KIND,
		schemaVersion: PROJECT_VERSION_RESTORE_SCHEMA_VERSION,
		projectId: normalizedProjectId,
		snapshotId: normalizeIdentifier({
			value: snapshotId,
			label: "Restore snapshot id",
		}),
		capturedAt: normalizeTimestamp({
			value: capturedAt,
			label: "Restore capture time",
		}),
		projectState: normalizedProjectState,
		timelineState: normalizedTimelineState,
		...(normalizedCreativeState === undefined
			? {}
			: { creativeState: normalizedCreativeState }),
		assets: normalizedAssets,
	} satisfies Omit<ProjectVersionRestorePayload, "integrity">;
	const payload: ProjectVersionRestorePayload = {
		...content,
		integrity: Object.freeze({
			algorithm: PROJECT_VERSION_RESTORE_INTEGRITY_ALGORITHM,
			digest: restorePayloadDigest({ payload: content }),
		}),
	};
	assertProjectVersionRestorePayloadInvariants({ payload });
	return freezeRestorePayload({ payload });
}

function normalizeProjectVersionRestorePayload({
	projectId,
	payload,
}: {
	projectId: string;
	payload: ProjectVersionRestorePayload;
}): ProjectVersionRestorePayload {
	const parsed = parseProjectVersionRestorePayload({ value: payload });
	if (parsed === null) {
		throw new ProjectVersionValidationError(
			"Project version restore payload is invalid.",
		);
	}
	if (parsed.projectId !== projectId) {
		throw new ProjectVersionValidationError(
			"Project version restore payload belongs to a different project.",
		);
	}
	return parsed;
}

function assertReferenceProject({
	projectId,
	referenceProjectId,
	label,
}: {
	projectId: string;
	referenceProjectId: string;
	label: string;
}): string {
	const normalized = normalizeProjectId({ projectId: referenceProjectId });
	if (normalized !== projectId) {
		throw new ProjectVersionValidationError(
			`${label} belongs to a different project.`,
		);
	}
	return normalized;
}

function normalizeIntentSpecReference({
	projectId,
	reference,
}: {
	projectId: string;
	reference: IntentSpecVersionReference;
}): IntentSpecVersionReference {
	return Object.freeze({
		kind: "visioncut.intent-spec",
		projectId: assertReferenceProject({
			projectId,
			referenceProjectId: reference.projectId,
			label: "IntentSpec reference",
		}),
		revision: normalizePositiveVersion({
			value: reference.revision,
			label: "IntentSpec revision",
		}),
		updatedAt: normalizeTimestamp({
			value: reference.updatedAt,
			label: "IntentSpec update time",
		}),
	});
}

function normalizeEditPlanReference({
	projectId,
	reference,
}: {
	projectId: string;
	reference: EditPlanVersionReference;
}): EditPlanVersionReference {
	return Object.freeze({
		kind: "visioncut.edit-plan",
		projectId: assertReferenceProject({
			projectId,
			referenceProjectId: reference.projectId,
			label: "Edit plan reference",
		}),
		planId: normalizeIdentifier({
			value: reference.planId,
			label: "Edit plan id",
		}),
		revision: normalizePositiveVersion({
			value: reference.revision,
			label: "Edit plan revision",
		}),
		versionId: normalizeIdentifier({
			value: reference.versionId,
			label: "Edit plan version id",
		}),
	});
}

function normalizeStoryGraphReference({
	projectId,
	reference,
}: {
	projectId: string;
	reference: StoryGraphVersionReference;
}): StoryGraphVersionReference {
	return Object.freeze({
		kind: "visioncut.story-graph",
		projectId: assertReferenceProject({
			projectId,
			referenceProjectId: reference.projectId,
			label: "Story Graph reference",
		}),
		graphId: normalizeIdentifier({
			value: reference.graphId,
			label: "Story Graph id",
		}),
		version: normalizePositiveVersion({
			value: reference.version,
			label: "Story Graph version",
		}),
	});
}

function normalizeAutomationRunReference({
	projectId,
	reference,
}: {
	projectId: string;
	reference: AutomationRunVersionReference;
}): AutomationRunVersionReference {
	if (!PROJECT_VERSION_AUTOMATION_STATUSES.includes(reference.status)) {
		throw new ProjectVersionValidationError(
			"Automation run status is not supported.",
		);
	}
	return Object.freeze({
		kind: "visioncut.automation-run",
		projectId: assertReferenceProject({
			projectId,
			referenceProjectId: reference.projectId,
			label: "Automation run reference",
		}),
		runId: normalizeIdentifier({
			value: reference.runId,
			label: "Automation run id",
		}),
		status: reference.status,
		updatedAt: normalizeTimestamp({
			value: reference.updatedAt,
			label: "Automation run update time",
		}),
	});
}

function normalizeTimelineSnapshotReference({
	projectId,
	reference,
}: {
	projectId: string;
	reference: TimelineSnapshotVersionReference;
}): TimelineSnapshotVersionReference {
	return Object.freeze({
		kind: "visioncut.timeline-snapshot",
		projectId: assertReferenceProject({
			projectId,
			referenceProjectId: reference.projectId,
			label: "Timeline snapshot reference",
		}),
		snapshotId: normalizeIdentifier({
			value: reference.snapshotId,
			label: "Timeline snapshot id",
		}),
		version: normalizePositiveVersion({
			value: reference.version,
			label: "Timeline snapshot version",
		}),
	});
}

function freezeReferences({
	refs,
}: {
	refs: ProjectVersionReferences;
}): ProjectVersionReferences {
	return Object.freeze({
		...(refs.intentSpec === undefined
			? {}
			: { intentSpec: Object.freeze({ ...refs.intentSpec }) }),
		...(refs.editPlan === undefined
			? {}
			: { editPlan: Object.freeze({ ...refs.editPlan }) }),
		...(refs.storyGraph === undefined
			? {}
			: { storyGraph: Object.freeze({ ...refs.storyGraph }) }),
		...(refs.automationRun === undefined
			? {}
			: { automationRun: Object.freeze({ ...refs.automationRun }) }),
		...(refs.timelineSnapshot === undefined
			? {}
			: {
					timelineSnapshot: Object.freeze({ ...refs.timelineSnapshot }),
				}),
	});
}

function mergeReferences({
	projectId,
	parent,
	patch,
}: {
	projectId: string;
	parent: ProjectVersion | null;
	patch: ProjectVersionReferencePatch;
}): ProjectVersionReferences {
	let intentSpec = parent?.refs.intentSpec;
	let editPlan = parent?.refs.editPlan;
	let storyGraph = parent?.refs.storyGraph;
	let automationRun = parent?.refs.automationRun;
	let timelineSnapshot = parent?.refs.timelineSnapshot;

	if (patch.intentSpec !== undefined) {
		intentSpec =
			patch.intentSpec === null
				? undefined
				: normalizeIntentSpecReference({
						projectId,
						reference: patch.intentSpec,
					});
	}
	if (patch.editPlan !== undefined) {
		editPlan =
			patch.editPlan === null
				? undefined
				: normalizeEditPlanReference({
						projectId,
						reference: patch.editPlan,
					});
	}
	if (patch.storyGraph !== undefined) {
		storyGraph =
			patch.storyGraph === null
				? undefined
				: normalizeStoryGraphReference({
						projectId,
						reference: patch.storyGraph,
					});
	}
	if (patch.automationRun !== undefined) {
		automationRun =
			patch.automationRun === null
				? undefined
				: normalizeAutomationRunReference({
						projectId,
						reference: patch.automationRun,
					});
	}
	if (patch.timelineSnapshot !== undefined) {
		timelineSnapshot =
			patch.timelineSnapshot === null
				? undefined
				: normalizeTimelineSnapshotReference({
						projectId,
						reference: patch.timelineSnapshot,
					});
	}

	const refs = freezeReferences({
		refs: {
			...(intentSpec === undefined ? {} : { intentSpec }),
			...(editPlan === undefined ? {} : { editPlan }),
			...(storyGraph === undefined ? {} : { storyGraph }),
			...(automationRun === undefined ? {} : { automationRun }),
			...(timelineSnapshot === undefined ? {} : { timelineSnapshot }),
		},
	});
	if (Object.keys(refs).length === 0) {
		throw new ProjectVersionValidationError(
			"A project version must reference at least one project artifact.",
		);
	}
	return refs;
}

function hashIdentity({ value }: { value: string }): string {
	let first = 0x811c9dc5;
	let second = 0x9e3779b9;
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		first = Math.imul(first ^ code, 0x01000193);
		second = Math.imul(second ^ (code + index), 0x85ebca6b);
	}
	return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0)
		.toString(16)
		.padStart(8, "0")}`;
}

function projectVersionIdentity({
	projectId,
	version,
	parentVersionId,
	label,
	createdAt,
	source,
	refs,
	restorePayload,
}: {
	projectId: string;
	version: number;
	parentVersionId: string | null;
	label: string;
	createdAt: string;
	source: ProjectVersionSource;
	refs: ProjectVersionReferences;
	restorePayload?: ProjectVersionRestorePayload;
}): string {
	const identity = {
		projectId,
		version,
		parentVersionId,
		label,
		createdAt,
		source,
		refs,
		...(restorePayload === undefined ? {} : { restorePayload }),
	};
	// Preserve the exact v1 reference-only identity algorithm for existing records.
	const canonical =
		restorePayload === undefined
			? JSON.stringify(identity)
			: canonicalizeRestoreJson({ value: identity });
	return `project_version_${hashIdentity({ value: canonical })}`;
}

function guaranteesForRestorePayload({
	restorePayload,
}: {
	restorePayload?: ProjectVersionRestorePayload;
}): ProjectVersionLocalGuarantees {
	return restorePayload === undefined
		? LOCAL_REFERENCE_ONLY_GUARANTEES
		: LOCAL_RESTORABLE_GUARANTEES;
}

function freezeProjectVersion({
	version,
}: {
	version: ProjectVersion;
}): ProjectVersion {
	return Object.freeze({
		...version,
		refs: freezeReferences({ refs: version.refs }),
		...(version.restorePayload === undefined
			? {}
			: {
					restorePayload: freezeRestorePayload({
						payload: version.restorePayload,
					}),
				}),
		guarantees: guaranteesForRestorePayload({
			restorePayload: version.restorePayload,
		}),
	});
}

function freezeProjectVersionLedger({
	ledger,
}: {
	ledger: ProjectVersionLedger;
}): ProjectVersionLedger {
	return Object.freeze({
		...ledger,
		versions: Object.freeze(
			ledger.versions.map((version) => freezeProjectVersion({ version })),
		),
		guarantees: ledger.versions.some(
			(version) => version.restorePayload !== undefined,
		)
			? LOCAL_RESTORABLE_GUARANTEES
			: LOCAL_REFERENCE_ONLY_GUARANTEES,
	});
}

function referenceProjectsMatch({
	projectId,
	refs,
}: {
	projectId: string;
	refs: ProjectVersionReferences;
}): boolean {
	return (
		(refs.intentSpec === undefined ||
			refs.intentSpec.projectId === projectId) &&
		(refs.editPlan === undefined || refs.editPlan.projectId === projectId) &&
		(refs.storyGraph === undefined ||
			refs.storyGraph.projectId === projectId) &&
		(refs.automationRun === undefined ||
			refs.automationRun.projectId === projectId) &&
		(refs.timelineSnapshot === undefined ||
			refs.timelineSnapshot.projectId === projectId)
	);
}

export function assertProjectVersionInvariants({
	version,
}: {
	version: ProjectVersion;
}): void {
	const parsed = projectVersionSchema.safeParse(version);
	if (!parsed.success) {
		throw new ProjectVersionValidationError(
			parsed.error.issues[0]?.message ?? "Project version is invalid.",
		);
	}
	const candidate = parsed.data;
	if (
		normalizeProjectId({ projectId: candidate.projectId }) !==
		candidate.projectId
	) {
		throw new ProjectVersionValidationError("Project id is not normalized.");
	}
	if (
		normalizeText({
			value: candidate.label,
			label: "Version label",
			maxLength: 240,
		}) !== candidate.label
	) {
		throw new ProjectVersionValidationError("Version label is not normalized.");
	}
	if (
		(candidate.version === 1 && candidate.parentVersionId !== null) ||
		(candidate.version > 1 && candidate.parentVersionId === null)
	) {
		throw new ProjectVersionValidationError(
			"Only the first project version may omit its parent.",
		);
	}
	if (
		!referenceProjectsMatch({
			projectId: candidate.projectId,
			refs: candidate.refs,
		})
	) {
		throw new ProjectVersionValidationError(
			"Every project artifact reference must match the version project.",
		);
	}
	if (candidate.restorePayload !== undefined) {
		assertProjectVersionRestorePayloadInvariants({
			payload: candidate.restorePayload,
		});
		if (candidate.restorePayload.projectId !== candidate.projectId) {
			throw new ProjectVersionValidationError(
				"Project version restore payload belongs to a different project.",
			);
		}
	}
	const expectedGuarantees = guaranteesForRestorePayload({
		restorePayload: candidate.restorePayload,
	});
	if (
		canonicalizeRestoreJson({
			value: candidate.guarantees,
		}) !==
		canonicalizeRestoreJson({
			value: expectedGuarantees,
		})
	) {
		throw new ProjectVersionValidationError(
			"Project version guarantees do not match its restore payload.",
		);
	}
	const expectedVersionId = projectVersionIdentity({
		projectId: candidate.projectId,
		version: candidate.version,
		parentVersionId: candidate.parentVersionId,
		label: candidate.label,
		createdAt: candidate.createdAt,
		source: candidate.source,
		refs: candidate.refs,
		restorePayload: candidate.restorePayload,
	});
	if (candidate.versionId !== expectedVersionId) {
		throw new ProjectVersionValidationError(
			"Project version identity does not match its immutable content.",
		);
	}
}

export function parseProjectVersion({
	value,
}: {
	value: unknown;
}): ProjectVersion | null {
	const parsed = projectVersionSchema.safeParse(value);
	if (!parsed.success) return null;
	try {
		assertProjectVersionInvariants({ version: parsed.data });
		return freezeProjectVersion({ version: parsed.data });
	} catch {
		return null;
	}
}

export function createProjectVersion({
	projectId,
	label,
	createdAt,
	source,
	refs,
	restorePayload,
	parent = null,
}: {
	projectId: string;
	label: string;
	createdAt: string;
	source: ProjectVersionSource;
	refs: ProjectVersionReferencePatch;
	restorePayload?: ProjectVersionRestorePayload;
	parent?: ProjectVersion | null;
}): ProjectVersion {
	const normalizedProjectId = normalizeProjectId({ projectId });
	const normalizedLabel = normalizeText({
		value: label,
		label: "Version label",
		maxLength: 240,
	});
	const normalizedCreatedAt = normalizeTimestamp({
		value: createdAt,
		label: "Version creation time",
	});
	if (!PROJECT_VERSION_SOURCES.includes(source)) {
		throw new ProjectVersionValidationError(
			"Project version source is invalid.",
		);
	}

	let validatedParent: ProjectVersion | null = null;
	if (parent !== null) {
		validatedParent = parseProjectVersion({ value: parent });
		if (validatedParent === null) {
			throw new ProjectVersionValidationError(
				"Cannot create a version from an invalid parent.",
			);
		}
		if (validatedParent.projectId !== normalizedProjectId) {
			throw new ProjectVersionValidationError(
				"Parent version belongs to a different project.",
			);
		}
		if (
			Date.parse(normalizedCreatedAt) < Date.parse(validatedParent.createdAt)
		) {
			throw new ProjectVersionValidationError(
				"Version creation time cannot be earlier than its parent.",
			);
		}
	}

	const versionNumber = (validatedParent?.version ?? 0) + 1;
	const parentVersionId = validatedParent?.versionId ?? null;
	const normalizedRefs = mergeReferences({
		projectId: normalizedProjectId,
		parent: validatedParent,
		patch: refs,
	});
	const normalizedRestorePayload =
		restorePayload === undefined
			? undefined
			: normalizeProjectVersionRestorePayload({
					projectId: normalizedProjectId,
					payload: restorePayload,
				});
	const versionId = projectVersionIdentity({
		projectId: normalizedProjectId,
		version: versionNumber,
		parentVersionId,
		label: normalizedLabel,
		createdAt: normalizedCreatedAt,
		source,
		refs: normalizedRefs,
		restorePayload: normalizedRestorePayload,
	});
	const version: ProjectVersion = {
		kind: PROJECT_VERSION_KIND,
		schemaVersion: PROJECT_VERSION_SCHEMA_VERSION,
		projectId: normalizedProjectId,
		version: versionNumber,
		versionId,
		parentVersionId,
		label: normalizedLabel,
		createdAt: normalizedCreatedAt,
		source,
		refs: normalizedRefs,
		...(normalizedRestorePayload === undefined
			? {}
			: { restorePayload: normalizedRestorePayload }),
		guarantees: guaranteesForRestorePayload({
			restorePayload: normalizedRestorePayload,
		}),
	};
	assertProjectVersionInvariants({ version });
	return freezeProjectVersion({ version });
}

export function assertProjectVersionLedgerInvariants({
	ledger,
}: {
	ledger: ProjectVersionLedger;
}): void {
	const parsed = projectVersionLedgerSchema.safeParse(ledger);
	if (!parsed.success) {
		throw new ProjectVersionValidationError(
			parsed.error.issues[0]?.message ?? "Project version ledger is invalid.",
		);
	}
	const candidate = parsed.data;
	if (
		normalizeProjectId({ projectId: candidate.projectId }) !==
		candidate.projectId
	) {
		throw new ProjectVersionValidationError(
			"Ledger project id is not normalized.",
		);
	}

	const versionIds = new Set<string>();
	let previous: ProjectVersion | null = null;
	for (const [index, version] of candidate.versions.entries()) {
		assertProjectVersionInvariants({ version });
		if (
			version.projectId !== candidate.projectId ||
			version.version !== index + 1 ||
			version.parentVersionId !== (previous?.versionId ?? null)
		) {
			throw new ProjectVersionValidationError(
				"Project version history must be a contiguous parent chain.",
			);
		}
		if (
			previous !== null &&
			Date.parse(version.createdAt) < Date.parse(previous.createdAt)
		) {
			throw new ProjectVersionValidationError(
				"Project version timestamps must be non-decreasing.",
			);
		}
		if (versionIds.has(version.versionId)) {
			throw new ProjectVersionValidationError(
				"Project version identities must be unique.",
			);
		}
		versionIds.add(version.versionId);
		previous = version;
	}
	const expectedGuarantees = candidate.versions.some(
		(version) => version.restorePayload !== undefined,
	)
		? LOCAL_RESTORABLE_GUARANTEES
		: LOCAL_REFERENCE_ONLY_GUARANTEES;
	if (
		canonicalizeRestoreJson({
			value: candidate.guarantees,
		}) !==
		canonicalizeRestoreJson({
			value: expectedGuarantees,
		})
	) {
		throw new ProjectVersionValidationError(
			"Project version ledger guarantees do not match its stored payloads.",
		);
	}
}

export function parseProjectVersionLedger({
	value,
}: {
	value: unknown;
}): ProjectVersionLedger | null {
	const parsed = projectVersionLedgerSchema.safeParse(value);
	if (!parsed.success) return null;
	try {
		assertProjectVersionLedgerInvariants({ ledger: parsed.data });
		return freezeProjectVersionLedger({ ledger: parsed.data });
	} catch {
		return null;
	}
}

function buildProjectVersionLedger({
	projectId,
	versions,
}: {
	projectId: string;
	versions: readonly ProjectVersion[];
}): ProjectVersionLedger {
	const ledger: ProjectVersionLedger = {
		kind: PROJECT_VERSION_LEDGER_KIND,
		schemaVersion: PROJECT_VERSION_SCHEMA_VERSION,
		projectId,
		versions,
		guarantees: versions.some((version) => version.restorePayload !== undefined)
			? LOCAL_RESTORABLE_GUARANTEES
			: LOCAL_REFERENCE_ONLY_GUARANTEES,
	};
	assertProjectVersionLedgerInvariants({ ledger });
	return freezeProjectVersionLedger({ ledger });
}

function parseStoredLedger({
	value,
	projectId,
}: {
	value: unknown | null;
	projectId: string;
}): ProjectVersionLedger | null {
	if (value === null) return null;
	const ledger = parseProjectVersionLedger({ value });
	if (ledger === null) {
		throw new ProjectVersionValidationError(
			"Stored project version history is malformed.",
		);
	}
	if (ledger.projectId !== projectId) {
		throw new ProjectVersionValidationError(
			"Stored project version history belongs to another project.",
		);
	}
	return ledger;
}

function appendToLedger({
	ledger,
	projectId,
	version,
	expectedParentVersionId,
}: {
	ledger: ProjectVersionLedger | null;
	projectId: string;
	version: ProjectVersion;
	expectedParentVersionId: string | null;
}): ProjectVersionLedger {
	const validatedVersion = parseProjectVersion({ value: version });
	if (validatedVersion === null || validatedVersion.projectId !== projectId) {
		throw new ProjectVersionValidationError(
			"Cannot append an invalid or cross-project version.",
		);
	}
	const current = ledger?.versions.at(-1) ?? null;
	const currentVersionId = current?.versionId ?? null;
	if (currentVersionId !== expectedParentVersionId) {
		throw new ProjectVersionConflictError(
			"Project version history changed before this append completed.",
		);
	}
	if (
		validatedVersion.parentVersionId !== expectedParentVersionId ||
		validatedVersion.version !== (current?.version ?? 0) + 1
	) {
		throw new ProjectVersionConflictError(
			"Appended version does not continue the current project history.",
		);
	}
	return buildProjectVersionLedger({
		projectId,
		versions: [
			...(ledger?.versions ?? EMPTY_PROJECT_VERSIONS),
			validatedVersion,
		],
	});
}

function cloneStorageValue({ value }: { value: unknown }): unknown {
	return structuredClone(value);
}

export class MemoryProjectVersionStorage implements ProjectVersionStorageAdapter {
	private readonly values = new Map<string, unknown>();

	constructor({
		entries = [],
	}: {
		entries?: readonly ProjectVersionStorageEntry[];
	} = {}) {
		for (const entry of entries) {
			this.values.set(
				normalizeProjectId({ projectId: entry.projectId }),
				cloneStorageValue({ value: entry.value }),
			);
		}
	}

	async read({ projectId }: { projectId: string }): Promise<unknown | null> {
		const value = this.values.get(normalizeProjectId({ projectId }));
		return value === undefined ? null : cloneStorageValue({ value });
	}

	async append({
		projectId,
		version,
		expectedParentVersionId,
	}: {
		projectId: string;
		version: ProjectVersion;
		expectedParentVersionId: string | null;
	}): Promise<void> {
		const normalizedProjectId = normalizeProjectId({ projectId });
		const stored = this.values.get(normalizedProjectId);
		const ledger = parseStoredLedger({
			value: stored === undefined ? null : stored,
			projectId: normalizedProjectId,
		});
		const next = appendToLedger({
			ledger,
			projectId: normalizedProjectId,
			version,
			expectedParentVersionId,
		});
		this.values.set(normalizedProjectId, cloneStorageValue({ value: next }));
	}

	async deleteProject({ projectId }: { projectId: string }): Promise<void> {
		this.values.delete(normalizeProjectId({ projectId }));
	}
}

export class IndexedDBProjectVersionStorage implements ProjectVersionStorageAdapter {
	private readonly databaseName: string;
	private readonly storeName: string;
	private readonly databaseVersion: number;
	private readonly indexedDBFactory: IDBFactory | null | undefined;
	private readonly fallback: ProjectVersionStorageAdapter;

	constructor({
		databaseName = "visioncut-project-versions",
		storeName = "project-version-ledgers",
		databaseVersion = 1,
		indexedDBFactory,
		fallback = new MemoryProjectVersionStorage(),
	}: {
		databaseName?: string;
		storeName?: string;
		databaseVersion?: number;
		indexedDBFactory?: IDBFactory | null;
		fallback?: ProjectVersionStorageAdapter;
	} = {}) {
		this.databaseName = databaseName;
		this.storeName = storeName;
		this.databaseVersion = databaseVersion;
		this.indexedDBFactory = indexedDBFactory;
		this.fallback = fallback;
	}

	private resolveFactory(): IDBFactory | null {
		if (this.indexedDBFactory !== undefined) return this.indexedDBFactory;
		return typeof indexedDB === "undefined" ? null : indexedDB;
	}

	private async openDatabase(): Promise<IDBDatabase | null> {
		const factory = this.resolveFactory();
		if (factory === null) return null;
		return new Promise((resolve, reject) => {
			const request = factory.open(this.databaseName, this.databaseVersion);
			request.onerror = () => reject(request.error);
			request.onblocked = () =>
				reject(
					new Error("Project version IndexedDB open request was blocked."),
				);
			request.onupgradeneeded = () => {
				const database = request.result;
				if (!database.objectStoreNames.contains(this.storeName)) {
					database.createObjectStore(this.storeName);
				}
			};
			request.onsuccess = () => resolve(request.result);
		});
	}

	private async readFromDatabase({
		projectId,
	}: {
		projectId: string;
	}): Promise<unknown | null> {
		const database = await this.openDatabase();
		if (database === null) return null;
		try {
			return await new Promise((resolve, reject) => {
				const transaction = database.transaction(this.storeName, "readonly");
				const request = transaction.objectStore(this.storeName).get(projectId);
				request.onerror = () => reject(request.error);
				request.onsuccess = () =>
					resolve(request.result === undefined ? null : request.result);
			});
		} finally {
			database.close();
		}
	}

	private async appendToDatabase({
		projectId,
		version,
		expectedParentVersionId,
	}: {
		projectId: string;
		version: ProjectVersion;
		expectedParentVersionId: string | null;
	}): Promise<boolean> {
		const database = await this.openDatabase();
		if (database === null) return false;
		try {
			await new Promise<void>((resolve, reject) => {
				const transaction = database.transaction(this.storeName, "readwrite");
				const store = transaction.objectStore(this.storeName);
				const request = store.get(projectId);
				let rejected = false;
				const rejectOnce = ({ error }: { error: unknown }) => {
					if (rejected) return;
					rejected = true;
					reject(error);
				};

				transaction.oncomplete = () => resolve();
				transaction.onerror = () => rejectOnce({ error: transaction.error });
				transaction.onabort = () => rejectOnce({ error: transaction.error });
				request.onerror = () => rejectOnce({ error: request.error });
				request.onsuccess = () => {
					try {
						const stored: unknown | null =
							request.result === undefined ? null : request.result;
						const ledger = parseStoredLedger({ value: stored, projectId });
						const next = appendToLedger({
							ledger,
							projectId,
							version,
							expectedParentVersionId,
						});
						store.put(next, projectId);
					} catch (error) {
						rejectOnce({ error });
						transaction.abort();
					}
				};
			});
			return true;
		} finally {
			database.close();
		}
	}

	private async removeFromDatabase({
		projectId,
	}: {
		projectId: string;
	}): Promise<boolean> {
		const database = await this.openDatabase();
		if (database === null) return false;
		try {
			await new Promise<void>((resolve, reject) => {
				const transaction = database.transaction(this.storeName, "readwrite");
				transaction.oncomplete = () => resolve();
				transaction.onerror = () => reject(transaction.error);
				transaction.onabort = () => reject(transaction.error);
				transaction.objectStore(this.storeName).delete(projectId);
			});
			return true;
		} finally {
			database.close();
		}
	}

	private async fallbackContinuesParent({
		projectId,
		expectedParentVersionId,
	}: {
		projectId: string;
		expectedParentVersionId: string | null;
	}): Promise<boolean> {
		const stored = await this.fallback.read({ projectId });
		const ledger = parseStoredLedger({ value: stored, projectId });
		return (
			(ledger?.versions.at(-1)?.versionId ?? null) === expectedParentVersionId
		);
	}

	async read({ projectId }: { projectId: string }): Promise<unknown | null> {
		const normalizedProjectId = normalizeProjectId({ projectId });
		try {
			const value = await this.readFromDatabase({
				projectId: normalizedProjectId,
			});
			if (value !== null) return value;
		} catch {
			// Restricted browser contexts can deny IndexedDB entirely.
		}
		return this.fallback.read({ projectId: normalizedProjectId });
	}

	async append({
		projectId,
		version,
		expectedParentVersionId,
	}: {
		projectId: string;
		version: ProjectVersion;
		expectedParentVersionId: string | null;
	}): Promise<void> {
		const normalizedProjectId = normalizeProjectId({ projectId });
		try {
			const persisted = await this.appendToDatabase({
				projectId: normalizedProjectId,
				version,
				expectedParentVersionId,
			});
			if (persisted) {
				await this.fallback.deleteProject({ projectId: normalizedProjectId });
				return;
			}
		} catch (error) {
			if (error instanceof ProjectVersionValidationError) throw error;
			if (error instanceof ProjectVersionConflictError) {
				const canContinueFallback = await this.fallbackContinuesParent({
					projectId: normalizedProjectId,
					expectedParentVersionId,
				});
				if (!canContinueFallback) throw error;
				await this.fallback.append({
					projectId: normalizedProjectId,
					version,
					expectedParentVersionId,
				});
				return;
			}
			// Operational IndexedDB failures use the local session fallback.
		}
		await this.fallback.append({
			projectId: normalizedProjectId,
			version,
			expectedParentVersionId,
		});
	}

	async deleteProject({ projectId }: { projectId: string }): Promise<void> {
		const normalizedProjectId = normalizeProjectId({ projectId });
		try {
			await this.removeFromDatabase({ projectId: normalizedProjectId });
		} catch {
			// The fallback must still be cleared if IndexedDB is unavailable.
		}
		await this.fallback.deleteProject({ projectId: normalizedProjectId });
	}
}

const defaultProjectVersionStorage = new IndexedDBProjectVersionStorage();

export async function loadProjectVersionLedger({
	projectId,
	storage = defaultProjectVersionStorage,
}: {
	projectId: string;
	storage?: ProjectVersionStorageAdapter;
}): Promise<ProjectVersionLedger | null> {
	const normalizedProjectId = normalizeProjectId({ projectId });
	const stored = await storage.read({ projectId: normalizedProjectId });
	return parseStoredLedger({ value: stored, projectId: normalizedProjectId });
}

export async function listProjectVersions({
	projectId,
	storage = defaultProjectVersionStorage,
}: {
	projectId: string;
	storage?: ProjectVersionStorageAdapter;
}): Promise<readonly ProjectVersion[]> {
	const ledger = await loadProjectVersionLedger({ projectId, storage });
	return ledger?.versions ?? EMPTY_PROJECT_VERSIONS;
}

export async function loadProjectVersion({
	projectId,
	versionId,
	storage = defaultProjectVersionStorage,
}: {
	projectId: string;
	versionId?: string;
	storage?: ProjectVersionStorageAdapter;
}): Promise<ProjectVersion | null> {
	const versions = await listProjectVersions({ projectId, storage });
	if (versionId === undefined) return versions.at(-1) ?? null;
	const normalizedVersionId = normalizeIdentifier({
		value: versionId,
		label: "Project version id",
	});
	return (
		versions.find((version) => version.versionId === normalizedVersionId) ??
		null
	);
}

export async function loadProjectVersionRestorePayload({
	projectId,
	versionId,
	storage = defaultProjectVersionStorage,
}: {
	projectId: string;
	versionId?: string;
	storage?: ProjectVersionStorageAdapter;
}): Promise<ProjectVersionRestorePayload | null> {
	const normalizedProjectId = normalizeProjectId({ projectId });
	const version = await loadProjectVersion({
		projectId: normalizedProjectId,
		versionId,
		storage,
	});
	if (version?.restorePayload === undefined) return null;
	return normalizeProjectVersionRestorePayload({
		projectId: normalizedProjectId,
		payload: version.restorePayload,
	});
}

export async function appendProjectVersion({
	projectId,
	label,
	createdAt,
	source,
	refs,
	restorePayload,
	storage = defaultProjectVersionStorage,
}: {
	projectId: string;
	label: string;
	createdAt: string;
	source: ProjectVersionSource;
	refs: ProjectVersionReferencePatch;
	restorePayload?: ProjectVersionRestorePayload;
	storage?: ProjectVersionStorageAdapter;
}): Promise<ProjectVersion> {
	const normalizedProjectId = normalizeProjectId({ projectId });
	const current = await loadProjectVersion({
		projectId: normalizedProjectId,
		storage,
	});
	const version = createProjectVersion({
		projectId: normalizedProjectId,
		label,
		createdAt,
		source,
		refs,
		restorePayload,
		parent: current,
	});
	await storage.append({
		projectId: normalizedProjectId,
		version,
		expectedParentVersionId: current?.versionId ?? null,
	});
	return version;
}

export async function deleteProjectVersions({
	projectId,
	storage = defaultProjectVersionStorage,
}: {
	projectId: string;
	storage?: ProjectVersionStorageAdapter;
}): Promise<void> {
	await storage.deleteProject({
		projectId: normalizeProjectId({ projectId }),
	});
}

export function serializeProjectVersionLedger({
	ledger,
}: {
	ledger: ProjectVersionLedger;
}): string {
	assertProjectVersionLedgerInvariants({ ledger });
	return JSON.stringify(ledger, null, 2);
}

export async function exportProjectVersions({
	projectId,
	storage = defaultProjectVersionStorage,
}: {
	projectId: string;
	storage?: ProjectVersionStorageAdapter;
}): Promise<string> {
	const ledger = await loadProjectVersionLedger({ projectId, storage });
	if (ledger === null) {
		throw new ProjectVersionValidationError(
			"Cannot export a project without version history.",
		);
	}
	return serializeProjectVersionLedger({ ledger });
}
