import {
	resolveAnimationPathValueAtTime,
	resolveEffectParamsAtTime,
	splitAnimationsAtTime,
} from "@/animation";
import type { MediaAsset } from "@/media/types";
import { renderThumbnailDataUrl } from "@/media/thumbnail";
import { getSourceSpanAtClipTime, getSourceTimeAtClipTime } from "@/retime";
import { videoCache } from "@/services/video-cache/service";
import type {
	ElementRef,
	ImageElement,
	SceneTracks,
	VideoElement,
	VideoTrack,
} from "@/timeline/types";
import { findTrackInSceneTracks } from "@/timeline/track-element-update";
import { generateUUID } from "@/utils/id";
import {
	addMediaTime,
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	roundMediaTime,
	subMediaTime,
	type MediaTime,
	ZERO_MEDIA_TIME,
} from "@/wasm";

export const DEFAULT_FREEZE_FRAME_DURATION = mediaTimeFromSeconds({
	seconds: 2,
});

export type FreezeFrameErrorCode =
	| "NO_SELECTION"
	| "MULTIPLE_SELECTION"
	| "ELEMENT_NOT_FOUND"
	| "NOT_VIDEO"
	| "ASSET_NOT_FOUND"
	| "UNSUPPORTED_FORMAT"
	| "PLAYHEAD_AT_START"
	| "PLAYHEAD_AT_END"
	| "PLAYHEAD_OUTSIDE_CLIP"
	| "TRACK_OVERLAP"
	| "STALE_SOURCE"
	| "STORAGE_FULL"
	| "FRAME_UNAVAILABLE"
	| "ENCODE_FAILED";

export class FreezeFrameError extends Error {
	readonly code: FreezeFrameErrorCode;

	constructor({
		code,
		message,
	}: {
		code: FreezeFrameErrorCode;
		message: string;
	}) {
		super(message);
		this.name = "FreezeFrameError";
		this.code = code;
	}
}

export interface FreezeFrameTarget {
	trackId: string;
	element: VideoElement;
	asset: MediaAsset;
	playheadTime: MediaTime;
	clipTime: MediaTime;
	sourceTime: MediaTime;
	sourceFingerprint: string;
}

export interface CapturedFreezeFrameAsset extends MediaAsset {
	type: "image";
}

export interface FreezeFrameMutationResult {
	tracks: SceneTracks;
	frozenElementRef: ElementRef;
	rightElementRef: ElementRef;
}

export function getFreezeFrameErrorMessage(error: unknown): string {
	if (error instanceof FreezeFrameError) {
		return error.message;
	}
	return error instanceof Error
		? error.message
		: "The selected frame could not be frozen.";
}

export function resolveFreezeFrameTarget({
	tracks,
	selection,
	mediaAssets,
	playheadTime,
}: {
	tracks: SceneTracks;
	selection: readonly ElementRef[];
	mediaAssets: readonly MediaAsset[];
	playheadTime: MediaTime;
}): FreezeFrameTarget {
	if (selection.length === 0) {
		throw new FreezeFrameError({
			code: "NO_SELECTION",
			message: "Select one video clip before creating a freeze frame.",
		});
	}
	if (selection.length > 1) {
		throw new FreezeFrameError({
			code: "MULTIPLE_SELECTION",
			message: "Select only one video clip to create a freeze frame.",
		});
	}

	const selected = selection[0];
	const track = findTrackInSceneTracks({ tracks, trackId: selected.trackId });
	const element = track?.elements.find(
		(candidate) => candidate.id === selected.elementId,
	);
	if (!track || !element) {
		throw new FreezeFrameError({
			code: "ELEMENT_NOT_FOUND",
			message: "The selected timeline element no longer exists.",
		});
	}
	if (track.type !== "video" || element.type !== "video") {
		throw new FreezeFrameError({
			code: "NOT_VIDEO",
			message: "Freeze frame is available only for video clips.",
		});
	}

	const asset = mediaAssets.find(
		(candidate) => candidate.id === element.mediaId,
	);
	if (!asset) {
		throw new FreezeFrameError({
			code: "ASSET_NOT_FOUND",
			message:
				"The source video is missing. Relink it before freezing a frame.",
		});
	}
	if (asset.type !== "video") {
		throw new FreezeFrameError({
			code: "UNSUPPORTED_FORMAT",
			message: "The selected clip does not reference a decodable video source.",
		});
	}

	const clipEnd = addMediaTime({ a: element.startTime, b: element.duration });
	if (playheadTime === element.startTime) {
		throw new FreezeFrameError({
			code: "PLAYHEAD_AT_START",
			message: "Move the playhead inside the clip, away from its first frame.",
		});
	}
	if (playheadTime === clipEnd) {
		throw new FreezeFrameError({
			code: "PLAYHEAD_AT_END",
			message: "Move the playhead inside the clip, away from its end boundary.",
		});
	}
	if (playheadTime < element.startTime || playheadTime > clipEnd) {
		throw new FreezeFrameError({
			code: "PLAYHEAD_OUTSIDE_CLIP",
			message: "Move the playhead inside the selected video clip.",
		});
	}

	const conflictingElement = track.elements.find(
		(candidate) =>
			candidate.id !== element.id &&
			candidate.startTime < clipEnd &&
			candidate.startTime + candidate.duration > element.startTime,
	);
	if (conflictingElement) {
		throw new FreezeFrameError({
			code: "TRACK_OVERLAP",
			message:
				"The source track contains overlapping elements. Resolve the overlap before freezing a frame.",
		});
	}

	const clipTime = subMediaTime({ a: playheadTime, b: element.startTime });
	const sourceOffset = roundMediaTime({
		time: getSourceTimeAtClipTime({
			clipTime,
			retime: element.retime,
		}),
	});
	const sourceTime = addMediaTime({ a: element.trimStart, b: sourceOffset });
	const sourceSeconds = mediaTimeToSeconds({ time: sourceTime });
	if (
		!Number.isFinite(sourceSeconds) ||
		sourceSeconds < 0 ||
		(typeof asset.duration === "number" && sourceSeconds >= asset.duration)
	) {
		throw new FreezeFrameError({
			code: "FRAME_UNAVAILABLE",
			message:
				"The playhead resolves outside the source video's decodable frame range.",
		});
	}

	return {
		trackId: track.id,
		element,
		asset,
		playheadTime,
		clipTime,
		sourceTime,
		sourceFingerprint: createFreezeFrameSourceFingerprint({ element, asset }),
	};
}

export async function captureFreezeFrameAsset({
	target,
}: {
	target: FreezeFrameTarget;
}): Promise<CapturedFreezeFrameAsset> {
	let frame: Awaited<ReturnType<typeof videoCache.getFrameAt>>;
	try {
		frame = await videoCache.getFrameAt({
			mediaId: target.asset.id,
			file: target.asset.file,
			time: mediaTimeToSeconds({ time: target.sourceTime }),
		});
	} catch (error) {
		const detail =
			error instanceof Error ? error.message : "Unknown decoder error";
		const isUnsupported = /codec|decode|video track|format/i.test(detail);
		throw new FreezeFrameError({
			code: isUnsupported ? "UNSUPPORTED_FORMAT" : "FRAME_UNAVAILABLE",
			message: isUnsupported
				? `This video format cannot be decoded in the current browser. ${detail}`
				: `The frame could not be decoded. ${detail}`,
		});
	}
	if (!frame) {
		throw new FreezeFrameError({
			code: "FRAME_UNAVAILABLE",
			message: "No decodable video frame was found at the playhead.",
		});
	}

	const encoded = await encodeCanvasAsPng({ source: frame.canvas });
	const sourceName = target.asset.name.replace(/\.[^.]+$/, "");
	const sourceSeconds = mediaTimeToSeconds({ time: target.sourceTime });
	const fileName = `${sourceName}-freeze-${formatFreezeTime({ seconds: sourceSeconds })}.png`;
	const file = new File([encoded.blob], fileName, {
		type: "image/png",
		lastModified: Date.now(),
	});

	return {
		id: generateUUID(),
		name: fileName,
		type: "image",
		file,
		url: URL.createObjectURL(file),
		thumbnailUrl: encoded.thumbnailUrl,
		width: encoded.width,
		height: encoded.height,
	};
}

export function createFreezeFrameSourceFingerprint({
	element,
	asset,
}: {
	element: VideoElement;
	asset: MediaAsset;
}): string {
	return JSON.stringify({
		element: {
			id: element.id,
			mediaId: element.mediaId,
			startTime: element.startTime,
			duration: element.duration,
			trimStart: element.trimStart,
			trimEnd: element.trimEnd,
			sourceDuration: element.sourceDuration ?? null,
			retime: element.retime ?? null,
		},
		asset: {
			id: asset.id,
			name: asset.file.name,
			size: asset.file.size,
			lastModified: asset.file.lastModified,
			type: asset.file.type,
		},
	});
}

export function applyFreezeFrameMutation({
	tracks,
	target,
	frozenAssetId,
	freezeDuration = DEFAULT_FREEZE_FRAME_DURATION,
	frozenElementId = generateUUID(),
	rightElementId = generateUUID(),
}: {
	tracks: SceneTracks;
	target: Pick<
		FreezeFrameTarget,
		"trackId" | "element" | "playheadTime" | "clipTime"
	>;
	frozenAssetId: string;
	freezeDuration?: MediaTime;
	frozenElementId?: string;
	rightElementId?: string;
}): FreezeFrameMutationResult {
	if (freezeDuration <= ZERO_MEDIA_TIME) {
		throw new FreezeFrameError({
			code: "FRAME_UNAVAILABLE",
			message: "Freeze-frame duration must be greater than zero.",
		});
	}

	const track = findTrackInSceneTracks({ tracks, trackId: target.trackId });
	const currentElement = track?.elements.find(
		(candidate) => candidate.id === target.element.id,
	);
	if (!track || track.type !== "video" || currentElement?.type !== "video") {
		throw new FreezeFrameError({
			code: "ELEMENT_NOT_FOUND",
			message: "The source video changed before the freeze frame was inserted.",
		});
	}
	const currentClipEnd = addMediaTime({
		a: currentElement.startTime,
		b: currentElement.duration,
	});
	const conflictingElement = track.elements.find(
		(candidate) =>
			candidate.id !== currentElement.id &&
			candidate.startTime < currentClipEnd &&
			candidate.startTime + candidate.duration > currentElement.startTime,
	);
	if (conflictingElement) {
		throw new FreezeFrameError({
			code: "TRACK_OVERLAP",
			message:
				"The source track changed and now contains an overlap. Resolve it and try again.",
		});
	}

	const clipEnd = currentClipEnd;
	const rightDuration = subMediaTime({
		a: currentElement.duration,
		b: target.clipTime,
	});
	if (
		target.playheadTime <= currentElement.startTime ||
		target.playheadTime >= clipEnd ||
		target.clipTime <= ZERO_MEDIA_TIME ||
		rightDuration <= ZERO_MEDIA_TIME
	) {
		throw new FreezeFrameError({
			code: "STALE_SOURCE",
			message:
				"The clip or playhead changed while the frame was being captured. Try again.",
		});
	}

	const leftSourceSpan = roundMediaTime({
		time: getSourceSpanAtClipTime({
			clipTime: target.clipTime,
			retime: currentElement.retime,
		}),
	});
	const totalSourceSpan = roundMediaTime({
		time: getSourceSpanAtClipTime({
			clipTime: currentElement.duration,
			retime: currentElement.retime,
		}),
	});
	const rightSourceSpan = subMediaTime({
		a: totalSourceSpan,
		b: leftSourceSpan,
	});
	const { leftAnimations, rightAnimations } = splitAnimationsAtTime({
		animations: currentElement.animations,
		splitTime: target.clipTime,
		shouldIncludeSplitBoundary: true,
	});

	const leftElement: VideoElement = {
		...currentElement,
		duration: target.clipTime,
		trimEnd: addMediaTime({
			a: currentElement.trimEnd,
			b: rightSourceSpan,
		}),
		animations: leftAnimations,
	};
	const frozenElement = buildFrozenImageElement({
		source: currentElement,
		id: frozenElementId,
		mediaId: frozenAssetId,
		startTime: target.playheadTime,
		duration: freezeDuration,
		localTime: target.clipTime,
	});
	const rightElement: VideoElement = {
		...currentElement,
		id: rightElementId,
		name: `${currentElement.name} (continued)`,
		startTime: addMediaTime({
			a: target.playheadTime,
			b: freezeDuration,
		}),
		duration: rightDuration,
		trimStart: addMediaTime({
			a: currentElement.trimStart,
			b: leftSourceSpan,
		}),
		animations: rightAnimations,
	};

	const shiftedTrack: VideoTrack = {
		...track,
		elements: track.elements.flatMap((element): VideoTrack["elements"] => {
			if (element.id === currentElement.id) {
				return [leftElement, frozenElement, rightElement];
			}
			if (element.startTime >= clipEnd) {
				return [
					{
						...element,
						startTime: addMediaTime({
							a: element.startTime,
							b: freezeDuration,
						}),
					},
				];
			}
			return [element];
		}),
	};

	const nextTracks: SceneTracks =
		tracks.main.id === track.id
			? { ...tracks, main: shiftedTrack }
			: {
					...tracks,
					overlay: tracks.overlay.map((candidate) =>
						candidate.id === track.id ? shiftedTrack : candidate,
					),
				};

	return {
		tracks: nextTracks,
		frozenElementRef: { trackId: track.id, elementId: frozenElementId },
		rightElementRef: { trackId: track.id, elementId: rightElementId },
	};
}

function buildFrozenImageElement({
	source,
	id,
	mediaId,
	startTime,
	duration,
	localTime,
}: {
	source: VideoElement;
	id: string;
	mediaId: string;
	startTime: MediaTime;
	duration: MediaTime;
	localTime: MediaTime;
}): ImageElement {
	const params = Object.fromEntries(
		Object.entries(source.params).map(([propertyPath, fallbackValue]) => [
			propertyPath,
			resolveAnimationPathValueAtTime({
				animations: source.animations,
				propertyPath,
				localTime,
				fallbackValue,
			}),
		]),
	);
	const effects = source.effects?.map((effect) => ({
		...effect,
		params: resolveEffectParamsAtTime({
			effectId: effect.id,
			params: effect.params,
			animations: source.animations,
			localTime,
		}),
	}));

	return {
		id,
		type: "image",
		mediaId,
		name: `${source.name} (freeze frame)`,
		startTime,
		duration,
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		hidden: source.hidden,
		params,
		effects,
		masks: source.masks ? structuredClone(source.masks) : undefined,
	};
}

async function encodeCanvasAsPng({
	source,
}: {
	source: HTMLCanvasElement | OffscreenCanvas;
}): Promise<{
	blob: Blob;
	thumbnailUrl: string;
	width: number;
	height: number;
}> {
	const width = source.width;
	const height = source.height;
	if (width <= 0 || height <= 0) {
		throw new FreezeFrameError({
			code: "ENCODE_FAILED",
			message: "The decoded frame has invalid dimensions.",
		});
	}

	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext("2d");
	if (!context) {
		throw new FreezeFrameError({
			code: "ENCODE_FAILED",
			message: "This browser could not create an image canvas.",
		});
	}
	context.drawImage(source, 0, 0, width, height);

	const blob = await new Promise<Blob | null>((resolve) => {
		canvas.toBlob(resolve, "image/png");
	});
	if (!blob) {
		throw new FreezeFrameError({
			code: "ENCODE_FAILED",
			message: "The selected frame could not be encoded as PNG.",
		});
	}

	return {
		blob,
		thumbnailUrl: renderThumbnailDataUrl({
			width,
			height,
			draw: ({
				context: thumbnailContext,
				width: targetWidth,
				height: targetHeight,
			}) => {
				thumbnailContext.drawImage(canvas, 0, 0, targetWidth, targetHeight);
			},
		}),
		width,
		height,
	};
}

function formatFreezeTime({ seconds }: { seconds: number }): string {
	const milliseconds = Math.max(0, Math.round(seconds * 1_000));
	const wholeSeconds = Math.floor(milliseconds / 1_000);
	const remainder = milliseconds % 1_000;
	return `${String(wholeSeconds).padStart(4, "0")}-${String(remainder).padStart(3, "0")}`;
}
