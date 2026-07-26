import { describe, expect, test } from "bun:test";
import { installMockWasm } from "@/test-utils/mock-wasm";
import type { SceneTracks } from "@/timeline";
import type {
	EditDecisionCurrentAssetState,
	EditDecisionOperation,
	EditDecisionPlan,
} from "./edit-decision-orchestrator";

installMockWasm();

const {
	EditDecisionExecutionError,
	buildEditDecisionTracks,
	inspectEditDecisionApplicability,
} = await import("./edit-decision-executor");
const { mediaTimeFromSeconds } = await import("@/wasm");

const t = (seconds: number) => mediaTimeFromSeconds({ seconds });

interface OperationInput {
	readonly operationId: string;
	readonly assetId: string;
	readonly kind?: "remove" | "trim" | "primary";
	readonly startSeconds: number;
	readonly endSeconds: number;
	readonly edge?: "head" | "tail";
	readonly availability?: "suggestion" | "executable" | "blocked";
}

function operation({
	operationId,
	assetId,
	kind = "remove",
	startSeconds,
	endSeconds,
	edge,
	availability = "suggestion",
}: OperationInput): EditDecisionOperation {
	const base = {
		operationId,
		assetId,
		sourceRange: {
			unit: "seconds" as const,
			startSeconds,
			endSeconds,
		},
		inputFingerprint: `fingerprint-${assetId}`,
		mediaIndexId: `index-${assetId}`,
		evidenceIds: [`evidence-${operationId}`],
		reason: "Measured low-energy interval; no semantic claim.",
		availability,
		availabilityReason: "Human review is required.",
		requiresExplicitReview: true as const,
	};
	if (kind === "trim") {
		return {
			...base,
			kind,
			edge: edge ?? "head",
		};
	}
	if (kind === "primary") {
		return {
			...base,
			kind,
			candidateRank: 1,
		};
	}
	return { ...base, kind };
}

function plan({
	operations,
	assetIds = ["asset-a", "asset-b", "asset-c"],
}: {
	operations: readonly EditDecisionOperation[];
	assetIds?: readonly string[];
}): EditDecisionPlan {
	return {
		kind: "visioncut.edit-decision-plan",
		schemaVersion: 1,
		planId: "plan-1",
		projectId: "project-1",
		createdAt: "2026-07-27T00:00:00.000Z",
		intent: {
			revision: 1,
			userIntent: "Remove the reviewed pauses.",
		},
		editPlan: {
			planId: "edit-plan-1",
			formatVersion: "flowcut.edit-plan/v1",
			mode: "local",
			prompt: "Remove the reviewed pauses.",
			target: {
				platform: "generic",
				label: "General",
				aspectRatio: "16:9",
				style: "documentary",
			},
		},
		storyGraph: null,
		inputs: {
			assets: assetIds.map((assetId, sourceOrder) => ({
				assetId,
				inputFingerprint: `fingerprint-${assetId}`,
				mediaIndexId: `index-${assetId}`,
				mediaIndexAlgorithmVersion: "test/1",
				durationSeconds:
					assetId === "asset-b" ? 8 : assetId === "asset-c" ? 6 : 10,
				sourceOrder,
				storyGraphNodeIds: [],
			})),
		},
		suggestedAssetOrder: [...assetIds],
		primaryCandidateAssetId: assetIds[0] ?? null,
		operations: [...operations],
		limitations: ["No semantic claim."],
		guarantees: {
			localOnly: true,
			deterministic: true,
			network: false,
			paidService: false,
			mutatesProject: false,
			createsCommand: false,
			requiresExplicitReview: true,
			semanticClaims: false,
		},
	};
}

function currentAssets(
	assetIds: readonly string[] = ["asset-a", "asset-b", "asset-c"],
): readonly EditDecisionCurrentAssetState[] {
	return assetIds.map((assetId) => ({
		assetId,
		inputFingerprint: `fingerprint-${assetId}`,
		mediaIndexId: `index-${assetId}`,
	}));
}

function tracks(): SceneTracks {
	return {
		main: {
			id: "main",
			name: "Main video",
			type: "video",
			muted: false,
			hidden: false,
			elements: [
				{
					id: "clip-a",
					name: "A",
					type: "video",
					mediaId: "asset-a",
					startTime: t(0),
					duration: t(10),
					trimStart: t(0),
					trimEnd: t(2),
					sourceDuration: t(12),
					params: {},
				},
				{
					id: "clip-b",
					name: "B",
					type: "video",
					mediaId: "asset-b",
					startTime: t(10),
					duration: t(8),
					trimStart: t(0),
					trimEnd: t(2),
					sourceDuration: t(10),
					params: {},
				},
				{
					id: "clip-c",
					name: "C",
					type: "video",
					mediaId: "asset-c",
					startTime: t(18),
					duration: t(6),
					trimStart: t(0),
					trimEnd: t(0),
					sourceDuration: t(6),
					params: {},
				},
			],
		},
		overlay: [
			{
				id: "overlay",
				name: "Overlay",
				type: "text",
				hidden: false,
				elements: [
					{
						id: "later-title",
						name: "Later title",
						type: "text",
						startTime: t(24),
						duration: t(2),
						trimStart: t(0),
						trimEnd: t(0),
						params: {},
					},
				],
			},
		],
		audio: [
			{
				id: "audio",
				name: "Uploaded audio",
				type: "audio",
				muted: false,
				elements: [
					{
						id: "later-audio",
						name: "Later audio",
						type: "audio",
						sourceType: "upload",
						mediaId: "audio-upload",
						startTime: t(26),
						duration: t(2),
						trimStart: t(0),
						trimEnd: t(0),
						params: {},
					},
				],
			},
		],
	};
}

describe("edit-decision transactional executor", () => {
	test("cuts multiple reviewed pauses across assets and ripples the whole scene deterministically", () => {
		const operations = [
			operation({
				operationId: "remove-a-1",
				assetId: "asset-a",
				startSeconds: 2,
				endSeconds: 3,
			}),
			operation({
				operationId: "remove-a-2",
				assetId: "asset-a",
				startSeconds: 5,
				endSeconds: 6,
				availability: "executable",
			}),
			operation({
				operationId: "trim-b-head",
				assetId: "asset-b",
				kind: "trim",
				edge: "head",
				startSeconds: 0,
				endSeconds: 1,
			}),
			operation({
				operationId: "trim-b-tail",
				assetId: "asset-b",
				kind: "trim",
				edge: "tail",
				startSeconds: 7,
				endSeconds: 8,
			}),
		];
		const inputTracks = tracks();
		const inputPlan = plan({ operations });
		const approvals = operations.map((item) => item.operationId);
		const states = currentAssets();
		const before = JSON.stringify({
			inputTracks,
			inputPlan,
			approvals,
			states,
		});

		const result = buildEditDecisionTracks({
			tracks: inputTracks,
			plan: inputPlan,
			approvedOperationIds: approvals,
			currentAssets: states,
			elementIds: ["segment-1", "segment-2", "segment-3", "segment-4"],
		});

		expect(result.canApply).toBe(true);
		expect(result.removedSeconds).toBe(4);
		expect(result.executedOperations).toEqual(operations);
		expect(
			result.tracks.main.elements.map((element) => ({
				id: element.id,
				mediaId: element.mediaId,
				start: element.startTime,
				duration: element.duration,
				trimStart: element.trimStart,
				trimEnd: element.trimEnd,
				sourceDuration: element.sourceDuration,
			})),
		).toEqual([
			{
				id: "segment-1",
				mediaId: "asset-a",
				start: t(0),
				duration: t(2),
				trimStart: t(0),
				trimEnd: t(10),
				sourceDuration: t(12),
			},
			{
				id: "segment-2",
				mediaId: "asset-a",
				start: t(2),
				duration: t(2),
				trimStart: t(3),
				trimEnd: t(7),
				sourceDuration: t(12),
			},
			{
				id: "segment-3",
				mediaId: "asset-a",
				start: t(4),
				duration: t(4),
				trimStart: t(6),
				trimEnd: t(2),
				sourceDuration: t(12),
			},
			{
				id: "segment-4",
				mediaId: "asset-b",
				start: t(8),
				duration: t(6),
				trimStart: t(1),
				trimEnd: t(3),
				sourceDuration: t(10),
			},
			{
				id: "clip-c",
				mediaId: "asset-c",
				start: t(14),
				duration: t(6),
				trimStart: t(0),
				trimEnd: t(0),
				sourceDuration: t(6),
			},
		]);
		expect(result.tracks.overlay[0].elements[0].startTime).toBe(t(20));
		expect(result.tracks.audio[0].elements[0].startTime).toBe(t(22));
		expect(JSON.stringify({ inputTracks, inputPlan, approvals, states })).toBe(
			before,
		);
	});

	test("rejects stale fingerprints or MediaIndex ids before building tracks", () => {
		const remove = operation({
			operationId: "remove-a",
			assetId: "asset-a",
			startSeconds: 2,
			endSeconds: 3,
		});
		const input = {
			tracks: tracks(),
			plan: plan({ operations: [remove] }),
			approvedOperationIds: [remove.operationId],
			currentAssets: currentAssets().map((asset) =>
				asset.assetId === "asset-a"
					? { ...asset, mediaIndexId: "index-replaced" }
					: asset,
			),
		};

		const applicability = inspectEditDecisionApplicability(input);
		expect(applicability.canApply).toBe(false);
		expect(applicability.blockers.map((blocker) => blocker.code)).toContain(
			"plan-stale",
		);
		expect(() =>
			buildEditDecisionTracks({
				...input,
				elementIds: ["segment-1", "segment-2"],
			}),
		).toThrow(EditDecisionExecutionError);
	});

	test("keeps valid suggestions unexecuted unless their exact ids are approved", () => {
		const approved = operation({
			operationId: "approved",
			assetId: "asset-a",
			startSeconds: 2,
			endSeconds: 3,
		});
		const pending = operation({
			operationId: "pending",
			assetId: "asset-a",
			startSeconds: 5,
			endSeconds: 6,
		});
		const inputPlan = plan({ operations: [approved, pending] });
		const result = buildEditDecisionTracks({
			tracks: tracks(),
			plan: inputPlan,
			approvedOperationIds: [approved.operationId],
			currentAssets: currentAssets(),
			elementIds: ["segment-1", "segment-2"],
		});

		expect(result.removedSeconds).toBe(1);
		expect(result.executedOperations).toEqual([approved]);
		expect(
			result.tracks.main.elements
				.filter((element) => element.mediaId === "asset-a")
				.map((element) => [
					element.trimStart,
					element.duration,
					element.trimEnd,
				]),
		).toEqual([
			[t(0), t(2), t(10)],
			[t(3), t(7), t(2)],
		]);

		const empty = inspectEditDecisionApplicability({
			tracks: tracks(),
			plan: inputPlan,
			approvedOperationIds: [],
			currentAssets: currentAssets(),
		});
		expect(empty.blockers.map((blocker) => blocker.code)).toContain(
			"approval-empty",
		);
	});

	test("atomically rejects one invalid operation and all non-timeline review suggestions", () => {
		const valid = operation({
			operationId: "valid",
			assetId: "asset-a",
			startSeconds: 2,
			endSeconds: 3,
		});
		const invalid = operation({
			operationId: "invalid",
			assetId: "asset-b",
			startSeconds: 7,
			endSeconds: 9,
		});
		const primary = operation({
			operationId: "primary",
			assetId: "asset-a",
			kind: "primary",
			startSeconds: 0,
			endSeconds: 10,
		});
		const inputTracks = tracks();
		const before = JSON.stringify(inputTracks);

		const applicability = inspectEditDecisionApplicability({
			tracks: inputTracks,
			plan: plan({ operations: [valid, invalid, primary] }),
			approvedOperationIds: [
				valid.operationId,
				invalid.operationId,
				primary.operationId,
			],
			currentAssets: currentAssets(),
		});

		expect(applicability.canApply).toBe(false);
		expect(applicability.blockers.map((blocker) => blocker.code)).toContain(
			"operation-out-of-bounds",
		);
		expect(applicability.blockers.map((blocker) => blocker.code)).toContain(
			"operation-not-timeline-edit",
		);
		expect(JSON.stringify(inputTracks)).toBe(before);
	});

	test("rejects overlapping cuts while allowing touching reviewed boundaries", () => {
		const first = operation({
			operationId: "first",
			assetId: "asset-a",
			startSeconds: 2,
			endSeconds: 4,
		});
		const overlap = operation({
			operationId: "overlap",
			assetId: "asset-a",
			startSeconds: 3,
			endSeconds: 5,
		});
		const touching = operation({
			operationId: "touching",
			assetId: "asset-a",
			startSeconds: 4,
			endSeconds: 5,
		});

		const rejected = inspectEditDecisionApplicability({
			tracks: tracks(),
			plan: plan({ operations: [first, overlap] }),
			approvedOperationIds: [first.operationId, overlap.operationId],
			currentAssets: currentAssets(),
		});
		expect(rejected.blockers.map((blocker) => blocker.code)).toContain(
			"operation-overlap",
		);

		const accepted = inspectEditDecisionApplicability({
			tracks: tracks(),
			plan: plan({ operations: [first, touching] }),
			approvedOperationIds: [first.operationId, touching.operationId],
			currentAssets: currentAssets(),
		});
		expect(accepted.canApply).toBe(true);
		expect(accepted.removedSeconds).toBe(3);
	});

	test("safely blocks retime, animation, bookmarks, cross-track overlap, and non-upload audio", () => {
		const remove = operation({
			operationId: "remove-a",
			assetId: "asset-a",
			startSeconds: 2,
			endSeconds: 3,
		});
		const unsafeTracks = tracks();
		unsafeTracks.main.elements[0] = {
			...unsafeTracks.main.elements[0],
			retime: { rate: 1.25 },
			animations: { opacity: { keys: [] } },
		};
		unsafeTracks.overlay[0].elements[0] = {
			...unsafeTracks.overlay[0].elements[0],
			startTime: t(1),
		};
		unsafeTracks.audio[0].elements[0] = {
			id: "library-audio",
			name: "Library",
			type: "audio",
			sourceType: "library",
			sourceUrl: "https://example.invalid/audio.mp3",
			startTime: t(30),
			duration: t(2),
			trimStart: t(0),
			trimEnd: t(0),
			params: {},
		};

		const applicability = inspectEditDecisionApplicability({
			tracks: unsafeTracks,
			plan: plan({ operations: [remove] }),
			approvedOperationIds: [remove.operationId],
			currentAssets: currentAssets(),
			hasTimelineBookmarks: true,
		});
		const codes = applicability.blockers.map((blocker) => blocker.code);
		expect(codes).toContain("target-retimed");
		expect(codes).toContain("timeline-animation");
		expect(codes).toContain("timeline-bookmarks");
		expect(codes).toContain("cross-track-overlap");
		expect(codes).toContain("library-audio");
	});
});
