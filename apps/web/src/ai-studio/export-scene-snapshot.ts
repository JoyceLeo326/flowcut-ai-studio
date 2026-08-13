import type {
	AudioElement,
	AudioTrack,
	SceneTracks,
} from "@/timeline";

function cloneAudioElement(element: AudioElement): AudioElement {
	if (!element.buffer) {
		return structuredClone(element);
	}

	const { buffer, ...cloneable } = element;
	return {
		...structuredClone(cloneable),
		buffer,
	};
}

function cloneAudioTrack(track: AudioTrack): AudioTrack {
	const { elements, ...cloneable } = track;
	return {
		...structuredClone(cloneable),
		elements: elements.map(cloneAudioElement),
	};
}

/**
 * Freezes the editable timeline shape while retaining immutable runtime audio.
 * AudioBuffer is not supported by structuredClone in all target browsers.
 */
export function cloneSceneTracksForExport(tracks: SceneTracks): SceneTracks {
	return {
		main: structuredClone(tracks.main),
		overlay: structuredClone(tracks.overlay),
		audio: tracks.audio.map(cloneAudioTrack),
	};
}
