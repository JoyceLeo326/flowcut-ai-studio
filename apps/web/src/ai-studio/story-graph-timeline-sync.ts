import type { StoryGraph } from "./story-graph-model";
import type {
	Bookmark,
	SceneTracks,
	TimelineElement,
	TimelineTrack,
} from "@/timeline";
import { addMediaTime, mediaTimeToSeconds, type MediaTime } from "@/wasm";

const CONTIGUOUS_TOLERANCE_SECONDS = 0.002;

export interface StoryGraphTimelineSyncInspection {
	readonly canApply: boolean;
	readonly blockers: readonly string[];
	readonly targetTrackId: string | null;
	readonly orderedElementIds: readonly string[];
	readonly changed: boolean;
	readonly span: {
		readonly startSeconds: number;
		readonly endSeconds: number;
	} | null;
}

export interface StoryGraphTimelineSyncResult extends StoryGraphTimelineSyncInspection {
	readonly tracks: SceneTracks;
}

function tracksInScene(tracks: SceneTracks): TimelineTrack[] {
	return [tracks.main, ...tracks.overlay, ...tracks.audio];
}

function endOf(element: TimelineElement): MediaTime {
	return addMediaTime({ a: element.startTime, b: element.duration });
}

function overlaps({
	leftStart,
	leftEnd,
	rightStart,
	rightEnd,
}: {
	leftStart: MediaTime;
	leftEnd: MediaTime;
	rightStart: MediaTime;
	rightEnd: MediaTime;
}): boolean {
	return leftStart < rightEnd && leftEnd > rightStart;
}

function freezeInspection(
	inspection: StoryGraphTimelineSyncInspection,
): StoryGraphTimelineSyncInspection {
	Object.freeze(inspection.blockers);
	Object.freeze(inspection.orderedElementIds);
	if (inspection.span) Object.freeze(inspection.span);
	return Object.freeze(inspection);
}

export function inspectStoryGraphTimelineSync({
	graph,
	tracks,
	bookmarks = [],
}: {
	graph: StoryGraph;
	tracks: SceneTracks;
	bookmarks?: readonly Bookmark[];
}): StoryGraphTimelineSyncInspection {
	const blockers: string[] = [];
	const orderedElementIds: string[] = [];
	const trackIds: string[] = [];
	for (const node of graph.nodes) {
		if (node.provenance.timelineElementIds.length === 0) continue;
		if (
			node.provenance.timelineElementIds.length !== 1 ||
			node.provenance.trackIds.length !== 1
		) {
			blockers.push("合并或多来源节点需要先拆分，当前不会猜测片段顺序。");
			continue;
		}
		orderedElementIds.push(node.provenance.timelineElementIds[0]);
		trackIds.push(node.provenance.trackIds[0]);
	}
	if (orderedElementIds.length < 2) {
		blockers.push("至少需要两个可定位的时间线节点才能同步顺序。");
	}
	if (new Set(orderedElementIds).size !== orderedElementIds.length) {
		blockers.push("多个故事节点指向同一片段，无法确定唯一重排结果。");
	}
	const uniqueTrackIds = [...new Set(trackIds)];
	if (uniqueTrackIds.length !== 1) {
		blockers.push("当前只支持同一轨道上的连续片段重排。");
	}
	const targetTrackId = uniqueTrackIds.length === 1 ? uniqueTrackIds[0] : null;
	const targetTrack = tracksInScene(tracks).find(
		(track) => track.id === targetTrackId,
	);
	const elementById = new Map(
		targetTrack?.elements.map((element) => [element.id, element] as const) ??
			[],
	);
	const orderedElements = orderedElementIds
		.map((elementId) => elementById.get(elementId))
		.filter((element): element is TimelineElement => element !== undefined);
	if (orderedElements.length !== orderedElementIds.length) {
		blockers.push("故事图引用的片段已从目标轨道移除，请先刷新故事图。");
	}

	const chronological = [...orderedElements].sort(
		(left, right) => left.startTime - right.startTime,
	);
	for (let index = 1; index < chronological.length; index += 1) {
		const previous = chronological[index - 1];
		const current = chronological[index];
		const gap = Math.abs(
			mediaTimeToSeconds({ time: current.startTime }) -
				mediaTimeToSeconds({ time: endOf(previous) }),
		);
		if (gap > CONTIGUOUS_TOLERANCE_SECONDS) {
			blockers.push("目标片段之间存在空隙或重叠，当前不会自动改变这些间隔。");
			break;
		}
	}

	const first = chronological[0];
	const last = chronological.at(-1);
	const span =
		first && last
			? {
					startSeconds: mediaTimeToSeconds({ time: first.startTime }),
					endSeconds: mediaTimeToSeconds({ time: endOf(last) }),
				}
			: null;
	if (first && last && targetTrack) {
		const mappedIds = new Set(orderedElementIds);
		const spanStart = first.startTime;
		const spanEnd = endOf(last);
		for (const element of targetTrack.elements) {
			if (mappedIds.has(element.id)) continue;
			if (
				overlaps({
					leftStart: element.startTime,
					leftEnd: endOf(element),
					rightStart: spanStart,
					rightEnd: spanEnd,
				})
			) {
				blockers.push("目标区间包含未进入故事图的片段，不能安全重排。");
				break;
			}
		}
		for (const track of tracksInScene(tracks)) {
			if (track.id === targetTrack.id) continue;
			if (
				track.elements.some((element) =>
					overlaps({
						leftStart: element.startTime,
						leftEnd: endOf(element),
						rightStart: spanStart,
						rightEnd: spanEnd,
					}),
				)
			) {
				blockers.push(
					`轨道“${track.name}”在目标区间有叠加内容；当前不会自动重排关联层。`,
				);
			}
		}
		if (
			bookmarks.some(
				(bookmark) => bookmark.time >= spanStart && bookmark.time <= spanEnd,
			)
		) {
			blockers.push("目标区间含时间书签；当前不会在未确认时移动书签。");
		}
	}

	const chronologicalIds = chronological.map((element) => element.id);
	const changed =
		chronologicalIds.length === orderedElementIds.length &&
		chronologicalIds.some(
			(elementId, index) => elementId !== orderedElementIds[index],
		);
	if (!changed && orderedElementIds.length >= 2) {
		blockers.push("故事图顺序已经与时间线一致。");
	}
	return freezeInspection({
		canApply: blockers.length === 0,
		blockers: [...new Set(blockers)],
		targetTrackId,
		orderedElementIds,
		changed,
		span,
	});
}

function replaceTargetTrack<TTrack extends TimelineTrack>({
	track,
	inspection,
}: {
	track: TTrack;
	inspection: StoryGraphTimelineSyncInspection;
}): TTrack {
	if (track.id !== inspection.targetTrackId || inspection.span === null) {
		return track;
	}
	const mappedIds = new Set(inspection.orderedElementIds);
	const byId = new Map(
		track.elements.map((element) => [element.id, element] as const),
	);
	let cursor = [...byId.values()]
		.filter((element) => mappedIds.has(element.id))
		.reduce(
			(minimum, element) =>
				element.startTime < minimum ? element.startTime : minimum,
			[...byId.values()].find((element) => mappedIds.has(element.id))!
				.startTime,
		);
	const reordered = inspection.orderedElementIds.map((elementId) => {
		const element = byId.get(elementId)!;
		const next = { ...element, startTime: cursor };
		cursor = addMediaTime({ a: cursor, b: element.duration });
		return next;
	});
	const elements = [
		...track.elements.filter((element) => !mappedIds.has(element.id)),
		...reordered,
	].sort((left, right) => left.startTime - right.startTime);
	return { ...track, elements } as TTrack;
}

export function buildStoryGraphTimelineSync({
	graph,
	tracks,
	bookmarks = [],
}: {
	graph: StoryGraph;
	tracks: SceneTracks;
	bookmarks?: readonly Bookmark[];
}): StoryGraphTimelineSyncResult {
	const inspection = inspectStoryGraphTimelineSync({
		graph,
		tracks,
		bookmarks,
	});
	if (!inspection.canApply) {
		throw new Error(inspection.blockers.join(" "));
	}
	return Object.freeze({
		...inspection,
		tracks: {
			main: replaceTargetTrack({ track: tracks.main, inspection }),
			overlay: tracks.overlay.map((track) =>
				replaceTargetTrack({ track, inspection }),
			),
			audio: tracks.audio.map((track) =>
				replaceTargetTrack({ track, inspection }),
			),
		},
	});
}
