import { z } from "zod";

export const INTENT_SPEC_SCHEMA_VERSION = 1 as const;
export const INTENT_SPEC_KIND = "visioncut.intent-spec" as const;

export type IntentSpecSource = "home" | "editor";

export interface IntentSpecTarget {
	readonly platform?: string;
	readonly aspectRatio?: string;
	readonly durationSeconds?: number;
	readonly style?: string;
}

export interface IntentSpecRevision {
	readonly projectId: string;
	readonly revision: number;
	readonly userIntent: string;
	readonly target?: IntentSpecTarget;
	readonly source: IntentSpecSource;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface IntentSpecLocalGuarantees {
	readonly localOnly: true;
	readonly accountRequired: false;
	readonly network: false;
	readonly paidService: false;
}

export interface IntentSpec {
	readonly kind: typeof INTENT_SPEC_KIND;
	readonly schemaVersion: typeof INTENT_SPEC_SCHEMA_VERSION;
	readonly projectId: string;
	readonly revision: number;
	readonly userIntent: string;
	readonly target?: IntentSpecTarget;
	readonly source: IntentSpecSource;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly revisions: readonly IntentSpecRevision[];
	readonly guarantees: IntentSpecLocalGuarantees;
}

export interface IntentSpecTargetInput {
	platform?: string;
	aspectRatio?: string;
	durationSeconds?: number;
	style?: string;
}

export interface IntentSpecTargetPatch {
	platform?: string | null;
	aspectRatio?: string | null;
	durationSeconds?: number | null;
	style?: string | null;
}

export interface IntentSpecChanges {
	userIntent?: string;
	target?: IntentSpecTargetPatch | null;
}

export interface IntentSpecStorageAdapter {
	get({ projectId }: { projectId: string }): Promise<unknown | null>;
	set({
		projectId,
		value,
	}: {
		projectId: string;
		value: unknown;
	}): Promise<void>;
	remove({ projectId }: { projectId: string }): Promise<void>;
}

export interface IntentSpecStorageEntry {
	projectId: string;
	value: unknown;
}

export class IntentSpecValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "IntentSpecValidationError";
	}
}

const intentSpecSourceSchema = z.enum(["home", "editor"]);
const canonicalTimestampSchema = z.string().refine(isCanonicalTimestamp, {
	message: "Timestamp must be a canonical ISO-8601 value.",
});
const normalizedProjectIdSchema = z.string().min(1).max(128);
const normalizedIntentSchema = z.string().min(1).max(4_000);
const normalizedTargetTextSchema = z.string().min(1).max(160);
const intentSpecTargetSchema = z
	.object({
		platform: normalizedTargetTextSchema.optional(),
		aspectRatio: normalizedTargetTextSchema.optional(),
		durationSeconds: z.number().int().positive().max(86_400).optional(),
		style: normalizedTargetTextSchema.optional(),
	})
	.strict()
	.refine((target) => Object.keys(target).length > 0, {
		message: "Target must contain at least one preference.",
	});
const intentSpecRevisionSchema = z
	.object({
		projectId: normalizedProjectIdSchema,
		revision: z.number().int().positive(),
		userIntent: normalizedIntentSchema,
		target: intentSpecTargetSchema.optional(),
		source: intentSpecSourceSchema,
		createdAt: canonicalTimestampSchema,
		updatedAt: canonicalTimestampSchema,
	})
	.strict();
const intentSpecSchema = z
	.object({
		kind: z.literal(INTENT_SPEC_KIND),
		schemaVersion: z.literal(INTENT_SPEC_SCHEMA_VERSION),
		projectId: normalizedProjectIdSchema,
		revision: z.number().int().positive(),
		userIntent: normalizedIntentSchema,
		target: intentSpecTargetSchema.optional(),
		source: intentSpecSourceSchema,
		createdAt: canonicalTimestampSchema,
		updatedAt: canonicalTimestampSchema,
		revisions: z.array(intentSpecRevisionSchema).min(1).max(1_000),
		guarantees: z
			.object({
				localOnly: z.literal(true),
				accountRequired: z.literal(false),
				network: z.literal(false),
				paidService: z.literal(false),
			})
			.strict(),
	})
	.strict();

type ParsedIntentSpec = z.infer<typeof intentSpecSchema>;
type ParsedIntentSpecRevision = z.infer<typeof intentSpecRevisionSchema>;

const LOCAL_GUARANTEES: IntentSpecLocalGuarantees = Object.freeze({
	localOnly: true,
	accountRequired: false,
	network: false,
	paidService: false,
});

function isCanonicalTimestamp(value: string): boolean {
	const milliseconds = Date.parse(value);
	if (!Number.isFinite(milliseconds)) return false;
	return new Date(milliseconds).toISOString() === value;
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
		throw new IntentSpecValidationError(`${label} must be a valid timestamp.`);
	}
	return new Date(milliseconds).toISOString();
}

function normalizeRequiredText({
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
		throw new IntentSpecValidationError(`${label} cannot be empty.`);
	}
	if (Array.from(normalized).length > maxLength) {
		throw new IntentSpecValidationError(
			`${label} cannot exceed ${maxLength} characters.`,
		);
	}
	return normalized;
}

function normalizeProjectId({ projectId }: { projectId: string }): string {
	const normalized = normalizeRequiredText({
		value: projectId,
		label: "Project id",
		maxLength: 128,
	});
	if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(normalized)) {
		throw new IntentSpecValidationError(
			"Project id may contain only letters, numbers, dots, underscores, colons, and hyphens.",
		);
	}
	return normalized;
}

function normalizeUserIntent({ userIntent }: { userIntent: string }): string {
	return normalizeRequiredText({
		value: userIntent,
		label: "User intent",
		maxLength: 4_000,
	});
}

function normalizeOptionalTargetText({
	value,
	label,
}: {
	value: string | null | undefined;
	label: string;
}): string | undefined {
	if (value === null || value === undefined) return undefined;
	const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
	if (!normalized) return undefined;
	if (Array.from(normalized).length > 160) {
		throw new IntentSpecValidationError(
			`${label} cannot exceed 160 characters.`,
		);
	}
	return normalized;
}

function normalizeAspectRatio({
	value,
}: {
	value: string | null | undefined;
}): string | undefined {
	const normalized = normalizeOptionalTargetText({
		value,
		label: "Aspect ratio",
	});
	if (normalized === undefined) return undefined;
	const ratio = /^(\d{1,4})\s*:\s*(\d{1,4})$/u.exec(normalized);
	if (!ratio) return normalized;
	const width = Number(ratio[1]);
	const height = Number(ratio[2]);
	if (width < 1 || height < 1) {
		throw new IntentSpecValidationError(
			"Aspect ratio dimensions must be positive.",
		);
	}
	return `${width}:${height}`;
}

function normalizeDuration({
	value,
}: {
	value: number | null | undefined;
}): number | undefined {
	if (value === null || value === undefined) return undefined;
	if (!Number.isSafeInteger(value) || value < 1 || value > 86_400) {
		throw new IntentSpecValidationError(
			"Target duration must be an integer between 1 and 86400 seconds.",
		);
	}
	return value;
}

function freezeTarget({
	target,
}: {
	target: IntentSpecTarget | undefined;
}): IntentSpecTarget | undefined {
	if (target === undefined) return undefined;
	return Object.freeze({ ...target });
}

function normalizeTarget({
	target,
}: {
	target: IntentSpecTargetInput | IntentSpecTargetPatch | null | undefined;
}): IntentSpecTarget | undefined {
	if (target === null || target === undefined) return undefined;
	const normalized: IntentSpecTarget = {
		...(normalizeOptionalTargetText({
			value: target.platform,
			label: "Target platform",
		}) === undefined
			? {}
			: {
					platform: normalizeOptionalTargetText({
						value: target.platform,
						label: "Target platform",
					}),
				}),
		...(normalizeAspectRatio({ value: target.aspectRatio }) === undefined
			? {}
			: { aspectRatio: normalizeAspectRatio({ value: target.aspectRatio }) }),
		...(normalizeDuration({ value: target.durationSeconds }) === undefined
			? {}
			: {
					durationSeconds: normalizeDuration({
						value: target.durationSeconds,
					}),
				}),
		...(normalizeOptionalTargetText({
			value: target.style,
			label: "Target style",
		}) === undefined
			? {}
			: {
					style: normalizeOptionalTargetText({
						value: target.style,
						label: "Target style",
					}),
				}),
	};
	return Object.keys(normalized).length === 0
		? undefined
		: freezeTarget({ target: normalized });
}

function applyTargetPatch({
	current,
	patch,
}: {
	current: IntentSpecTarget | undefined;
	patch: IntentSpecTargetPatch | null | undefined;
}): IntentSpecTarget | undefined {
	if (patch === undefined) return freezeTarget({ target: current });
	if (patch === null) return undefined;
	return normalizeTarget({
		target: {
			platform:
				patch.platform === undefined ? current?.platform : patch.platform,
			aspectRatio:
				patch.aspectRatio === undefined
					? current?.aspectRatio
					: patch.aspectRatio,
			durationSeconds:
				patch.durationSeconds === undefined
					? current?.durationSeconds
					: patch.durationSeconds,
			style: patch.style === undefined ? current?.style : patch.style,
		},
	});
}

function targetsEqual({
	left,
	right,
}: {
	left: IntentSpecTarget | undefined;
	right: IntentSpecTarget | undefined;
}): boolean {
	return (
		left?.platform === right?.platform &&
		left?.aspectRatio === right?.aspectRatio &&
		left?.durationSeconds === right?.durationSeconds &&
		left?.style === right?.style
	);
}

function freezeRevision({
	revision,
}: {
	revision: IntentSpecRevision | ParsedIntentSpecRevision;
}): IntentSpecRevision {
	const target = freezeTarget({ target: revision.target });
	return Object.freeze({
		projectId: revision.projectId,
		revision: revision.revision,
		userIntent: revision.userIntent,
		...(target === undefined ? {} : { target }),
		source: revision.source,
		createdAt: revision.createdAt,
		updatedAt: revision.updatedAt,
	});
}

function freezeIntentSpec({
	spec,
}: {
	spec: ParsedIntentSpec | IntentSpec;
}): IntentSpec {
	const revisions = Object.freeze(
		spec.revisions.map((revision) => freezeRevision({ revision })),
	);
	const target = freezeTarget({ target: spec.target });
	return Object.freeze({
		kind: INTENT_SPEC_KIND,
		schemaVersion: INTENT_SPEC_SCHEMA_VERSION,
		projectId: spec.projectId,
		revision: spec.revision,
		userIntent: spec.userIntent,
		...(target === undefined ? {} : { target }),
		source: spec.source,
		createdAt: spec.createdAt,
		updatedAt: spec.updatedAt,
		revisions,
		guarantees: LOCAL_GUARANTEES,
	});
}

function isNormalizedTarget({
	target,
}: {
	target: IntentSpecTarget | undefined;
}): boolean {
	try {
		const normalized = normalizeTarget({ target });
		return targetsEqual({ left: target, right: normalized });
	} catch {
		return false;
	}
}

function hasValidIntentSpecInvariants({
	spec,
}: {
	spec: ParsedIntentSpec;
}): boolean {
	try {
		if (normalizeProjectId({ projectId: spec.projectId }) !== spec.projectId) {
			return false;
		}
		if (
			normalizeUserIntent({ userIntent: spec.userIntent }) !== spec.userIntent
		) {
			return false;
		}
		if (!isNormalizedTarget({ target: spec.target })) return false;
		if (spec.revision !== spec.revisions.length) return false;
		if (Date.parse(spec.updatedAt) < Date.parse(spec.createdAt)) return false;

		let previousUpdatedAt = spec.createdAt;
		for (const [index, revision] of spec.revisions.entries()) {
			if (revision.projectId !== spec.projectId) return false;
			if (revision.revision !== index + 1) return false;
			if (revision.createdAt !== spec.createdAt) return false;
			if (Date.parse(revision.updatedAt) < Date.parse(previousUpdatedAt)) {
				return false;
			}
			if (
				normalizeUserIntent({ userIntent: revision.userIntent }) !==
				revision.userIntent
			) {
				return false;
			}
			if (!isNormalizedTarget({ target: revision.target })) return false;
			previousUpdatedAt = revision.updatedAt;
		}

		const current = spec.revisions.at(-1);
		if (current === undefined) return false;
		return (
			current.revision === spec.revision &&
			current.userIntent === spec.userIntent &&
			current.source === spec.source &&
			current.createdAt === spec.createdAt &&
			current.updatedAt === spec.updatedAt &&
			targetsEqual({ left: current.target, right: spec.target })
		);
	} catch {
		return false;
	}
}

export function parseIntentSpec({
	value,
}: {
	value: unknown;
}): IntentSpec | null {
	const parsed = intentSpecSchema.safeParse(value);
	if (!parsed.success) return null;
	if (!hasValidIntentSpecInvariants({ spec: parsed.data })) return null;
	return freezeIntentSpec({ spec: parsed.data });
}

export function createIntentSpec({
	projectId,
	userIntent,
	target,
	source,
	createdAt,
}: {
	projectId: string;
	userIntent: string;
	target?: IntentSpecTargetInput;
	source: IntentSpecSource;
	createdAt: string;
}): IntentSpec {
	const normalizedProjectId = normalizeProjectId({ projectId });
	const normalizedIntent = normalizeUserIntent({ userIntent });
	const normalizedTarget = normalizeTarget({ target });
	const normalizedCreatedAt = normalizeTimestamp({
		value: createdAt,
		label: "Created at",
	});
	const firstRevision = freezeRevision({
		revision: {
			projectId: normalizedProjectId,
			revision: 1,
			userIntent: normalizedIntent,
			...(normalizedTarget === undefined ? {} : { target: normalizedTarget }),
			source,
			createdAt: normalizedCreatedAt,
			updatedAt: normalizedCreatedAt,
		},
	});
	return freezeIntentSpec({
		spec: {
			kind: INTENT_SPEC_KIND,
			schemaVersion: INTENT_SPEC_SCHEMA_VERSION,
			projectId: normalizedProjectId,
			revision: 1,
			userIntent: normalizedIntent,
			...(normalizedTarget === undefined ? {} : { target: normalizedTarget }),
			source,
			createdAt: normalizedCreatedAt,
			updatedAt: normalizedCreatedAt,
			revisions: [firstRevision],
			guarantees: LOCAL_GUARANTEES,
		},
	});
}

export function updateIntentSpec({
	spec,
	changes,
	source,
	updatedAt,
}: {
	spec: IntentSpec;
	changes: IntentSpecChanges;
	source: IntentSpecSource;
	updatedAt: string;
}): IntentSpec {
	const current = parseIntentSpec({ value: spec });
	if (current === null) {
		throw new IntentSpecValidationError("Cannot update an invalid IntentSpec.");
	}
	const normalizedUpdatedAt = normalizeTimestamp({
		value: updatedAt,
		label: "Updated at",
	});
	if (Date.parse(normalizedUpdatedAt) < Date.parse(current.updatedAt)) {
		throw new IntentSpecValidationError(
			"Updated at cannot be earlier than the current revision.",
		);
	}
	const userIntent =
		changes.userIntent === undefined
			? current.userIntent
			: normalizeUserIntent({ userIntent: changes.userIntent });
	const target = applyTargetPatch({
		current: current.target,
		patch: changes.target,
	});
	if (
		userIntent === current.userIntent &&
		source === current.source &&
		targetsEqual({ left: target, right: current.target })
	) {
		return current;
	}

	const revisionNumber = current.revision + 1;
	const nextRevision = freezeRevision({
		revision: {
			projectId: current.projectId,
			revision: revisionNumber,
			userIntent,
			...(target === undefined ? {} : { target }),
			source,
			createdAt: current.createdAt,
			updatedAt: normalizedUpdatedAt,
		},
	});
	return freezeIntentSpec({
		spec: {
			...current,
			revision: revisionNumber,
			userIntent,
			...(target === undefined ? { target: undefined } : { target }),
			source,
			updatedAt: normalizedUpdatedAt,
			revisions: [...current.revisions, nextRevision],
		},
	});
}

function cloneStorageValue({ value }: { value: unknown }): unknown {
	return structuredClone(value);
}

export class MemoryIntentSpecStorage implements IntentSpecStorageAdapter {
	private readonly values = new Map<string, unknown>();

	constructor({
		entries = [],
	}: {
		entries?: readonly IntentSpecStorageEntry[];
	} = {}) {
		for (const entry of entries) {
			this.values.set(
				normalizeProjectId({ projectId: entry.projectId }),
				cloneStorageValue({ value: entry.value }),
			);
		}
	}

	async get({ projectId }: { projectId: string }): Promise<unknown | null> {
		const value = this.values.get(normalizeProjectId({ projectId }));
		return value === undefined ? null : cloneStorageValue({ value });
	}

	async set({
		projectId,
		value,
	}: {
		projectId: string;
		value: unknown;
	}): Promise<void> {
		this.values.set(
			normalizeProjectId({ projectId }),
			cloneStorageValue({ value }),
		);
	}

	async remove({ projectId }: { projectId: string }): Promise<void> {
		this.values.delete(normalizeProjectId({ projectId }));
	}
}

export class IndexedDBIntentSpecStorage implements IntentSpecStorageAdapter {
	private readonly databaseName: string;
	private readonly storeName: string;
	private readonly databaseVersion: number;
	private readonly indexedDBFactory: IDBFactory | null | undefined;
	private readonly fallback: IntentSpecStorageAdapter;

	constructor({
		databaseName = "visioncut-intent-specs",
		storeName = "intent-specs",
		databaseVersion = 1,
		indexedDBFactory,
		fallback = new MemoryIntentSpecStorage(),
	}: {
		databaseName?: string;
		storeName?: string;
		databaseVersion?: number;
		indexedDBFactory?: IDBFactory | null;
		fallback?: IntentSpecStorageAdapter;
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
				reject(new Error("IntentSpec IndexedDB open request was blocked."));
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

	private async writeToDatabase({
		projectId,
		value,
	}: {
		projectId: string;
		value: unknown;
	}): Promise<boolean> {
		const database = await this.openDatabase();
		if (database === null) return false;
		try {
			await new Promise<void>((resolve, reject) => {
				const transaction = database.transaction(this.storeName, "readwrite");
				transaction.oncomplete = () => resolve();
				transaction.onerror = () => reject(transaction.error);
				transaction.onabort = () => reject(transaction.error);
				transaction.objectStore(this.storeName).put(value, projectId);
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

	async get({ projectId }: { projectId: string }): Promise<unknown | null> {
		const normalizedProjectId = normalizeProjectId({ projectId });
		try {
			const value = await this.readFromDatabase({
				projectId: normalizedProjectId,
			});
			if (value !== null) return value;
		} catch {
			// Browsers can deny IndexedDB in private or restricted contexts.
		}
		return this.fallback.get({ projectId: normalizedProjectId });
	}

	async set({
		projectId,
		value,
	}: {
		projectId: string;
		value: unknown;
	}): Promise<void> {
		const normalizedProjectId = normalizeProjectId({ projectId });
		try {
			const persisted = await this.writeToDatabase({
				projectId: normalizedProjectId,
				value,
			});
			if (persisted) {
				await this.fallback.remove({ projectId: normalizedProjectId });
				return;
			}
		} catch {
			// The in-memory fallback keeps local editing usable for this session.
		}
		await this.fallback.set({ projectId: normalizedProjectId, value });
	}

	async remove({ projectId }: { projectId: string }): Promise<void> {
		const normalizedProjectId = normalizeProjectId({ projectId });
		try {
			await this.removeFromDatabase({ projectId: normalizedProjectId });
		} catch {
			// The fallback still needs to be cleared when IndexedDB is unavailable.
		}
		await this.fallback.remove({ projectId: normalizedProjectId });
	}
}

const defaultIntentSpecStorage = new IndexedDBIntentSpecStorage();

export async function loadIntentSpec({
	projectId,
	storage = defaultIntentSpecStorage,
}: {
	projectId: string;
	storage?: IntentSpecStorageAdapter;
}): Promise<IntentSpec | null> {
	const normalizedProjectId = normalizeProjectId({ projectId });
	const stored = await storage.get({ projectId: normalizedProjectId });
	const spec = parseIntentSpec({ value: stored });
	return spec?.projectId === normalizedProjectId ? spec : null;
}

export async function saveIntentSpec({
	spec,
	storage = defaultIntentSpecStorage,
}: {
	spec: IntentSpec;
	storage?: IntentSpecStorageAdapter;
}): Promise<IntentSpec> {
	const validated = parseIntentSpec({ value: spec });
	if (validated === null) {
		throw new IntentSpecValidationError("Cannot save an invalid IntentSpec.");
	}
	await storage.set({ projectId: validated.projectId, value: validated });
	return validated;
}

export async function updateStoredIntentSpec({
	projectId,
	changes,
	source,
	updatedAt,
	storage = defaultIntentSpecStorage,
}: {
	projectId: string;
	changes: IntentSpecChanges;
	source: IntentSpecSource;
	updatedAt: string;
	storage?: IntentSpecStorageAdapter;
}): Promise<IntentSpec | null> {
	const current = await loadIntentSpec({ projectId, storage });
	if (current === null) return null;
	const next = updateIntentSpec({
		spec: current,
		changes,
		source,
		updatedAt,
	});
	await saveIntentSpec({ spec: next, storage });
	return next;
}

export async function deleteIntentSpec({
	projectId,
	storage = defaultIntentSpecStorage,
}: {
	projectId: string;
	storage?: IntentSpecStorageAdapter;
}): Promise<void> {
	await storage.remove({ projectId: normalizeProjectId({ projectId }) });
}

export function exportIntentSpec({ spec }: { spec: IntentSpec }): string {
	const validated = parseIntentSpec({ value: spec });
	if (validated === null) {
		throw new IntentSpecValidationError("Cannot export an invalid IntentSpec.");
	}
	return JSON.stringify(validated, null, 2);
}
