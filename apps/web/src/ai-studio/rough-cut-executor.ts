import type { SceneTracks, TimelineElement, TimelineTrack } from "@/timeline";
import {
	addMediaTime,
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	type MediaTime,
} from "@/wasm";
import {
	assertRoughCutPlan,
	getApprovedRoughCutOperations,
	type RoughCutPlan,
} from "./rough-cut-plan";

const BASELINE_TOLERANCE_SECONDS = 0.002;

export interface RoughCutApplicability {
	readonly canApply: boolean;
	readonly blockers: readonly string[];
	readonly approvedOperationCount: number;
	readonly removedSeconds: number;
	readonly outputSegmentCount: number;
}

export interface RoughCutExecutionResult extends RoughCutApplicability {
	readonly tracks: SceneTracks;
	readonly createdElementRefs: readonly {
		readonly trackId: string;
		readonly elementId: string;
	}[];
}

function closeEnough({
	left,
	right,
}: {
	left: number;
	right: number;
}): boolean {
	return Math.abs(left - right) <= BASELINE_TOLERANCE_SECONDS;
}

function allTracks(tracks: SceneTracks): TimelineTrack[] {
	return [tracks.main, ...tracks.overlay, ...tracks.audio];
}

function elementEnd(element: TimelineElement): MediaTime {
	return addMediaTime({ a: element.startTime, b: element.duration });
}

function targetEntry({
	tracks,
	trackId,
	elementId,
}: {
	tracks: SceneTracks;
	trackId: string;
	elementId: string;
}): { track: TimelineTrack; element: TimelineElement } | null {
	const track = allTracks(tracks).find((candidate) => candidate.id === trackId);
	const element = track?.elements.find(
		(candidate) => candidate.id === elementId,
	);
	return track && element ? { track, element } : null;
}

function frozenApplicability({
	blockers,
	approvedOperationCount,
	removedSeconds,
	outputSegmentCount,
}: Omit<RoughCutApplicability, "canApply">): RoughCutApplicability {
	return Object.freeze({
		canApply: blockers.length === 0,
		blockers: Object.freeze([...new Set(blockers)]),
		approvedOperationCount,
		removedSeconds: Number(removedSeconds.toFixed(6)),
		outputSegmentCount,
	});
}

export function inspectRoughCutApplicability({
	tracks,
	plan,
	hasTimelineBookmarks = false,
	currentAssetFingerprint,
	currentMediaIndexId,
}: {
	tracks: SceneTracks;
	plan: RoughCutPlan;
	hasTimelineBookmarks?: boolean;
	currentAssetFingerprint?: string;
	currentMediaIndexId?: string;
}): RoughCutApplicability {
	assertRoughCutPlan(plan);
	const approved = getApprovedRoughCutOperations(plan);
	const blockers: string[] = [];
	const removedSeconds = approved.reduce(
		(total, operation) => total + operation.removedSeconds,
		0,
	);
	if (
		currentAssetFingerprint !== undefined &&
		currentAssetFingerprint !== plan.evidenceArtifact.assetFingerprint
	) {
		blockers.push("素材指纹与生成建议时不一致，请重新执行本地分析。");
	}
	if (
		currentMediaIndexId !== undefined &&
		currentMediaIndexId !== plan.evidenceArtifact.mediaIndexId
	) {
		blockers.push("本地分析版本已经变化，请重新生成粗剪建议。");
	}
	if (approved.length === 0) blockers.push("至少批准一个切口后才能执行。");
	const entry = targetEntry({
		tracks,
		trackId: plan.baseline.trackId,
		elementId: plan.baseline.elementId,
	});
	if (!entry) {
		blockers.push("目标片段已不在基线轨道上，请重新生成粗剪建议。");
		return frozenApplicability({
			blockers,
			approvedOperationCount: approved.length,
			removedSeconds,
			outputSegmentCount: approved.length + 1,
		});
	}
	const { element } = entry;
	if (!("mediaId" in element) || element.mediaId !== plan.assetId) {
		blockers.push("目标片段与分析素材不再匹配，请重新分析。");
	}
	if (element.type !== "video" && element.type !== "audio") {
		blockers.push("本地静音粗剪只支持视频或上传音频片段。");
	}
	if (element.type === "audio" && element.sourceType !== "upload") {
		blockers.push("在线音乐库片段不参与本地静音粗剪。");
	}
	if ("retime" in element && element.retime && element.retime.rate !== 1) {
		blockers.push("片段已经变速；恢复 1x 后重新生成切口。");
	}
	if (element.animations && Object.keys(element.animations).length > 0) {
		blockers.push("片段含关键帧动画，当前版本不会自动重排关键帧。");
	}
	const timelineStart = mediaTimeToSeconds({ time: element.startTime });
	const sourceStart = mediaTimeToSeconds({ time: element.trimStart });
	const duration = mediaTimeToSeconds({ time: element.duration });
	if (
		!closeEnough({
			left: timelineStart,
			right: plan.baseline.timelineStartSeconds,
		}) ||
		!closeEnough({
			left: sourceStart,
			right: plan.baseline.sourceStartSeconds,
		}) ||
		!closeEnough({ left: duration, right: plan.baseline.durationSeconds })
	) {
		blockers.push("时间线片段已在生成建议后变化，请重新生成切口。");
	}
	if (hasTimelineBookmarks) {
		blockers.push("场景含时间书签；当前版本不会在未确认时移动书签。");
	}

	const targetStart = element.startTime;
	const targetEnd = elementEnd(element);
	for (const track of allTracks(tracks)) {
		for (const candidate of track.elements) {
			if (candidate.id === element.id && track.id === entry.track.id) continue;
			const candidateEnd = elementEnd(candidate);
			if (candidate.startTime < targetEnd && candidateEnd > targetStart) {
				blockers.push(
					`轨道“${track.name}”有元素与目标片段重叠；请先处理叠加层或改用手动剪辑。`,
				);
			}
		}
	}

	return frozenApplicability({
		blockers,
		approvedOperationCount: approved.length,
		removedSeconds,
		outputSegmentCount: approved.length + 1,
	});
}

interface SourceRange {
	startSeconds: number;
	endSeconds: number;
}

function keptSourceRanges(plan: RoughCutPlan): SourceRange[] {
	const approved = [...getApprovedRoughCutOperations(plan)].sort(
		(left, right) =>
			left.sourceRange.startSeconds - right.sourceRange.startSeconds,
	);
	const sourceEnd =
		plan.baseline.sourceStartSeconds + plan.baseline.durationSeconds;
	const ranges: SourceRange[] = [];
	let cursor = plan.baseline.sourceStartSeconds;
	for (const operation of approved) {
		if (operation.sourceRange.startSeconds > cursor) {
			ranges.push({
				startSeconds: cursor,
				endSeconds: operation.sourceRange.startSeconds,
			});
		}
		cursor = operation.sourceRange.endSeconds;
	}
	if (cursor < sourceEnd)
		ranges.push({ startSeconds: cursor, endSeconds: sourceEnd });
	return ranges;
}

function cloneSegment({
	element,
	elementId,
	range,
	segmentIndex,
	startTime,
	visibleSourceEndSeconds,
}: {
	element: TimelineElement;
	elementId: string;
	range: SourceRange;
	segmentIndex: number;
	startTime: MediaTime;
	visibleSourceEndSeconds: number;
}): TimelineElement {
	const duration = mediaTimeFromSeconds({
		seconds: range.endSeconds - range.startSeconds,
	});
	const trailingRemoved = mediaTimeFromSeconds({
		seconds: visibleSourceEndSeconds - range.endSeconds,
	});
	return {
		...element,
		id: elementId,
		name: `${element.name} · 粗剪 ${segmentIndex + 1}`,
		startTime,
		duration,
		trimStart: mediaTimeFromSeconds({ seconds: range.startSeconds }),
		trimEnd: addMediaTime({ a: element.trimEnd, b: trailingRemoved }),
	};
}

function transformTrack<TTrack extends TimelineTrack>({
	track,
	targetTrackId,
	targetElementId,
	segments,
	targetEnd,
	rippleOffset,
}: {
	track: TTrack;
	targetTrackId: string;
	targetElementId: string;
	segments: TimelineElement[];
	targetEnd: MediaTime;
	rippleOffset: MediaTime;
}): TTrack {
	const elements = track.elements.flatMap((element) => {
		if (track.id === targetTrackId && element.id === targetElementId) {
			return segments;
		}
		if (element.startTime >= targetEnd) {
			return [
				{
					...element,
					startTime: addMediaTime({
						a: element.startTime,
						b: mediaTimeFromSeconds({
							seconds: -mediaTimeToSeconds({ time: rippleOffset }),
						}),
					}),
				},
			];
		}
		return [element];
	});
	return { ...track, elements } as TTrack;
}

export function buildRoughCutTracks({
	tracks,
	plan,
	elementIds,
	hasTimelineBookmarks = false,
	currentAssetFingerprint,
	currentMediaIndexId,
}: {
	tracks: SceneTracks;
	plan: RoughCutPlan;
	elementIds: readonly string[];
	hasTimelineBookmarks?: boolean;
	currentAssetFingerprint?: string;
	currentMediaIndexId?: string;
}): RoughCutExecutionResult {
	const applicability = inspectRoughCutApplicability({
		tracks,
		plan,
		hasTimelineBookmarks,
		currentAssetFingerprint,
		currentMediaIndexId,
	});
	if (!applicability.canApply) {
		throw new Error(applicability.blockers.join(" "));
	}
	const entry = targetEntry({
		tracks,
		trackId: plan.baseline.trackId,
		elementId: plan.baseline.elementId,
	});
	if (!entry) throw new Error("Rough-cut target disappeared before execution.");
	const ranges = keptSourceRanges(plan);
	if (
		elementIds.length !== ranges.length ||
		new Set(elementIds).size !== elementIds.length
	) {
		throw new Error(
			"Rough-cut segment ids must be unique and match the kept ranges.",
		);
	}
	const visibleSourceEndSeconds =
		plan.baseline.sourceStartSeconds + plan.baseline.durationSeconds;
	let cursor = entry.element.startTime;
	const segments = ranges.map((range, segmentIndex) => {
		const segment = cloneSegment({
			element: entry.element,
			elementId: elementIds[segmentIndex],
			range,
			segmentIndex,
			startTime: cursor,
			visibleSourceEndSeconds,
		});
		cursor = addMediaTime({ a: cursor, b: segment.duration });
		return segment;
	});
	const rippleOffset = mediaTimeFromSeconds({
		seconds: applicability.removedSeconds,
	});
	const targetEnd = elementEnd(entry.element);
	const nextTracks: SceneTracks = {
		main: transformTrack({
			track: tracks.main,
			targetTrackId: entry.track.id,
			targetElementId: entry.element.id,
			segments,
			targetEnd,
			rippleOffset,
		}),
		overlay: tracks.overlay.map((track) =>
			transformTrack({
				track,
				targetTrackId: entry.track.id,
				targetElementId: entry.element.id,
				segments,
				targetEnd,
				rippleOffset,
			}),
		),
		audio: tracks.audio.map((track) =>
			transformTrack({
				track,
				targetTrackId: entry.track.id,
				targetElementId: entry.element.id,
				segments,
				targetEnd,
				rippleOffset,
			}),
		),
	};
	return Object.freeze({
		...applicability,
		tracks: nextTracks,
		createdElementRefs: Object.freeze(
			segments.map((segment) =>
				Object.freeze({ trackId: entry.track.id, elementId: segment.id }),
			),
		),
	});
}
