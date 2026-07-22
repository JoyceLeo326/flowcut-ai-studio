import {
	assertStoryGraphInvariants,
	serializeStoryGraph,
	type StoryGraph,
	type StoryGraphNode,
} from "./story-graph-model";

export const STORY_GRAPH_HISTORY_SCHEMA_VERSION = 1 as const;
export const STORY_GRAPH_HISTORY_KIND =
	"visioncut.story-graph-history" as const;

export interface StoryGraphStorageGuarantees {
	readonly localOnly: true;
	readonly accountRequired: false;
	readonly network: false;
	readonly paidService: false;
	readonly jsonSafe: true;
	readonly binaryPayloadsStored: false;
}

export interface StoryGraphHistory {
	readonly kind: typeof STORY_GRAPH_HISTORY_KIND;
	readonly schemaVersion: typeof STORY_GRAPH_HISTORY_SCHEMA_VERSION;
	readonly projectId: string;
	readonly graphId: string;
	readonly current: StoryGraph;
	readonly history: readonly StoryGraph[];
	readonly guarantees: StoryGraphStorageGuarantees;
}

export interface StoryGraphStorageAdapter {
	read({ projectId }: { projectId: string }): Promise<unknown | null>;
	append({
		projectId,
		graph,
		expectedCurrentVersion,
	}: {
		projectId: string;
		graph: StoryGraph;
		expectedCurrentVersion: number;
	}): Promise<void>;
	deleteProject({ projectId }: { projectId: string }): Promise<void>;
}

export interface StoryGraphStorageEntry {
	readonly projectId: string;
	readonly value: unknown;
}

export class StoryGraphStorageValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "StoryGraphStorageValidationError";
	}
}

export class StoryGraphVersionConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "StoryGraphVersionConflictError";
	}
}

const STORAGE_GUARANTEES: StoryGraphStorageGuarantees = Object.freeze({
	localOnly: true,
	accountRequired: false,
	network: false,
	paidService: false,
	jsonSafe: true,
	binaryPayloadsStored: false,
});

const EMPTY_STORY_GRAPH_HISTORY: readonly StoryGraph[] = Object.freeze([]);

function normalizeProjectId({ projectId }: { projectId: string }): string {
	if (typeof projectId !== "string") {
		throw new StoryGraphStorageValidationError("Project id must be a string.");
	}
	const normalized = projectId.normalize("NFKC").trim().replace(/\s+/gu, " ");
	if (!normalized) {
		throw new StoryGraphStorageValidationError("Project id cannot be empty.");
	}
	return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
	return Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
	return (
		isUnknownArray(value) && value.every((entry) => typeof entry === "string")
	);
}

function isOptionalString(value: unknown): value is string | undefined {
	return value === undefined || typeof value === "string";
}

function isOptionalNumber(value: unknown): value is number | undefined {
	return value === undefined || typeof value === "number";
}

function isNullableNumber(value: unknown): value is number | null {
	return value === null || typeof value === "number";
}

function isStoryGraphNode(value: unknown): value is StoryGraphNode {
	if (!isRecord(value) || !isRecord(value.provenance)) return false;
	const thumbnail = value.thumbnail;
	const validThumbnail =
		thumbnail === undefined ||
		(isRecord(thumbnail) &&
			typeof thumbnail.url === "string" &&
			typeof thumbnail.sourceAssetId === "string" &&
			isOptionalNumber(thumbnail.width) &&
			isOptionalNumber(thumbnail.height));
	return (
		typeof value.id === "string" &&
		isOptionalString(value.assetId) &&
		isOptionalString(value.mediaId) &&
		isNullableNumber(value.timelineStart) &&
		isNullableNumber(value.timelineEnd) &&
		typeof value.label === "string" &&
		(value.evidenceState === "timeline-and-media" ||
			value.evidenceState === "timeline-only" ||
			value.evidenceState === "media-only" ||
			value.evidenceState === "manual" ||
			value.evidenceState === "merged") &&
		validThumbnail &&
		isStringArray(value.provenance.sceneIds) &&
		isStringArray(value.provenance.trackIds) &&
		isStringArray(value.provenance.timelineElementIds) &&
		isStringArray(value.provenance.mediaIds) &&
		isStringArray(value.provenance.sourceNodeIds)
	);
}

function isStoryGraphShape(value: unknown): value is StoryGraph {
	if (
		!isRecord(value) ||
		!isRecord(value.derivation) ||
		!isRecord(value.requirements) ||
		!isUnknownArray(value.nodes)
	) {
		return false;
	}
	return (
		value.kind === "visioncut.story-graph" &&
		value.schemaVersion === 1 &&
		typeof value.graphId === "string" &&
		typeof value.projectId === "string" &&
		typeof value.version === "number" &&
		value.derivation.deterministic === true &&
		value.derivation.contentAnalysisPerformed === false &&
		typeof value.derivation.notice === "string" &&
		value.requirements.network === false &&
		value.requirements.paidService === false &&
		value.requirements.apiKey === false &&
		value.nodes.every(isStoryGraphNode)
	);
}

function isBlobOrFile(value: object): boolean {
	if (typeof Blob !== "undefined" && value instanceof Blob) return true;
	return typeof File !== "undefined" && value instanceof File;
}

function assertJsonCompatible({
	value,
	path = "$",
	seen = new Set<object>(),
	inArray = false,
}: {
	value: unknown;
	path?: string;
	seen?: Set<object>;
	inArray?: boolean;
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
			throw new StoryGraphStorageValidationError(
				`${path} contains a non-finite number.`,
			);
		}
		return;
	}
	if (value === undefined && !inArray) return;
	if (
		value === undefined ||
		typeof value === "bigint" ||
		typeof value === "function" ||
		typeof value === "symbol"
	) {
		throw new StoryGraphStorageValidationError(`${path} is not JSON-safe.`);
	}
	if (typeof value !== "object") {
		throw new StoryGraphStorageValidationError(`${path} is not JSON-safe.`);
	}
	if (isBlobOrFile(value)) {
		throw new StoryGraphStorageValidationError(
			`${path} cannot contain File or Blob payloads.`,
		);
	}
	if (seen.has(value)) {
		throw new StoryGraphStorageValidationError(
			`${path} contains a circular reference.`,
		);
	}
	seen.add(value);

	if (Array.isArray(value)) {
		for (const [index, entry] of value.entries()) {
			assertJsonCompatible({
				value: entry,
				path: `${path}[${index}]`,
				seen,
				inArray: true,
			});
		}
		seen.delete(value);
		return;
	}

	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		throw new StoryGraphStorageValidationError(
			`${path} contains a non-plain runtime object.`,
		);
	}
	if (Object.getOwnPropertySymbols(value).length > 0) {
		throw new StoryGraphStorageValidationError(
			`${path} contains symbol properties.`,
		);
	}
	for (const [key, descriptor] of Object.entries(
		Object.getOwnPropertyDescriptors(value),
	)) {
		if (descriptor.get !== undefined || descriptor.set !== undefined) {
			throw new StoryGraphStorageValidationError(
				`${path}.${key} contains an accessor property.`,
			);
		}
		assertJsonCompatible({
			value: descriptor.value,
			path: `${path}.${key}`,
			seen,
		});
	}
	seen.delete(value);
}

function cloneStoryGraphNode({
	node,
}: {
	node: StoryGraphNode;
}): StoryGraphNode {
	return {
		id: node.id,
		...(node.assetId === undefined ? {} : { assetId: node.assetId }),
		...(node.mediaId === undefined ? {} : { mediaId: node.mediaId }),
		timelineStart: node.timelineStart,
		timelineEnd: node.timelineEnd,
		label: node.label,
		evidenceState: node.evidenceState,
		...(node.thumbnail === undefined
			? {}
			: {
					thumbnail: {
						url: node.thumbnail.url,
						sourceAssetId: node.thumbnail.sourceAssetId,
						...(node.thumbnail.width === undefined
							? {}
							: { width: node.thumbnail.width }),
						...(node.thumbnail.height === undefined
							? {}
							: { height: node.thumbnail.height }),
					},
				}),
		provenance: {
			sceneIds: [...node.provenance.sceneIds],
			trackIds: [...node.provenance.trackIds],
			timelineElementIds: [...node.provenance.timelineElementIds],
			mediaIds: [...node.provenance.mediaIds],
			sourceNodeIds: [...node.provenance.sourceNodeIds],
		},
	};
}

function freezeStoryGraph({ graph }: { graph: StoryGraph }): StoryGraph {
	for (const node of graph.nodes) {
		Object.freeze(node.provenance.sceneIds);
		Object.freeze(node.provenance.trackIds);
		Object.freeze(node.provenance.timelineElementIds);
		Object.freeze(node.provenance.mediaIds);
		Object.freeze(node.provenance.sourceNodeIds);
		Object.freeze(node.provenance);
		if (node.thumbnail !== undefined) Object.freeze(node.thumbnail);
		Object.freeze(node);
	}
	Object.freeze(graph.nodes);
	Object.freeze(graph.derivation);
	Object.freeze(graph.requirements);
	return Object.freeze(graph);
}

export function parseStoryGraphForStorage({
	value,
}: {
	value: unknown;
}): StoryGraph | null {
	try {
		assertJsonCompatible({ value });
		if (!isStoryGraphShape(value)) return null;
		assertStoryGraphInvariants({ graph: value });
		const source = value;
		const graph: StoryGraph = {
			kind: source.kind,
			schemaVersion: source.schemaVersion,
			graphId: source.graphId,
			projectId: source.projectId,
			version: source.version,
			derivation: {
				deterministic: source.derivation.deterministic,
				contentAnalysisPerformed: source.derivation.contentAnalysisPerformed,
				notice: source.derivation.notice,
			},
			requirements: {
				network: source.requirements.network,
				paidService: source.requirements.paidService,
				apiKey: source.requirements.apiKey,
			},
			nodes: source.nodes.map((node) => cloneStoryGraphNode({ node })),
		};
		assertStoryGraphInvariants({ graph });
		return freezeStoryGraph({ graph });
	} catch {
		return null;
	}
}

function historiesMatch({
	left,
	right,
}: {
	left: StoryGraph;
	right: StoryGraph;
}): boolean {
	return (
		serializeStoryGraph({ graph: left }) ===
		serializeStoryGraph({ graph: right })
	);
}

function guaranteesMatch(value: unknown): boolean {
	if (!isRecord(value)) return false;
	return (
		value.localOnly === true &&
		value.accountRequired === false &&
		value.network === false &&
		value.paidService === false &&
		value.jsonSafe === true &&
		value.binaryPayloadsStored === false
	);
}

function freezeStoryGraphHistory({
	history,
}: {
	history: StoryGraphHistory;
}): StoryGraphHistory {
	Object.freeze(history.history);
	return Object.freeze(history);
}

export function parseStoryGraphHistory({
	value,
}: {
	value: unknown;
}): StoryGraphHistory | null {
	try {
		assertJsonCompatible({ value });
		if (!isRecord(value)) return null;
		if (
			value.kind !== STORY_GRAPH_HISTORY_KIND ||
			value.schemaVersion !== STORY_GRAPH_HISTORY_SCHEMA_VERSION ||
			typeof value.projectId !== "string" ||
			typeof value.graphId !== "string" ||
			!Array.isArray(value.history) ||
			value.history.length === 0 ||
			!guaranteesMatch(value.guarantees)
		) {
			return null;
		}
		const projectId = normalizeProjectId({ projectId: value.projectId });
		if (projectId !== value.projectId) return null;
		const history: StoryGraph[] = [];
		for (const candidate of value.history) {
			const graph = parseStoryGraphForStorage({ value: candidate });
			if (graph === null) return null;
			history.push(graph);
		}
		for (const [index, graph] of history.entries()) {
			if (
				graph.projectId !== projectId ||
				graph.graphId !== value.graphId ||
				graph.version !== index + 1
			) {
				return null;
			}
		}
		const suppliedCurrent = parseStoryGraphForStorage({ value: value.current });
		const current = history.at(-1);
		if (
			suppliedCurrent === null ||
			current === undefined ||
			!historiesMatch({ left: suppliedCurrent, right: current })
		) {
			return null;
		}
		return freezeStoryGraphHistory({
			history: {
				kind: STORY_GRAPH_HISTORY_KIND,
				schemaVersion: STORY_GRAPH_HISTORY_SCHEMA_VERSION,
				projectId,
				graphId: current.graphId,
				current,
				history,
				guarantees: STORAGE_GUARANTEES,
			},
		});
	} catch {
		return null;
	}
}

export function assertStoryGraphHistoryInvariants({
	history,
}: {
	history: StoryGraphHistory;
}): void {
	if (parseStoryGraphHistory({ value: history }) === null) {
		throw new StoryGraphStorageValidationError(
			"Story Graph history is malformed or non-contiguous.",
		);
	}
}

function buildStoryGraphHistory({
	projectId,
	history,
}: {
	projectId: string;
	history: readonly StoryGraph[];
}): StoryGraphHistory {
	const current = history.at(-1);
	if (current === undefined) {
		throw new StoryGraphStorageValidationError(
			"Story Graph history cannot be empty.",
		);
	}
	const candidate: StoryGraphHistory = {
		kind: STORY_GRAPH_HISTORY_KIND,
		schemaVersion: STORY_GRAPH_HISTORY_SCHEMA_VERSION,
		projectId,
		graphId: current.graphId,
		current,
		history,
		guarantees: STORAGE_GUARANTEES,
	};
	const parsed = parseStoryGraphHistory({ value: candidate });
	if (parsed === null) {
		throw new StoryGraphStorageValidationError(
			"Story Graph history is malformed or non-contiguous.",
		);
	}
	return parsed;
}

function parseStoredHistory({
	value,
	projectId,
}: {
	value: unknown | null;
	projectId: string;
}): StoryGraphHistory | null {
	if (value === null) return null;
	const history = parseStoryGraphHistory({ value });
	if (history === null) {
		throw new StoryGraphStorageValidationError(
			"Stored Story Graph history is malformed.",
		);
	}
	if (history.projectId !== projectId) {
		throw new StoryGraphStorageValidationError(
			"Stored Story Graph history belongs to another project.",
		);
	}
	return history;
}

function appendToHistory({
	history,
	projectId,
	graph,
	expectedCurrentVersion,
}: {
	history: StoryGraphHistory | null;
	projectId: string;
	graph: StoryGraph;
	expectedCurrentVersion: number;
}): StoryGraphHistory {
	if (!Number.isInteger(expectedCurrentVersion) || expectedCurrentVersion < 0) {
		throw new StoryGraphStorageValidationError(
			"Expected Story Graph version must be a non-negative integer.",
		);
	}
	const validatedGraph = parseStoryGraphForStorage({ value: graph });
	if (validatedGraph === null) {
		throw new StoryGraphStorageValidationError(
			"Cannot persist an invalid or non-JSON-safe Story Graph.",
		);
	}
	if (validatedGraph.projectId !== projectId) {
		throw new StoryGraphStorageValidationError(
			"Cannot persist a Story Graph for another project.",
		);
	}
	const currentVersion = history?.current.version ?? 0;
	if (currentVersion !== expectedCurrentVersion) {
		throw new StoryGraphVersionConflictError(
			`Story Graph changed from version ${expectedCurrentVersion} to ${currentVersion} before the write completed.`,
		);
	}
	if (validatedGraph.version !== expectedCurrentVersion + 1) {
		throw new StoryGraphVersionConflictError(
			"Appended Story Graph does not continue the current version history.",
		);
	}
	if (history !== null && validatedGraph.graphId !== history.graphId) {
		throw new StoryGraphStorageValidationError(
			"Appended Story Graph identity does not match the project history.",
		);
	}
	return buildStoryGraphHistory({
		projectId,
		history: [
			...(history?.history ?? EMPTY_STORY_GRAPH_HISTORY),
			validatedGraph,
		],
	});
}

function cloneStorageValue({ value }: { value: unknown }): unknown {
	return structuredClone(value);
}

export class MemoryStoryGraphStorage implements StoryGraphStorageAdapter {
	private readonly values = new Map<string, unknown>();

	constructor({
		entries = [],
	}: {
		entries?: readonly StoryGraphStorageEntry[];
	} = {}) {
		for (const entry of entries) {
			this.values.set(
				normalizeProjectId({ projectId: entry.projectId }),
				cloneStorageValue({ value: entry.value }),
			);
		}
	}

	async read({ projectId }: { projectId: string }): Promise<unknown | null> {
		const stored = this.values.get(normalizeProjectId({ projectId }));
		return stored === undefined ? null : cloneStorageValue({ value: stored });
	}

	async append({
		projectId,
		graph,
		expectedCurrentVersion,
	}: {
		projectId: string;
		graph: StoryGraph;
		expectedCurrentVersion: number;
	}): Promise<void> {
		const normalizedProjectId = normalizeProjectId({ projectId });
		const stored = this.values.get(normalizedProjectId);
		const history = parseStoredHistory({
			value: stored === undefined ? null : stored,
			projectId: normalizedProjectId,
		});
		const next = appendToHistory({
			history,
			projectId: normalizedProjectId,
			graph,
			expectedCurrentVersion,
		});
		this.values.set(normalizedProjectId, cloneStorageValue({ value: next }));
	}

	async deleteProject({ projectId }: { projectId: string }): Promise<void> {
		this.values.delete(normalizeProjectId({ projectId }));
	}
}

export class IndexedDBStoryGraphStorage implements StoryGraphStorageAdapter {
	private readonly databaseName: string;
	private readonly storeName: string;
	private readonly databaseVersion: number;
	private readonly indexedDBFactory: IDBFactory | null | undefined;
	private readonly fallback: StoryGraphStorageAdapter;

	constructor({
		databaseName = "visioncut-story-graphs",
		storeName = "project-story-graph-history",
		databaseVersion = 1,
		indexedDBFactory,
		fallback = new MemoryStoryGraphStorage(),
	}: {
		databaseName?: string;
		storeName?: string;
		databaseVersion?: number;
		indexedDBFactory?: IDBFactory | null;
		fallback?: StoryGraphStorageAdapter;
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
				reject(new Error("Story Graph IndexedDB open request was blocked."));
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
		graph,
		expectedCurrentVersion,
	}: {
		projectId: string;
		graph: StoryGraph;
		expectedCurrentVersion: number;
	}): Promise<boolean> {
		const database = await this.openDatabase();
		if (database === null) return false;
		try {
			await new Promise<void>((resolve, reject) => {
				const transaction = database.transaction(this.storeName, "readwrite");
				const store = transaction.objectStore(this.storeName);
				const request = store.get(projectId);
				let settled = false;
				const rejectOnce = (error: unknown) => {
					if (settled) return;
					settled = true;
					reject(error);
				};

				transaction.oncomplete = () => {
					if (settled) return;
					settled = true;
					resolve();
				};
				transaction.onerror = () => rejectOnce(transaction.error);
				transaction.onabort = () => rejectOnce(transaction.error);
				request.onerror = () => rejectOnce(request.error);
				request.onsuccess = () => {
					try {
						const stored: unknown | null =
							request.result === undefined ? null : request.result;
						const history = parseStoredHistory({
							value: stored,
							projectId,
						});
						const next = appendToHistory({
							history,
							projectId,
							graph,
							expectedCurrentVersion,
						});
						store.put(next, projectId);
					} catch (error) {
						rejectOnce(error);
						try {
							transaction.abort();
						} catch {
							// The transaction may already have aborted after the request error.
						}
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

	async read({ projectId }: { projectId: string }): Promise<unknown | null> {
		const normalizedProjectId = normalizeProjectId({ projectId });
		try {
			const stored = await this.readFromDatabase({
				projectId: normalizedProjectId,
			});
			if (stored !== null) return stored;
		} catch {
			// Restricted browser contexts can deny IndexedDB entirely.
		}
		return this.fallback.read({ projectId: normalizedProjectId });
	}

	async append({
		projectId,
		graph,
		expectedCurrentVersion,
	}: {
		projectId: string;
		graph: StoryGraph;
		expectedCurrentVersion: number;
	}): Promise<void> {
		const normalizedProjectId = normalizeProjectId({ projectId });
		try {
			const persisted = await this.appendToDatabase({
				projectId: normalizedProjectId,
				graph,
				expectedCurrentVersion,
			});
			if (persisted) {
				await this.fallback.deleteProject({
					projectId: normalizedProjectId,
				});
				return;
			}
		} catch (error) {
			if (
				error instanceof StoryGraphStorageValidationError ||
				error instanceof StoryGraphVersionConflictError
			) {
				throw error;
			}
			// Operational IndexedDB failures use the in-session local fallback.
		}
		await this.fallback.append({
			projectId: normalizedProjectId,
			graph,
			expectedCurrentVersion,
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

const defaultStoryGraphStorage = new IndexedDBStoryGraphStorage();

export async function loadStoryGraphHistory({
	projectId,
	storage = defaultStoryGraphStorage,
}: {
	projectId: string;
	storage?: StoryGraphStorageAdapter;
}): Promise<StoryGraphHistory | null> {
	const normalizedProjectId = normalizeProjectId({ projectId });
	const stored = await storage.read({ projectId: normalizedProjectId });
	return parseStoredHistory({
		value: stored,
		projectId: normalizedProjectId,
	});
}

export async function loadStoryGraph({
	projectId,
	version,
	storage = defaultStoryGraphStorage,
}: {
	projectId: string;
	version?: number;
	storage?: StoryGraphStorageAdapter;
}): Promise<StoryGraph | null> {
	const stored = await loadStoryGraphHistory({ projectId, storage });
	if (stored === null) return null;
	if (version === undefined) return stored.current;
	if (!Number.isInteger(version) || version < 1) {
		throw new StoryGraphStorageValidationError(
			"Requested Story Graph version must be a positive integer.",
		);
	}
	return stored.history.find((graph) => graph.version === version) ?? null;
}

export async function listStoryGraphVersions({
	projectId,
	storage = defaultStoryGraphStorage,
}: {
	projectId: string;
	storage?: StoryGraphStorageAdapter;
}): Promise<readonly StoryGraph[]> {
	const stored = await loadStoryGraphHistory({ projectId, storage });
	return stored?.history ?? EMPTY_STORY_GRAPH_HISTORY;
}

export async function appendStoryGraphVersion({
	projectId,
	graph,
	expectedCurrentVersion,
	storage = defaultStoryGraphStorage,
}: {
	projectId: string;
	graph: StoryGraph;
	expectedCurrentVersion: number;
	storage?: StoryGraphStorageAdapter;
}): Promise<StoryGraph> {
	const normalizedProjectId = normalizeProjectId({ projectId });
	const validatedGraph = parseStoryGraphForStorage({ value: graph });
	if (validatedGraph === null) {
		throw new StoryGraphStorageValidationError(
			"Cannot persist an invalid or non-JSON-safe Story Graph.",
		);
	}
	await storage.append({
		projectId: normalizedProjectId,
		graph: validatedGraph,
		expectedCurrentVersion,
	});
	return validatedGraph;
}

export async function deleteStoryGraphHistory({
	projectId,
	storage = defaultStoryGraphStorage,
}: {
	projectId: string;
	storage?: StoryGraphStorageAdapter;
}): Promise<void> {
	await storage.deleteProject({
		projectId: normalizeProjectId({ projectId }),
	});
}

export function serializeStoryGraphHistory({
	history,
}: {
	history: StoryGraphHistory;
}): string {
	const parsed = parseStoryGraphHistory({ value: history });
	if (parsed === null) {
		throw new StoryGraphStorageValidationError(
			"Cannot serialize malformed Story Graph history.",
		);
	}
	return JSON.stringify(parsed, null, 2);
}

export async function exportStoryGraphHistory({
	projectId,
	storage = defaultStoryGraphStorage,
}: {
	projectId: string;
	storage?: StoryGraphStorageAdapter;
}): Promise<string> {
	const history = await loadStoryGraphHistory({ projectId, storage });
	if (history === null) {
		throw new StoryGraphStorageValidationError(
			"Cannot export a project without Story Graph history.",
		);
	}
	return serializeStoryGraphHistory({ history });
}
