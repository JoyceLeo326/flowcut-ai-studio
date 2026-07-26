import { describe, expect, test } from "bun:test";
import {
	buildChatCutResultPreview,
	ChatCutResultValidationError,
	compareChatCutResult,
	createChatCutResultIdempotencyKey,
	finalizeChatCutResultImport,
	parseChatCutResult,
	prepareChatCutResultImport,
	serializeChatCutResult,
	validateChatCutResult,
	type ChatCutImportTargetState,
	type ChatCutResultEnvelope,
	type ChatCutResultOperation,
} from "./chatcut-result";

const CREATED_AT = "2026-07-23T10:06:00.000Z";
const APPLIED_AT = "2026-07-23T10:05:00.000Z";
const IMPORTED_AT = "2026-07-23T10:10:00.000Z";

function fingerprint(character: string): string {
	return `sha256:${character.repeat(64)}`;
}

const BASELINE_FINGERPRINT = fingerprint("a");
const SOURCE_BEFORE_FINGERPRINT = fingerprint("b");
const SOURCE_AFTER_FINGERPRINT = fingerprint("c");
const TRANSCRIPT_FINGERPRINT = fingerprint("d");
const WORD_FINGERPRINT = fingerprint("e");
const ASSET_FINGERPRINT = fingerprint("f");

function operations(): ChatCutResultOperation[] {
	return [
		{
			id: "op-trim",
			sequence: 0,
			kind: "trim",
			surface: "timeline",
			scope: { projectId: "project-a", timelineId: "timeline-main" },
			target: {
				itemId: "item-trim",
				itemFingerprint: fingerprint("1"),
				assetId: "asset-a",
				trackId: "V1",
				playbackRate: { numerator: 1, denominator: 1 },
			},
			before: {
				timelineRange: { startFrame: 0, endFrame: 100 },
				sourceRange: { startFrame: 0, endFrame: 100 },
			},
			after: {
				timelineRange: { startFrame: 10, endFrame: 90 },
				sourceRange: { startFrame: 10, endFrame: 90 },
			},
			ripple: "none",
			evidence: [
				{
					kind: "timeline-item",
					evidenceId: "evidence-trim",
					assetId: "asset-a",
					itemId: "item-trim",
					itemFingerprint: fingerprint("1"),
					timelineFingerprint: BASELINE_FINGERPRINT,
					timelineRange: { startFrame: 0, endFrame: 100 },
					sourceRange: { startFrame: 0, endFrame: 100 },
				},
			],
		},
		{
			id: "op-split",
			sequence: 1,
			kind: "split",
			surface: "timeline",
			scope: { projectId: "project-a", timelineId: "timeline-main" },
			target: {
				itemId: "item-split",
				itemFingerprint: fingerprint("2"),
				assetId: "asset-a",
				trackId: "V1",
				playbackRate: { numerator: 1, denominator: 1 },
			},
			before: {
				timelineRange: { startFrame: 100, endFrame: 200 },
				sourceRange: { startFrame: 100, endFrame: 200 },
			},
			splitAtTimelineFrame: 150,
			splitAtSourceFrame: 150,
			resultItemIds: ["item-split-left", "item-split-right"],
			ripple: "none",
			evidence: [
				{
					kind: "timeline-item",
					evidenceId: "evidence-split",
					assetId: "asset-a",
					itemId: "item-split",
					itemFingerprint: fingerprint("2"),
					timelineFingerprint: BASELINE_FINGERPRINT,
					timelineRange: { startFrame: 100, endFrame: 200 },
					sourceRange: { startFrame: 100, endFrame: 200 },
				},
			],
		},
		{
			id: "op-remove",
			sequence: 2,
			kind: "remove",
			surface: "script",
			basis: "transcript",
			scope: { projectId: "project-a", timelineId: "timeline-main" },
			target: {
				itemId: "item-remove",
				itemFingerprint: fingerprint("3"),
				assetId: "asset-a",
				trackId: "V1",
				playbackRate: { numerator: 1, denominator: 1 },
				timelineRange: { startFrame: 220, endFrame: 230 },
				sourceRange: { startFrame: 220, endFrame: 230 },
			},
			ripple: "same-track",
			evidence: [
				{
					kind: "transcript-segment",
					evidenceId: "evidence-remove",
					assetId: "asset-a",
					transcriptId: "transcript-a",
					transcriptRevision: 2,
					segmentIds: ["segment-remove"],
					sourceRange: { startFrame: 220, endFrame: 230 },
					contentFingerprint: TRANSCRIPT_FINGERPRINT,
				},
			],
		},
		{
			id: "op-reorder",
			sequence: 3,
			kind: "reorder",
			surface: "timeline",
			scope: { projectId: "project-a", timelineId: "timeline-main" },
			trackId: "V1",
			segments: [
				{
					segmentId: "segment-a",
					target: {
						itemId: "item-order-a",
						itemFingerprint: fingerprint("4"),
						assetId: "asset-a",
						trackId: "V1",
						playbackRate: { numerator: 1, denominator: 1 },
					},
					timelineRange: { startFrame: 300, endFrame: 340 },
					sourceRange: { startFrame: 300, endFrame: 340 },
				},
				{
					segmentId: "segment-b",
					target: {
						itemId: "item-order-b",
						itemFingerprint: fingerprint("5"),
						assetId: "asset-a",
						trackId: "V1",
						playbackRate: { numerator: 1, denominator: 1 },
					},
					timelineRange: { startFrame: 340, endFrame: 380 },
					sourceRange: { startFrame: 340, endFrame: 380 },
				},
			],
			beforeOrder: ["segment-a", "segment-b"],
			afterOrder: ["segment-b", "segment-a"],
			ripple: "same-track",
			evidence: [
				{
					kind: "timeline-item",
					evidenceId: "evidence-order-a",
					assetId: "asset-a",
					itemId: "item-order-a",
					itemFingerprint: fingerprint("4"),
					timelineFingerprint: BASELINE_FINGERPRINT,
					timelineRange: { startFrame: 300, endFrame: 340 },
					sourceRange: { startFrame: 300, endFrame: 340 },
				},
				{
					kind: "timeline-item",
					evidenceId: "evidence-order-b",
					assetId: "asset-a",
					itemId: "item-order-b",
					itemFingerprint: fingerprint("5"),
					timelineFingerprint: BASELINE_FINGERPRINT,
					timelineRange: { startFrame: 340, endFrame: 380 },
					sourceRange: { startFrame: 340, endFrame: 380 },
				},
			],
		},
		{
			id: "op-caption-fix",
			sequence: 4,
			kind: "caption-fix",
			surface: "transcript",
			fixType: "asr-word",
			scope: { projectId: "project-a", timelineId: "timeline-main" },
			target: {
				assetId: "asset-a",
				transcriptId: "transcript-a",
				transcriptRevision: 2,
				segmentId: "segment-caption",
				wordId: "word-caption",
				sourceRange: { startFrame: 400, endFrame: 401 },
				wordFingerprint: WORD_FINGERPRINT,
			},
			beforeText: "helo",
			afterText: "hello",
			evidence: [
				{
					kind: "transcript-word",
					evidenceId: "evidence-caption",
					assetId: "asset-a",
					transcriptId: "transcript-a",
					transcriptRevision: 2,
					segmentId: "segment-caption",
					wordId: "word-caption",
					sourceRange: { startFrame: 400, endFrame: 401 },
					observedText: "helo",
					contentFingerprint: WORD_FINGERPRINT,
				},
			],
		},
	];
}

function envelope(): ChatCutResultEnvelope {
	const resultOperations = operations();
	const source = {
		provider: "ChatCut" as const,
		projectId: "chatcut-project-a",
		timelineId: "chatcut-timeline-a",
		timelineRevision: 7,
		beforeTimelineFingerprint: SOURCE_BEFORE_FINGERPRINT,
		afterTimelineFingerprint: SOURCE_AFTER_FINGERPRINT,
		applyReceipt: {
			kind: "chatcut.apply-receipt" as const,
			receiptId: "chatcut-receipt-a",
			appliedAt: APPLIED_AT,
			operationIds: resultOperations.map(({ id }) => id),
			beforeTimelineFingerprint: SOURCE_BEFORE_FINGERPRINT,
			afterTimelineFingerprint: SOURCE_AFTER_FINGERPRINT,
		},
		undoReference: {
			kind: "chatcut.timeline-undo-reference" as const,
			projectId: "chatcut-project-a",
			timelineId: "chatcut-timeline-a",
			snapshotId: "chatcut-snapshot-before",
			timelineRevision: 7,
			timelineFingerprint: SOURCE_BEFORE_FINGERPRINT,
		},
	};
	return {
		kind: "visioncut.chatcut-result",
		schemaVersion: 1,
		resultId: "chatcut-result-a",
		handoffId: "handoff-a",
		idempotencyKey: createChatCutResultIdempotencyKey({
			sourceProjectId: source.projectId,
			sourceTimelineId: source.timelineId,
			sourceReceiptId: source.applyReceipt.receiptId,
			baselineVersionId: "version-3",
		}),
		createdAt: CREATED_AT,
		timebase: {
			unit: "frame",
			fps: { numerator: 30, denominator: 1 },
		},
		baseline: {
			projectId: "project-a",
			projectVersion: 3,
			versionId: "version-3",
			timelineId: "timeline-main",
			timelineSnapshotId: "snapshot-3",
			timelineFingerprint: BASELINE_FINGERPRINT,
		},
		source,
		assets: [
			{
				visionCutAssetId: "asset-a",
				chatCutAssetId: "chatcut-asset-a",
				fingerprint: ASSET_FINGERPRINT,
				durationFrames: 1_000,
			},
		],
		operations: resultOperations,
		preview: buildChatCutResultPreview({ operations: resultOperations }),
		guarantees: {
			portableJson: true,
			binaryPayloads: false,
			apiKeys: false,
			freeTextCommands: false,
			requiresExplicitApproval: true,
		},
	};
}

function targetState(): ChatCutImportTargetState {
	return {
		projectId: "project-a",
		projectVersion: 3,
		versionId: "version-3",
		timelineId: "timeline-main",
		timelineSnapshotId: "snapshot-3",
		timelineFingerprint: BASELINE_FINGERPRINT,
		assets: [
			{
				assetId: "asset-a",
				fingerprint: ASSET_FINGERPRINT,
				durationFrames: 1_000,
			},
		],
		items: [
			{
				itemId: "item-trim",
				itemFingerprint: fingerprint("1"),
				assetId: "asset-a",
				trackId: "V1",
				playbackRate: { numerator: 1, denominator: 1 },
				timelineRange: { startFrame: 0, endFrame: 100 },
				sourceRange: { startFrame: 0, endFrame: 100 },
			},
			{
				itemId: "item-split",
				itemFingerprint: fingerprint("2"),
				assetId: "asset-a",
				trackId: "V1",
				playbackRate: { numerator: 1, denominator: 1 },
				timelineRange: { startFrame: 100, endFrame: 200 },
				sourceRange: { startFrame: 100, endFrame: 200 },
			},
			{
				itemId: "item-remove",
				itemFingerprint: fingerprint("3"),
				assetId: "asset-a",
				trackId: "V1",
				playbackRate: { numerator: 1, denominator: 1 },
				timelineRange: { startFrame: 200, endFrame: 300 },
				sourceRange: { startFrame: 200, endFrame: 300 },
			},
			{
				itemId: "item-order-a",
				itemFingerprint: fingerprint("4"),
				assetId: "asset-a",
				trackId: "V1",
				playbackRate: { numerator: 1, denominator: 1 },
				timelineRange: { startFrame: 300, endFrame: 340 },
				sourceRange: { startFrame: 300, endFrame: 340 },
			},
			{
				itemId: "item-order-b",
				itemFingerprint: fingerprint("5"),
				assetId: "asset-a",
				trackId: "V1",
				playbackRate: { numerator: 1, denominator: 1 },
				timelineRange: { startFrame: 340, endFrame: 380 },
				sourceRange: { startFrame: 340, endFrame: 380 },
			},
		],
		transcripts: [
			{
				transcriptId: "transcript-a",
				assetId: "asset-a",
				revision: 2,
				contentFingerprint: TRANSCRIPT_FINGERPRINT,
			},
		],
		transcriptWords: [
			{
				transcriptId: "transcript-a",
				assetId: "asset-a",
				revision: 2,
				segmentId: "segment-caption",
				wordId: "word-caption",
				sourceRange: { startFrame: 400, endFrame: 401 },
				text: "helo",
				wordFingerprint: WORD_FINGERPRINT,
			},
		],
		silenceAnalyses: [],
		appliedImports: [],
	};
}

function clone<T>(value: T): T {
	return structuredClone(value);
}

function operationIds(result = envelope()): string[] {
	return result.operations.map(({ id }) => id);
}

describe("ChatCut result envelope", () => {
	test("parses, freezes, and canonically serializes a portable versioned result", () => {
		const input = envelope();
		const parsed = parseChatCutResult(input);
		const serialized = serializeChatCutResult(input);
		const reparsed = parseChatCutResult(serialized);

		expect(parsed).toEqual(input);
		expect(reparsed).toEqual(input);
		expect(Object.isFrozen(parsed)).toBe(true);
		expect(Object.isFrozen(parsed.operations)).toBe(true);
		expect(serialized).toBe(serializeChatCutResult(reparsed));
		expect(serialized).not.toContain('"apiKey":');
		expect(serialized).not.toContain("blob:");
		expect(serialized).not.toContain("file:");
	});

	test("derives an exact preview from structured operations", () => {
		const preview = envelope().preview;

		expect(preview.summary).toEqual({
			operationCount: 5,
			destructiveCount: 2,
			structuralCount: 2,
			textCorrectionCount: 1,
			removedTimelineFrames: 30,
			movedSegmentCount: 2,
			correctedWordCount: 1,
		});
	});

	test("rejects free-text commands, credentials, binary objects, and runtime URLs", () => {
		const commandSource = clone(envelope());
		const withCommand = {
			...commandSource,
			operations: commandSource.operations.map((operation, index) =>
				index === 0
					? { ...operation, command: "delete everything" }
					: operation,
			),
		};
		expect(validateChatCutResult(withCommand).ok).toBe(false);

		const withCredential = { ...clone(envelope()), apiKey: "secret" };
		const credentialValidation = validateChatCutResult(withCredential);
		expect(credentialValidation.ok).toBe(false);
		if (!credentialValidation.ok) {
			expect(credentialValidation.issues[0]?.message).toContain("Credentials");
		}

		const withBlob = { ...clone(envelope()), payload: new Blob(["video"]) };
		expect(validateChatCutResult(withBlob).ok).toBe(false);

		const withRuntimeUrl = {
			...clone(envelope()),
			payload: "blob:temporary-media",
		};
		expect(validateChatCutResult(withRuntimeUrl).ok).toBe(false);
	});

	test("rejects tampered project scope, receipt, idempotency, and preview", () => {
		const scoped = clone(envelope());
		scoped.operations[0]!.scope.projectId = "project-b";
		expect(validateChatCutResult(scoped).ok).toBe(false);

		const receipt = clone(envelope());
		receipt.source.applyReceipt.operationIds.reverse();
		expect(validateChatCutResult(receipt).ok).toBe(false);

		const idempotency = clone(envelope());
		idempotency.idempotencyKey = "chatcut-result:tampered";
		expect(validateChatCutResult(idempotency).ok).toBe(false);

		const preview = clone(envelope());
		preview.preview.summary.removedTimelineFrames = 999;
		expect(validateChatCutResult(preview).ok).toBe(false);
	});

	test("rejects operations without exact evidence or valid frame semantics", () => {
		const missingEvidence = clone(envelope());
		missingEvidence.operations[2]!.evidence = [
			missingEvidence.operations[0]!.evidence[0]!,
		];
		missingEvidence.preview = buildChatCutResultPreview({
			operations: missingEvidence.operations,
		});
		expect(validateChatCutResult(missingEvidence).ok).toBe(false);

		const expandingTrim = clone(envelope());
		const trim = expandingTrim.operations[0]!;
		if (trim.kind !== "trim") throw new Error("Expected trim fixture.");
		trim.after = clone(trim.before);
		expandingTrim.preview = buildChatCutResultPreview({
			operations: expandingTrim.operations,
		});
		expect(validateChatCutResult(expandingTrim).ok).toBe(false);

		const unchangedReorder = clone(envelope());
		const reorder = unchangedReorder.operations[3]!;
		if (reorder.kind !== "reorder")
			throw new Error("Expected reorder fixture.");
		reorder.afterOrder = clone(reorder.beforeOrder);
		unchangedReorder.preview = buildChatCutResultPreview({
			operations: unchangedReorder.operations,
		});
		expect(validateChatCutResult(unchangedReorder).ok).toBe(false);

		const captionNoop = clone(envelope());
		const caption = captionNoop.operations[4]!;
		if (caption.kind !== "caption-fix") {
			throw new Error("Expected caption fixture.");
		}
		caption.afterText = caption.beforeText;
		expect(validateChatCutResult(captionNoop).ok).toBe(false);
	});

	test("binds timeline evidence to the exact item and source asset bounds", () => {
		const wrongItem = clone(envelope());
		const trimEvidence = wrongItem.operations[0]!.evidence[0]!;
		if (trimEvidence.kind !== "timeline-item") {
			throw new Error("Expected timeline evidence fixture.");
		}
		trimEvidence.itemId = "different-item";
		expect(validateChatCutResult(wrongItem).ok).toBe(false);

		const outsideAsset = clone(envelope());
		const outsideEvidence = outsideAsset.operations[0]!.evidence[0]!;
		if (outsideEvidence.kind !== "timeline-item") {
			throw new Error("Expected timeline evidence fixture.");
		}
		outsideEvidence.sourceRange.endFrame = 1_001;
		expect(validateChatCutResult(outsideAsset).ok).toBe(false);
	});

	test("supports evidence-backed silence removal without accepting a guessed range", () => {
		const result = clone(envelope());
		const remove = result.operations[2]!;
		if (remove.kind !== "remove") throw new Error("Expected remove fixture.");
		remove.basis = "silence";
		remove.evidence = [
			{
				kind: "silence-analysis",
				evidenceId: "evidence-silence",
				assetId: "asset-a",
				analysisId: "silence-analysis-a",
				analysisRevision: 1,
				sourceRange: clone(remove.target.sourceRange),
				confidence: 0.98,
				analysisFingerprint: fingerprint("6"),
			},
		];
		result.preview = buildChatCutResultPreview({
			operations: result.operations,
		});
		const current = clone(targetState());
		current.silenceAnalyses.push({
			analysisId: "silence-analysis-a",
			assetId: "asset-a",
			revision: 1,
			analysisFingerprint: fingerprint("6"),
		});

		expect(validateChatCutResult(result).ok).toBe(true);
		expect(compareChatCutResult({ result, current }).status).toBe("ready");

		current.silenceAnalyses[0]!.analysisFingerprint = fingerprint("7");
		const stale = compareChatCutResult({ result, current });
		expect(stale.status).toBe("conflict");
		expect(stale.conflicts.map(({ code }) => code)).toContain(
			"silence-analysis-state-mismatch",
		);
	});

	test("rejects invalid JSON and reports validation instead of executing it", () => {
		expect(() => parseChatCutResult("{not-json}")).toThrow(
			ChatCutResultValidationError,
		);
		const validation = validateChatCutResult("{not-json}");
		expect(validation.ok).toBe(false);
	});
});

describe("ChatCut result comparison", () => {
	test("accepts only the exact project baseline and evidenced current state", () => {
		const comparison = compareChatCutResult({
			result: envelope(),
			current: targetState(),
		});

		expect(comparison.status).toBe("ready");
		expect(comparison.conflicts).toEqual([]);
	});

	test("detects project, baseline, asset, and item conflicts", () => {
		const wrongProject = clone(targetState());
		wrongProject.projectId = "project-b";
		const scoped = compareChatCutResult({
			result: envelope(),
			current: wrongProject,
		});
		expect(scoped.status).toBe("conflict");
		expect(scoped.conflicts.map(({ code }) => code)).toContain(
			"project-mismatch",
		);

		const stale = clone(targetState());
		stale.projectVersion = 4;
		stale.versionId = "version-4";
		stale.timelineFingerprint = fingerprint("0");
		stale.assets[0]!.fingerprint = fingerprint("9");
		stale.items[0]!.itemFingerprint = fingerprint("8");
		const comparison = compareChatCutResult({
			result: envelope(),
			current: stale,
		});
		expect(comparison.status).toBe("conflict");
		const codes = comparison.conflicts.map(({ code }) => code);
		expect(codes).toContain("baseline-version-mismatch");
		expect(codes).toContain("baseline-version-id-mismatch");
		expect(codes).toContain("baseline-timeline-fingerprint-mismatch");
		expect(codes).toContain("asset-fingerprint-mismatch");
		expect(codes).toContain("item-fingerprint-mismatch");
	});

	test("detects stale transcript and word evidence", () => {
		const current = clone(targetState());
		current.transcripts[0]!.revision = 3;
		current.transcriptWords[0]!.text = "different";
		const comparison = compareChatCutResult({
			result: envelope(),
			current,
		});

		expect(comparison.status).toBe("conflict");
		const codes = comparison.conflicts.map(({ code }) => code);
		expect(codes).toContain("transcript-state-mismatch");
		expect(codes).toContain("transcript-word-state-mismatch");
	});
});

describe("ChatCut import preparation and receipts", () => {
	test("requires explicit structured approval for every operation", () => {
		const prepared = prepareChatCutResultImport({
			result: envelope(),
			current: targetState(),
			approvedOperationIds: ["op-trim"],
		});

		expect(prepared.status).toBe("approval-required");
		if (prepared.status === "approval-required") {
			expect(prepared.missingOperationIds).toEqual([
				"op-split",
				"op-remove",
				"op-reorder",
				"op-caption-fix",
			]);
		}
		expect(() =>
			prepareChatCutResultImport({
				result: envelope(),
				current: targetState(),
				approvedOperationIds: ["free text delete command"],
			}),
		).toThrow(ChatCutResultValidationError);
	});

	test("prepares a deterministic guarded plan without executable text commands", () => {
		const result = envelope();
		const input = {
			result,
			current: targetState(),
			approvedOperationIds: operationIds(result),
		};
		const first = prepareChatCutResultImport(input);
		const second = prepareChatCutResultImport(input);

		expect(first).toEqual(second);
		expect(first.status).toBe("ready");
		if (first.status !== "ready") throw new Error("Expected ready plan.");
		expect(first.plan.executionPolicy).toEqual({
			atomic: true,
			revalidateBeforeApply: true,
			freeTextCommandsAllowed: false,
			requiresExplicitApproval: true,
		});
		expect(first.plan.undoReference).toEqual({
			kind: "visioncut.timeline-undo-reference",
			projectId: "project-a",
			timelineId: "timeline-main",
			snapshotId: "snapshot-3",
			versionId: "version-3",
			timelineFingerprint: BASELINE_FINGERPRINT,
		});
		expect(Object.isFrozen(first.plan)).toBe(true);
		expect("command" in first.plan).toBe(false);
	});

	test("finalizes an apply receipt with an immutable undo reference", () => {
		const prepared = prepareChatCutResultImport({
			result: envelope(),
			current: targetState(),
			approvedOperationIds: operationIds(),
		});
		if (prepared.status !== "ready") throw new Error("Expected ready plan.");

		const receipt = finalizeChatCutResultImport({
			plan: prepared.plan,
			appliedAt: IMPORTED_AT,
			resultingVersion: 4,
			resultingVersionId: "version-4",
			resultingTimelineFingerprint: fingerprint("7"),
		});

		expect(receipt.fromVersion).toBe(3);
		expect(receipt.toVersion).toBe(4);
		expect(receipt.operationIds).toEqual(operationIds());
		expect(receipt.undoReference.timelineFingerprint).toBe(
			BASELINE_FINGERPRINT,
		);
		expect(Object.isFrozen(receipt)).toBe(true);
		expect(() =>
			finalizeChatCutResultImport({
				plan: prepared.plan,
				appliedAt: IMPORTED_AT,
				resultingVersion: 3,
				resultingVersionId: "version-3b",
				resultingTimelineFingerprint: fingerprint("7"),
			}),
		).toThrow(ChatCutResultValidationError);
	});

	test("returns the prior receipt for idempotent re-import", () => {
		const prepared = prepareChatCutResultImport({
			result: envelope(),
			current: targetState(),
			approvedOperationIds: operationIds(),
		});
		if (prepared.status !== "ready") throw new Error("Expected ready plan.");
		const receipt = finalizeChatCutResultImport({
			plan: prepared.plan,
			appliedAt: IMPORTED_AT,
			resultingVersion: 4,
			resultingVersionId: "version-4",
			resultingTimelineFingerprint: fingerprint("7"),
		});
		const current = clone(targetState());
		current.projectVersion = 4;
		current.versionId = "version-4";
		current.timelineFingerprint = fingerprint("7");
		current.appliedImports.push(receipt);

		const comparison = compareChatCutResult({
			result: envelope(),
			current,
		});
		const repeated = prepareChatCutResultImport({
			result: envelope(),
			current,
			approvedOperationIds: [],
		});

		expect(comparison.status).toBe("already-applied");
		expect(repeated).toEqual({ status: "already-applied", receipt });
	});

	test("rejects a foreign or non-forward local apply receipt", () => {
		const prepared = prepareChatCutResultImport({
			result: envelope(),
			current: targetState(),
			approvedOperationIds: operationIds(),
		});
		if (prepared.status !== "ready") throw new Error("Expected ready plan.");
		const receipt = finalizeChatCutResultImport({
			plan: prepared.plan,
			appliedAt: IMPORTED_AT,
			resultingVersion: 4,
			resultingVersionId: "version-4",
			resultingTimelineFingerprint: fingerprint("7"),
		});
		const current = clone(targetState());
		current.projectVersion = 4;
		current.versionId = "version-4";
		current.timelineFingerprint = fingerprint("7");
		const foreignReceipt = clone(receipt);
		foreignReceipt.projectId = "project-b";
		current.appliedImports.push(foreignReceipt);

		expect(() => compareChatCutResult({ result: envelope(), current })).toThrow(
			ChatCutResultValidationError,
		);
	});

	test("does not prepare through conflicts", () => {
		const current = clone(targetState());
		current.items.splice(0, 1);
		const prepared = prepareChatCutResultImport({
			result: envelope(),
			current,
			approvedOperationIds: operationIds(),
		});

		expect(prepared.status).toBe("conflict");
		if (prepared.status === "conflict") {
			expect(prepared.comparison.conflicts.map(({ code }) => code)).toContain(
				"item-missing",
			);
		}
	});
});
