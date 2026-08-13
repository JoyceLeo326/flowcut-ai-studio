import { describe, expect, test } from "bun:test";
import type { AudioElement, SceneTracks } from "@/timeline";
import { cloneSceneTracksForExport } from "./export-scene-snapshot";

describe("export scene snapshot", () => {
	test("clones timeline state without cloning AudioBuffer", () => {
		const runtimeBuffer: AudioBuffer = {
			duration: 1,
			length: 48_000,
			numberOfChannels: 2,
			sampleRate: 48_000,
			copyFromChannel: () => undefined,
			copyToChannel: () => undefined,
			getChannelData: () => new Float32Array(48_000),
		};
		const audio: AudioElement = {
			id: "audio-1",
			type: "audio",
			sourceType: "library",
			sourceUrl: "/api/sounds/local/focus-bed",
			name: "Focus Bed",
			duration: 240_000,
			startTime: 0,
			trimStart: 0,
			trimEnd: 0,
			params: { volume: 1 },
			buffer: runtimeBuffer,
		};
		const tracks: SceneTracks = {
			main: {
				id: "main",
				name: "Main",
				type: "video",
				muted: false,
				hidden: false,
				elements: [],
			},
			overlay: [],
			audio: [
				{
					id: "audio-track",
					name: "Audio",
					type: "audio",
					muted: false,
					elements: [audio],
				},
			],
		};

		const snapshot = cloneSceneTracksForExport(tracks);
		const clonedAudio = snapshot.audio[0]?.elements[0];

		expect(snapshot).not.toBe(tracks);
		expect(snapshot.audio[0]).not.toBe(tracks.audio[0]);
		expect(clonedAudio).not.toBe(audio);
		expect(clonedAudio?.type).toBe("audio");
		if (clonedAudio?.type === "audio") {
			expect(clonedAudio.buffer).toBe(runtimeBuffer);
			expect(clonedAudio.params).not.toBe(audio.params);
		}
	});
});
