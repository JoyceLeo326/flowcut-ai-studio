import { describe, expect, test } from "bun:test";
import { handleAiCompletion } from "./route";

function sameOriginRequest(): Request {
	return new Request("https://visioncut.example/api/ai/complete", {
		body: JSON.stringify({
			apiKey: "credential-fixture",
			maxOutputTokens: 32,
			model: "test-model",
			prompt: "test",
			provider: "openai",
			purpose: "connection-test",
		}),
		headers: {
			"content-type": "application/json",
			origin: "https://visioncut.example",
		},
		method: "POST",
	});
}

describe("AI completion proxy production safety", () => {
	test("fails closed when distributed rate limiting is unavailable", async () => {
		let fetchCalled = false;
		const response = await handleAiCompletion({
			checkRateLimitImpl: async () => ({
				configured: false,
				fallback: true,
				limited: false,
				success: true,
			}),
			environment: "production",
			fetchImpl: async () => {
				fetchCalled = true;
				return Response.json({});
			},
			request: sameOriginRequest(),
		});

		expect(response.status).toBe(503);
		expect(fetchCalled).toBe(false);
		expect(await response.json()).toEqual({
			error: {
				code: "upstream_unavailable",
				message:
					"公网模型代理尚未配置分布式限流，请使用本机工作模式或联系部署管理员",
				retryable: false,
			},
			ok: false,
		});
	});
});
