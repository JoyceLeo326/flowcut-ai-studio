import { describe, expect, test } from "bun:test";
import type { ChatCutImportApplyReceipt } from "./chatcut-result";
import {
	ChatCutImportStorageConflictError,
	ChatCutImportStorageValidationError,
	appendChatCutImportStateTransition,
	clearProjectChatCutImports,
	IndexedDBChatCutImportStorage,
	listProjectChatCutImportEntries,
	listProjectChatCutImports,
	loadChatCutImportHistory,
	loadChatCutImportRecord,
	MemoryChatCutImportStorage,
	parseChatCutImportHistory,
	saveChatCutImportReceipt,
} from "./chatcut-import-store";

const baselineFingerprint = `sha256:${"a".repeat(64)}`;
const resultingFingerprint = `sha256:${"b".repeat(64)}`;

function makeReceipt({
	receiptId = "receipt-1",
	resultId = "result-1",
	idempotencyKey = "chatcut-result:result-1",
	projectId = "project-1",
	fromVersion = 1,
	toVersion = 2,
	toVersionId = "version-2",
	appliedAt = "2026-07-23T08:00:00.000Z",
	operationIds = ["operation-1"],
}: {
	receiptId?: string;
	resultId?: string;
	idempotencyKey?: string;
	projectId?: string;
	fromVersion?: number;
	toVersion?: number;
	toVersionId?: string;
	appliedAt?: string;
	operationIds?: string[];
} = {}): ChatCutImportApplyReceipt {
	return {
		kind: "visioncut.chatcut-import-receipt",
		schemaVersion: 1,
		receiptId,
		resultId,
		idempotencyKey,
		projectId,
		timelineId: "timeline-1",
		fromVersion,
		fromVersionId: `version-${fromVersion}`,
		toVersion,
		toVersionId,
		appliedAt,
		operationIds,
		resultingTimelineFingerprint: resultingFingerprint,
		undoReference: {
			kind: "visioncut.timeline-undo-reference",
			projectId,
			timelineId: "timeline-1",
			snapshotId: `snapshot-${fromVersion}`,
			versionId: `version-${fromVersion}`,
			timelineFingerprint: baselineFingerprint,
		},
	};
}

describe("ChatCut import receipt storage", () => {
	test("persists and reads one complete immutable receipt record", async () => {
		const storage = new MemoryChatCutImportStorage();
		const source = makeReceipt();
		const saved = await saveChatCutImportReceipt({
			handoffId: "handoff-1",
			receipt: source,
			storage,
		});

		expect(saved.resultingVersion).toBe(2);
		expect(saved.resultingVersionId).toBe("version-2");
		expect(saved.resultingTimelineFingerprint).toBe(resultingFingerprint);
		expect(saved.appliedOperationIds).toEqual(["operation-1"]);
		expect(saved.appliedAt).toBe("2026-07-23T08:00:00.000Z");
		expect(Object.isFrozen(saved)).toBe(true);
		expect(Object.isFrozen(saved.receipt)).toBe(true);
		expect(Object.isFrozen(saved.appliedOperationIds)).toBe(true);

		const byResult = await loadChatCutImportRecord({
			projectId: "project-1",
			handoffId: "handoff-1",
			resultId: "result-1",
			storage,
		});
		const byIdempotency = await loadChatCutImportRecord({
			projectId: "project-1",
			handoffId: "handoff-1",
			idempotencyKey: "chatcut-result:result-1",
			storage,
		});
		expect(byResult).toEqual(saved);
		expect(byIdempotency).toEqual(saved);
	});

	test("returns the prior record for an identical idempotent save", async () => {
		const storage = new MemoryChatCutImportStorage();
		const receipt = makeReceipt();
		const first = await saveChatCutImportReceipt({
			handoffId: "handoff-1",
			receipt,
			storage,
		});
		const repeated = await saveChatCutImportReceipt({
			handoffId: "handoff-1",
			receipt,
			storage,
		});

		expect(repeated).toEqual(first);
		expect(
			await listProjectChatCutImports({ projectId: "project-1", storage }),
		).toHaveLength(1);
	});

	test("rejects changed receipts and reused idempotency identities", async () => {
		const storage = new MemoryChatCutImportStorage();
		await saveChatCutImportReceipt({
			handoffId: "handoff-1",
			receipt: makeReceipt(),
			storage,
		});

		await expect(
			saveChatCutImportReceipt({
				handoffId: "handoff-1",
				receipt: makeReceipt({
					toVersion: 3,
					toVersionId: "version-3",
				}),
				storage,
			}),
		).rejects.toBeInstanceOf(ChatCutImportStorageConflictError);
		await expect(
			saveChatCutImportReceipt({
				handoffId: "handoff-1",
				receipt: makeReceipt({
					receiptId: "receipt-2",
					resultId: "result-2",
				}),
				storage,
			}),
		).rejects.toBeInstanceOf(ChatCutImportStorageConflictError);
	});

	test("keeps prior history unchanged and rejects stale appends", async () => {
		const storage = new MemoryChatCutImportStorage();
		const mutableOperationIds = ["operation-1"];
		const source = makeReceipt({ operationIds: mutableOperationIds });
		await saveChatCutImportReceipt({
			handoffId: "handoff-1",
			receipt: source,
			storage,
		});
		mutableOperationIds[0] = "mutated-operation";

		const history = await loadChatCutImportHistory({
			projectId: "project-1",
			storage,
		});
		expect(history?.records[0].appliedOperationIds).toEqual(["operation-1"]);
		expect(Object.isFrozen(history)).toBe(true);
		expect(Object.isFrozen(history?.records)).toBe(true);

		await expect(
			storage.append({
				projectId: "project-1",
				value: history!,
				expectedRevision: 0,
			}),
		).rejects.toBeInstanceOf(ChatCutImportStorageConflictError);
	});

	test("appends auditable undo and redo transitions without mutating receipts", async () => {
		const storage = new MemoryChatCutImportStorage();
		await saveChatCutImportReceipt({
			handoffId: "handoff-1",
			receipt: makeReceipt(),
			storage,
		});
		const originalRecord = (
			await listProjectChatCutImports({ projectId: "project-1", storage })
		)[0];

		await appendChatCutImportStateTransition({
			projectId: "project-1",
			receiptId: "receipt-1",
			transition: "undone",
			occurredAt: "2026-07-23T08:01:00.000Z",
			storage,
		});
		let entries = await listProjectChatCutImportEntries({
			projectId: "project-1",
			storage,
		});
		expect(entries[0].state).toBe("undone");
		expect(entries[0].lastTransition?.transition).toBe("undone");
		expect(entries[0].record).toEqual(originalRecord);

		await expect(
			appendChatCutImportStateTransition({
				projectId: "project-1",
				receiptId: "receipt-1",
				transition: "undone",
				occurredAt: "2026-07-23T08:02:00.000Z",
				storage,
			}),
		).rejects.toBeInstanceOf(ChatCutImportStorageConflictError);

		await appendChatCutImportStateTransition({
			projectId: "project-1",
			receiptId: "receipt-1",
			transition: "redone",
			occurredAt: "2026-07-23T08:02:00.000Z",
			storage,
		});
		entries = await listProjectChatCutImportEntries({
			projectId: "project-1",
			storage,
		});
		const history = await loadChatCutImportHistory({
			projectId: "project-1",
			storage,
		});
		expect(entries[0].state).toBe("applied");
		expect(entries[0].lastTransition?.transition).toBe("redone");
		expect(history?.revision).toBe(3);
		expect(history?.records).toHaveLength(1);
		expect(history?.events).toHaveLength(2);
		expect(Object.isFrozen(history?.events)).toBe(true);
	});

	test("loads schema-v1 histories written before state events existed", async () => {
		const storage = new MemoryChatCutImportStorage();
		await saveChatCutImportReceipt({
			handoffId: "handoff-1",
			receipt: makeReceipt(),
			storage,
		});
		const current = await loadChatCutImportHistory({
			projectId: "project-1",
			storage,
		});
		expect(current).not.toBeNull();
		if (current === null) throw new Error("Expected stored history.");
		const { events: _events, ...legacyFields } = structuredClone(current);
		const legacy = { ...legacyFields, revision: 1 };

		const parsed = parseChatCutImportHistory({ value: legacy });
		expect(parsed?.records).toHaveLength(1);
		expect(parsed?.events).toEqual([]);
	});

	test("lists project-scoped history and clears only the selected project", async () => {
		const storage = new MemoryChatCutImportStorage();
		await saveChatCutImportReceipt({
			handoffId: "handoff-1",
			receipt: makeReceipt(),
			storage,
		});
		await saveChatCutImportReceipt({
			handoffId: "handoff-2",
			receipt: makeReceipt({
				receiptId: "receipt-2",
				resultId: "result-2",
				idempotencyKey: "chatcut-result:result-2",
				appliedAt: "2026-07-23T08:01:00.000Z",
			}),
			storage,
		});
		await saveChatCutImportReceipt({
			handoffId: "handoff-1",
			receipt: makeReceipt({
				projectId: "project-2",
				receiptId: "receipt-project-2",
			}),
			storage,
		});

		expect(
			await listProjectChatCutImports({ projectId: "project-1", storage }),
		).toHaveLength(2);
		await clearProjectChatCutImports({ projectId: "project-1", storage });
		expect(
			await listProjectChatCutImports({ projectId: "project-1", storage }),
		).toHaveLength(0);
		expect(
			await listProjectChatCutImports({ projectId: "project-2", storage }),
		).toHaveLength(1);
	});

	test("uses the memory fallback when IndexedDB is unavailable", async () => {
		const fallback = new MemoryChatCutImportStorage();
		const storage = new IndexedDBChatCutImportStorage({
			indexedDBFactory: null,
			fallback,
		});
		await saveChatCutImportReceipt({
			handoffId: "handoff-fallback",
			receipt: makeReceipt(),
			storage,
		});

		expect(
			await loadChatCutImportRecord({
				projectId: "project-1",
				handoffId: "handoff-fallback",
				resultId: "result-1",
				storage,
			}),
		).not.toBeNull();
		await clearProjectChatCutImports({ projectId: "project-1", storage });
		expect(
			await loadChatCutImportHistory({ projectId: "project-1", storage }),
		).toBeNull();
	});

	test("rejects binary or non-JSON receipt payloads", async () => {
		const storage = new MemoryChatCutImportStorage();
		const receipt = makeReceipt();
		Reflect.set(receipt, "binaryPayload", new Uint8Array([1, 2, 3]));

		await expect(
			saveChatCutImportReceipt({
				handoffId: "handoff-1",
				receipt,
				storage,
			}),
		).rejects.toBeInstanceOf(ChatCutImportStorageValidationError);
	});
});
