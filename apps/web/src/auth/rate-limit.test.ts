import { describe, expect, test } from "bun:test";
import { baseRateLimit, checkRateLimit } from "./rate-limit";

describe("rate limit fallback", () => {
	test("enforces a bounded per-client limit without external Redis", async () => {
		if (baseRateLimit !== null) return;
		const clientId = `test-${crypto.randomUUID()}`;
		const request = new Request("http://localhost/api/ai/complete", {
			headers: { "x-forwarded-for": clientId },
		});
		const results = [];
		for (let index = 0; index < 31; index += 1) {
			results.push(await checkRateLimit({ request }));
		}

		expect(results.slice(0, 30).every(({ success }) => success)).toBe(true);
		expect(results[30]).toMatchObject({
			configured: false,
			fallback: true,
			limited: true,
			success: false,
		});
	});
});
