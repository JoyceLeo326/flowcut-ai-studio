import { describe, expect, test } from "bun:test";
import type { SceneTracks, VideoElement } from "@/timeline";
import { installMockWasm } from "@/test-utils/mock-wasm";
import type {
	ChatCutPreparedImportPlan,
	ChatCutResultOperation,
	PlaybackRate,
} from "./chatcut-result";

const fps: PlaybackRate = { numerator: 30, denominator: 1 };

installMockWasm();

const { createChatCutTimelineItemState } =
	await import("./chatcut-timeline-adapter");
const { buildChatCutImportTracks, inspectChatCutImportApplicability } =
	await import("./chatcut-executor");
const { mediaTimeFromSeconds } = await import("@/wasm");

const t = (seconds: number) => mediaTimeFromSeconds({ seconds });

function video({
	id,
	start,
	duration,
	mediaId = "asset-a",
}: {
	id: string;
	start: number;
	duration: number;
	mediaId?: string;
}): VideoElement {
	return {
		id,
		name: id,
		type: "video",
		mediaId,
		startTime: t(start),
		duration: t(duration),
		trimStart: t(0),
		trimEnd: t(0),
		sourceDuration: t(duration),
		params: {},
	};
}

function tracks(elements: VideoElement[]): SceneTracks {
	return {
		main: {
			id: "V1",
			name: "Main",
			type: "video",
			muted: false,
			hidden: false,
			elements,
		},
		overlay: [],
		audio: [],
	};
}

function item({
	element,
	trackId = "V1",
}: {
	element: VideoElement;
	trackId?: string;
}) {
	return createChatCutTimelineItemState({ element, trackId, fps })!;
}

function evidence({
	target,
	evidenceId,
}: {
	target: ReturnType<typeof item>;
	evidenceId: string;
}) {
	return {
		kind: "timeline-item" as const,
		evidenceId,
		assetId: target.assetId,
		itemId: target.itemId,
		itemFingerprint: target.itemFingerprint,
		timelineFingerprint: `sha256:${"a".repeat(64)}`,
		timelineRange: target.timelineRange,
		sourceRange: target.sourceRange,
	};
}

function plan(operations: ChatCutResultOperation[]): ChatCutPreparedImportPlan {
	const removedTimelineFrames = operations.reduce((total, operation) => {
		if (operation.kind === "remove") {
			return (
				total +
				operation.target.timelineRange.endFrame -
				operation.target.timelineRange.startFrame
			);
		}
		if (operation.kind === "trim") {
			return (
				total +
				operation.before.timelineRange.endFrame -
				operation.before.timelineRange.startFrame -
				(operation.after.timelineRange.endFrame -
					operation.after.timelineRange.startFrame)
			);
		}
		return total;
	}, 0);
	return {
		kind: "visioncut.chatcut-import-plan",
		schemaVersion: 1,
		preparedImportId: "prepared-a",
		resultId: "result-a",
		idempotencyKey: "key-a",
		projectId: "project-a",
		timelineId: "timeline-main",
		approvedOperationIds: operations.map(({ id }) => id),
		operations,
		preview: {
			operationDiffs: [],
			summary: {
				operationCount: operations.length,
				destructiveCount: operations.filter(
					(operation) =>
						operation.kind === "trim" || operation.kind === "remove",
				).length,
				structuralCount: operations.filter(
					(operation) =>
						operation.kind === "split" || operation.kind === "reorder",
				).length,
				textCorrectionCount: 0,
				removedTimelineFrames,
				movedSegmentCount: 0,
				correctedWordCount: 0,
			},
		},
		guards: {
			expectedProjectVersion: 25,
			expectedVersionId: "version-25",
			expectedTimelineSnapshotId: "snapshot-a",
			expectedTimelineFingerprint: `sha256:${"a".repeat(64)}`,
			assetFingerprints: [
				{ assetId: "asset-a", fingerprint: `sha256:${"b".repeat(64)}` },
			],
		},
		undoReference: {
			kind: "visioncut.timeline-undo-reference",
			projectId: "project-a",
			timelineId: "timeline-main",
			snapshotId: "snapshot-a",
			versionId: "version-25",
			timelineFingerprint: `sha256:${"a".repeat(64)}`,
		},
		executionPolicy: {
			atomic: true,
			revalidateBeforeApply: true,
			freeTextCommandsAllowed: false,
			requiresExplicitApproval: true,
		},
	};
}

describe("ChatCut timeline executor", () => {
	test("applies a reviewed trim and multiple removals as one ripple change", () => {
		const source = video({ id: "clip-a", start: 0, duration: 10 });
		const following = video({ id: "clip-b", start: 10, duration: 2 });
		const target = item({ element: source });
		const operations: ChatCutResultOperation[] = [
			{
				id: "trim-a",
				sequence: 0,
				kind: "trim",
				surface: "timeline",
				scope: { projectId: "project-a", timelineId: "timeline-main" },
				target: {
					itemId: target.itemId,
					itemFingerprint: target.itemFingerprint,
					assetId: target.assetId,
					trackId: target.trackId,
					playbackRate: target.playbackRate,
				},
				before: {
					timelineRange: target.timelineRange,
					sourceRange: target.sourceRange,
				},
				after: {
					timelineRange: { startFrame: 0, endFrame: 270 },
					sourceRange: { startFrame: 0, endFrame: 270 },
				},
				ripple: "same-track",
				evidence: [evidence({ target, evidenceId: "e-trim" })],
			},
			...(
				[
					[60, 90],
					[150, 180],
				] as const
			).map(
				([startFrame, endFrame], index): ChatCutResultOperation => ({
					id: `remove-${index + 1}`,
					sequence: index + 1,
					kind: "remove",
					surface: "timeline",
					basis: "timeline-item",
					scope: { projectId: "project-a", timelineId: "timeline-main" },
					target: {
						itemId: target.itemId,
						itemFingerprint: target.itemFingerprint,
						assetId: target.assetId,
						trackId: target.trackId,
						playbackRate: target.playbackRate,
						timelineRange: { startFrame, endFrame },
						sourceRange: { startFrame, endFrame },
					},
					ripple: "same-track",
						evidence: [
							evidence({
								target,
								evidenceId: `e-remove-${index + 1}`,
							}),
						],
				}),
			),
		];
		const result = buildChatCutImportTracks({
			tracks: tracks([source, following]),
			plan: plan(operations),
			fps,
		});
		const output = result.tracks.main.elements;
		expect(output).toHaveLength(4);
		expect(output.map((element) => element.startTime)).toEqual([
			t(0),
			t(2),
			t(4),
			t(7),
		]);
		expect(output.map((element) => element.duration)).toEqual([
			t(2),
			t(2),
			t(3),
			t(2),
		]);
		expect(result.removedFrames).toBe(90);
	});

	test("splits one exact baseline item using result ids", () => {
		const source = video({ id: "clip-a", start: 0, duration: 4 });
		const target = item({ element: source });
		const operation: ChatCutResultOperation = {
			id: "split-a",
			sequence: 0,
			kind: "split",
			surface: "timeline",
			scope: { projectId: "project-a", timelineId: "timeline-main" },
			target: {
				itemId: target.itemId,
				itemFingerprint: target.itemFingerprint,
				assetId: target.assetId,
				trackId: target.trackId,
				playbackRate: target.playbackRate,
			},
			before: {
				timelineRange: target.timelineRange,
				sourceRange: target.sourceRange,
			},
			splitAtTimelineFrame: 60,
			splitAtSourceFrame: 60,
			resultItemIds: ["clip-a-left", "clip-a-right"],
			ripple: "none",
				evidence: [evidence({ target, evidenceId: "e-split" })],
		};
		const result = buildChatCutImportTracks({
			tracks: tracks([source]),
			plan: plan([operation]),
			fps,
		});
		expect(result.tracks.main.elements.map(({ id }) => id)).toEqual([
			"clip-a-left",
			"clip-a-right",
		]);
		expect(result.tracks.main.elements.map(({ duration }) => duration)).toEqual([
			t(2),
			t(2),
		]);
	});

	test("reorders contiguous full items without changing their durations", () => {
		const first = video({ id: "clip-a", start: 0, duration: 2 });
		const second = video({ id: "clip-b", start: 2, duration: 3 });
		const firstTarget = item({ element: first });
		const secondTarget = item({ element: second });
		const operation: ChatCutResultOperation = {
			id: "reorder-a",
			sequence: 0,
			kind: "reorder",
			surface: "timeline",
			scope: { projectId: "project-a", timelineId: "timeline-main" },
			trackId: "V1",
			segments: [
				{
					segmentId: "segment-a",
					target: {
						itemId: firstTarget.itemId,
						itemFingerprint: firstTarget.itemFingerprint,
						assetId: firstTarget.assetId,
						trackId: firstTarget.trackId,
						playbackRate: firstTarget.playbackRate,
					},
					timelineRange: firstTarget.timelineRange,
					sourceRange: firstTarget.sourceRange,
				},
				{
					segmentId: "segment-b",
					target: {
						itemId: secondTarget.itemId,
						itemFingerprint: secondTarget.itemFingerprint,
						assetId: secondTarget.assetId,
						trackId: secondTarget.trackId,
						playbackRate: secondTarget.playbackRate,
					},
					timelineRange: secondTarget.timelineRange,
					sourceRange: secondTarget.sourceRange,
				},
			],
			beforeOrder: ["segment-a", "segment-b"],
			afterOrder: ["segment-b", "segment-a"],
			ripple: "same-track",
			evidence: [
					evidence({
						target: firstTarget,
						evidenceId: "e-order-a",
					}),
					evidence({
						target: secondTarget,
						evidenceId: "e-order-b",
					}),
			],
		};
		const result = buildChatCutImportTracks({
			tracks: tracks([first, second]),
			plan: plan([operation]),
			fps,
		});
		expect(
			result.tracks.main.elements.map(({ id, startTime, duration }) => ({
				id,
				startTime,
				duration,
			})),
		).toEqual([
			{ id: "clip-b", startTime: t(0), duration: t(3) },
			{ id: "clip-a", startTime: t(3), duration: t(2) },
		]);
	});

	test("blocks stale fingerprints, unmodelled captions, and moving bookmarks", () => {
		const source = video({ id: "clip-a", start: 0, duration: 4 });
		const target = item({ element: source });
		const stale: ChatCutResultOperation = {
			id: "remove-a",
			sequence: 0,
			kind: "remove",
			surface: "timeline",
			basis: "timeline-item",
			scope: { projectId: "project-a", timelineId: "timeline-main" },
			target: {
				itemId: target.itemId,
				itemFingerprint: `sha256:${"f".repeat(64)}`,
				assetId: target.assetId,
				trackId: target.trackId,
				playbackRate: target.playbackRate,
				timelineRange: { startFrame: 30, endFrame: 60 },
				sourceRange: { startFrame: 30, endFrame: 60 },
			},
			ripple: "same-track",
				evidence: [evidence({ target, evidenceId: "e-remove" })],
		};
		const inspection = inspectChatCutImportApplicability({
			tracks: tracks([source]),
			plan: plan([stale]),
			fps,
			hasTimelineBookmarks: true,
		});
		expect(inspection.canApply).toBe(false);
		expect(inspection.blockers.join(" ")).toContain("指纹已过期");
		expect(inspection.blockers.join(" ")).toContain("时间线含书签");

		const caption: ChatCutResultOperation = {
			id: "caption-a",
			sequence: 0,
			kind: "caption-fix",
			surface: "transcript",
			fixType: "asr-word",
			scope: { projectId: "project-a", timelineId: "timeline-main" },
			target: {
				assetId: "asset-a",
				transcriptId: "transcript-a",
				transcriptRevision: 1,
				segmentId: "segment-a",
				wordId: "word-a",
				sourceRange: { startFrame: 1, endFrame: 2 },
				wordFingerprint: `sha256:${"c".repeat(64)}`,
			},
			beforeText: "错",
			afterText: "对",
			evidence: [],
		};
		expect(
			inspectChatCutImportApplicability({
				tracks: tracks([source]),
				plan: plan([caption]),
				fps,
			}).blockers.join(" "),
		).toContain("词级转录轨道");
	});
});
