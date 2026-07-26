import {
	parseMediaIndex,
	serializeMediaIndex,
	type MediaIndex,
} from "./media-index";

export const MEDIA_INDEX_HISTORY_KIND =
	"visioncut.media-index-history" as const;
export const MEDIA_INDEX_HISTORY_SCHEMA_VERSION = 1 as const;

export interface MediaIndexHistoryRecord {
	readonly projectId: string;
	readonly assetId: string;
	readonly assetFingerprint: string;
	readonly createdAt: string;
	readonly index: MediaIndex;
}

export interface MediaIndexHistory {
	readonly kind: typeof MEDIA_INDEX_HISTORY_KIND;
	readonly schemaVersion: typeof MEDIA_INDEX_HISTORY_SCHEMA_VERSION;
	readonly projectId: string;
	readonly assetId: string;
	readonly currentMediaIndexId: string;
	readonly records: readonly MediaIndexHistoryRecord[];
	readonly guarantees: {
		readonly localOnly: true;
		readonly accountRequired: false;
		readonly network: false;
		readonly paidService: false;
		readonly binaryPayloadsStored: false;
	};
}

export interface MediaIndexStorageAdapter {
	read({
		projectId,
		assetId,
	}: {
		projectId: string;
		assetId: string;
	}): Promise<unknown | null>;
	write({
		projectId,
		assetId,
		value,
		expectedCurrentMediaIndexId,
	}: {
		projectId: string;
		assetId: string;
		value: MediaIndexHistory;
		expectedCurrentMediaIndexId: string | null;
	}): Promise<void>;
	deleteProject({ projectId }: { projectId: string }): Promise<void>;
}

export class MediaIndexStorageValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MediaIndexStorageValidationError";
	}
}

export class MediaIndexStorageConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "MediaIndexStorageConflictError";
	}
}

const GUARANTEES = Object.freeze({
	localOnly: true,
	accountRequired: false,
	network: false,
	paidService: false,
	binaryPayloadsStored: false,
} as const);

function normalizeIdentifier({
	value,
	label,
}: {
	value: string;
	label: string;
}): string {
	if (typeof value !== "string") {
		throw new MediaIndexStorageValidationError(`${label} must be a string.`);
	}
	const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
	if (!normalized) {
		throw new MediaIndexStorageValidationError(`${label} cannot be empty.`);
	}
	if (normalized.length > 512) {
		throw new MediaIndexStorageValidationError(`${label} is too long.`);
	}
	return normalized;
}

function normalizeTimestamp(value: string): string {
	const timestamp = Date.parse(value);
	if (!Number.isFinite(timestamp)) {
		throw new MediaIndexStorageValidationError(
			"MediaIndex creation time must be an ISO timestamp.",
		);
	}
	return new Date(timestamp).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRecord(value: unknown): MediaIndexHistoryRecord | null {
	if (!isRecord(value)) return null;
	try {
		const projectId = normalizeIdentifier({
			value: String(value.projectId ?? ""),
			label: "Project id",
		});
		const assetId = normalizeIdentifier({
			value: String(value.assetId ?? ""),
			label: "Asset id",
		});
		const assetFingerprint = normalizeIdentifier({
			value: String(value.assetFingerprint ?? ""),
			label: "Asset fingerprint",
		});
		const createdAt = normalizeTimestamp(String(value.createdAt ?? ""));
		const index = parseMediaIndex({ value: value.index });
		if (index.assetId !== assetId) return null;
		return Object.freeze({
			projectId,
			assetId,
			assetFingerprint,
			createdAt,
			index,
		});
	} catch {
		return null;
	}
}

function guaranteesMatch(value: unknown): boolean {
	return (
		isRecord(value) &&
		value.localOnly === true &&
		value.accountRequired === false &&
		value.network === false &&
		value.paidService === false &&
		value.binaryPayloadsStored === false
	);
}

export function parseMediaIndexHistory({
	value,
}: {
	value: unknown;
}): MediaIndexHistory | null {
	if (!isRecord(value) || !Array.isArray(value.records)) return null;
	if (
		value.kind !== MEDIA_INDEX_HISTORY_KIND ||
		value.schemaVersion !== MEDIA_INDEX_HISTORY_SCHEMA_VERSION ||
		typeof value.projectId !== "string" ||
		typeof value.assetId !== "string" ||
		typeof value.currentMediaIndexId !== "string" ||
		value.records.length === 0 ||
		!guaranteesMatch(value.guarantees)
	) {
		return null;
	}
	try {
		const projectId = normalizeIdentifier({
			value: value.projectId,
			label: "Project id",
		});
		const assetId = normalizeIdentifier({
			value: value.assetId,
			label: "Asset id",
		});
		const records: MediaIndexHistoryRecord[] = [];
		let previousTimestamp = -Infinity;
		for (const candidate of value.records) {
			const record = parseRecord(candidate);
			if (
				record === null ||
				record.projectId !== projectId ||
				record.assetId !== assetId ||
				Date.parse(record.createdAt) < previousTimestamp
			) {
				return null;
			}
			previousTimestamp = Date.parse(record.createdAt);
			records.push(record);
		}
		const current = records.at(-1);
		if (
			current === undefined ||
			current.index.mediaIndexId !== value.currentMediaIndexId
		) {
			return null;
		}
		Object.freeze(records);
		return Object.freeze({
			kind: MEDIA_INDEX_HISTORY_KIND,
			schemaVersion: MEDIA_INDEX_HISTORY_SCHEMA_VERSION,
			projectId,
			assetId,
			currentMediaIndexId: current.index.mediaIndexId,
			records,
			guarantees: GUARANTEES,
		});
	} catch {
		return null;
	}
}

function storageKey({
	projectId,
	assetId,
}: {
	projectId: string;
	assetId: string;
}): string {
	return `${projectId}\u0000${assetId}`;
}

function cloneValue<T>(value: T): T {
	return structuredClone(value);
}

function currentId(value: unknown | null): string | null {
	if (value === null) return null;
	const history = parseMediaIndexHistory({ value });
	if (history === null) {
		throw new MediaIndexStorageValidationError(
			"Stored MediaIndex history is malformed.",
		);
	}
	return history.currentMediaIndexId;
}

function assertExpectedCurrent({
	stored,
	expectedCurrentMediaIndexId,
}: {
	stored: unknown | null;
	expectedCurrentMediaIndexId: string | null;
}): void {
	if (currentId(stored) !== expectedCurrentMediaIndexId) {
		throw new MediaIndexStorageConflictError(
			"MediaIndex history changed before this analysis was saved.",
		);
	}
}

export class MemoryMediaIndexStorage implements MediaIndexStorageAdapter {
	private readonly values = new Map<string, unknown>();

	async read({
		projectId,
		assetId,
	}: {
		projectId: string;
		assetId: string;
	}): Promise<unknown | null> {
		const key = storageKey({ projectId, assetId });
		const value = this.values.get(key);
		return value === undefined ? null : cloneValue(value);
	}

	async write({
		projectId,
		assetId,
		value,
		expectedCurrentMediaIndexId,
	}: {
		projectId: string;
		assetId: string;
		value: MediaIndexHistory;
		expectedCurrentMediaIndexId: string | null;
	}): Promise<void> {
		const key = storageKey({ projectId, assetId });
		const stored = this.values.get(key) ?? null;
		assertExpectedCurrent({ stored, expectedCurrentMediaIndexId });
		this.values.set(key, cloneValue(value));
	}

	async deleteProject({ projectId }: { projectId: string }): Promise<void> {
		const prefix = `${projectId}\u0000`;
		for (const key of this.values.keys()) {
			if (key.startsWith(prefix)) this.values.delete(key);
		}
	}
}

export class IndexedDBMediaIndexStorage implements MediaIndexStorageAdapter {
	private readonly fallback: MediaIndexStorageAdapter;

	constructor(
		private readonly options: {
			readonly databaseName?: string;
			readonly storeName?: string;
			readonly indexedDBFactory?: IDBFactory | null;
			readonly fallback?: MediaIndexStorageAdapter;
		} = {},
	) {
		this.fallback = options.fallback ?? new MemoryMediaIndexStorage();
	}

	private factory(): IDBFactory | null {
		if (this.options.indexedDBFactory !== undefined) {
			return this.options.indexedDBFactory;
		}
		return typeof indexedDB === "undefined" ? null : indexedDB;
	}

	private async open(): Promise<IDBDatabase | null> {
		const factory = this.factory();
		if (factory === null) return null;
		return new Promise((resolve, reject) => {
			const request = factory.open(
				this.options.databaseName ?? "visioncut-media-indexes",
				1,
			);
			request.onerror = () => reject(request.error);
			request.onblocked = () =>
				reject(new Error("MediaIndex storage blocked."));
			request.onupgradeneeded = () => {
				const storeName = this.options.storeName ?? "media-index-histories";
				if (!request.result.objectStoreNames.contains(storeName)) {
					request.result.createObjectStore(storeName);
				}
			};
			request.onsuccess = () => resolve(request.result);
		});
	}

	async read({
		projectId,
		assetId,
	}: {
		projectId: string;
		assetId: string;
	}): Promise<unknown | null> {
		const database = await this.open().catch(() => null);
		if (database === null) return this.fallback.read({ projectId, assetId });
		try {
			const value = await new Promise<unknown | null>((resolve, reject) => {
				const request = database
					.transaction(
						this.options.storeName ?? "media-index-histories",
						"readonly",
					)
					.objectStore(this.options.storeName ?? "media-index-histories")
					.get(storageKey({ projectId, assetId }));
				request.onerror = () => reject(request.error);
				request.onsuccess = () =>
					resolve(request.result === undefined ? null : request.result);
			});
			if (value !== null) return value;
		} catch {
			// Restricted browser contexts use the in-memory fallback.
		} finally {
			database.close();
		}
		return this.fallback.read({ projectId, assetId });
	}

	async write({
		projectId,
		assetId,
		value,
		expectedCurrentMediaIndexId,
	}: {
		projectId: string;
		assetId: string;
		value: MediaIndexHistory;
		expectedCurrentMediaIndexId: string | null;
	}): Promise<void> {
		const database = await this.open().catch(() => null);
		if (database === null) {
			return this.fallback.write({
				projectId,
				assetId,
				value,
				expectedCurrentMediaIndexId,
			});
		}
		try {
			await new Promise<void>((resolve, reject) => {
				const transaction = database.transaction(
					this.options.storeName ?? "media-index-histories",
					"readwrite",
				);
				const store = transaction.objectStore(
					this.options.storeName ?? "media-index-histories",
				);
				const key = storageKey({ projectId, assetId });
				const request = store.get(key);
				let settled = false;
				const fail = (error: unknown) => {
					if (settled) return;
					settled = true;
					reject(error);
				};
				request.onerror = () => fail(request.error);
				request.onsuccess = () => {
					try {
						assertExpectedCurrent({
							stored: request.result ?? null,
							expectedCurrentMediaIndexId,
						});
						store.put(value, key);
					} catch (error) {
						fail(error);
						transaction.abort();
					}
				};
				transaction.onerror = () => fail(transaction.error);
				transaction.onabort = () => fail(transaction.error);
				transaction.oncomplete = () => {
					if (!settled) {
						settled = true;
						resolve();
					}
				};
			});
			await this.fallback.deleteProject({ projectId });
		} catch (error) {
			if (
				error instanceof MediaIndexStorageConflictError ||
				error instanceof MediaIndexStorageValidationError
			) {
				throw error;
			}
			await this.fallback.write({
				projectId,
				assetId,
				value,
				expectedCurrentMediaIndexId,
			});
		} finally {
			database.close();
		}
	}

	async deleteProject({ projectId }: { projectId: string }): Promise<void> {
		const database = await this.open().catch(() => null);
		if (database !== null) {
			try {
				await new Promise<void>((resolve, reject) => {
					const transaction = database.transaction(
						this.options.storeName ?? "media-index-histories",
						"readwrite",
					);
					const store = transaction.objectStore(
						this.options.storeName ?? "media-index-histories",
					);
					const request = store.openKeyCursor();
					request.onerror = () => reject(request.error);
					request.onsuccess = () => {
						const cursor = request.result;
						if (cursor === null) return;
						if (String(cursor.key).startsWith(`${projectId}\u0000`)) {
							store.delete(cursor.key);
						}
						cursor.continue();
					};
					transaction.onerror = () => reject(transaction.error);
					transaction.oncomplete = () => resolve();
				});
			} finally {
				database.close();
			}
		}
		await this.fallback.deleteProject({ projectId });
	}
}

const defaultStorage = new IndexedDBMediaIndexStorage();

export async function loadMediaIndexHistory({
	projectId,
	assetId,
	storage = defaultStorage,
}: {
	projectId: string;
	assetId: string;
	storage?: MediaIndexStorageAdapter;
}): Promise<MediaIndexHistory | null> {
	const normalizedProjectId = normalizeIdentifier({
		value: projectId,
		label: "Project id",
	});
	const normalizedAssetId = normalizeIdentifier({
		value: assetId,
		label: "Asset id",
	});
	const value = await storage.read({
		projectId: normalizedProjectId,
		assetId: normalizedAssetId,
	});
	if (value === null) return null;
	const history = parseMediaIndexHistory({ value });
	if (
		history === null ||
		history.projectId !== normalizedProjectId ||
		history.assetId !== normalizedAssetId
	) {
		throw new MediaIndexStorageValidationError(
			"Stored MediaIndex history is malformed or cross-project.",
		);
	}
	return history;
}

export async function loadCurrentMediaIndex({
	projectId,
	assetId,
	storage = defaultStorage,
}: {
	projectId: string;
	assetId: string;
	storage?: MediaIndexStorageAdapter;
}): Promise<MediaIndex | null> {
	const history = await loadMediaIndexHistory({ projectId, assetId, storage });
	return history?.records.at(-1)?.index ?? null;
}

export async function saveMediaIndex({
	projectId,
	assetFingerprint,
	createdAt,
	index,
	storage = defaultStorage,
}: {
	projectId: string;
	assetFingerprint: string;
	createdAt: string;
	index: MediaIndex;
	storage?: MediaIndexStorageAdapter;
}): Promise<MediaIndexHistory> {
	const normalizedProjectId = normalizeIdentifier({
		value: projectId,
		label: "Project id",
	});
	const normalizedFingerprint = normalizeIdentifier({
		value: assetFingerprint,
		label: "Asset fingerprint",
	});
	const parsedIndex = parseMediaIndex({ value: index });
	const existing = await loadMediaIndexHistory({
		projectId: normalizedProjectId,
		assetId: parsedIndex.assetId,
		storage,
	});
	const current = existing?.records.at(-1) ?? null;
	if (
		current?.index.mediaIndexId === parsedIndex.mediaIndexId &&
		current.assetFingerprint === normalizedFingerprint
	) {
		return existing!;
	}
	const record: MediaIndexHistoryRecord = Object.freeze({
		projectId: normalizedProjectId,
		assetId: parsedIndex.assetId,
		assetFingerprint: normalizedFingerprint,
		createdAt: normalizeTimestamp(createdAt),
		index: parsedIndex,
	});
	const candidate: MediaIndexHistory = {
		kind: MEDIA_INDEX_HISTORY_KIND,
		schemaVersion: MEDIA_INDEX_HISTORY_SCHEMA_VERSION,
		projectId: normalizedProjectId,
		assetId: parsedIndex.assetId,
		currentMediaIndexId: parsedIndex.mediaIndexId,
		records: [...(existing?.records ?? []), record],
		guarantees: GUARANTEES,
	};
	const history = parseMediaIndexHistory({ value: candidate });
	if (history === null) {
		throw new MediaIndexStorageValidationError(
			"New MediaIndex history is malformed.",
		);
	}
	await storage.write({
		projectId: normalizedProjectId,
		assetId: parsedIndex.assetId,
		value: history,
		expectedCurrentMediaIndexId: existing?.currentMediaIndexId ?? null,
	});
	return history;
}

export async function deleteProjectMediaIndexes({
	projectId,
	storage = defaultStorage,
}: {
	projectId: string;
	storage?: MediaIndexStorageAdapter;
}): Promise<void> {
	await storage.deleteProject({
		projectId: normalizeIdentifier({
			value: projectId,
			label: "Project id",
		}),
	});
}

export function serializeMediaIndexHistory({
	history,
}: {
	history: MediaIndexHistory;
}): string {
	const parsed = parseMediaIndexHistory({ value: history });
	if (parsed === null) {
		throw new MediaIndexStorageValidationError(
			"Cannot serialize malformed MediaIndex history.",
		);
	}
	for (const record of parsed.records) {
		serializeMediaIndex({ index: record.index, space: 0 });
	}
	return JSON.stringify(parsed, null, 2);
}
