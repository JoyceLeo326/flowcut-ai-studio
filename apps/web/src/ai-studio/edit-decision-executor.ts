import type {
	AudioTrack,
	ElementRef,
	OverlayTrack,
	SceneTracks,
	TimelineElement,
	TimelineTrack,
	VideoElement,
} from "@/timeline";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";
import {
	EDIT_DECISION_PLAN_KIND,
	EDIT_DECISION_PLAN_SCHEMA_VERSION,
	inspectEditDecisionPlanFreshness,
	type EditDecisionCurrentAssetState,
	type EditDecisionOperation,
	type EditDecisionPlan,
} from "./edit-decision-orchestrator";

const TIME_TOLERANCE_SECONDS = 0.002;

export type EditDecisionExecutionBlockerCode =
	| "plan-invalid"
	| "current-state-invalid"
	| "plan-stale"
	| "approval-empty"
	| "approval-duplicate"
	| "operation-unknown"
	| "operation-not-timeline-edit"
	| "operation-not-available"
	| "operation-invalid"
	| "operation-out-of-bounds"
	| "operation-overlap"
	| "asset-not-on-main-track"
	| "asset-ambiguous-on-main-track"
	| "target-not-video"
	| "target-retimed"
	| "target-source-inconsistent"
	| "timeline-animation"
	| "timeline-bookmarks"
	| "main-track-overlap"
	| "cross-track-overlap"
	| "library-audio";

export interface EditDecisionExecutionBlocker {
	readonly code: EditDecisionExecutionBlockerCode;
	readonly message: string;
	readonly assetId?: string;
	readonly operationId?: string;
	readonly elementId?: string;
}

export interface EditDecisionExecutionInput {
	readonly tracks: SceneTracks;
	readonly plan: EditDecisionPlan;
	readonly approvedOperationIds: readonly string[];
	readonly currentAssets: readonly EditDecisionCurrentAssetState[];
	readonly hasTimelineBookmarks?: boolean;
}

export interface EditDecisionApplicability {
	readonly canApply: boolean;
	readonly blockers: readonly EditDecisionExecutionBlocker[];
	readonly approvedOperationCount: number;
	readonly removedSeconds: number;
	readonly outputSegmentCount: number;
}

export interface BuildEditDecisionTracksInput extends EditDecisionExecutionInput {
	readonly elementIds: readonly string[];
}

export interface EditDecisionExecutionResult extends EditDecisionApplicability {
	readonly tracks: SceneTracks;
	readonly createdElementRefs: readonly ElementRef[];
	/**
	 * Original plan operations are exposed unchanged so approval never upgrades or
	 * rewrites their evidence semantics.
	 */
	readonly executedOperations: readonly EditDecisionOperation[];
}

export class EditDecisionExecutionError extends Error {
	readonly blockers: readonly EditDecisionExecutionBlocker[];

	constructor(blockers: readonly EditDecisionExecutionBlocker[]) {
		super(
			blockers.length > 0
				? blockers.map((blocker) => blocker.message).join(" ")
				: "The edit decision could not be applied.",
		);
		this.name = "EditDecisionExecutionError";
		this.blockers = Object.freeze([...blockers]);
	}
}

interface SourceRange {
	readonly startSeconds: number;
	readonly endSeconds: number;
}

type ExecutableEditDecisionOperation = Extract<
	EditDecisionOperation,
	{ readonly kind: "trim" | "remove" }
>;

interface TimelineCut extends SourceRange {
	readonly operation: ExecutableEditDecisionOperation;
	readonly element: VideoElement;
}

interface TargetAnalysis {
	readonly element: VideoElement;
	readonly operations: readonly ExecutableEditDecisionOperation[];
	readonly visibleSourceRange: SourceRange;
	readonly keptSourceRanges: readonly SourceRange[];
}

interface ExecutionAnalysis {
	readonly applicability: EditDecisionApplicability;
	readonly approvedOperations: readonly ExecutableEditDecisionOperation[];
	readonly targets: ReadonlyMap<string, TargetAnalysis>;
	readonly cuts: readonly TimelineCut[];
}

function closeEnough({
	left,
	right,
}: {
	left: number;
	right: number;
}): boolean {
	return Math.abs(left - right) <= TIME_TOLERANCE_SECONDS;
}

function rangeDuration(range: SourceRange): number {
	return range.endSeconds - range.startSeconds;
}

function elementRange(element: TimelineElement): SourceRange {
	const startSeconds = mediaTimeToSeconds({ time: element.startTime });
	return {
		startSeconds,
		endSeconds: startSeconds + mediaTimeToSeconds({ time: element.duration }),
	};
}

function rangesOverlap({
	left,
	right,
}: {
	left: SourceRange;
	right: SourceRange;
}): boolean {
	return (
		left.startSeconds < right.endSeconds - TIME_TOLERANCE_SECONDS &&
		left.endSeconds > right.startSeconds + TIME_TOLERANCE_SECONDS
	);
}

function allTracks(tracks: SceneTracks): readonly TimelineTrack[] {
	return [tracks.main, ...tracks.overlay, ...tracks.audio];
}

function blockerKey(blocker: EditDecisionExecutionBlocker): string {
	return [
		blocker.code,
		blocker.assetId ?? "",
		blocker.operationId ?? "",
		blocker.elementId ?? "",
		blocker.message,
	].join("\u0000");
}

function sortedBlockers(
	blockers: readonly EditDecisionExecutionBlocker[],
): readonly EditDecisionExecutionBlocker[] {
	const unique = new Map<string, EditDecisionExecutionBlocker>();
	for (const blocker of blockers) unique.set(blockerKey(blocker), blocker);
	return Object.freeze(
		[...unique.values()].sort(
			(left, right) =>
				left.code.localeCompare(right.code) ||
				(left.assetId ?? "").localeCompare(right.assetId ?? "") ||
				(left.operationId ?? "").localeCompare(right.operationId ?? "") ||
				(left.elementId ?? "").localeCompare(right.elementId ?? "") ||
				left.message.localeCompare(right.message),
		),
	);
}

function frozenApplicability({
	blockers,
	approvedOperationCount,
	removedSeconds,
	outputSegmentCount,
}: Omit<EditDecisionApplicability, "canApply">): EditDecisionApplicability {
	const stableBlockers = sortedBlockers(blockers);
	return Object.freeze({
		canApply: stableBlockers.length === 0,
		blockers: stableBlockers,
		approvedOperationCount,
		removedSeconds: Number(removedSeconds.toFixed(6)),
		outputSegmentCount,
	});
}

function keptSourceRanges({
	visibleSourceRange,
	operations,
}: {
	visibleSourceRange: SourceRange;
	operations: readonly ExecutableEditDecisionOperation[];
}): readonly SourceRange[] {
	const sorted = [...operations].sort(
		(left, right) =>
			left.sourceRange.startSeconds - right.sourceRange.startSeconds ||
			left.sourceRange.endSeconds - right.sourceRange.endSeconds ||
			left.operationId.localeCompare(right.operationId),
	);
	const ranges: SourceRange[] = [];
	let cursor = visibleSourceRange.startSeconds;
	for (const operation of sorted) {
		if (operation.sourceRange.startSeconds > cursor + TIME_TOLERANCE_SECONDS) {
			ranges.push({
				startSeconds: cursor,
				endSeconds: operation.sourceRange.startSeconds,
			});
		}
		cursor = Math.max(cursor, operation.sourceRange.endSeconds);
	}
	if (cursor < visibleSourceRange.endSeconds - TIME_TOLERANCE_SECONDS) {
		ranges.push({
			startSeconds: cursor,
			endSeconds: visibleSourceRange.endSeconds,
		});
	}
	return Object.freeze(ranges);
}

function analyzeExecution({
	tracks,
	plan,
	approvedOperationIds,
	currentAssets,
	hasTimelineBookmarks = false,
}: EditDecisionExecutionInput): ExecutionAnalysis {
	const blockers: EditDecisionExecutionBlocker[] = [];
	const operationById = new Map<string, EditDecisionOperation>();
	const assetSnapshotById = new Map(
		plan.inputs.assets.map((asset) => [asset.assetId, asset] as const),
	);

	if (
		plan.kind !== EDIT_DECISION_PLAN_KIND ||
		plan.schemaVersion !== EDIT_DECISION_PLAN_SCHEMA_VERSION ||
		plan.projectId.length === 0
	) {
		blockers.push({
			code: "plan-invalid",
			message: "The edit-decision plan envelope is invalid.",
		});
	}
	if (assetSnapshotById.size !== plan.inputs.assets.length) {
		blockers.push({
			code: "plan-invalid",
			message: "The edit-decision plan contains duplicate asset snapshots.",
		});
	}
	for (const operation of plan.operations) {
		if (operationById.has(operation.operationId)) {
			blockers.push({
				code: "plan-invalid",
				message: `The plan contains duplicate operation id ${operation.operationId}.`,
				operationId: operation.operationId,
			});
		}
		operationById.set(operation.operationId, operation);
	}

	try {
		const freshness = inspectEditDecisionPlanFreshness({
			plan,
			currentAssets,
		});
		if (freshness.state !== "current") {
			blockers.push({
				code: "plan-stale",
				message:
					"The material fingerprint or MediaIndex state changed after this plan was created.",
			});
		}
	} catch (error) {
		blockers.push({
			code: "current-state-invalid",
			message:
				error instanceof Error
					? `The current material state is invalid: ${error.message}`
					: "The current material state is invalid.",
		});
	}

	const approvalSet = new Set<string>();
	if (approvedOperationIds.length === 0) {
		blockers.push({
			code: "approval-empty",
			message:
				"At least one exact timeline operation must be explicitly approved.",
		});
	}
	for (const operationId of approvedOperationIds) {
		if (approvalSet.has(operationId)) {
			blockers.push({
				code: "approval-duplicate",
				message: `Operation ${operationId} was approved more than once.`,
				operationId,
			});
		}
		approvalSet.add(operationId);
	}

	const approvedOperations: ExecutableEditDecisionOperation[] = [];
	for (const operationId of approvalSet) {
		const operation = operationById.get(operationId);
		if (!operation) {
			blockers.push({
				code: "operation-unknown",
				message: `Approved operation ${operationId} is not part of this plan.`,
				operationId,
			});
			continue;
		}
		if (operation.kind !== "trim" && operation.kind !== "remove") {
			blockers.push({
				code: "operation-not-timeline-edit",
				message: `Operation ${operationId} is a ${operation.kind} review suggestion and cannot edit the timeline.`,
				assetId: operation.assetId,
				operationId,
			});
			continue;
		}
		if (
			operation.availability !== "suggestion" &&
			operation.availability !== "executable"
		) {
			blockers.push({
				code: "operation-not-available",
				message: `Operation ${operationId} was originally blocked and cannot be approved for execution.`,
				assetId: operation.assetId,
				operationId,
			});
			continue;
		}
		approvedOperations.push(operation);
	}
	approvedOperations.sort(
		(left, right) =>
			(assetSnapshotById.get(left.assetId)?.sourceOrder ??
				Number.MAX_SAFE_INTEGER) -
				(assetSnapshotById.get(right.assetId)?.sourceOrder ??
					Number.MAX_SAFE_INTEGER) ||
			left.sourceRange.startSeconds - right.sourceRange.startSeconds ||
			left.sourceRange.endSeconds - right.sourceRange.endSeconds ||
			left.operationId.localeCompare(right.operationId),
	);

	if (hasTimelineBookmarks) {
		blockers.push({
			code: "timeline-bookmarks",
			message:
				"The scene contains bookmarks; this command will not silently reposition them.",
		});
	}
	for (const track of allTracks(tracks)) {
		for (const element of track.elements) {
			if (element.animations && Object.keys(element.animations).length > 0) {
				blockers.push({
					code: "timeline-animation",
					message: `Element ${element.id} contains animation data that cannot be safely rippled.`,
					elementId: element.id,
				});
			}
		}
	}
	for (const track of tracks.audio) {
		for (const element of track.elements) {
			if (element.sourceType === "library") {
				blockers.push({
					code: "library-audio",
					message: `Library audio ${element.id} is not an uploaded source and blocks transactional ripple.`,
					elementId: element.id,
				});
			}
		}
	}

	const sortedMainElements = [...tracks.main.elements].sort(
		(left, right) =>
			mediaTimeToSeconds({ time: left.startTime }) -
				mediaTimeToSeconds({ time: right.startTime }) ||
			left.id.localeCompare(right.id),
	);
	for (let index = 1; index < sortedMainElements.length; index += 1) {
		const previous = sortedMainElements[index - 1];
		const current = sortedMainElements[index];
		if (
			rangesOverlap({
				left: elementRange(previous),
				right: elementRange(current),
			})
		) {
			blockers.push({
				code: "main-track-overlap",
				message: `Main-track elements ${previous.id} and ${current.id} overlap.`,
				elementId: current.id,
			});
		}
	}

	const targetOperations = new Map<string, ExecutableEditDecisionOperation[]>();
	const targetElements = new Map<string, VideoElement>();
	for (const operation of approvedOperations) {
		const snapshot = assetSnapshotById.get(operation.assetId);
		if (
			!snapshot ||
			operation.inputFingerprint !== snapshot.inputFingerprint ||
			operation.mediaIndexId !== snapshot.mediaIndexId ||
			operation.requiresExplicitReview !== true
		) {
			blockers.push({
				code: "operation-invalid",
				message: `Operation ${operation.operationId} is not bound to the plan's immutable evidence snapshot.`,
				assetId: operation.assetId,
				operationId: operation.operationId,
			});
			continue;
		}
		const { startSeconds, endSeconds } = operation.sourceRange;
		if (
			!Number.isFinite(startSeconds) ||
			!Number.isFinite(endSeconds) ||
			startSeconds < 0 ||
			endSeconds <= startSeconds ||
			endSeconds > snapshot.durationSeconds + TIME_TOLERANCE_SECONDS
		) {
			blockers.push({
				code: "operation-out-of-bounds",
				message: `Operation ${operation.operationId} has an invalid source range.`,
				assetId: operation.assetId,
				operationId: operation.operationId,
			});
			continue;
		}

		const candidates = tracks.main.elements.filter(
			(element) =>
				"mediaId" in element && element.mediaId === operation.assetId,
		);
		if (candidates.length === 0) {
			blockers.push({
				code: "asset-not-on-main-track",
				message: `Asset ${operation.assetId} is not present on the main video track.`,
				assetId: operation.assetId,
				operationId: operation.operationId,
			});
			continue;
		}
		if (candidates.length !== 1) {
			blockers.push({
				code: "asset-ambiguous-on-main-track",
				message: `Asset ${operation.assetId} appears more than once on the main track.`,
				assetId: operation.assetId,
				operationId: operation.operationId,
			});
			continue;
		}
		const candidate = candidates[0];
		if (candidate.type !== "video") {
			blockers.push({
				code: "target-not-video",
				message: `Asset ${operation.assetId} is not a video element on the main track.`,
				assetId: operation.assetId,
				operationId: operation.operationId,
				elementId: candidate.id,
			});
			continue;
		}
		if (
			candidate.retime &&
			!closeEnough({ left: candidate.retime.rate, right: 1 })
		) {
			blockers.push({
				code: "target-retimed",
				message: `Video element ${candidate.id} is retimed and cannot be cut transactionally.`,
				assetId: operation.assetId,
				operationId: operation.operationId,
				elementId: candidate.id,
			});
		}

		const trimStart = mediaTimeToSeconds({ time: candidate.trimStart });
		const trimEnd = mediaTimeToSeconds({ time: candidate.trimEnd });
		const duration = mediaTimeToSeconds({ time: candidate.duration });
		const visibleSourceEnd = trimStart + duration;
		if (
			trimStart < 0 ||
			trimEnd < 0 ||
			duration <= 0 ||
			(candidate.sourceDuration !== undefined &&
				!closeEnough({
					left: mediaTimeToSeconds({ time: candidate.sourceDuration }),
					right: trimStart + duration + trimEnd,
				}))
		) {
			blockers.push({
				code: "target-source-inconsistent",
				message: `Video element ${candidate.id} has inconsistent trim or source-duration data.`,
				assetId: operation.assetId,
				operationId: operation.operationId,
				elementId: candidate.id,
			});
		}
		const rangeWithinVisibleSource =
			startSeconds >= trimStart - TIME_TOLERANCE_SECONDS &&
			endSeconds <= visibleSourceEnd + TIME_TOLERANCE_SECONDS;
		const edgeMatches =
			operation.kind === "remove" ||
			(operation.edge === "head"
				? closeEnough({ left: startSeconds, right: trimStart })
				: closeEnough({ left: endSeconds, right: visibleSourceEnd }));
		const removeIsInterior =
			operation.kind !== "remove" ||
			(startSeconds > trimStart + TIME_TOLERANCE_SECONDS &&
				endSeconds < visibleSourceEnd - TIME_TOLERANCE_SECONDS);
		if (!rangeWithinVisibleSource || !edgeMatches || !removeIsInterior) {
			blockers.push({
				code: "operation-out-of-bounds",
				message: `Operation ${operation.operationId} no longer matches the visible source boundary of ${candidate.id}.`,
				assetId: operation.assetId,
				operationId: operation.operationId,
				elementId: candidate.id,
			});
		}

		targetElements.set(candidate.id, candidate);
		const current = targetOperations.get(candidate.id) ?? [];
		current.push(operation);
		targetOperations.set(candidate.id, current);
	}

	for (const [elementId, operations] of targetOperations) {
		const sorted = [...operations].sort(
			(left, right) =>
				left.sourceRange.startSeconds - right.sourceRange.startSeconds ||
				left.sourceRange.endSeconds - right.sourceRange.endSeconds ||
				left.operationId.localeCompare(right.operationId),
		);
		for (let index = 1; index < sorted.length; index += 1) {
			const previous = sorted[index - 1];
			const current = sorted[index];
			if (
				current.sourceRange.startSeconds <
				previous.sourceRange.endSeconds - TIME_TOLERANCE_SECONDS
			) {
				blockers.push({
					code: "operation-overlap",
					message: `Operations ${previous.operationId} and ${current.operationId} overlap.`,
					assetId: current.assetId,
					operationId: current.operationId,
					elementId,
				});
			}
		}
	}

	const targetTimelineRanges = [...targetElements.values()].map((element) => ({
		element,
		range: elementRange(element),
	}));
	for (const track of [...tracks.overlay, ...tracks.audio]) {
		for (const element of track.elements) {
			for (const target of targetTimelineRanges) {
				if (
					rangesOverlap({
						left: elementRange(element),
						right: target.range,
					})
				) {
					blockers.push({
						code: "cross-track-overlap",
						message: `Element ${element.id} on track ${track.id} overlaps edited main-track element ${target.element.id}.`,
						elementId: element.id,
					});
				}
			}
		}
	}

	const targets = new Map<string, TargetAnalysis>();
	const cuts: TimelineCut[] = [];
	for (const [elementId, operations] of targetOperations) {
		const element = targetElements.get(elementId);
		if (!element) continue;
		const trimStart = mediaTimeToSeconds({ time: element.trimStart });
		const visibleSourceRange = {
			startSeconds: trimStart,
			endSeconds: trimStart + mediaTimeToSeconds({ time: element.duration }),
		};
		const kept = keptSourceRanges({
			visibleSourceRange,
			operations,
		});
		targets.set(elementId, {
			element,
			operations: Object.freeze([...operations]),
			visibleSourceRange,
			keptSourceRanges: kept,
		});
		const elementStart = mediaTimeToSeconds({ time: element.startTime });
		for (const operation of operations) {
			cuts.push({
				startSeconds:
					elementStart + (operation.sourceRange.startSeconds - trimStart),
				endSeconds:
					elementStart + (operation.sourceRange.endSeconds - trimStart),
				operation,
				element,
			});
		}
	}
	cuts.sort(
		(left, right) =>
			left.startSeconds - right.startSeconds ||
			left.endSeconds - right.endSeconds ||
			left.operation.operationId.localeCompare(right.operation.operationId),
	);
	for (let index = 1; index < cuts.length; index += 1) {
		const previous = cuts[index - 1];
		const current = cuts[index];
		if (rangesOverlap({ left: previous, right: current })) {
			blockers.push({
				code: "operation-overlap",
				message: `Timeline cuts ${previous.operation.operationId} and ${current.operation.operationId} overlap.`,
				assetId: current.operation.assetId,
				operationId: current.operation.operationId,
				elementId: current.element.id,
			});
		}
	}

	const removedSeconds = approvedOperations.reduce(
		(total, operation) => total + rangeDuration(operation.sourceRange),
		0,
	);
	const outputSegmentCount = [...targets.values()].reduce(
		(total, target) => total + target.keptSourceRanges.length,
		0,
	);
	return {
		applicability: frozenApplicability({
			blockers,
			approvedOperationCount: approvalSet.size,
			removedSeconds,
			outputSegmentCount,
		}),
		approvedOperations: Object.freeze([...approvedOperations]),
		targets,
		cuts: Object.freeze([...cuts]),
	};
}

export function inspectEditDecisionApplicability(
	input: EditDecisionExecutionInput,
): EditDecisionApplicability {
	return analyzeExecution(input).applicability;
}

function removedBefore({
	timeSeconds,
	cuts,
}: {
	timeSeconds: number;
	cuts: readonly TimelineCut[];
}): number {
	return cuts.reduce(
		(total, cut) =>
			cut.endSeconds <= timeSeconds + TIME_TOLERANCE_SECONDS
				? total + rangeDuration(cut)
				: total,
		0,
	);
}

function shiftedStartTime({
	timeSeconds,
	cuts,
}: {
	timeSeconds: number;
	cuts: readonly TimelineCut[];
}) {
	return mediaTimeFromSeconds({
		seconds: timeSeconds - removedBefore({ timeSeconds, cuts }),
	});
}

function shiftTrack<TTrack extends OverlayTrack | AudioTrack>({
	track,
	cuts,
}: {
	track: TTrack;
	cuts: readonly TimelineCut[];
}): TTrack {
	return {
		...track,
		elements: track.elements.map((element) => ({
			...element,
			startTime: shiftedStartTime({
				timeSeconds: mediaTimeToSeconds({ time: element.startTime }),
				cuts,
			}),
		})),
	} as TTrack;
}

export function buildEditDecisionTracks({
	tracks,
	plan,
	approvedOperationIds,
	currentAssets,
	hasTimelineBookmarks = false,
	elementIds,
}: BuildEditDecisionTracksInput): EditDecisionExecutionResult {
	const analysis = analyzeExecution({
		tracks,
		plan,
		approvedOperationIds,
		currentAssets,
		hasTimelineBookmarks,
	});
	if (!analysis.applicability.canApply) {
		throw new EditDecisionExecutionError(analysis.applicability.blockers);
	}

	const requiredElementIds = analysis.applicability.outputSegmentCount;
	const existingElementIds = new Set(
		allTracks(tracks).flatMap((track) =>
			track.elements.map((element) => element.id),
		),
	);
	const allocated = elementIds.slice(0, requiredElementIds);
	const allocationBlockers: EditDecisionExecutionBlocker[] = [];
	if (elementIds.length < requiredElementIds) {
		allocationBlockers.push({
			code: "plan-invalid",
			message: `The command preallocated ${elementIds.length} element ids but requires ${requiredElementIds}.`,
		});
	}
	if (
		allocated.some((elementId) => elementId.length === 0) ||
		new Set(allocated).size !== allocated.length ||
		allocated.some((elementId) => existingElementIds.has(elementId))
	) {
		allocationBlockers.push({
			code: "plan-invalid",
			message:
				"Preallocated element ids must be non-empty, unique, and absent from the current scene.",
		});
	}
	if (allocationBlockers.length > 0) {
		throw new EditDecisionExecutionError(allocationBlockers);
	}

	let nextElementIdIndex = 0;
	const createdElementRefs: ElementRef[] = [];
	const mainElements = tracks.main.elements.flatMap((element) => {
		const target = analysis.targets.get(element.id);
		if (!target) {
			return [
				{
					...element,
					startTime: shiftedStartTime({
						timeSeconds: mediaTimeToSeconds({ time: element.startTime }),
						cuts: analysis.cuts,
					}),
				},
			];
		}
		const elementTimelineStart = mediaTimeToSeconds({
			time: element.startTime,
		});
		const originalTrimEnd = mediaTimeToSeconds({ time: element.trimEnd });
		return target.keptSourceRanges.map((range) => {
			const elementId = allocated[nextElementIdIndex];
			nextElementIdIndex += 1;
			const originalSegmentStart =
				elementTimelineStart +
				(range.startSeconds - target.visibleSourceRange.startSeconds);
			const segment: VideoElement = {
				...target.element,
				id: elementId,
				startTime: shiftedStartTime({
					timeSeconds: originalSegmentStart,
					cuts: analysis.cuts,
				}),
				duration: mediaTimeFromSeconds({
					seconds: rangeDuration(range),
				}),
				trimStart: mediaTimeFromSeconds({
					seconds: range.startSeconds,
				}),
				trimEnd: mediaTimeFromSeconds({
					seconds:
						originalTrimEnd +
						(target.visibleSourceRange.endSeconds - range.endSeconds),
				}),
			};
			createdElementRefs.push({
				trackId: tracks.main.id,
				elementId,
			});
			return segment;
		});
	});

	const nextTracks: SceneTracks = {
		main: {
			...tracks.main,
			elements: mainElements,
		},
		overlay: tracks.overlay.map((track) =>
			shiftTrack({ track, cuts: analysis.cuts }),
		),
		audio: tracks.audio.map((track) =>
			shiftTrack({ track, cuts: analysis.cuts }),
		),
	};
	return Object.freeze({
		...analysis.applicability,
		tracks: nextTracks,
		createdElementRefs: Object.freeze(createdElementRefs),
		executedOperations: analysis.approvedOperations,
	});
}
