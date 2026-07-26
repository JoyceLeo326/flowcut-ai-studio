import type {
	SceneTracks,
	TimelineElement,
	TimelineTrack,
} from "@/timeline";
import {
	addMediaTime,
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	type MediaTime,
} from "@/wasm";
import { createChatCutTimelineItemState } from "./chatcut-timeline-adapter";
import type {
	ChatCutPreparedImportPlan,
	ChatCutRemoveOperation,
	ChatCutReorderOperation,
	ChatCutResultOperation,
	ChatCutTrimOperation,
	FrameRange,
	PlaybackRate,
} from "./chatcut-result";

interface LocatedElement {
	readonly track: TimelineTrack;
	readonly element: TimelineElement;
}

interface CollapseInterval extends FrameRange {
	readonly trackId: string;
}

interface SegmentRange {
	readonly timelineRange: FrameRange;
	readonly sourceRange: FrameRange;
}

export interface ChatCutImportApplicability {
	readonly canApply: boolean;
	readonly blockers: readonly string[];
	readonly operationCount: number;
	readonly destructiveOperationCount: number;
	readonly structuralOperationCount: number;
	readonly removedFrames: number;
}

export interface ChatCutImportExecutionResult
	extends ChatCutImportApplicability {
	readonly tracks: SceneTracks;
	readonly changedElementRefs: readonly {
		readonly trackId: string;
		readonly elementId: string;
	}[];
}

function tracksInScene(tracks: SceneTracks): TimelineTrack[] {
	return [tracks.main, ...tracks.overlay, ...tracks.audio];
}

function locate({
	tracks,
	trackId,
	elementId,
}: {
	tracks: SceneTracks;
	trackId: string;
	elementId: string;
}): LocatedElement | null {
	const track = tracksInScene(tracks).find((candidate) => candidate.id === trackId);
	const element = track?.elements.find((candidate) => candidate.id === elementId);
	return track && element ? { track, element } : null;
}

function rangesEqual({
	left,
	right,
}: {
	left: FrameRange;
	right: FrameRange;
}): boolean {
	return (
		left.startFrame === right.startFrame && left.endFrame === right.endFrame
	);
}

function contains({
	container,
	candidate,
}: {
	container: FrameRange;
	candidate: FrameRange;
}): boolean {
	return (
		container.startFrame <= candidate.startFrame &&
		container.endFrame >= candidate.endFrame
	);
}

function overlaps({
	left,
	right,
}: {
	left: FrameRange;
	right: FrameRange;
}): boolean {
	return left.startFrame < right.endFrame && left.endFrame > right.startFrame;
}

function frameDuration(range: FrameRange): number {
	return range.endFrame - range.startFrame;
}

function framesToTime({
	frames,
	fps,
}: {
	frames: number;
	fps: PlaybackRate;
}): MediaTime {
	return mediaTimeFromSeconds({
		seconds: (frames * fps.denominator) / fps.numerator,
	});
}

function frozenApplicability({
	blockers,
	operationCount,
	destructiveOperationCount,
	structuralOperationCount,
	removedFrames,
}: Omit<ChatCutImportApplicability, "canApply">): ChatCutImportApplicability {
	return Object.freeze({
		canApply: blockers.length === 0,
		blockers: Object.freeze([...new Set(blockers)]),
		operationCount,
		destructiveOperationCount,
		structuralOperationCount,
		removedFrames,
	});
}

function operationTargets(operation: ChatCutResultOperation): readonly {
	readonly itemId: string;
	readonly trackId: string;
	readonly itemFingerprint: string;
	readonly timelineRange: FrameRange;
	readonly sourceRange: FrameRange;
	readonly exactRange: boolean;
}[] {
	if (operation.kind === "trim" || operation.kind === "split") {
		return [
			{
				...operation.target,
				timelineRange: operation.before.timelineRange,
				sourceRange: operation.before.sourceRange,
				exactRange: true,
			},
		];
	}
	if (operation.kind === "remove") {
		return [{ ...operation.target, exactRange: false }];
	}
	if (operation.kind === "reorder") {
		return operation.segments.map((segment) => ({
			...segment.target,
			timelineRange: segment.timelineRange,
			sourceRange: segment.sourceRange,
			exactRange: true,
		}));
	}
	return [];
}

function inspectTarget({
	tracks,
	fps,
	operation,
	blockers,
}: {
	tracks: SceneTracks;
	fps: PlaybackRate;
	operation: ChatCutResultOperation;
	blockers: string[];
}): void {
	for (const target of operationTargets(operation)) {
		const entry = locate({
			tracks,
			trackId: target.trackId,
			elementId: target.itemId,
		});
		if (!entry) {
			blockers.push(`操作“${operation.id}”引用的片段已不存在。`);
			continue;
		}
		const state = createChatCutTimelineItemState({
			element: entry.element,
			trackId: entry.track.id,
			fps,
		});
		if (!state) {
			blockers.push(`操作“${operation.id}”的目标不是本地上传素材。`);
			continue;
		}
		if (state.itemFingerprint !== target.itemFingerprint) {
			blockers.push(`操作“${operation.id}”的片段指纹已过期。`);
		}
		const timelineMatches = target.exactRange
			? rangesEqual({
					left: state.timelineRange,
					right: target.timelineRange,
				})
			: contains({
					container: state.timelineRange,
					candidate: target.timelineRange,
				});
		const sourceMatches = target.exactRange
			? rangesEqual({ left: state.sourceRange, right: target.sourceRange })
			: contains({
					container: state.sourceRange,
					candidate: target.sourceRange,
				});
		if (!timelineMatches || !sourceMatches) {
			blockers.push(`操作“${operation.id}”的时间范围已变化。`);
		}
		if (
			entry.element.animations &&
			Object.keys(entry.element.animations).length > 0
		) {
			blockers.push(
				`片段“${entry.element.name}”含关键帧动画，当前不会自动重排动画。`,
			);
		}
	}
}

function inspectOperationCombinations({
	operations,
	blockers,
}: {
	operations: readonly ChatCutResultOperation[];
	blockers: string[];
}): void {
	const byItem = new Map<string, ChatCutResultOperation[]>();
	for (const operation of operations) {
		for (const target of operationTargets(operation)) {
			const list = byItem.get(target.itemId) ?? [];
			if (!list.includes(operation)) list.push(operation);
			byItem.set(target.itemId, list);
		}
	}
	for (const [itemId, itemOperations] of byItem) {
		const kinds = itemOperations.map(({ kind }) => kind);
		const trims = itemOperations.filter(
			(operation): operation is ChatCutTrimOperation => operation.kind === "trim",
		);
		const removals = itemOperations.filter(
			(operation): operation is ChatCutRemoveOperation =>
				operation.kind === "remove",
		);
		if (trims.length > 1) {
			blockers.push(`片段“${itemId}”包含多个裁切结果，无法确定唯一范围。`);
		}
		if (
			(kinds.includes("split") || kinds.includes("reorder")) &&
			itemOperations.length > 1
		) {
			blockers.push(
				`片段“${itemId}”同时参与分割或重排及其他操作，请在 ChatCut 合并后重试。`,
			);
		}
		const visibleRange = trims[0]?.after.timelineRange;
		for (const removal of removals) {
			if (
				visibleRange &&
				!contains({
					container: visibleRange,
					candidate: removal.target.timelineRange,
				})
			) {
				blockers.push(`片段“${itemId}”的删除范围落在裁切结果之外。`);
			}
		}
		const sorted = removals
			.map((operation) => operation.target.timelineRange)
			.sort((left, right) => left.startFrame - right.startFrame);
		for (let index = 1; index < sorted.length; index += 1) {
			if (overlaps({ left: sorted[index - 1], right: sorted[index] })) {
				blockers.push(`片段“${itemId}”包含重叠删除范围。`);
				break;
			}
		}
	}
}

function inspectReorder({
	tracks,
	operations,
	fps,
	blockers,
}: {
	tracks: SceneTracks;
	operations: readonly ChatCutResultOperation[];
	fps: PlaybackRate;
	blockers: string[];
}): void {
	const occupiedItems = new Set<string>();
	for (const operation of operations) {
		if (operation.kind !== "reorder") continue;
		const track = tracksInScene(tracks).find(
			(candidate) => candidate.id === operation.trackId,
		);
		if (!track) continue;
		const orderedRanges = [...operation.segments].sort(
			(left, right) => left.timelineRange.startFrame - right.timelineRange.startFrame,
		);
		for (let index = 1; index < orderedRanges.length; index += 1) {
			if (
				orderedRanges[index - 1].timelineRange.endFrame !==
				orderedRanges[index].timelineRange.startFrame
			) {
				blockers.push(`重排“${operation.id}”只支持连续的完整片段。`);
				break;
			}
		}
		for (const segment of operation.segments) {
			if (occupiedItems.has(segment.target.itemId)) {
				blockers.push(`片段“${segment.target.itemId}”参与了多个重排操作。`);
			}
			occupiedItems.add(segment.target.itemId);
		}
		const span = {
			startFrame: orderedRanges[0]?.timelineRange.startFrame ?? 0,
			endFrame: orderedRanges.at(-1)?.timelineRange.endFrame ?? 0,
		};
		const segmentIds = new Set(
			operation.segments.map((segment) => segment.target.itemId),
		);
		for (const element of track.elements) {
			if (segmentIds.has(element.id)) continue;
			const state = createChatCutTimelineItemState({
				element,
				trackId: track.id,
				fps,
			});
			if (state && overlaps({ left: span, right: state.timelineRange })) {
				blockers.push(`重排“${operation.id}”的区间包含未声明片段。`);
				break;
			}
		}
		for (const otherTrack of tracksInScene(tracks)) {
			if (otherTrack.id === track.id) continue;
			const hasOverlap = otherTrack.elements.some((element) => {
				const state = createChatCutTimelineItemState({
					element,
					trackId: otherTrack.id,
					fps,
				});
				return state
					? overlaps({ left: span, right: state.timelineRange })
					: false;
			});
			if (hasOverlap) {
				blockers.push(
					`重排“${operation.id}”与轨道“${otherTrack.name}”的内容重叠。`,
				);
			}
		}
	}
}

export function inspectChatCutImportApplicability({
	tracks,
	plan,
	fps,
	hasTimelineBookmarks = false,
}: {
	tracks: SceneTracks;
	plan: ChatCutPreparedImportPlan;
	fps: PlaybackRate;
	hasTimelineBookmarks?: boolean;
}): ChatCutImportApplicability {
	const blockers: string[] = [];
	if (plan.operations.length === 0) blockers.push("结果中没有可执行操作。");
	if (
		plan.approvedOperationIds.length !== plan.operations.length ||
		plan.operations.some(
			(operation) => !plan.approvedOperationIds.includes(operation.id),
		)
	) {
		blockers.push("导入计划尚未完成全部操作审核。");
	}
	for (const operation of plan.operations) {
		if (operation.kind === "caption-fix") {
			blockers.push(
				`文字修正“${operation.id}”需要词级转录轨道；当前项目没有可安全写回的转录模型。`,
			);
			continue;
		}
		inspectTarget({ tracks, fps, operation, blockers });
	}
	inspectOperationCombinations({ operations: plan.operations, blockers });
	inspectReorder({ tracks, operations: plan.operations, fps, blockers });
	if (
		hasTimelineBookmarks &&
		plan.operations.some(
			(operation) =>
				operation.kind === "reorder" ||
				("ripple" in operation && operation.ripple === "same-track"),
		)
	) {
		blockers.push("时间线含书签；当前不会在未确认时移动书签。");
	}
	return frozenApplicability({
		blockers,
		operationCount: plan.operations.length,
		destructiveOperationCount: plan.operations.filter(
			(operation) => operation.kind === "trim" || operation.kind === "remove",
		).length,
		structuralOperationCount: plan.operations.filter(
			(operation) => operation.kind === "split" || operation.kind === "reorder",
		).length,
		removedFrames: plan.preview.summary.removedTimelineFrames,
	});
}

function safeSegmentId({
	itemId,
	operationId,
	index,
}: {
	itemId: string;
	operationId: string;
	index: number;
}): string {
	const suffix = `:cc:${operationId}:${index + 1}`;
	return `${itemId.slice(0, Math.max(1, 200 - suffix.length))}${suffix}`;
}

function collapseBefore({
	frame,
	trackId,
	intervals,
}: {
	frame: number;
	trackId: string;
	intervals: readonly CollapseInterval[];
}): number {
	return intervals
		.filter(
			(interval) => interval.trackId === trackId && interval.endFrame <= frame,
		)
		.reduce((total, interval) => total + frameDuration(interval), 0);
}

function cloneSegment({
	element,
	elementId,
	trackId,
	range,
	segmentIndex,
	segmentCount,
	fps,
	collapseIntervals,
	baselineSourceEndFrame,
}: {
	element: TimelineElement;
	elementId: string;
	trackId: string;
	range: SegmentRange;
	segmentIndex: number;
	segmentCount: number;
	fps: PlaybackRate;
	collapseIntervals: readonly CollapseInterval[];
	baselineSourceEndFrame: number;
}): TimelineElement {
	const shift = collapseBefore({
		frame: range.timelineRange.startFrame,
		trackId,
		intervals: collapseIntervals,
	});
	return {
		...element,
		id: elementId,
		name:
			segmentCount > 1
				? `${element.name} · ChatCut ${segmentIndex + 1}`
				: element.name,
		startTime: framesToTime({
			frames: range.timelineRange.startFrame - shift,
			fps,
		}),
		duration: framesToTime({
			frames: frameDuration(range.timelineRange),
			fps,
		}),
		trimStart: framesToTime({ frames: range.sourceRange.startFrame, fps }),
		trimEnd: framesToTime({
			frames:
				baselineSourceEndFrame - range.sourceRange.endFrame +
				Math.round(
					mediaTimeToSeconds({ time: element.trimEnd }) *
						(fps.numerator / fps.denominator),
				),
			fps,
		}),
	};
}

function subtractRemovals({
	timelineRange,
	sourceRange,
	removals,
}: {
	timelineRange: FrameRange;
	sourceRange: FrameRange;
	removals: readonly ChatCutRemoveOperation[];
}): SegmentRange[] {
	const ranges: SegmentRange[] = [];
	let timelineCursor = timelineRange.startFrame;
	let sourceCursor = sourceRange.startFrame;
	for (const removal of [...removals].sort(
		(left, right) =>
			left.target.timelineRange.startFrame -
			right.target.timelineRange.startFrame,
	)) {
		if (removal.target.timelineRange.startFrame > timelineCursor) {
			ranges.push({
				timelineRange: {
					startFrame: timelineCursor,
					endFrame: removal.target.timelineRange.startFrame,
				},
				sourceRange: {
					startFrame: sourceCursor,
					endFrame: removal.target.sourceRange.startFrame,
				},
			});
		}
		timelineCursor = removal.target.timelineRange.endFrame;
		sourceCursor = removal.target.sourceRange.endFrame;
	}
	if (timelineCursor < timelineRange.endFrame) {
		ranges.push({
			timelineRange: {
				startFrame: timelineCursor,
				endFrame: timelineRange.endFrame,
			},
			sourceRange: {
				startFrame: sourceCursor,
				endFrame: sourceRange.endFrame,
			},
		});
	}
	return ranges;
}

function collectCollapseIntervals(
	operations: readonly ChatCutResultOperation[],
): CollapseInterval[] {
	const intervals: CollapseInterval[] = [];
	for (const operation of operations) {
		if (operation.kind === "remove" && operation.ripple === "same-track") {
			intervals.push({
				trackId: operation.target.trackId,
				...operation.target.timelineRange,
			});
		}
		if (operation.kind === "trim" && operation.ripple === "same-track") {
			if (
				operation.after.timelineRange.startFrame >
				operation.before.timelineRange.startFrame
			) {
				intervals.push({
					trackId: operation.target.trackId,
					startFrame: operation.before.timelineRange.startFrame,
					endFrame: operation.after.timelineRange.startFrame,
				});
			}
			if (
				operation.after.timelineRange.endFrame <
				operation.before.timelineRange.endFrame
			) {
				intervals.push({
					trackId: operation.target.trackId,
					startFrame: operation.after.timelineRange.endFrame,
					endFrame: operation.before.timelineRange.endFrame,
				});
			}
		}
	}
	return intervals.sort(
		(left, right) =>
			left.trackId.localeCompare(right.trackId) ||
			left.startFrame - right.startFrame,
	);
}

function replaceTrack<TTrack extends TimelineTrack>({
	track,
	operations,
	fps,
	collapseIntervals,
	changedRefs,
}: {
	track: TTrack;
	operations: readonly ChatCutResultOperation[];
	fps: PlaybackRate;
	collapseIntervals: readonly CollapseInterval[];
	changedRefs: { trackId: string; elementId: string }[];
}): TTrack {
	const result = track.elements.flatMap((element): TimelineElement[] => {
		const elementOperations = operations.filter((operation) =>
			operationTargets(operation).some(
				(target) =>
					target.trackId === track.id && target.itemId === element.id,
			),
		);
		const split = elementOperations.find(
			(operation) => operation.kind === "split",
		);
		if (split?.kind === "split") {
			const state = createChatCutTimelineItemState({
				element,
				trackId: track.id,
				fps,
			})!;
			const ranges: SegmentRange[] = [
				{
					timelineRange: {
						startFrame: split.before.timelineRange.startFrame,
						endFrame: split.splitAtTimelineFrame,
					},
					sourceRange: {
						startFrame: split.before.sourceRange.startFrame,
						endFrame: split.splitAtSourceFrame,
					},
				},
				{
					timelineRange: {
						startFrame: split.splitAtTimelineFrame,
						endFrame: split.before.timelineRange.endFrame,
					},
					sourceRange: {
						startFrame: split.splitAtSourceFrame,
						endFrame: split.before.sourceRange.endFrame,
					},
				},
			];
			return ranges.map((range, index) => {
				const elementId = split.resultItemIds[index];
				changedRefs.push({ trackId: track.id, elementId });
				return cloneSegment({
					element,
					elementId,
					trackId: track.id,
					range,
					segmentIndex: index,
					segmentCount: 2,
					fps,
					collapseIntervals,
					baselineSourceEndFrame: state.sourceRange.endFrame,
				});
			});
		}

		const trim = elementOperations.find(
			(operation): operation is ChatCutTrimOperation => operation.kind === "trim",
		);
		const removals = elementOperations.filter(
			(operation): operation is ChatCutRemoveOperation =>
				operation.kind === "remove",
		);
		if (trim || removals.length > 0) {
			const state = createChatCutTimelineItemState({
				element,
				trackId: track.id,
				fps,
			})!;
			const ranges = subtractRemovals({
				timelineRange: trim?.after.timelineRange ?? state.timelineRange,
				sourceRange: trim?.after.sourceRange ?? state.sourceRange,
				removals,
			});
			return ranges.map((range, index) => {
				const elementId =
					ranges.length === 1
						? element.id
						: safeSegmentId({
								itemId: element.id,
								operationId: removals[0]?.id ?? trim?.id ?? "edit",
								index,
							});
				changedRefs.push({ trackId: track.id, elementId });
				return cloneSegment({
					element,
					elementId,
					trackId: track.id,
					range,
					segmentIndex: index,
					segmentCount: ranges.length,
					fps,
					collapseIntervals,
					baselineSourceEndFrame: state.sourceRange.endFrame,
				});
			});
		}

		const state = createChatCutTimelineItemState({
			element,
			trackId: track.id,
			fps,
		});
		if (!state) return [element];
		const shift = collapseBefore({
			frame: state.timelineRange.startFrame,
			trackId: track.id,
			intervals: collapseIntervals,
		});
		if (shift === 0) return [element];
		return [
			{
				...element,
				startTime: framesToTime({
					frames: state.timelineRange.startFrame - shift,
					fps,
				}),
			},
		];
	});
	return {
		...track,
		elements: result.sort(
			(left, right) =>
				left.startTime - right.startTime || left.id.localeCompare(right.id),
		),
	} as TTrack;
}

function applyReorders<TTrack extends TimelineTrack>({
	track,
	reorders,
	changedRefs,
}: {
	track: TTrack;
	reorders: readonly ChatCutReorderOperation[];
	changedRefs: { trackId: string; elementId: string }[];
}): TTrack {
	let elements: TimelineElement[] = [...track.elements];
	for (const reorder of reorders.filter(
		(operation) => operation.trackId === track.id,
	)) {
		const segmentById = new Map(
			reorder.segments.map((segment) => [segment.segmentId, segment] as const),
		);
		const elementById = new Map(
			elements.map((element) => [element.id, element] as const),
		);
		const members = reorder.segments.map(
			(segment) => elementById.get(segment.target.itemId)!,
		);
		let cursor = members.reduce(
			(minimum, element) =>
				element.startTime < minimum ? element.startTime : minimum,
			members[0].startTime,
		);
		const updates = new Map<string, TimelineElement>();
		for (const segmentId of reorder.afterOrder) {
			const segment = segmentById.get(segmentId)!;
			const element = elementById.get(segment.target.itemId)!;
			updates.set(element.id, { ...element, startTime: cursor });
			changedRefs.push({ trackId: track.id, elementId: element.id });
			cursor = addMediaTime({ a: cursor, b: element.duration });
		}
		elements = elements.map((element) => updates.get(element.id) ?? element);
	}
	return {
		...track,
		elements: elements.sort(
			(left, right) =>
				left.startTime - right.startTime || left.id.localeCompare(right.id),
		),
	} as TTrack;
}

export function buildChatCutImportTracks({
	tracks,
	plan,
	fps,
	hasTimelineBookmarks = false,
}: {
	tracks: SceneTracks;
	plan: ChatCutPreparedImportPlan;
	fps: PlaybackRate;
	hasTimelineBookmarks?: boolean;
}): ChatCutImportExecutionResult {
	const applicability = inspectChatCutImportApplicability({
		tracks,
		plan,
		fps,
		hasTimelineBookmarks,
	});
	if (!applicability.canApply) {
		throw new Error(applicability.blockers.join(" "));
	}
	const collapseIntervals = collectCollapseIntervals(plan.operations);
	const changedRefs: { trackId: string; elementId: string }[] = [];
	const replace = <TTrack extends TimelineTrack>(track: TTrack): TTrack =>
		applyReorders({
			track: replaceTrack({
				track,
				operations: plan.operations,
				fps,
				collapseIntervals,
				changedRefs,
			}),
			reorders: plan.operations.filter(
				(operation): operation is ChatCutReorderOperation =>
					operation.kind === "reorder",
			),
			changedRefs,
		});
	const nextTracks: SceneTracks = {
		main: replace(tracks.main),
		overlay: tracks.overlay.map(replace),
		audio: tracks.audio.map(replace),
	};
	return Object.freeze({
		...applicability,
		tracks: nextTracks,
		changedElementRefs: Object.freeze(
			[...new Map(changedRefs.map((ref) => [`${ref.trackId}:${ref.elementId}`, ref])).values()].map(
				(ref) => Object.freeze(ref),
			),
		),
	});
}
