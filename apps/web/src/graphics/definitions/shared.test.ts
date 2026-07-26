import { describe, expect, it } from "bun:test";
import { resolveGraphicStrokeAlign } from "./shared";

describe("resolveGraphicStrokeAlign", () => {
	it("preserves supported stroke alignments", () => {
		expect(resolveGraphicStrokeAlign("inside")).toBe("inside");
		expect(resolveGraphicStrokeAlign("center")).toBe("center");
		expect(resolveGraphicStrokeAlign("outside")).toBe("outside");
	});

	it("falls back to center for untrusted values", () => {
		expect(resolveGraphicStrokeAlign("invalid")).toBe("center");
		expect(resolveGraphicStrokeAlign(1)).toBe("center");
		expect(resolveGraphicStrokeAlign(null)).toBe("center");
	});
});
