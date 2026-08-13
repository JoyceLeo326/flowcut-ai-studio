import { describe, expect, test } from "bun:test";
import { localSoundBySlug } from "./local-sound-library";
import { createLocalSoundWav } from "./local-wav";

describe("local WAV synthesis", () => {
	test("creates a valid PCM WAV with the requested duration", () => {
		const sound = localSoundBySlug("soft-ui-click");
		expect(sound).not.toBeNull();
		const bytes = new Uint8Array(createLocalSoundWav(sound!));
		expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF");
		expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe("WAVE");
		expect(bytes.byteLength).toBe(44 + Math.round(0.22 * 44_100) * 2);
	});

	test("is deterministic for cacheable project audio", () => {
		const sound = localSoundBySlug("launch-pulse")!;
		const first = new Uint8Array(createLocalSoundWav(sound));
		const second = new Uint8Array(createLocalSoundWav(sound));
		expect(first).toEqual(second);
	});
});
