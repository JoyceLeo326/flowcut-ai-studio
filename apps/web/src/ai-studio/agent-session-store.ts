import {
	assertAgentAuditSafe,
	parseAgentRuntimeSession,
	type AgentRuntimeSession,
} from "./agent-runtime";

export const AGENT_SESSION_COLLECTION_KIND =
	"visioncut.agent-session-collection" as const;
export const AGENT_SESSION_COLLECTION_SCHEMA_VERSION = 1 as const;

const MAX_PROJECT_SESSIONS = 250;

export interface AgentSessionCollection {
	readonly kind: typeof AGENT_SESSION_COLLECTION_KIND;
	readonly schemaVersion: typeof AGENT_SESSION_COLLECTION_SCHEMA_VERSION;
	readonly projectId: string;
	readonly revision: number;
	readonly sessions: readonly AgentRuntimeSession[];
	readonly guarantees: {
		readonly indexedDbPreferred: true;
		readonly memoryFallback: true;
		readonly apiKeysStored: false;
		readonly binaryPayloadsStored: false;
		readonly projectScoped: true;
	};
}

export interface AgentSessionStorageAdapter {
	readProject({ projectId }: { projectId: string }): Promise<unknown | null>;
	writeProject({
		projectId,
		value,
		expectedRevision,
	}: {
		projectId: string;
		value: AgentSessionCollection;
		expectedRevision: number;
	}): Promise<void>;
	deleteProject({ projectId }: { projectId: string }): Promise<void>;
}

export class AgentSessionStorageValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentSessionStorageValidationError";
	}
}

export class AgentSessionStorageConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentSessionStorageConflictError";
	}
}

const GUARANTEES = Object.freeze({
	indexedDbPreferred: true,
	memoryFallback: true,
	apiKeysStored: false,
	binaryPayloadsStored: false,
	projectScoped: true,
} as const);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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

function cloneValue<T>(value: T): T {
	return structuredClone(value);
}

function normalizeProjectId(value: string): string {
	if (typeof value !== "string") {
		throw new AgentSessionStorageValidationError(
			"Project id must be a string.",
		);
	}
	const normalized = value.normalize("NFKC").trim();
	if (
		!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(normalized) ||
		normalized.length > 240
	) {
		throw new AgentSessionStorageValidationError("Project id is invalid.");
	}
	return normalized;
}

function guaranteesMatch(value: unknown): boolean {
	return (
		isRecord(value) &&
		value.indexedDbPreferred === true &&
		value.memoryFallback === true &&
		value.apiKeysStored === false &&
		value.binaryPayloadsStored === false &&
		value.projectScoped === true
	);
}

export function parseAgentSessionCollection({
	value,
}: {
	value: unknown;
}): AgentSessionCollection | null {
	try {
		assertAgentAuditSafe({ value });
		if (
			!isRecord(value) ||
			value.kind !== AGENT_SESSION_COLLECTION_KIND ||
			value.schemaVersion !== AGENT_SESSION_COLLECTION_SCHEMA_VERSION ||
			typeof value.projectId !== "string" ||
			!Number.isSafeInteger(value.revision) ||
			Number(value.revision) < 1 ||
			!Array.isArray(value.sessions) ||
			value.sessions.length === 0 ||
			value.sessions.length > MAX_PROJECT_SESSIONS ||
			!guaranteesMatch(value.guarantees)
		) {
			return null;
		}
		const projectId = normalizeProjectId(value.projectId);
		const sessions: AgentRuntimeSession[] = [];
		const sessionIds = new Set<string>();
		let previousCreatedAt = -Infinity;
		for (const candidate of value.sessions) {
			const session = parseAgentRuntimeSession({ value: candidate });
			if (
				session === null ||
				session.projectId !== projectId ||
				sessionIds.has(session.sessionId)
			) {
				return null;
			}
			const createdAt = Date.parse(session.createdAt);
			if (createdAt < previousCreatedAt) return null;
			previousCreatedAt = createdAt;
			sessionIds.add(session.sessionId);
			sessions.push(session);
		}
		return deepFreeze({
			kind: AGENT_SESSION_COLLECTION_KIND,
			schemaVersion: AGENT_SESSION_COLLECTION_SCHEMA_VERSION,
			projectId,
			revision: Number(value.revision),
			sessions,
			guarantees: GUARANTEES,
		});
	} catch {
		return null;
	}
}

function collectionRevision(value: unknown | null): number {
	if (value === null) return 0;
	const collection = parseAgentSessionCollection({ value });
	if (collection === null) {
		throw new AgentSessionStorageValidationError(
			"Stored agent session collection is malformed.",
		);
	}
	return collection.revision;
}

function emptyCollection(projectId: string): AgentSessionCollection | null {
	void projectId;
	return null;
}

export class MemoryAgentSessionStorage implements AgentSessionStorageAdapter {
	private readonly values = new Map<string, unknown>();

	async readProject({
		projectId,
	}: {
		projectId: string;
	}): Promise<unknown | null> {
		const value = this.values.get(normalizeProjectId(projectId));
		return value === undefined ? null : cloneValue(value);
	}

	async writeProject({
		projectId,
		value,
		expectedRevision,
	}: {
		projectId: string;
		value: AgentSessionCollection;
		expectedRevision: number;
	}): Promise<void> {
		const normalizedProjectId = normalizeProjectId(projectId);
		const parsed = parseAgentSessionCollection({ value });
		if (parsed === null || parsed.projectId !== normalizedProjectId) {
			throw new AgentSessionStorageValidationError(
				"Agent session collection failed validation.",
			);
		}
		const stored = this.values.get(normalizedProjectId) ?? null;
		if (collectionRevision(stored) !== expectedRevision) {
			throw new AgentSessionStorageConflictError(
				"Agent session collection changed before this update was saved.",
			);
		}
		if (parsed.revision !== expectedRevision + 1) {
			throw new AgentSessionStorageConflictError(
				"Agent session collection revision is not contiguous.",
			);
		}
		this.values.set(normalizedProjectId, cloneValue(parsed));
	}

	async deleteProject({ projectId }: { projectId: string }): Promise<void> {
		this.values.delete(normalizeProjectId(projectId));
	}
}

export class IndexedDBAgentSessionStorage implements AgentSessionStorageAdapter {
	private readonly fallback: AgentSessionStorageAdapter;

	constructor(
		private readonly options: {
			readonly databaseName?: string;
			readonly storeName?: string;
			readonly indexedDBFactory?: IDBFactory | null;
			readonly fallback?: AgentSessionStorageAdapter;
		} = {},
	) {
		this.fallback = options.fallback ?? new MemoryAgentSessionStorage();
	}

	private factory(): IDBFactory | null {
		if (this.options.indexedDBFactory !== undefined) {
			return this.options.indexedDBFactory;
		}
		return typeof indexedDB === "undefined" ? null : indexedDB;
	}

	private storeName(): string {
		return this.options.storeName ?? "project-agent-sessions";
	}

	private async open(): Promise<IDBDatabase | null> {
		const factory = this.factory();
		if (factory === null) return null;
		return new Promise((resolve, reject) => {
			const request = factory.open(
				this.options.databaseName ?? "visioncut-agent-sessions",
				1,
			);
			request.onerror = () => reject(request.error);
			request.onblocked = () =>
				reject(new Error("Agent session storage is blocked."));
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
		const normalizedProjectId = normalizeProjectId(projectId);
		const database = await this.open().catch(() => null);
		if (database === null) {
			return this.fallback.readProject({ projectId: normalizedProjectId });
		}
		try {
			const value = await new Promise<unknown | null>((resolve, reject) => {
				const request = database
					.transaction(this.storeName(), "readonly")
					.objectStore(this.storeName())
					.get(normalizedProjectId);
				request.onerror = () => reject(request.error);
				request.onsuccess = () =>
					resolve(request.result === undefined ? null : request.result);
			});
			if (value !== null) return value;
		} catch {
			// Restricted or transient browser storage falls back to memory.
		} finally {
			database.close();
		}
		return this.fallback.readProject({ projectId: normalizedProjectId });
	}

	async writeProject({
		projectId,
		value,
		expectedRevision,
	}: {
		projectId: string;
		value: AgentSessionCollection;
		expectedRevision: number;
	}): Promise<void> {
		const normalizedProjectId = normalizeProjectId(projectId);
		const parsed = parseAgentSessionCollection({ value });
		if (parsed === null || parsed.projectId !== normalizedProjectId) {
			throw new AgentSessionStorageValidationError(
				"Agent session collection failed validation.",
			);
		}
		const database = await this.open().catch(() => null);
		if (database === null) {
			return this.fallback.writeProject({
				projectId: normalizedProjectId,
				value: parsed,
				expectedRevision,
			});
		}
		try {
			await new Promise<void>((resolve, reject) => {
				const transaction = database.transaction(this.storeName(), "readwrite");
				const store = transaction.objectStore(this.storeName());
				const request = store.get(normalizedProjectId);
				let settled = false;
				const fail = (error: unknown) => {
					if (settled) return;
					settled = true;
					reject(error);
				};
				request.onerror = () => fail(request.error);
				request.onsuccess = () => {
					try {
						const storedRevision = collectionRevision(request.result ?? null);
						if (storedRevision !== expectedRevision) {
							throw new AgentSessionStorageConflictError(
								"Agent session collection changed before this update was saved.",
							);
						}
						if (parsed.revision !== expectedRevision + 1) {
							throw new AgentSessionStorageConflictError(
								"Agent session collection revision is not contiguous.",
							);
						}
						store.put(parsed, normalizedProjectId);
					} catch (error) {
						fail(error);
						transaction.abort();
					}
				};
				transaction.onerror = () => fail(transaction.error);
				transaction.onabort = () =>
					fail(
						transaction.error ??
							new Error("Agent session transaction was aborted."),
					);
				transaction.oncomplete = () => {
					if (settled) return;
					settled = true;
					resolve();
				};
			});
		} catch (error) {
			if (error instanceof AgentSessionStorageConflictError) throw error;
			await this.fallback.writeProject({
				projectId: normalizedProjectId,
				value: parsed,
				expectedRevision,
			});
		} finally {
			database.close();
		}
	}

	async deleteProject({ projectId }: { projectId: string }): Promise<void> {
		const normalizedProjectId = normalizeProjectId(projectId);
		const database = await this.open().catch(() => null);
		if (database !== null) {
			try {
				await new Promise<void>((resolve, reject) => {
					const request = database
						.transaction(this.storeName(), "readwrite")
						.objectStore(this.storeName())
						.delete(normalizedProjectId);
					request.onerror = () => reject(request.error);
					request.onsuccess = () => resolve();
				});
			} catch {
				// The fallback is still cleared below.
			} finally {
				database.close();
			}
		}
		await this.fallback.deleteProject({ projectId: normalizedProjectId });
	}
}

function createCollection({
	projectId,
	revision,
	sessions,
}: {
	projectId: string;
	revision: number;
	sessions: readonly AgentRuntimeSession[];
}): AgentSessionCollection {
	const value: AgentSessionCollection = {
		kind: AGENT_SESSION_COLLECTION_KIND,
		schemaVersion: AGENT_SESSION_COLLECTION_SCHEMA_VERSION,
		projectId,
		revision,
		sessions,
		guarantees: GUARANTEES,
	};
	const parsed = parseAgentSessionCollection({ value });
	if (parsed === null) {
		throw new AgentSessionStorageValidationError(
			"Agent session collection could not be constructed.",
		);
	}
	return parsed;
}

async function readCollection({
	projectId,
	storage,
}: {
	projectId: string;
	storage: AgentSessionStorageAdapter;
}): Promise<AgentSessionCollection | null> {
	const value = await storage.readProject({ projectId });
	if (value === null) return emptyCollection(projectId);
	const parsed = parseAgentSessionCollection({ value });
	if (parsed === null) {
		throw new AgentSessionStorageValidationError(
			"Stored agent session collection is malformed.",
		);
	}
	return parsed;
}

const defaultStorage = new IndexedDBAgentSessionStorage();

export async function saveAgentRuntimeSession({
	session,
	storage = defaultStorage,
}: {
	session: AgentRuntimeSession;
	storage?: AgentSessionStorageAdapter;
}): Promise<AgentRuntimeSession> {
	assertAgentAuditSafe({ value: session });
	const parsedSession = parseAgentRuntimeSession({ value: session });
	if (parsedSession === null) {
		throw new AgentSessionStorageValidationError(
			"Agent runtime session failed validation.",
		);
	}
	const projectId = normalizeProjectId(parsedSession.projectId);
	const current = await readCollection({ projectId, storage });
	const currentRevision = current?.revision ?? 0;
	const sessions = [...(current?.sessions ?? [])];
	const existingIndex = sessions.findIndex(
		(candidate) => candidate.sessionId === parsedSession.sessionId,
	);
	if (existingIndex >= 0) {
		const existing = sessions[existingIndex];
		if (existing.revision === parsedSession.revision) {
			if (JSON.stringify(existing) !== JSON.stringify(parsedSession)) {
				throw new AgentSessionStorageConflictError(
					"The same session revision contains different audit data.",
				);
			}
			return existing;
		}
		if (parsedSession.revision !== existing.revision + 1) {
			throw new AgentSessionStorageConflictError(
				"Agent runtime session updates must be saved in revision order.",
			);
		}
		sessions[existingIndex] = parsedSession;
	} else {
		if (parsedSession.revision < 1) {
			throw new AgentSessionStorageConflictError(
				"A new agent runtime session must start at revision one or later.",
			);
		}
		sessions.push(parsedSession);
	}
	sessions.sort(
		(left, right) =>
			Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
			left.sessionId.localeCompare(right.sessionId),
	);
	if (sessions.length > MAX_PROJECT_SESSIONS) {
		sessions.splice(0, sessions.length - MAX_PROJECT_SESSIONS);
	}
	const next = createCollection({
		projectId,
		revision: currentRevision + 1,
		sessions,
	});
	await storage.writeProject({
		projectId,
		value: next,
		expectedRevision: currentRevision,
	});
	return (
		next.sessions.find(
			(candidate) => candidate.sessionId === parsedSession.sessionId,
		) ?? parsedSession
	);
}

export async function loadAgentRuntimeSession({
	projectId,
	sessionId,
	storage = defaultStorage,
}: {
	projectId: string;
	sessionId: string;
	storage?: AgentSessionStorageAdapter;
}): Promise<AgentRuntimeSession | null> {
	const collection = await readCollection({
		projectId: normalizeProjectId(projectId),
		storage,
	});
	return (
		collection?.sessions.find((session) => session.sessionId === sessionId) ??
		null
	);
}

export async function listProjectAgentRuntimeSessions({
	projectId,
	orchestrationId,
	storage = defaultStorage,
}: {
	projectId: string;
	orchestrationId?: string;
	storage?: AgentSessionStorageAdapter;
}): Promise<readonly AgentRuntimeSession[]> {
	const collection = await readCollection({
		projectId: normalizeProjectId(projectId),
		storage,
	});
	const sessions =
		collection?.sessions.filter(
			(session) =>
				orchestrationId === undefined ||
				session.orchestrationId === orchestrationId,
		) ?? [];
	return deepFreeze([...sessions].reverse());
}

export async function clearProjectAgentRuntimeSessions({
	projectId,
	storage = defaultStorage,
}: {
	projectId: string;
	storage?: AgentSessionStorageAdapter;
}): Promise<void> {
	await storage.deleteProject({ projectId: normalizeProjectId(projectId) });
}
