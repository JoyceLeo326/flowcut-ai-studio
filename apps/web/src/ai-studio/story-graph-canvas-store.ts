import { z } from "zod";
import {
	assertStoryGraphCanvasAggregateInvariants,
	assertStoryGraphCanvasInvariants,
	createStoryGraphCanvasAggregate,
	rebaseStoryGraphCanvasAggregate,
	STORY_GRAPH_CANVAS_AGGREGATE_KIND,
	STORY_GRAPH_CANVAS_AGGREGATE_SCHEMA_VERSION,
	STORY_GRAPH_CANVAS_KIND,
	STORY_GRAPH_CANVAS_SCHEMA_VERSION,
	type StoryGraphCanvasAggregate,
	type StoryGraphCanvasDocument,
} from "./story-graph-canvas-model";
import type { StoryGraph } from "./story-graph-model";
import { parseStoryGraphForStorage } from "./story-graph-store";

export type StoryGraphCanvasStoredValue =
	| StoryGraphCanvasAggregate
	| StoryGraphCanvasDocument;

export interface StoryGraphCanvasStorageIdentity {
	readonly projectId: string;
	readonly graphId: string;
	readonly graphVersion: number;
}

export interface StoryGraphCanvasStorageAdapter {
	read({ storageKey }: { storageKey: string }): Promise<unknown | null>;
	write({
		storageKey,
		value,
		expectedRevision,
	}: {
		storageKey: string;
		value: StoryGraphCanvasStoredValue;
		expectedRevision?: number | null;
	}): Promise<void>;
	delete({ storageKey }: { storageKey: string }): Promise<void>;
}

export interface StoryGraphCanvasStorageEntry {
	readonly identity: StoryGraphCanvasStorageIdentity;
	readonly value: unknown;
}

export class StoryGraphCanvasStorageValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "StoryGraphCanvasStorageValidationError";
	}
}

export class StoryGraphCanvasRevisionConflictError extends Error {
	readonly expectedRevision: number | null;
	readonly actualRevision: number | null;

	constructor({
		expectedRevision,
		actualRevision,
	}: {
		expectedRevision: number | null;
		actualRevision: number | null;
	}) {
		super(
			`Creative Canvas revision conflict: expected ${
				expectedRevision ?? "no stored revision"
			}, found ${actualRevision ?? "no stored revision"}.`,
		);
		this.name = "StoryGraphCanvasRevisionConflictError";
		this.expectedRevision = expectedRevision;
		this.actualRevision = actualRevision;
	}
}

const finiteNumberSchema = z.number().finite();
const pointSchema = z
	.object({
		x: finiteNumberSchema,
		y: finiteNumberSchema,
	})
	.strict();
const timelineRangeSchema = z
	.object({
		start: finiteNumberSchema.nonnegative(),
		end: finiteNumberSchema.positive(),
	})
	.strict();
const thumbnailSchema = z
	.object({
		url: z.string().min(1),
		sourceAssetId: z.string().min(1),
		width: finiteNumberSchema.positive().optional(),
		height: finiteNumberSchema.positive().optional(),
	})
	.strict();
const timelineProvenanceSchema = z
	.object({
		kind: z.literal("timeline-derived"),
		storyNodeId: z.string().min(1),
		evidenceState: z.enum([
			"timeline-and-media",
			"timeline-only",
			"media-only",
			"manual",
			"merged",
		]),
		sceneIds: z.array(z.string()),
		trackIds: z.array(z.string()),
		timelineElementIds: z.array(z.string()).min(1),
		mediaIds: z.array(z.string()),
		semanticAnalysisPerformed: z.literal(false),
		notice: z.string().min(1),
	})
	.strict();
const draftProvenanceSchema = z
	.object({
		kind: z.literal("user-draft"),
		createdBy: z.literal("user"),
		sourceNodeIds: z.array(z.string()),
		semanticAnalysisPerformed: z.literal(false),
		notice: z.string().min(1),
	})
	.strict();
const nodeSchema = z
	.object({
		id: z.string().min(1),
		type: z.enum(["scene", "character", "emotion", "audio"]),
		label: z.string().min(1),
		position: pointSchema,
		timeline: timelineRangeSchema.nullable(),
		thumbnail: thumbnailSchema.optional(),
		provenance: z.discriminatedUnion("kind", [
			timelineProvenanceSchema,
			draftProvenanceSchema,
		]),
	})
	.strict();
const timelineEdgeProvenanceSchema = z
	.object({
		kind: z.literal("timeline-order"),
		semanticAnalysisPerformed: z.literal(false),
		notice: z.string().min(1),
	})
	.strict();
const draftEdgeProvenanceSchema = z
	.object({
		kind: z.literal("user-draft"),
		createdBy: z.literal("user"),
		semanticAnalysisPerformed: z.literal(false),
		notice: z.string().min(1),
	})
	.strict();
const edgeSchema = z
	.object({
		id: z.string().min(1),
		sourceNodeId: z.string().min(1),
		targetNodeId: z.string().min(1),
		relation: z.enum(["sequence", "related"]),
		label: z.string().min(1),
		provenance: z.discriminatedUnion("kind", [
			timelineEdgeProvenanceSchema,
			draftEdgeProvenanceSchema,
		]),
	})
	.strict();
const documentSchema = z
	.object({
		kind: z.literal(STORY_GRAPH_CANVAS_KIND),
		schemaVersion: z.literal(STORY_GRAPH_CANVAS_SCHEMA_VERSION),
		canvasId: z.string().min(1),
		projectId: z.string().min(1),
		graphId: z.string().min(1),
		graphVersion: z.number().int().positive(),
		revision: z.number().int().positive(),
		viewport: z
			.object({
				x: finiteNumberSchema,
				y: finiteNumberSchema,
				zoom: finiteNumberSchema.positive(),
			})
			.strict(),
		nodes: z.array(nodeSchema),
		edges: z.array(edgeSchema),
		guarantees: z
			.object({
				localOnly: z.literal(true),
				semanticInferencePerformed: z.literal(false),
				derivedSceneNodesRequireTimelineEvidence: z.literal(true),
				semanticNodesRequireUserDraftProvenance: z.literal(true),
			})
			.strict(),
	})
	.strict();
const aggregateSchema = z
	.object({
		kind: z.literal(STORY_GRAPH_CANVAS_AGGREGATE_KIND),
		schemaVersion: z.literal(STORY_GRAPH_CANVAS_AGGREGATE_SCHEMA_VERSION),
		aggregateId: z.string().min(1),
		projectId: z.string().min(1),
		graphId: z.string().min(1),
		graphVersion: z.number().int().positive(),
		revision: z.number().int().positive(),
		storyGraph: z.unknown(),
		canvas: documentSchema,
		guarantees: z
			.object({
				canvasIsVersionedSubdocument: z.literal(true),
				timelineProvenanceVerified: z.literal(true),
				semanticInferencePerformed: z.literal(false),
			})
			.strict(),
	})
	.strict();

function normalizeIdentifier({
	value,
	label,
}: {
	value: string;
	label: string;
}): string {
	if (typeof value !== "string") {
		throw new StoryGraphCanvasStorageValidationError(
			`${label} must be a string.`,
		);
	}
	const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
	if (!normalized) {
		throw new StoryGraphCanvasStorageValidationError(
			`${label} cannot be empty.`,
		);
	}
	return normalized;
}

function normalizeIdentity({
	identity,
}: {
	identity: StoryGraphCanvasStorageIdentity;
}): StoryGraphCanvasStorageIdentity {
	if (!Number.isInteger(identity.graphVersion) || identity.graphVersion <= 0) {
		throw new StoryGraphCanvasStorageValidationError(
			"Graph version must be a positive integer.",
		);
	}
	return {
		projectId: normalizeIdentifier({
			value: identity.projectId,
			label: "Project id",
		}),
		graphId: normalizeIdentifier({
			value: identity.graphId,
			label: "Graph id",
		}),
		graphVersion: identity.graphVersion,
	};
}

export function createStoryGraphCanvasStorageKey({
	identity,
}: {
	identity: StoryGraphCanvasStorageIdentity;
}): string {
	const normalized = normalizeIdentity({ identity });
	return JSON.stringify([
		normalized.projectId,
		normalized.graphId,
		normalized.graphVersion,
	]);
}

function assertPortableJson({
	value,
	path = "$",
	seen = new WeakSet<object>(),
}: {
	value: unknown;
	path?: string;
	seen?: WeakSet<object>;
}): void {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "boolean"
	) {
		return;
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw new StoryGraphCanvasStorageValidationError(
				`${path} contains a non-finite number.`,
			);
		}
		return;
	}
	if (typeof value !== "object") {
		throw new StoryGraphCanvasStorageValidationError(
			`${path} is not portable JSON.`,
		);
	}
	if (
		value instanceof ArrayBuffer ||
		ArrayBuffer.isView(value) ||
		(typeof Blob !== "undefined" && value instanceof Blob) ||
		(typeof File !== "undefined" && value instanceof File)
	) {
		throw new StoryGraphCanvasStorageValidationError(
			`${path} contains a binary payload.`,
		);
	}
	if (seen.has(value)) {
		throw new StoryGraphCanvasStorageValidationError(
			`${path} contains a cyclic or shared object reference.`,
		);
	}
	seen.add(value);
	if (Array.isArray(value)) {
		for (const [index, entry] of value.entries()) {
			assertPortableJson({
				value: entry,
				path: `${path}[${index}]`,
				seen,
			});
		}
		return;
	}
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		throw new StoryGraphCanvasStorageValidationError(
			`${path} contains a non-JSON object.`,
		);
	}
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== "string") {
			throw new StoryGraphCanvasStorageValidationError(
				`${path} contains a symbol property.`,
			);
		}
		assertPortableJson({
			value: Reflect.get(value, key),
			path: `${path}.${key}`,
			seen,
		});
	}
}

function deepFreeze<T>(value: T): T {
	if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
		return value;
	}
	for (const key of Reflect.ownKeys(value)) {
		deepFreeze(Reflect.get(value, key));
	}
	return Object.freeze(value);
}

export function parseStoryGraphCanvasDocument({
	value,
}: {
	value: unknown;
}): StoryGraphCanvasDocument | null {
	try {
		assertPortableJson({ value });
		const parsed = documentSchema.safeParse(value);
		if (!parsed.success) return null;
		const document = parsed.data as StoryGraphCanvasDocument;
		assertStoryGraphCanvasInvariants({ document });
		return deepFreeze(document);
	} catch {
		return null;
	}
}

export function parseStoryGraphCanvasAggregate({
	value,
}: {
	value: unknown;
}): StoryGraphCanvasAggregate | null {
	try {
		assertPortableJson({ value });
		const parsed = aggregateSchema.safeParse(structuredClone(value));
		if (!parsed.success) return null;
		const storyGraph = parseStoryGraphForStorage({
			value: parsed.data.storyGraph,
		});
		if (storyGraph === null) return null;
		const aggregate: StoryGraphCanvasAggregate = {
			...parsed.data,
			storyGraph,
		};
		assertStoryGraphCanvasAggregateInvariants({ aggregate });
		return deepFreeze(aggregate);
	} catch {
		return null;
	}
}

function assertDocumentMatchesIdentity({
	document,
	identity,
}: {
	document: StoryGraphCanvasDocument;
	identity: StoryGraphCanvasStorageIdentity;
}): void {
	if (
		document.projectId !== identity.projectId ||
		document.graphId !== identity.graphId ||
		document.graphVersion !== identity.graphVersion
	) {
		throw new StoryGraphCanvasStorageValidationError(
			"Canvas document identity does not match its storage key.",
		);
	}
}

function assertAggregateMatchesIdentity({
	aggregate,
	identity,
}: {
	aggregate: StoryGraphCanvasAggregate;
	identity: StoryGraphCanvasStorageIdentity;
}): void {
	if (
		aggregate.projectId !== identity.projectId ||
		aggregate.graphId !== identity.graphId ||
		aggregate.graphVersion !== identity.graphVersion
	) {
		throw new StoryGraphCanvasStorageValidationError(
			"Canvas aggregate identity does not match its storage key.",
		);
	}
}

function storedRevision({ value }: { value: unknown | null }): number | null {
	if (value === null) return null;
	if (typeof value !== "object" || value === null) {
		throw new StoryGraphCanvasStorageValidationError(
			"Stored Creative Canvas value has no valid revision.",
		);
	}
	const revision: unknown = "revision" in value ? value.revision : undefined;
	if (
		typeof revision !== "number" ||
		!Number.isInteger(revision) ||
		revision <= 0
	) {
		throw new StoryGraphCanvasStorageValidationError(
			"Stored Creative Canvas value has no valid revision.",
		);
	}
	return revision;
}

function assertExpectedRevision({
	currentValue,
	expectedRevision,
}: {
	currentValue: unknown | null;
	expectedRevision: number | null | undefined;
}): void {
	if (expectedRevision === undefined) return;
	if (
		expectedRevision !== null &&
		(!Number.isInteger(expectedRevision) || expectedRevision <= 0)
	) {
		throw new StoryGraphCanvasStorageValidationError(
			"Expected Canvas revision must be null or a positive integer.",
		);
	}
	const actualRevision = storedRevision({ value: currentValue });
	if (actualRevision !== expectedRevision) {
		throw new StoryGraphCanvasRevisionConflictError({
			expectedRevision,
			actualRevision,
		});
	}
}

function cloneStorageValue({ value }: { value: unknown }): unknown {
	return structuredClone(value);
}

export class MemoryStoryGraphCanvasStorage implements StoryGraphCanvasStorageAdapter {
	private readonly values = new Map<string, unknown>();

	constructor({
		entries = [],
	}: {
		entries?: readonly StoryGraphCanvasStorageEntry[];
	} = {}) {
		for (const entry of entries) {
			const storageKey = createStoryGraphCanvasStorageKey({
				identity: entry.identity,
			});
			this.values.set(storageKey, cloneStorageValue({ value: entry.value }));
		}
	}

	async read({ storageKey }: { storageKey: string }): Promise<unknown | null> {
		const value = this.values.get(storageKey);
		return value === undefined ? null : cloneStorageValue({ value });
	}

	async write({
		storageKey,
		value,
		expectedRevision,
	}: {
		storageKey: string;
		value: StoryGraphCanvasStoredValue;
		expectedRevision?: number | null;
	}): Promise<void> {
		assertExpectedRevision({
			currentValue: this.values.get(storageKey) ?? null,
			expectedRevision,
		});
		this.values.set(storageKey, cloneStorageValue({ value }));
	}

	async delete({ storageKey }: { storageKey: string }): Promise<void> {
		this.values.delete(storageKey);
	}
}

export class IndexedDBStoryGraphCanvasStorage implements StoryGraphCanvasStorageAdapter {
	private readonly databaseName: string;
	private readonly storeName: string;
	private readonly databaseVersion: number;
	private readonly indexedDBFactory: IDBFactory | null | undefined;
	private readonly fallback: StoryGraphCanvasStorageAdapter;

	constructor({
		databaseName = "visioncut-story-graph-canvas",
		storeName = "canvas-documents",
		databaseVersion = 1,
		indexedDBFactory,
		fallback = new MemoryStoryGraphCanvasStorage(),
	}: {
		databaseName?: string;
		storeName?: string;
		databaseVersion?: number;
		indexedDBFactory?: IDBFactory | null;
		fallback?: StoryGraphCanvasStorageAdapter;
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
				reject(new Error("Creative Canvas IndexedDB request was blocked."));
			request.onupgradeneeded = () => {
				if (!request.result.objectStoreNames.contains(this.storeName)) {
					request.result.createObjectStore(this.storeName);
				}
			};
			request.onsuccess = () => resolve(request.result);
		});
	}

	private async readFromDatabase({
		storageKey,
	}: {
		storageKey: string;
	}): Promise<unknown | null> {
		const database = await this.openDatabase();
		if (database === null) return null;
		try {
			return await new Promise((resolve, reject) => {
				const transaction = database.transaction(this.storeName, "readonly");
				const request = transaction.objectStore(this.storeName).get(storageKey);
				request.onerror = () => reject(request.error);
				request.onsuccess = () =>
					resolve(request.result === undefined ? null : request.result);
			});
		} finally {
			database.close();
		}
	}

	private async writeToDatabase({
		storageKey,
		value,
		expectedRevision,
	}: {
		storageKey: string;
		value: StoryGraphCanvasStoredValue;
		expectedRevision?: number | null;
	}): Promise<boolean> {
		const database = await this.openDatabase();
		if (database === null) return false;
		try {
			await new Promise<void>((resolve, reject) => {
				const transaction = database.transaction(this.storeName, "readwrite");
				transaction.oncomplete = () => resolve();
				transaction.onerror = () => reject(transaction.error);
				transaction.onabort = () => reject(transaction.error);
				const store = transaction.objectStore(this.storeName);
				const request = store.get(storageKey);
				request.onerror = () => reject(request.error);
				request.onsuccess = () => {
					try {
						assertExpectedRevision({
							currentValue:
								request.result === undefined ? null : request.result,
							expectedRevision,
						});
						store.put(value, storageKey);
					} catch (error) {
						reject(error);
						transaction.abort();
					}
				};
			});
			return true;
		} finally {
			database.close();
		}
	}

	private async deleteFromDatabase({
		storageKey,
	}: {
		storageKey: string;
	}): Promise<boolean> {
		const database = await this.openDatabase();
		if (database === null) return false;
		try {
			await new Promise<void>((resolve, reject) => {
				const transaction = database.transaction(this.storeName, "readwrite");
				transaction.oncomplete = () => resolve();
				transaction.onerror = () => reject(transaction.error);
				transaction.onabort = () => reject(transaction.error);
				transaction.objectStore(this.storeName).delete(storageKey);
			});
			return true;
		} finally {
			database.close();
		}
	}

	async read({ storageKey }: { storageKey: string }): Promise<unknown | null> {
		try {
			const value = await this.readFromDatabase({ storageKey });
			if (value !== null) return value;
		} catch {
			// Sandboxed and private browser contexts can reject IndexedDB.
		}
		return this.fallback.read({ storageKey });
	}

	async write({
		storageKey,
		value,
		expectedRevision,
	}: {
		storageKey: string;
		value: StoryGraphCanvasStoredValue;
		expectedRevision?: number | null;
	}): Promise<void> {
		try {
			const persisted = await this.writeToDatabase({
				storageKey,
				value,
				expectedRevision,
			});
			if (persisted) {
				await this.fallback.delete({ storageKey });
				return;
			}
		} catch (error) {
			if (error instanceof StoryGraphCanvasRevisionConflictError) {
				throw error;
			}
			// Keep the current session usable when browser storage is unavailable.
		}
		await this.fallback.write({ storageKey, value, expectedRevision });
	}

	async delete({ storageKey }: { storageKey: string }): Promise<void> {
		try {
			await this.deleteFromDatabase({ storageKey });
		} catch {
			// The fallback is still cleared below.
		}
		await this.fallback.delete({ storageKey });
	}
}

export const defaultStoryGraphCanvasStorage =
	new IndexedDBStoryGraphCanvasStorage();

export async function loadStoryGraphCanvasDocument({
	identity,
	storage = defaultStoryGraphCanvasStorage,
}: {
	identity: StoryGraphCanvasStorageIdentity;
	storage?: StoryGraphCanvasStorageAdapter;
}): Promise<StoryGraphCanvasDocument | null> {
	const normalizedIdentity = normalizeIdentity({ identity });
	const storageKey = createStoryGraphCanvasStorageKey({
		identity: normalizedIdentity,
	});
	const value = await storage.read({ storageKey });
	if (value === null) return null;
	const aggregate = parseStoryGraphCanvasAggregate({ value });
	const document =
		aggregate?.canvas ?? parseStoryGraphCanvasDocument({ value });
	if (document === null) {
		throw new StoryGraphCanvasStorageValidationError(
			"Stored Creative Canvas document is malformed.",
		);
	}
	assertDocumentMatchesIdentity({
		document,
		identity: normalizedIdentity,
	});
	return document;
}

export async function saveStoryGraphCanvasDocument({
	document,
	storage = defaultStoryGraphCanvasStorage,
	expectedRevision,
}: {
	document: StoryGraphCanvasDocument;
	storage?: StoryGraphCanvasStorageAdapter;
	expectedRevision?: number | null;
}): Promise<StoryGraphCanvasDocument> {
	const parsed = parseStoryGraphCanvasDocument({ value: document });
	if (parsed === null) {
		throw new StoryGraphCanvasStorageValidationError(
			"Cannot persist an invalid or non-JSON Creative Canvas document.",
		);
	}
	const identity = normalizeIdentity({
		identity: {
			projectId: parsed.projectId,
			graphId: parsed.graphId,
			graphVersion: parsed.graphVersion,
		},
	});
	assertDocumentMatchesIdentity({ document: parsed, identity });
	await storage.write({
		storageKey: createStoryGraphCanvasStorageKey({ identity }),
		value: parsed,
		expectedRevision,
	});
	return parsed;
}

export async function loadStoryGraphCanvasAggregate({
	graph,
	storage = defaultStoryGraphCanvasStorage,
}: {
	graph: StoryGraph;
	storage?: StoryGraphCanvasStorageAdapter;
}): Promise<StoryGraphCanvasAggregate | null> {
	const identity = normalizeIdentity({
		identity: {
			projectId: graph.projectId,
			graphId: graph.graphId,
			graphVersion: graph.version,
		},
	});
	const value = await storage.read({
		storageKey: createStoryGraphCanvasStorageKey({ identity }),
	});
	if (value === null) return null;

	const storedAggregate = parseStoryGraphCanvasAggregate({ value });
	if (storedAggregate !== null) {
		assertAggregateMatchesIdentity({
			aggregate: storedAggregate,
			identity,
		});
		try {
			const rebased = rebaseStoryGraphCanvasAggregate({
				aggregate: storedAggregate,
				graph,
			});
			const immutable = parseStoryGraphCanvasAggregate({ value: rebased });
			if (immutable === null) {
				throw new StoryGraphCanvasStorageValidationError(
					"Rebased Canvas aggregate is not portable JSON.",
				);
			}
			return immutable;
		} catch (error) {
			throw new StoryGraphCanvasStorageValidationError(
				error instanceof Error
					? `Stored Canvas aggregate conflicts with the current Story Graph: ${error.message}`
					: "Stored Canvas aggregate conflicts with the current Story Graph.",
			);
		}
	}

	const legacyDocument = parseStoryGraphCanvasDocument({ value });
	if (legacyDocument === null) {
		throw new StoryGraphCanvasStorageValidationError(
			"Stored Creative Canvas aggregate is malformed.",
		);
	}
	assertDocumentMatchesIdentity({
		document: legacyDocument,
		identity,
	});
	try {
		const migrated = createStoryGraphCanvasAggregate({
			graph,
			canvas: legacyDocument,
		});
		const immutable = parseStoryGraphCanvasAggregate({ value: migrated });
		if (immutable === null) {
			throw new StoryGraphCanvasStorageValidationError(
				"Migrated Canvas aggregate is not portable JSON.",
			);
		}
		return immutable;
	} catch (error) {
		throw new StoryGraphCanvasStorageValidationError(
			error instanceof Error
				? `Legacy Canvas layout conflicts with the current Story Graph: ${error.message}`
				: "Legacy Canvas layout conflicts with the current Story Graph.",
		);
	}
}

export async function saveStoryGraphCanvasAggregate({
	aggregate,
	expectedRevision,
	storage = defaultStoryGraphCanvasStorage,
}: {
	aggregate: StoryGraphCanvasAggregate;
	expectedRevision: number | null;
	storage?: StoryGraphCanvasStorageAdapter;
}): Promise<StoryGraphCanvasAggregate> {
	const parsed = parseStoryGraphCanvasAggregate({ value: aggregate });
	if (parsed === null) {
		throw new StoryGraphCanvasStorageValidationError(
			"Cannot persist an invalid or non-JSON Creative Canvas aggregate.",
		);
	}
	const identity = normalizeIdentity({
		identity: {
			projectId: parsed.projectId,
			graphId: parsed.graphId,
			graphVersion: parsed.graphVersion,
		},
	});
	assertAggregateMatchesIdentity({ aggregate: parsed, identity });
	await storage.write({
		storageKey: createStoryGraphCanvasStorageKey({ identity }),
		value: parsed,
		expectedRevision,
	});
	return parsed;
}

export async function deleteStoryGraphCanvasDocument({
	identity,
	storage = defaultStoryGraphCanvasStorage,
}: {
	identity: StoryGraphCanvasStorageIdentity;
	storage?: StoryGraphCanvasStorageAdapter;
}): Promise<void> {
	await storage.delete({
		storageKey: createStoryGraphCanvasStorageKey({ identity }),
	});
}
