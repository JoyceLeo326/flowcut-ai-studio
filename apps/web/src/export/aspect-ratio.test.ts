import { describe, expect, test } from "bun:test";
import { hasEquivalentAspectRatio } from "./aspect-ratio";

describe("hasEquivalentAspectRatio", () => {
	test("accepts exact scales and a one-pixel rounding difference", () => {
		expect(
			hasEquivalentAspectRatio({
				source: { width: 1280, height: 720 },
				output: { width: 1920, height: 1080 },
			}),
		).toBe(true);
		expect(
			hasEquivalentAspectRatio({
				source: { width: 608, height: 1080 },
				output: { width: 1080, height: 1920 },
			}),
		).toBe(true);
	});

	test("rejects a real reframe and invalid dimensions", () => {
		expect(
			hasEquivalentAspectRatio({
				source: { width: 608, height: 1080 },
				output: { width: 1080, height: 1350 },
			}),
		).toBe(false);
		expect(
			hasEquivalentAspectRatio({
				source: { width: 0, height: 1080 },
				output: { width: 1080, height: 1920 },
			}),
		).toBe(false);
	});
});
