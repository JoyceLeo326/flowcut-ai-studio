import { describe, expect, test } from "bun:test";
import { createExportPreflight } from "./preflight";

describe("createExportPreflight", () => {
	test("blocks export when the timeline is empty", () => {
		const preflight = createExportPreflight({
			durationSeconds: 0,
			canvasSize: { width: 1080, height: 1920 },
			format: "mp4",
			includeAudio: true,
			hasAudioSource: false,
		});

		expect(preflight.canExport).toBe(false);
		expect(preflight.blockers).toContain("时间线还是空的，请先加入视频或图片");
	});

	test("summarizes actual duration, resolution, aspect ratio and audio state", () => {
		const preflight = createExportPreflight({
			durationSeconds: 64.4,
			canvasSize: { width: 1080, height: 1350 },
			format: "webm",
			includeAudio: true,
			hasAudioSource: true,
		});

		expect(preflight.canExport).toBe(true);
		expect(preflight.summary).toEqual({
			duration: "1:04",
			resolution: "1080 × 1350",
			aspectRatio: "4:5",
			format: "WEBM",
			audio: "包含声音",
		});
	});

	test("warns when audio is requested but no audio source exists", () => {
		const preflight = createExportPreflight({
			durationSeconds: 20,
			canvasSize: { width: 1920, height: 1080 },
			format: "mp4",
			includeAudio: true,
			hasAudioSource: false,
		});

		expect(preflight.canExport).toBe(true);
		expect(preflight.warnings).toContain("当前时间线没有可用声音，成片将静音");
	});
});
