import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

describe("mainland-friendly runtime contract", () => {
	test("keeps the shell and font loading independent from Google-hosted runtime assets", async () => {
		const [layout, fonts] = await Promise.all([
			readFile(join(root, "app", "layout.tsx"), "utf8"),
			readFile(join(root, "fonts", "google-fonts.ts"), "utf8"),
		]);

		expect(layout).not.toContain('from "next/font/google"');
		expect(fonts).not.toContain("fonts.googleapis.com");
	});

	test("does not ship production-framing copy or credential-shaped test literals", async () => {
		const [intelligence, runtimeTest] = await Promise.all([
			readFile(
				join(
					root,
					"components",
					"editor",
					"panels",
					"inspector",
					"visioncut-project-intelligence.tsx",
				),
				"utf8",
			),
			readFile(join(root, "ai-studio", "agent-runtime.test.ts"), "utf8"),
		]);

		expect(intelligence).not.toContain("免费路径");
		expect(runtimeTest).not.toMatch(/\bsk-[A-Za-z0-9_-]{8,}\b/u);
	});
});
