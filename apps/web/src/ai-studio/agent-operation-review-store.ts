import {
	agentOperationLedgerIdForSession,
	assertAgentOperationReviewLedgerIntegrity,
	parseAgentOperationReviewLedger,
	type AgentOperationReviewLedger,
} from "./agent-operation-review";
import type { AgentRuntimeSession } from "./agent-runtime";

export interface AgentOperationReviewStorageAdapter {
	readLedger({ ledgerId }: { ledgerId: string }): Promise<unknown | null>;
	writeLedger({
		ledgerId,
		value,
		expectedRevision,
	}: {
		ledgerId: string;
		value: AgentOperationReviewLedger;
		expectedRevision: number;
	}): Promise<void>;
}

export class AgentOperationReviewStorageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentOperationReviewStorageError";
	}
}

export class AgentOperationReviewStorageConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentOperationReviewStorageConflictError";
	}
}

function cloneValue<T>(value: T): T {
	return structuredClone(value);
}

function storedRevision(value: unknown | null): number {
	if (value === null) return 0;
	const ledger = parseAgentOperationReviewLedger({ value });
	if (ledger === null) {
		throw new AgentOperationReviewStorageError(
			"Stored operation review ledger is malformed.",
		);
	}
	return ledger.revision;
}

export class MemoryAgentOperationReviewStorage implements AgentOperationReviewStorageAdapter {
	private readonly values = new Map<string, unknown>();

	async readLedger({
		ledgerId,
	}: {
		ledgerId: string;
	}): Promise<unknown | null> {
		const value = this.values.get(ledgerId);
		return value === undefined ? null : cloneValue(value);
	}

	async writeLedger({
		ledgerId,
		value,
		expectedRevision,
	}: {
		ledgerId: string;
		value: AgentOperationReviewLedger;
		expectedRevision: number;
	}): Promise<void> {
		assertAgentOperationReviewLedgerIntegrity(value);
		if (value.ledgerId !== ledgerId) {
			throw new AgentOperationReviewStorageError("Ledger key does not match.");
		}
		const current = this.values.get(ledgerId) ?? null;
		if (storedRevision(current) !== expectedRevision) {
			throw new AgentOperationReviewStorageConflictError(
				"Operation review ledger changed before this update was saved.",
			);
		}
		if (value.revision !== expectedRevision + 1) {
			throw new AgentOperationReviewStorageConflictError(
				"Operation review revisions must be contiguous.",
			);
		}
		this.values.set(ledgerId, cloneValue(value));
	}
}

export class IndexedDBAgentOperationReviewStorage implements AgentOperationReviewStorageAdapter {
	private readonly fallback: AgentOperationReviewStorageAdapter;

	constructor(
		private readonly options: {
			readonly databaseName?: string;
			readonly storeName?: string;
			readonly indexedDBFactory?: IDBFactory | null;
			readonly fallback?: AgentOperationReviewStorageAdapter;
		} = {},
	) {
		this.fallback = options.fallback ?? new MemoryAgentOperationReviewStorage();
	}

	private factory(): IDBFactory | null {
		if (this.options.indexedDBFactory !== undefined) {
			return this.options.indexedDBFactory;
		}
		return typeof indexedDB === "undefined" ? null : indexedDB;
	}

	private storeName(): string {
		return this.options.storeName ?? "operation-review-ledgers";
	}

	private async open(): Promise<IDBDatabase | null> {
		const factory = this.factory();
		if (factory === null) return null;
		return new Promise((resolve, reject) => {
			const request = factory.open(
				this.options.databaseName ?? "visioncut-agent-operation-review",
				1,
			);
			request.onerror = () => reject(request.error);
			request.onblocked = () =>
				reject(new Error("Operation review storage is blocked."));
			request.onupgradeneeded = () => {
				if (!request.result.objectStoreNames.contains(this.storeName())) {
					request.result.createObjectStore(this.storeName());
				}
			};
			request.onsuccess = () => resolve(request.result);
		});
	}

	async readLedger({
		ledgerId,
	}: {
		ledgerId: string;
	}): Promise<unknown | null> {
		const database = await this.open().catch(() => null);
		if (database === null) return this.fallback.readLedger({ ledgerId });
		try {
			const value = await new Promise<unknown | null>((resolve, reject) => {
				const request = database
					.transaction(this.storeName(), "readonly")
					.objectStore(this.storeName())
					.get(ledgerId);
				request.onerror = () => reject(request.error);
				request.onsuccess = () =>
					resolve(request.result === undefined ? null : request.result);
			});
			if (value !== null) return value;
		} catch {
			// Restricted or transient IndexedDB access uses the in-session fallback.
		} finally {
			database.close();
		}
		return this.fallback.readLedger({ ledgerId });
	}

	async writeLedger({
		ledgerId,
		value,
		expectedRevision,
	}: {
		ledgerId: string;
		value: AgentOperationReviewLedger;
		expectedRevision: number;
	}): Promise<void> {
		assertAgentOperationReviewLedgerIntegrity(value);
		if (value.ledgerId !== ledgerId) {
			throw new AgentOperationReviewStorageError("Ledger key does not match.");
		}
		const database = await this.open().catch(() => null);
		if (database === null) {
			return this.fallback.writeLedger({
				ledgerId,
				value,
				expectedRevision,
			});
		}
		try {
			await new Promise<void>((resolve, reject) => {
				const transaction = database.transaction(this.storeName(), "readwrite");
				const store = transaction.objectStore(this.storeName());
				const request = store.get(ledgerId);
				let settled = false;
				const fail = (error: unknown) => {
					if (settled) return;
					settled = true;
					reject(error);
				};
				request.onerror = () => fail(request.error);
				request.onsuccess = () => {
					try {
						if (storedRevision(request.result ?? null) !== expectedRevision) {
							throw new AgentOperationReviewStorageConflictError(
								"Operation review ledger changed before this update was saved.",
							);
						}
						if (value.revision !== expectedRevision + 1) {
							throw new AgentOperationReviewStorageConflictError(
								"Operation review revisions must be contiguous.",
							);
						}
						store.put(value, ledgerId);
					} catch (error) {
						fail(error);
						transaction.abort();
					}
				};
				transaction.onerror = () => fail(transaction.error);
				transaction.onabort = () =>
					fail(transaction.error ?? new Error("Review transaction aborted."));
				transaction.oncomplete = () => {
					if (settled) return;
					settled = true;
					resolve();
				};
			});
		} catch (error) {
			if (error instanceof AgentOperationReviewStorageConflictError)
				throw error;
			return this.fallback.writeLedger({
				ledgerId,
				value,
				expectedRevision,
			});
		} finally {
			database.close();
		}
	}
}

const defaultStorage = new IndexedDBAgentOperationReviewStorage();

export async function saveAgentOperationReviewLedger({
	ledger,
	storage = defaultStorage,
}: {
	ledger: AgentOperationReviewLedger;
	storage?: AgentOperationReviewStorageAdapter;
}): Promise<AgentOperationReviewLedger> {
	assertAgentOperationReviewLedgerIntegrity(ledger);
	const stored = await storage.readLedger({ ledgerId: ledger.ledgerId });
	const current =
		stored === null ? null : parseAgentOperationReviewLedger({ value: stored });
	if (stored !== null && current === null) {
		throw new AgentOperationReviewStorageError(
			"Stored operation review ledger is malformed.",
		);
	}
	if (current?.revision === ledger.revision) {
		if (JSON.stringify(current) !== JSON.stringify(ledger)) {
			throw new AgentOperationReviewStorageConflictError(
				"The same review revision contains different audit data.",
			);
		}
		return current;
	}
	const expectedRevision = current?.revision ?? 0;
	if (ledger.revision !== expectedRevision + 1) {
		throw new AgentOperationReviewStorageConflictError(
			"Operation review updates must be saved in revision order.",
		);
	}
	await storage.writeLedger({
		ledgerId: ledger.ledgerId,
		value: ledger,
		expectedRevision,
	});
	return ledger;
}

export async function loadAgentOperationReviewLedger({
	session,
	storage = defaultStorage,
}: {
	session: AgentRuntimeSession;
	storage?: AgentOperationReviewStorageAdapter;
}): Promise<AgentOperationReviewLedger | null> {
	const ledgerId = agentOperationLedgerIdForSession({ session });
	const stored = await storage.readLedger({ ledgerId });
	if (stored === null) return null;
	const ledger = parseAgentOperationReviewLedger({ value: stored });
	if (ledger === null) {
		throw new AgentOperationReviewStorageError(
			"Stored operation review ledger is malformed.",
		);
	}
	if (
		ledger.projectId !== session.projectId ||
		ledger.sessionId !== session.sessionId ||
		ledger.mergeFingerprint !== session.merge.fingerprint
	) {
		throw new AgentOperationReviewStorageError(
			"Stored operation review ledger belongs to another runtime snapshot.",
		);
	}
	return ledger;
}
