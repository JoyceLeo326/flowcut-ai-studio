import type { MediaAsset } from "@/media/types";
import type { TProject } from "@/project/types";
import type {
	AudioElement,
	SceneTracks,
	TScene,
	TimelineElement,
	TimelineTrack,
} from "@/timeline";
import { mediaTimeToSeconds, type MediaTime } from "@/wasm";
import type { MediaIndex } from "./media-index";
import {
	fingerprintJson,
	type Sha256Fingerprint,
} from "./chatcut-fingerprint";
import type {
	ChatCutImportApplyReceipt,
	ChatCutImportAssetState,
	ChatCutImportSilenceAnalysisState,
	ChatCutImportTargetState,
	ChatCutImportTimelineItemState,
	FrameRange,
	PlaybackRate,
} from "./chatcut-result";

export interface ChatCutAssetIdentity {
	readonly assetId: string;
	readonly name: string;
	readonly type: MediaAsset["type"];
	readonly sizeBytes: number;
	readonly lastModified: number;
	readonly durationSeconds: number | null;
	readonly width: number | null;
	readonly height: number | null;
	readonly nominalFps: number | null;
	readonly hasAudio: boolean | null;
}

export interface ChatCutTargetStateBundle {
	readonly target: ChatCutImportTargetState;
	readonly assetIdentities: readonly (ChatCutAssetIdentity & {
		readonly fingerprint: Sha256Fingerprint;
	})[];
	readonly timebase: {
		readonly unit: "frame";
		readonly fps: PlaybackRate;
	};
}

export function createChatCutVersionIdentity({
	projectVersion,
	timelineFingerprint,
}: {
	projectVersion: number;
	timelineFingerprint: Sha256Fingerprint;
}): {
	readonly versionId: string;
	readonly timelineSnapshotId: string;
} {
	const timelineDigest = timelineFingerprint.slice("sha256:".length, 22);
	return Object.freeze({
		versionId: `version-${projectVersion}-${timelineDigest}`,
		timelineSnapshotId: `snapshot-${timelineDigest}`,
	});
}

function allTracks({ tracks }: { tracks: SceneTracks }): TimelineTrack[] {
	return [tracks.main, ...tracks.overlay, ...tracks.audio];
}

function asSeconds(time: MediaTime): number {
	return mediaTimeToSeconds({ time });
}

function framesPerSecond(rate: PlaybackRate): number {
	return rate.numerator / rate.denominator;
}

function secondsToFrame({
	seconds,
	fps,
}: {
	seconds: number;
	fps: PlaybackRate;
}): number {
	return Math.max(0, Math.round(seconds * framesPerSecond(fps)));
}

function durationToFrames({
	seconds,
	fps,
}: {
	seconds: number;
	fps: PlaybackRate;
}): number {
	return Math.max(1, Math.round(seconds * framesPerSecond(fps)));
}

function greatestCommonDivisor({
	left,
	right,
}: {
	left: number;
	right: number;
}): number {
	let a = Math.abs(left);
	let b = Math.abs(right);
	while (b > 0) {
		const remainder = a % b;
		a = b;
		b = remainder;
	}
	return Math.max(1, a);
}

function playbackRateFromFrameDurations({
	timelineFrames,
	sourceFrames,
}: {
	timelineFrames: number;
	sourceFrames: number;
}): PlaybackRate {
	const divisor = greatestCommonDivisor({
		left: sourceFrames,
		right: timelineFrames,
	});
	return Object.freeze({
		numerator: sourceFrames / divisor,
		denominator: timelineFrames / divisor,
	});
}

function mediaIdentity(asset: MediaAsset): ChatCutAssetIdentity {
	return Object.freeze({
		assetId: asset.id,
		name: asset.name,
		type: asset.type,
		sizeBytes: asset.file.size,
		lastModified: asset.file.lastModified,
		durationSeconds: asset.duration ?? null,
		width: asset.width ?? null,
		height: asset.height ?? null,
		nominalFps: asset.fps ?? null,
		hasAudio: asset.hasAudio ?? null,
	});
}

export function fingerprintChatCutAsset(asset: MediaAsset): Sha256Fingerprint {
	return fingerprintJson({
		kind: "visioncut.asset-identity/v1",
		...mediaIdentity(asset),
	});
}

function canonicalElement(element: TimelineElement): Record<string, unknown> {
	const base: Record<string, unknown> = {
		id: element.id,
		type: element.type,
		name: element.name,
		startTime: element.startTime,
		duration: element.duration,
		trimStart: element.trimStart,
		trimEnd: element.trimEnd,
		sourceDuration: element.sourceDuration,
		animations: element.animations,
		params: element.params,
	};
	if ("mediaId" in element) base.mediaId = element.mediaId;
	if ("sourceType" in element) base.sourceType = element.sourceType;
	if ("sourceUrl" in element) base.sourceUrl = element.sourceUrl;
	if ("retime" in element) base.retime = element.retime;
	if ("hidden" in element) base.hidden = element.hidden;
	if ("effects" in element) base.effects = element.effects;
	if ("masks" in element) base.masks = element.masks;
	if ("isSourceAudioEnabled" in element) {
		base.isSourceAudioEnabled = element.isSourceAudioEnabled;
	}
	if ("stickerId" in element) base.stickerId = element.stickerId;
	if ("definitionId" in element) base.definitionId = element.definitionId;
	if ("effectType" in element) base.effectType = element.effectType;
	return base;
}

function canonicalTrack(track: TimelineTrack): Record<string, unknown> {
	return {
		id: track.id,
		name: track.name,
		type: track.type,
		...(track.type === "audio" || track.type === "video"
			? { muted: track.muted }
			: {}),
		...(track.type !== "audio" ? { hidden: track.hidden } : {}),
		elements: [...track.elements]
			.sort(
				(left, right) =>
					left.startTime - right.startTime || left.id.localeCompare(right.id),
			)
			.map(canonicalElement),
	};
}

export function fingerprintChatCutTimeline({
	project,
	scene,
}: {
	project: TProject;
	scene: TScene;
}): Sha256Fingerprint {
	return fingerprintJson({
		kind: "visioncut.timeline-snapshot/v1",
		projectId: project.metadata.id,
		timelineId: scene.id,
		tracks: allTracks({ tracks: scene.tracks }).map(canonicalTrack),
		bookmarks: scene.bookmarks.map((bookmark) => ({
			time: bookmark.time,
			duration: bookmark.duration,
			note: bookmark.note,
			color: bookmark.color,
		})),
	});
}

function isUploadBackedElement(
	element: TimelineElement,
): element is Extract<TimelineElement, { type: "video" | "image" }> | AudioElement {
	if (element.type === "video" || element.type === "image") return true;
	return element.type === "audio" && element.sourceType === "upload";
}

export function createChatCutTimelineItemState({
	element,
	trackId,
	fps,
}: {
	element: TimelineElement;
	trackId: string;
	fps: PlaybackRate;
}): ChatCutImportTimelineItemState | null {
	if (!isUploadBackedElement(element) || !("mediaId" in element)) return null;
	const timelineStartFrame = secondsToFrame({
		seconds: asSeconds(element.startTime),
		fps,
	});
	const timelineDurationFrames = durationToFrames({
		seconds: asSeconds(element.duration),
		fps,
	});
	const requestedRate =
		"retime" in element && element.retime ? element.retime.rate : 1;
	const sourceDurationFrames = Math.max(
		1,
		Math.round(timelineDurationFrames * requestedRate),
	);
	const sourceStartFrame = secondsToFrame({
		seconds: asSeconds(element.trimStart),
		fps,
	});
	const timelineRange: FrameRange = Object.freeze({
		startFrame: timelineStartFrame,
		endFrame: timelineStartFrame + timelineDurationFrames,
	});
	const sourceRange: FrameRange = Object.freeze({
		startFrame: sourceStartFrame,
		endFrame: sourceStartFrame + sourceDurationFrames,
	});
	const playbackRate = playbackRateFromFrameDurations({
		timelineFrames: timelineDurationFrames,
		sourceFrames: sourceDurationFrames,
	});
	const fingerprint = fingerprintJson({
		kind: "visioncut.timeline-item/v1",
		trackId,
		assetId: element.mediaId,
		playbackRate,
		timelineRange,
		sourceRange,
		element: canonicalElement(element),
	});
	return Object.freeze({
		itemId: element.id,
		itemFingerprint: fingerprint,
		assetId: element.mediaId,
		trackId,
		playbackRate,
		timelineRange,
		sourceRange,
	});
}

function timelineItems({
	tracks,
	fps,
}: {
	tracks: SceneTracks;
	fps: PlaybackRate;
}): ChatCutImportTimelineItemState[] {
	return allTracks({ tracks }).flatMap((track) =>
		[...track.elements]
			.sort(
				(left, right) =>
					left.startTime - right.startTime || left.id.localeCompare(right.id),
			)
			.flatMap((element) => {
				const item = createChatCutTimelineItemState({
					element,
					trackId: track.id,
					fps,
				});
				return item ? [item] : [];
			}),
	);
}

function silenceAnalysisState(
	index: MediaIndex,
): ChatCutImportSilenceAnalysisState {
	return Object.freeze({
		analysisId: index.mediaIndexId,
		assetId: index.assetId,
		revision: index.schemaVersion,
		analysisFingerprint: fingerprintJson({
			kind: "visioncut.media-index.silence-analysis/v1",
			mediaIndexId: index.mediaIndexId,
			assetId: index.assetId,
			algorithm: index.algorithm.version,
			candidates: index.audioActivityCandidates.filter(
				(candidate) => candidate.kind === "silence-candidate",
			),
		}),
	});
}

function logicalProjectVersion({
	project,
	timelineId,
	appliedImports,
}: {
	project: TProject;
	timelineId: string;
	appliedImports: readonly ChatCutImportApplyReceipt[];
}): number {
	return appliedImports
		.filter(
			(receipt) =>
				receipt.projectId === project.metadata.id &&
				receipt.timelineId === timelineId,
		)
		.reduce(
			(version, receipt) => Math.max(version, receipt.toVersion),
			project.version,
		);
}

export function createChatCutTargetState({
	project,
	scene,
	assets,
	mediaIndexes = [],
	appliedImports = [],
}: {
	project: TProject;
	scene: TScene;
	assets: readonly MediaAsset[];
	mediaIndexes?: readonly MediaIndex[];
	appliedImports?: readonly ChatCutImportApplyReceipt[];
}): ChatCutTargetStateBundle {
	const fps: PlaybackRate = Object.freeze({
		numerator: project.settings.fps.numerator,
		denominator: project.settings.fps.denominator,
	});
	const timelineFingerprint = fingerprintChatCutTimeline({ project, scene });
	const items = timelineItems({ tracks: scene.tracks, fps });
	const assetIdentities = assets.map((asset) =>
		Object.freeze({
			...mediaIdentity(asset),
			fingerprint: fingerprintChatCutAsset(asset),
		}),
	);
	const maximumSourceEndByAsset = new Map<string, number>();
	for (const item of items) {
		maximumSourceEndByAsset.set(
			item.assetId,
			Math.max(
				maximumSourceEndByAsset.get(item.assetId) ?? 0,
				item.sourceRange.endFrame,
			),
		);
	}
	const assetStates: ChatCutImportAssetState[] = assetIdentities.map(
		(identity) => ({
			assetId: identity.assetId,
			fingerprint: identity.fingerprint,
			durationFrames: Math.max(
				1,
				identity.durationSeconds === null
					? 0
					: durationToFrames({ seconds: identity.durationSeconds, fps }),
				maximumSourceEndByAsset.get(identity.assetId) ?? 0,
			),
		}),
	);
	const scopedReceipts = appliedImports.filter(
		(receipt) =>
			receipt.projectId === project.metadata.id &&
			receipt.timelineId === scene.id,
	);
	const projectVersion = logicalProjectVersion({
		project,
		timelineId: scene.id,
		appliedImports: scopedReceipts,
	});
	const { versionId, timelineSnapshotId } = createChatCutVersionIdentity({
		projectVersion,
		timelineFingerprint,
	});
	const silenceAnalyses = mediaIndexes
		.filter((index) => assets.some((asset) => asset.id === index.assetId))
		.map(silenceAnalysisState);
	const target: ChatCutImportTargetState = Object.freeze({
		projectId: project.metadata.id,
		projectVersion,
		versionId,
		timelineId: scene.id,
		timelineSnapshotId,
		timelineFingerprint,
		assets: Object.freeze(assetStates),
		items: Object.freeze(items),
		transcripts: Object.freeze([]),
		transcriptWords: Object.freeze([]),
		silenceAnalyses: Object.freeze(silenceAnalyses),
		appliedImports: Object.freeze([...scopedReceipts]),
	});
	return Object.freeze({
		target,
		assetIdentities: Object.freeze(assetIdentities),
		timebase: Object.freeze({ unit: "frame" as const, fps }),
	});
}
