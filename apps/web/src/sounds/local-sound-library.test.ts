import { describe, expect, test } from "bun:test";
import {
	localSoundBySlug,
	localSoundToSearchResult,
	searchLocalSounds,
} from "./local-sound-library";

describe("local original sound library", () => {
	test("keeps effects and music separated", () => {
		expect(searchLocalSounds({ type: "effects" })).toHaveLength(4);
		expect(searchLocalSounds({ type: "songs" })).toHaveLength(4);
	});

	test("searches stable metadata and exposes a same-origin preview", () => {
		const [sound] = searchLocalSounds({
			query: "product creator",
			type: "songs",
		});
		expect(sound?.slug).toBe("forward-motion");
		const result = localSoundToSearchResult({ sound: sound! });
		expect(result.previewUrl).toBe("/api/sounds/local/forward-motion");
		expect(result.license).toContain("original");
	});

	test("rejects unknown slugs", () => {
		expect(localSoundBySlug("unknown")).toBeNull();
	});
});
