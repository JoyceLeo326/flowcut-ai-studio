import { z } from "zod";
import {
	CHATCUT_IMPORT_RECEIPT_KIND,
	CHATCUT_RESULT_SCHEMA_VERSION,
	type ChatCutImportApplyReceipt,
} from "./chatcut-result";

export const CHATCUT_IMPORT_HISTORY_KIND =
	"visioncut.chatcut-import-history" as const;
export const CHATCUT_IMPORT_HISTORY_SCHEMA_VERSION = 1 as const;

export interface ChatCutImportHistoryRecord {
	readonly projectId: string;
	readonly handoffId: string;
	readonly resultId: string;
	readonly idempotencyKey: string;
	readonly receipt: ChatCutImportApplyReceipt;
	readonly resultingVersion: number;
	readonly resultingVersionId: string;
	readonly resultingTimelineFingerprint: string;
	readonly appliedOperationIds: readonly string[];
	readonly appliedAt: string;
}

export type ChatCutImportState = "applied" | "undone";
export type ChatCutImportTransition = "undone" | "redone";

export interface ChatCutImportStateEvent {
	readonly eventId: string;
	readonly projectId: string;
	readonly receiptId: string;
	readonly transition: ChatCutImportTransition;
	readonly occurredAt: string;
}

export interface ChatCutImportHistoryEntry {
	readonly record: ChatCutImportHistoryRecord;
	readonly state: ChatCutImportState;
	readonly lastTransition: ChatCutImportStateEvent | null;
}

export interface ChatCutImportHistory {
	readonly kind: typeof CHATCUT_IMPORT_HISTORY_KIND;
	readonly schemaVersion: typeof CHATCUT_IMPORT_HISTORY_SCHEMA_VERSION;
	readonly projectId: string;
	readonly revision: number;
	readonly records: readonly ChatCutImportHistoryRecord[];
	readonly events: readonly ChatCutImportStateEvent[];
	readonly guarantees: {
		readonly localOnly: true;
		readonly network: false;
		readonly binaryPayloadsStored: false;
		readonly immutableReceipts: true;
	};
}

export interface ChatCutImportStorageAdapter {
	read({ projectId }: { projectId: string }): Promise<unknown | null>;
	append({
		projectId,
		value,
		expectedRevision,
	}: {
		projectId: string;
		value: ChatCutImportHistory;
		expectedRevision: number;
	}): Promise<void>;
	deleteProject({ projectId }: { projectId: string }): Promise<void>;
}

export class ChatCutImportStorageValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ChatCutImportStorageValidationError";
	}
}

export class ChatCutImportStorageConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ChatCutImportStorageConflictError";
	}
}

const MAX_HISTORY_RECORDS = 100_000;
const identifierSchema = z
	.string()
	.min(1)
	.max(200)
	.regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u);
const idempotencyKeySchema = z.string().min(1).max(200);
const fingerprintSchema = z
	.string()
	.regex(/^sha256:[a-f0-9]{64}$/u, "Expected a sha256 fingerprint.");
const positiveIntegerSchema = z.number().int().positive().max(1_000_000_000);

function isCanonicalTimestamp(value: string): boolean {
	const timestamp = Date.parse(value);
	return (
		Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
	);
}

const canonicalTimestampSchema = z.string().refine(isCanonicalTimestamp, {
	message: "Expected a canonical ISO-8601 timestamp.",
});
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
const receiptSchema = z
	.object({
		kind: z.literal(CHATCUT_IMPORT_RECEIPT_KIND),
		schemaVersion: z.literal(CHATCUT_RESULT_SCHEMA_VERSION),
		receiptId: identifierSchema,
		resultId: identifierSchema,
		idempotencyKey: idempotencyKeySchema,
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
const guaranteesSchema = z
	.object({
		localOnly: z.literal(true),
		network: z.literal(false),
		binaryPayloadsStored: z.literal(false),
		immutableReceipts: z.literal(true),
	})
	.strict();
const recordSchema = z
	.object({
		projectId: identifierSchema,
		handoffId: identifierSchema,
		resultId: identifierSchema,
		idempotencyKey: idempotencyKeySchema,
		receipt: receiptSchema,
		resultingVersion: positiveIntegerSchema,
		resultingVersionId: identifierSchema,
		resultingTimelineFingerprint: fingerprintSchema,
		appliedOperationIds: z.array(identifierSchema).min(1).max(10_000),
		appliedAt: canonicalTimestampSchema,
	})
	.strict();
const stateEventSchema = z
	.object({
		eventId: identifierSchema,
		projectId: identifierSchema,
		receiptId: identifierSchema,
		transition: z.enum(["undone", "redone"]),
		occurredAt: canonicalTimestampSchema,
	})
	.strict();
const historySchema = z
	.object({
		kind: z.literal(CHATCUT_IMPORT_HISTORY_KIND),
		schemaVersion: z.literal(CHATCUT_IMPORT_HISTORY_SCHEMA_VERSION),
		projectId: identifierSchema,
		revision: positiveIntegerSchema,
		records: z.array(recordSchema).min(1).max(MAX_HISTORY_RECORDS),
		events: z.array(stateEventSchema).max(MAX_HISTORY_RECORDS).optional().default([]),
		guarantees: guaranteesSchema,
	})
	.strict();

const LOCAL_GUARANTEES = Object.freeze({
	localOnly: true,
	network: false,
	binaryPayloadsStored: false,
	immutableReceipts: true,
} as const);

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
			throw new ChatCutImportStorageValidationError(
				`${path} contains a non-finite number.`,
			);
		}
		return;
	}
	if (typeof value !== "object") {
		throw new ChatCutImportStorageValidationError(
			`${path} is not portable JSON.`,
		);
	}
	if (
		value instanceof ArrayBuffer ||
		ArrayBuffer.isView(value) ||
		(typeof Blob !== "undefined" && value instanceof Blob) ||
		(typeof File !== "undefined" && value instanceof File)
	) {
		throw new ChatCutImportStorageValidationError(
			`${path} contains a binary payload.`,
		);
	}
	if (seen.has(value)) {
		throw new ChatCutImportStorageValidationError(
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
		throw new ChatCutImportStorageValidationError(
			`${path} contains a non-JSON object.`,
		);
	}
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== "string") {
			throw new ChatCutImportStorageValidationError(
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

function normalizeIdentifier({
	value,
	label,
}: {
	value: string;
	label: string;
}): string {
	if (typeof value !== "string") {
		throw new ChatCutImportStorageValidationError(`${label} must be a string.`);
	}
	const normalized = value.normalize("NFKC").trim();
	if (!identifierSchema.safeParse(normalized).success) {
		throw new ChatCutImportStorageValidationError(`${label} is invalid.`);
	}
	return normalized;
}

function normalizeIdempotencyKey(value: string): string {
	if (!idempotencyKeySchema.safeParse(value).success) {
		throw new ChatCutImportStorageValidationError(
			"Idempotency key is invalid.",
		);
	}
	return value;
}

function hasUniqueValues(values: readonly string[]): boolean {
	return new Set(values).size === values.length;
}

function arraysEqual({
	left,
	right,
}: {
	left: readonly string[];
	right: readonly string[];
}): boolean {
	return (
		left.length === right.length &&
		left.every((entry, index) => entry === right[index])
	);
}

function parseReceipt(value: unknown): ChatCutImportApplyReceipt | null {
	try {
		assertPortableJson({ value });
	} catch {
		return null;
	}
	const parsed = receiptSchema.safeParse(value);
	if (!parsed.success) return null;
	const receipt = parsed.data;
	if (
		receipt.toVersion <= receipt.fromVersion ||
		receipt.undoReference.projectId !== receipt.projectId ||
		receipt.undoReference.timelineId !== receipt.timelineId ||
		receipt.undoReference.versionId !== receipt.fromVersionId ||
		!hasUniqueValues(receipt.operationIds)
	) {
		return null;
	}
	return deepFreeze(receipt as ChatCutImportApplyReceipt);
}

function parseRecord(value: unknown): ChatCutImportHistoryRecord | null {
	const parsed = recordSchema.safeParse(value);
	if (!parsed.success) return null;
	const receipt = parseReceipt(parsed.data.receipt);
	if (
		receipt === null ||
		parsed.data.projectId !== receipt.projectId ||
		parsed.data.resultId !== receipt.resultId ||
		parsed.data.idempotencyKey !== receipt.idempotencyKey ||
		parsed.data.resultingVersion !== receipt.toVersion ||
		parsed.data.resultingVersionId !== receipt.toVersionId ||
		parsed.data.resultingTimelineFingerprint !==
			receipt.resultingTimelineFingerprint ||
		parsed.data.appliedAt !== receipt.appliedAt ||
		!arraysEqual({
			left: parsed.data.appliedOperationIds,
			right: receipt.operationIds,
		})
	) {
		return null;
	}
	return deepFreeze({
		projectId: parsed.data.projectId,
		handoffId: parsed.data.handoffId,
		resultId: parsed.data.resultId,
		idempotencyKey: parsed.data.idempotencyKey,
		receipt,
		resultingVersion: parsed.data.resultingVersion,
		resultingVersionId: parsed.data.resultingVersionId,
		resultingTimelineFingerprint: parsed.data.resultingTimelineFingerprint,
		appliedOperationIds: [...parsed.data.appliedOperationIds],
		appliedAt: parsed.data.appliedAt,
	});
}

function recordIdentity({
	record,
	kind,
}: {
	record: ChatCutImportHistoryRecord;
	kind: "result" | "idempotency";
}): string {
	return `${record.handoffId}\u0000${
		kind === "result" ? record.resultId : record.idempotencyKey
	}`;
}

function recordsEqual({
	left,
	right,
}: {
	left: ChatCutImportHistoryRecord;
	right: ChatCutImportHistoryRecord;
}): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function eventsEqual({
	left,
	right,
}: {
	left: ChatCutImportStateEvent;
	right: ChatCutImportStateEvent;
}): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function deriveEntries({
	records,
	events,
}: {
	records: readonly ChatCutImportHistoryRecord[];
	events: readonly ChatCutImportStateEvent[];
}): readonly ChatCutImportHistoryEntry[] | null {
	const byReceiptId = new Map(
		records.map((record) => [
			record.receipt.receiptId,
			{
				record,
				state: "applied" as ChatCutImportState,
				lastTransition: null as ChatCutImportStateEvent | null,
			},
		]),
	);
	const lastTimestampByReceipt = new Map(
		records.map((record) => [record.receipt.receiptId, record.appliedAt]),
	);
	for (const event of events) {
		const entry = byReceiptId.get(event.receiptId);
		const lastTimestamp = lastTimestampByReceipt.get(event.receiptId);
		if (
			entry === undefined ||
			lastTimestamp === undefined ||
			event.projectId !== entry.record.projectId ||
			Date.parse(event.occurredAt) < Date.parse(lastTimestamp) ||
			(event.transition === "undone" && entry.state !== "applied") ||
			(event.transition === "redone" && entry.state !== "undone")
		) {
			return null;
		}
		entry.state = event.transition === "undone" ? "undone" : "applied";
		entry.lastTransition = event;
		lastTimestampByReceipt.set(event.receiptId, event.occurredAt);
	}
	return records.map((record) => {
		const entry = byReceiptId.get(record.receipt.receiptId)!;
		return deepFreeze({
			record,
			state: entry.state,
			lastTransition: entry.lastTransition,
		});
	});
}

export function parseChatCutImportHistory({
	value,
}: {
	value: unknown;
}): ChatCutImportHistory | null {
	try {
		assertPortableJson({ value });
	} catch {
		return null;
	}
	const parsed = historySchema.safeParse(value);
	if (
		!parsed.success ||
		parsed.data.revision !==
			parsed.data.records.length + parsed.data.events.length
	) {
		return null;
	}
	const records: ChatCutImportHistoryRecord[] = [];
	const resultIdentities = new Set<string>();
	const idempotencyIdentities = new Set<string>();
	const receiptIds = new Set<string>();
	for (const candidate of parsed.data.records) {
		const record = parseRecord(candidate);
		if (record === null || record.projectId !== parsed.data.projectId) {
			return null;
		}
		const resultIdentity = recordIdentity({ record, kind: "result" });
		const idempotencyIdentity = recordIdentity({
			record,
			kind: "idempotency",
		});
		if (
			resultIdentities.has(resultIdentity) ||
			idempotencyIdentities.has(idempotencyIdentity) ||
			receiptIds.has(record.receipt.receiptId)
		) {
			return null;
		}
		resultIdentities.add(resultIdentity);
		idempotencyIdentities.add(idempotencyIdentity);
		receiptIds.add(record.receipt.receiptId);
		records.push(record);
	}
	const events: ChatCutImportStateEvent[] = [];
	const eventIds = new Set<string>();
	for (const event of parsed.data.events) {
		if (
			event.projectId !== parsed.data.projectId ||
			eventIds.has(event.eventId)
		) {
			return null;
		}
		eventIds.add(event.eventId);
		events.push(deepFreeze({ ...event }));
	}
	if (deriveEntries({ records, events }) === null) return null;
	return deepFreeze({
		kind: CHATCUT_IMPORT_HISTORY_KIND,
		schemaVersion: CHATCUT_IMPORT_HISTORY_SCHEMA_VERSION,
		projectId: parsed.data.projectId,
		revision: parsed.data.revision,
		records,
		events,
		guarantees: LOCAL_GUARANTEES,
	});
}

function parseStoredHistory({
	value,
	projectId,
}: {
	value: unknown | null;
	projectId: string;
}): ChatCutImportHistory | null {
	if (value === null) return null;
	const history = parseChatCutImportHistory({ value });
	if (history === null || history.projectId !== projectId) {
		throw new ChatCutImportStorageValidationError(
			"Stored ChatCut import history is malformed or cross-project.",
		);
	}
	return history;
}

function assertAppendOnly({
	stored,
	candidate,
	expectedRevision,
}: {
	stored: ChatCutImportHistory | null;
	candidate: ChatCutImportHistory;
	expectedRevision: number;
}): void {
	const currentRevision = stored?.revision ?? 0;
	if (currentRevision !== expectedRevision) {
		throw new ChatCutImportStorageConflictError(
			"ChatCut import history changed before this receipt was saved.",
		);
	}
	if (
		candidate.revision !== expectedRevision + 1 ||
		candidate.projectId !== (stored?.projectId ?? candidate.projectId)
	) {
		throw new ChatCutImportStorageValidationError(
			"ChatCut import history must append exactly one item.",
		);
	}
	const previousRecordCount = stored?.records.length ?? 0;
	const previousEventCount = stored?.events.length ?? 0;
	const appendedReceipt =
		candidate.records.length === previousRecordCount + 1 &&
		candidate.events.length === previousEventCount;
	const appendedEvent =
		candidate.records.length === previousRecordCount &&
		candidate.events.length === previousEventCount + 1;
	if (!appendedReceipt && !appendedEvent) {
		throw new ChatCutImportStorageValidationError(
			"ChatCut import history must append exactly one receipt or state event.",
		);
	}
	for (let index = 0; index < previousRecordCount; index += 1) {
		const previous = stored?.records[index];
		const next = candidate.records[index];
		if (
			previous === undefined ||
			next === undefined ||
			!recordsEqual({ left: previous, right: next })
		) {
			throw new ChatCutImportStorageConflictError(
				"Existing ChatCut import receipts are immutable.",
			);
		}
	}
	for (let index = 0; index < previousEventCount; index += 1) {
		const previous = stored?.events[index];
		const next = candidate.events[index];
		if (
			previous === undefined ||
			next === undefined ||
			!eventsEqual({ left: previous, right: next })
		) {
			throw new ChatCutImportStorageConflictError(
				"Existing ChatCut import state events are immutable.",
			);
		}
	}
}

function cloneValue<T>(value: T): T {
	return structuredClone(value);
}

export class MemoryChatCutImportStorage implements ChatCutImportStorageAdapter {
	private readonly values = new Map<string, unknown>();

	async read({ projectId }: { projectId: string }): Promise<unknown | null> {
		const normalizedProjectId = normalizeIdentifier({
			value: projectId,
			label: "Project id",
		});
		const value = this.values.get(normalizedProjectId);
		return value === undefined ? null : cloneValue(value);
	}

	async append({
		projectId,
		value,
		expectedRevision,
	}: {
		projectId: string;
		value: ChatCutImportHistory;
		expectedRevision: number;
	}): Promise<void> {
		const normalizedProjectId = normalizeIdentifier({
			value: projectId,
			label: "Project id",
		});
		const candidate = parseChatCutImportHistory({ value });
		if (candidate === null || candidate.projectId !== normalizedProjectId) {
			throw new ChatCutImportStorageValidationError(
				"Cannot save malformed or cross-project ChatCut import history.",
			);
		}
		const rawStored = this.values.get(normalizedProjectId);
		const stored = parseStoredHistory({
			value: rawStored === undefined ? null : rawStored,
			projectId: normalizedProjectId,
		});
		assertAppendOnly({ stored, candidate, expectedRevision });
		this.values.set(normalizedProjectId, cloneValue(candidate));
	}

	async deleteProject({ projectId }: { projectId: string }): Promise<void> {
		this.values.delete(
			normalizeIdentifier({ value: projectId, label: "Project id" }),
		);
	}
}

export class IndexedDBChatCutImportStorage implements ChatCutImportStorageAdapter {
	private readonly databaseName: string;
	private readonly storeName: string;
	private readonly databaseVersion: number;
	private readonly indexedDBFactory: IDBFactory | null | undefined;
	private readonly fallback: ChatCutImportStorageAdapter;

	constructor({
		databaseName = "visioncut-chatcut-imports",
		storeName = "chatcut-import-histories",
		databaseVersion = 1,
		indexedDBFactory,
		fallback = new MemoryChatCutImportStorage(),
	}: {
		databaseName?: string;
		storeName?: string;
		databaseVersion?: number;
		indexedDBFactory?: IDBFactory | null;
		fallback?: ChatCutImportStorageAdapter;
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
				reject(new Error("ChatCut import storage is blocked."));
			request.onupgradeneeded = () => {
				if (!request.result.objectStoreNames.contains(this.storeName)) {
					request.result.createObjectStore(this.storeName);
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
				const request = database
					.transaction(this.storeName, "readonly")
					.objectStore(this.storeName)
					.get(projectId);
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
		value,
		expectedRevision,
	}: {
		projectId: string;
		value: ChatCutImportHistory;
		expectedRevision: number;
	}): Promise<boolean> {
		const database = await this.openDatabase();
		if (database === null) return false;
		try {
			await new Promise<void>((resolve, reject) => {
				const transaction = database.transaction(this.storeName, "readwrite");
				const store = transaction.objectStore(this.storeName);
				const request = store.get(projectId);
				let failure: unknown = null;
				let settled = false;
				const rejectOnce = (error: unknown) => {
					if (settled) return;
					settled = true;
					reject(error);
				};
				request.onerror = () => rejectOnce(request.error);
				request.onsuccess = () => {
					try {
						const stored = parseStoredHistory({
							value: request.result === undefined ? null : request.result,
							projectId,
						});
						assertAppendOnly({ stored, candidate: value, expectedRevision });
						store.put(value, projectId);
					} catch (error) {
						failure = error;
						transaction.abort();
					}
				};
				transaction.onerror = () => rejectOnce(failure ?? transaction.error);
				transaction.onabort = () => rejectOnce(failure ?? transaction.error);
				transaction.oncomplete = () => {
					if (settled) return;
					settled = true;
					resolve();
				};
			});
			return true;
		} finally {
			database.close();
		}
	}

	private async deleteFromDatabase({
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
		const normalizedProjectId = normalizeIdentifier({
			value: projectId,
			label: "Project id",
		});
		try {
			const value = await this.readFromDatabase({
				projectId: normalizedProjectId,
			});
			if (value !== null) return value;
		} catch {
			// Restricted browser contexts continue with the in-memory adapter.
		}
		return this.fallback.read({ projectId: normalizedProjectId });
	}

	async append({
		projectId,
		value,
		expectedRevision,
	}: {
		projectId: string;
		value: ChatCutImportHistory;
		expectedRevision: number;
	}): Promise<void> {
		const normalizedProjectId = normalizeIdentifier({
			value: projectId,
			label: "Project id",
		});
		const candidate = parseChatCutImportHistory({ value });
		if (candidate === null || candidate.projectId !== normalizedProjectId) {
			throw new ChatCutImportStorageValidationError(
				"Cannot save malformed or cross-project ChatCut import history.",
			);
		}
		try {
			const persisted = await this.appendToDatabase({
				projectId: normalizedProjectId,
				value: candidate,
				expectedRevision,
			});
			if (persisted) {
				await this.fallback.deleteProject({
					projectId: normalizedProjectId,
				});
				return;
			}
		} catch (error) {
			if (
				error instanceof ChatCutImportStorageConflictError ||
				error instanceof ChatCutImportStorageValidationError
			) {
				throw error;
			}
			// Operational IndexedDB failures use the session-local fallback.
		}
		await this.fallback.append({
			projectId: normalizedProjectId,
			value: candidate,
			expectedRevision,
		});
	}

	async deleteProject({ projectId }: { projectId: string }): Promise<void> {
		const normalizedProjectId = normalizeIdentifier({
			value: projectId,
			label: "Project id",
		});
		try {
			await this.deleteFromDatabase({ projectId: normalizedProjectId });
		} catch {
			// The fallback must still be cleared when IndexedDB is unavailable.
		}
		await this.fallback.deleteProject({ projectId: normalizedProjectId });
	}
}

const defaultStorage = new IndexedDBChatCutImportStorage();

function createRecord({
	handoffId,
	receipt,
}: {
	handoffId: string;
	receipt: ChatCutImportApplyReceipt;
}): ChatCutImportHistoryRecord {
	const parsedReceipt = parseReceipt(receipt);
	if (parsedReceipt === null) {
		throw new ChatCutImportStorageValidationError(
			"ChatCut import receipt is malformed or contains binary data.",
		);
	}
	return deepFreeze({
		projectId: parsedReceipt.projectId,
		handoffId: normalizeIdentifier({ value: handoffId, label: "Handoff id" }),
		resultId: parsedReceipt.resultId,
		idempotencyKey: parsedReceipt.idempotencyKey,
		receipt: parsedReceipt,
		resultingVersion: parsedReceipt.toVersion,
		resultingVersionId: parsedReceipt.toVersionId,
		resultingTimelineFingerprint: parsedReceipt.resultingTimelineFingerprint,
		appliedOperationIds: [...parsedReceipt.operationIds],
		appliedAt: parsedReceipt.appliedAt,
	});
}

function buildHistory({
	projectId,
	records,
	events = [],
}: {
	projectId: string;
	records: readonly ChatCutImportHistoryRecord[];
	events?: readonly ChatCutImportStateEvent[];
}): ChatCutImportHistory {
	const history = parseChatCutImportHistory({
		value: {
			kind: CHATCUT_IMPORT_HISTORY_KIND,
			schemaVersion: CHATCUT_IMPORT_HISTORY_SCHEMA_VERSION,
			projectId,
			revision: records.length + events.length,
			records,
			events,
			guarantees: LOCAL_GUARANTEES,
		},
	});
	if (history === null) {
		throw new ChatCutImportStorageValidationError(
			"New ChatCut import history is malformed.",
		);
	}
	return history;
}

export async function loadChatCutImportHistory({
	projectId,
	storage = defaultStorage,
}: {
	projectId: string;
	storage?: ChatCutImportStorageAdapter;
}): Promise<ChatCutImportHistory | null> {
	const normalizedProjectId = normalizeIdentifier({
		value: projectId,
		label: "Project id",
	});
	const stored = await storage.read({ projectId: normalizedProjectId });
	return parseStoredHistory({ value: stored, projectId: normalizedProjectId });
}

export async function listProjectChatCutImports({
	projectId,
	storage = defaultStorage,
}: {
	projectId: string;
	storage?: ChatCutImportStorageAdapter;
}): Promise<readonly ChatCutImportHistoryRecord[]> {
	const history = await loadChatCutImportHistory({ projectId, storage });
	return history?.records ?? Object.freeze([]);
}

export async function listProjectChatCutImportEntries({
	projectId,
	storage = defaultStorage,
}: {
	projectId: string;
	storage?: ChatCutImportStorageAdapter;
}): Promise<readonly ChatCutImportHistoryEntry[]> {
	const history = await loadChatCutImportHistory({ projectId, storage });
	if (history === null) return Object.freeze([]);
	const entries = deriveEntries({
		records: history.records,
		events: history.events,
	});
	if (entries === null) {
		throw new ChatCutImportStorageValidationError(
			"Stored ChatCut import state transitions are invalid.",
		);
	}
	return deepFreeze([...entries]);
}

export type ChatCutImportRecordLookup =
	| {
			readonly projectId: string;
			readonly handoffId: string;
			readonly resultId: string;
			readonly idempotencyKey?: string;
	  }
	| {
			readonly projectId: string;
			readonly handoffId: string;
			readonly resultId?: string;
			readonly idempotencyKey: string;
	  };

export async function loadChatCutImportRecord(
	lookup: ChatCutImportRecordLookup & {
		readonly storage?: ChatCutImportStorageAdapter;
	},
): Promise<ChatCutImportHistoryRecord | null> {
	const handoffId = normalizeIdentifier({
		value: lookup.handoffId,
		label: "Handoff id",
	});
	const resultId =
		lookup.resultId === undefined
			? undefined
			: normalizeIdentifier({ value: lookup.resultId, label: "Result id" });
	const idempotencyKey =
		lookup.idempotencyKey === undefined
			? undefined
			: normalizeIdempotencyKey(lookup.idempotencyKey);
	const records = await listProjectChatCutImports({
		projectId: lookup.projectId,
		storage: lookup.storage,
	});
	return (
		records.find(
			(record) =>
				record.handoffId === handoffId &&
				(resultId === undefined || record.resultId === resultId) &&
				(idempotencyKey === undefined ||
					record.idempotencyKey === idempotencyKey),
		) ?? null
	);
}

export async function saveChatCutImportReceipt({
	handoffId,
	receipt,
	storage = defaultStorage,
}: {
	handoffId: string;
	receipt: ChatCutImportApplyReceipt;
	storage?: ChatCutImportStorageAdapter;
}): Promise<ChatCutImportHistoryRecord> {
	const record = createRecord({ handoffId, receipt });
	const existing = await loadChatCutImportHistory({
		projectId: record.projectId,
		storage,
	});
	const records = existing?.records ?? [];
	const byResult = records.find(
		(candidate) =>
			candidate.handoffId === record.handoffId &&
			candidate.resultId === record.resultId,
	);
	const byIdempotency = records.find(
		(candidate) =>
			candidate.handoffId === record.handoffId &&
			candidate.idempotencyKey === record.idempotencyKey,
	);
	const byReceiptId = records.find(
		(candidate) => candidate.receipt.receiptId === record.receipt.receiptId,
	);
	const prior = byResult ?? byIdempotency ?? byReceiptId;
	if (prior !== undefined) {
		if (
			prior === byResult &&
			prior === byIdempotency &&
			(byReceiptId === undefined || prior === byReceiptId) &&
			recordsEqual({ left: prior, right: record })
		) {
			return prior;
		}
		throw new ChatCutImportStorageConflictError(
			"The ChatCut result or idempotency identity already has a different immutable receipt.",
		);
	}
	const next = buildHistory({
		projectId: record.projectId,
		records: [...records, record],
		events: existing?.events ?? [],
	});
	await storage.append({
		projectId: record.projectId,
		value: next,
		expectedRevision: existing?.revision ?? 0,
	});
	return next.records.at(-1)!;
}

export async function appendChatCutImportStateTransition({
	projectId,
	receiptId,
	transition,
	occurredAt = new Date().toISOString(),
	storage = defaultStorage,
}: {
	projectId: string;
	receiptId: string;
	transition: ChatCutImportTransition;
	occurredAt?: string;
	storage?: ChatCutImportStorageAdapter;
}): Promise<ChatCutImportStateEvent> {
	const normalizedProjectId = normalizeIdentifier({
		value: projectId,
		label: "Project id",
	});
	const normalizedReceiptId = normalizeIdentifier({
		value: receiptId,
		label: "Receipt id",
	});
	if (!canonicalTimestampSchema.safeParse(occurredAt).success) {
		throw new ChatCutImportStorageValidationError(
			"Transition timestamp is invalid.",
		);
	}
	const existing = await loadChatCutImportHistory({
		projectId: normalizedProjectId,
		storage,
	});
	if (existing === null) {
		throw new ChatCutImportStorageValidationError(
			"Cannot change state for a missing ChatCut import receipt.",
		);
	}
	const entries = deriveEntries({
		records: existing.records,
		events: existing.events,
	});
	const entry = entries?.find(
		(candidate) => candidate.record.receipt.receiptId === normalizedReceiptId,
	);
	const expectedState = transition === "undone" ? "applied" : "undone";
	if (entry === undefined || entry.state !== expectedState) {
		throw new ChatCutImportStorageConflictError(
			`Cannot append a ${transition} transition from the current import state.`,
		);
	}
	const event = deepFreeze({
		eventId: `state-${existing.revision + 1}-${normalizedReceiptId.slice(0, 80)}`,
		projectId: normalizedProjectId,
		receiptId: normalizedReceiptId,
		transition,
		occurredAt,
	} satisfies ChatCutImportStateEvent);
	const next = buildHistory({
		projectId: normalizedProjectId,
		records: existing.records,
		events: [...existing.events, event],
	});
	await storage.append({
		projectId: normalizedProjectId,
		value: next,
		expectedRevision: existing.revision,
	});
	return next.events.at(-1)!;
}

export async function clearProjectChatCutImports({
	projectId,
	storage = defaultStorage,
}: {
	projectId: string;
	storage?: ChatCutImportStorageAdapter;
}): Promise<void> {
	await storage.deleteProject({
		projectId: normalizeIdentifier({ value: projectId, label: "Project id" }),
	});
}
