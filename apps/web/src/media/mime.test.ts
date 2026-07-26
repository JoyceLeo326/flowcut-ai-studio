import { describe, expect, test } from "bun:test";
import { resolveMediaMimeType, restoreFileMimeType } from "./mime";

describe("media MIME restoration", () => {
	test("keeps a declared type that matches the stored media category", () => {
		expect(
			resolveMediaMimeType({
				name: "clip.mov",
				mediaType: "video",
				declaredType: "video/custom",
			}),
		).toBe("video/custom");
	});

	test("infers common formats after OPFS drops the File type", () => {
		expect(
			resolveMediaMimeType({
				name: "TALK.MP4",
				mediaType: "video",
				declaredType: "",
			}),
		).toBe("video/mp4");
		expect(
			resolveMediaMimeType({
				name: "voice.m4a",
				mediaType: "audio",
				declaredType: "",
			}),
		).toBe("audio/mp4");
	});

	test("rehydrates an untyped OPFS file without changing its bytes", async () => {
		const original = new File([new Uint8Array([1, 2, 3])], "opaque", {
			lastModified: 12,
		});
		const restored = restoreFileMimeType({
			file: original,
			name: "clip.mp4",
			mediaType: "video",
			storedMimeType: "",
			lastModified: 34,
		});
		expect(restored.type).toBe("video/mp4");
		expect(restored.name).toBe("clip.mp4");
		expect(restored.lastModified).toBe(34);
		expect([...new Uint8Array(await restored.arrayBuffer())]).toEqual([1, 2, 3]);
	});
});
