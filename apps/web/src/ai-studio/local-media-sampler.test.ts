import { describe, expect, test } from "bun:test";
import {
	createSamplingTimestamps,
	measureAudioChannels,
	measureFramePixels,
} from "./local-media-sampler";

describe("VisionCut local media sampler helpers", () => {
	test("creates bounded, sorted timestamps without sampling past the media end", () => {
		const timestamps = createSamplingTimestamps({
			durationSeconds: 10,
			maxSamples: 5,
			preferredIntervalSeconds: 0.25,
		});
		expect(timestamps).toHaveLength(5);
		expect(timestamps[0]).toBe(0);
		expect(timestamps.at(-1)).toBeLessThan(10);
		expect([...timestamps].sort((a, b) => a - b)).toEqual(timestamps);
		expect(Object.isFrozen(timestamps)).toBe(true);
	});

	test("uses the preferred interval when it stays under the sample budget", () => {
		expect(
			createSamplingTimestamps({
				durationSeconds: 1,
				maxSamples: 10,
				preferredIntervalSeconds: 0.25,
			}),
		).toEqual([0, 0.25, 0.5, 0.75, 0.999]);
	});

	test("rejects invalid timestamp sampling input", () => {
		expect(() =>
			createSamplingTimestamps({
				durationSeconds: 0,
				maxSamples: 5,
				preferredIntervalSeconds: 1,
			}),
		).toThrow("durationSeconds");
		expect(() =>
			createSamplingTimestamps({
				durationSeconds: 1,
				maxSamples: 0,
				preferredIntervalSeconds: 1,
			}),
		).toThrow("maxSamples");
	});

	test("measures normalized luma, clipping and deterministic frame difference", () => {
		const black = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]);
		const white = new Uint8ClampedArray([
			255, 255, 255, 255, 255, 255, 255, 255,
		]);
		const first = measureFramePixels({ rgba: black, width: 2, height: 1 });
		const second = measureFramePixels({
			rgba: white,
			width: 2,
			height: 1,
			previousLuma: first.luma,
		});
		expect(first.lumaMean).toBe(0);
		expect(first.darkPixelRatio).toBe(1);
		expect(first.differenceFromPrevious).toBeNull();
		expect(second.lumaMean).toBe(1);
		expect(second.lightPixelRatio).toBe(1);
		expect(second.differenceFromPrevious).toBe(1);
	});

	test("rejects malformed pixel buffers and previous frames", () => {
		expect(() =>
			measureFramePixels({
				rgba: new Uint8ClampedArray(3),
				width: 1,
				height: 1,
			}),
		).toThrow("RGBA");
		expect(() =>
			measureFramePixels({
				rgba: new Uint8ClampedArray(8),
				width: 2,
				height: 1,
				previousLuma: new Float32Array(1),
			}),
		).toThrow("Previous luma");
	});

	test("measures multi-channel RMS and peak without exceeding normalized bounds", () => {
		const measurement = measureAudioChannels({
			channels: [
				Float32Array.from([1, -1, 0, 0]),
				Float32Array.from([0.5, -0.5, 0, 0]),
			],
		});
		expect(measurement.peak).toBe(1);
		expect(measurement.rms).toBeCloseTo(0.559017, 6);
	});

	test("handles empty audio and rejects mismatched channels", () => {
		expect(measureAudioChannels({ channels: [] })).toEqual({ peak: 0, rms: 0 });
		expect(() =>
			measureAudioChannels({
				channels: [new Float32Array(2), new Float32Array(3)],
			}),
		).toThrow("equal lengths");
	});
});
