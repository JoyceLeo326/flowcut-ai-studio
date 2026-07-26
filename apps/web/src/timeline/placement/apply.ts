import type {
	AudioTrack,
	EffectTrack,
	GraphicTrack,
	OverlayTrack,
	SceneTracks,
	TextTrack,
	TimelineElement,
	TimelineTrack,
	VideoTrack,
} from "@/timeline";
import { generateUUID } from "@/utils/id";
import { buildEmptyTrack } from "./track-factory";
import type { PlacementResult } from "./types";
import { updateTrackInSceneTracks } from "@/timeline/track-element-update";

export function applyPlacement({
	tracks,
	placementResult,
	elements,
	newTrackInsertIndexOverride,
}: {
	tracks: SceneTracks;
	placementResult: PlacementResult;
	elements: TimelineElement[];
	newTrackInsertIndexOverride?: number;
}): { updatedTracks: SceneTracks; targetTrackId: string } | null {
	const orderedTracks = [...tracks.overlay, tracks.main, ...tracks.audio];
	if (placementResult.kind === "existingTrack") {
		const targetTrack = orderedTracks[placementResult.trackIndex];
		if (
			!targetTrack ||
			!areElementsCompatibleWithTrack({ track: targetTrack, elements })
		) {
			return null;
		}

		const updatedTracks = updateTrackInSceneTracks({
			tracks,
			trackId: targetTrack.id,
			update: (track) => ({
				...track,
				elements: [...track.elements, ...elements],
			}),
		});

		return { updatedTracks, targetTrackId: targetTrack.id };
	}

	const newTrackId = generateUUID();
	const insertIndex =
		newTrackInsertIndexOverride ?? placementResult.insertIndex;
	let updatedTracks: SceneTracks;
	if (placementResult.trackType === "audio") {
		const track = buildPlacedAudioTrack({
			id: newTrackId,
			elements,
		});
		if (!track) {
			return null;
		}
		updatedTracks = {
			...tracks,
			audio: insertIntoAudioTracks({
				tracks,
				insertIndex,
				track,
			}),
		};
	} else {
		const track = buildPlacedOverlayTrack({
			id: newTrackId,
			type: placementResult.trackType,
			elements,
		});
		if (!track) {
			return null;
		}
		updatedTracks = {
			...tracks,
			overlay: insertIntoOverlayTracks({
				tracks,
				insertIndex,
				track,
			}),
		};
	}
	return { updatedTracks, targetTrackId: newTrackId };
}

function areElementsCompatibleWithTrack({
	track,
	elements,
}: {
	track: TimelineTrack;
	elements: TimelineElement[];
}): boolean {
	switch (track.type) {
		case "audio":
			return elements.every(isAudioElement);
		case "video":
			return elements.every(isVideoTrackElement);
		case "text":
			return elements.every(isTextElement);
		case "graphic":
			return elements.every(isGraphicTrackElement);
		case "effect":
			return elements.every(isEffectElement);
	}
}

function isAudioElement(
	element: TimelineElement,
): element is AudioTrack["elements"][number] {
	return element.type === "audio";
}

function isVideoTrackElement(
	element: TimelineElement,
): element is VideoTrack["elements"][number] {
	return element.type === "video" || element.type === "image";
}

function isTextElement(
	element: TimelineElement,
): element is TextTrack["elements"][number] {
	return element.type === "text";
}

function isGraphicTrackElement(
	element: TimelineElement,
): element is GraphicTrack["elements"][number] {
	return element.type === "sticker" || element.type === "graphic";
}

function isEffectElement(
	element: TimelineElement,
): element is EffectTrack["elements"][number] {
	return element.type === "effect";
}

function insertIntoOverlayTracks({
	tracks,
	insertIndex,
	track,
}: {
	tracks: SceneTracks;
	insertIndex: number;
	track: OverlayTrack;
}): OverlayTrack[] {
	const normalizedInsertIndex = Math.max(
		0,
		Math.min(insertIndex, tracks.overlay.length),
	);
	const nextTracks = [...tracks.overlay];
	nextTracks.splice(normalizedInsertIndex, 0, track);
	return nextTracks;
}

function insertIntoAudioTracks({
	tracks,
	insertIndex,
	track,
}: {
	tracks: SceneTracks;
	insertIndex: number;
	track: AudioTrack;
}): AudioTrack[] {
	const audioInsertIndex = Math.max(
		0,
		Math.min(insertIndex - tracks.overlay.length - 1, tracks.audio.length),
	);
	const nextTracks = [...tracks.audio];
	nextTracks.splice(audioInsertIndex, 0, track);
	return nextTracks;
}

function buildPlacedAudioTrack({
	id,
	elements,
}: {
	id: string;
	elements: TimelineElement[];
}): AudioTrack | null {
	if (!elements.every(isAudioElement)) {
		return null;
	}

	return {
		...buildEmptyTrack({ id, type: "audio" }),
		elements,
	};
}

function buildPlacedOverlayTrack({
	id,
	type,
	elements,
}: {
	id: string;
	type: Exclude<OverlayTrack["type"], "audio">;
	elements: TimelineElement[];
}): OverlayTrack | null {
	switch (type) {
		case "video":
			if (!elements.every(isVideoTrackElement)) {
				return null;
			}
			return {
				...buildEmptyTrack({ id, type: "video" }),
				elements,
			};
		case "text":
			if (!elements.every(isTextElement)) {
				return null;
			}
			return {
				...buildEmptyTrack({ id, type: "text" }),
				elements,
			};
		case "graphic":
			if (!elements.every(isGraphicTrackElement)) {
				return null;
			}
			return {
				...buildEmptyTrack({ id, type: "graphic" }),
				elements,
			};
		case "effect":
			if (!elements.every(isEffectElement)) {
				return null;
			}
			return {
				...buildEmptyTrack({ id, type: "effect" }),
				elements,
			};
	}
}
