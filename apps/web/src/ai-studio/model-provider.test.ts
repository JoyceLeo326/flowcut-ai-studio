import { describe, expect, test } from "bun:test";
import {
	MODEL_PROVIDER_SESSION_KEY,
	aiCompletionRequestSchema,
	buildFixedProviderRequest,
	clearModelProviderSession,
	completeWithLocalRules,
	createDefaultModelProviderSession,
	loadModelProviderSession,
	normalizeProviderPayload,
	saveModelProviderSession,
	type AiCompletionRequest,
	type SessionStorageLike,
} from "./model-provider";
import {
	MAX_AI_REQUEST_BYTES,
	MAX_AI_RESPONSE_BYTES,
	handleAiCompletion,
	type ModelProviderFetch,
} from "../app/api/ai/complete/route";

class MemorySessionStorage implements SessionStorageLike {
	readonly values = new Map<string, string>();

	getItem(key: string): string | null {
		return this.values.get(key) ?? null;
	}

	// eslint-disable-next-line opencut/prefer-object-params -- Storage.setItem requires two positional parameters.
	setItem(key: string, value: string): void {
		this.values.set(key, value);
	}

	removeItem(key: string): void {
		this.values.delete(key);
	}
}

function createCompletionRequest({
	apiKey = "test-api-key-123",
	model = "gpt-5-mini",
	provider = "openai",
}: {
	apiKey?: string;
	model?: string;
	provider?: AiCompletionRequest["provider"];
} = {}): AiCompletionRequest {
	return aiCompletionRequestSchema.parse({
		apiKey,
		maxOutputTokens: 64,
		model,
		prompt: "Create a reviewable edit plan",
		provider,
		purpose: "connection-test",
		systemPrompt: "Do not modify the project directly.",
	});
}

function createRouteRequest({
	body,
	contentLength,
}: {
	body: unknown;
	contentLength?: number;
}): Request {
	const headers = new Headers({ "Content-Type": "application/json" });
	if (contentLength !== undefined) {
		headers.set("Content-Length", String(contentLength));
	}
	return new Request("http://localhost/api/ai/complete", {
		body: JSON.stringify(body),
		headers,
		method: "POST",
	});
}

describe("VisionCut model provider foundation", () => {
	test("defaults to a deterministic local-free mode", () => {
		const session = createDefaultModelProviderSession();
		const result = completeWithLocalRules({
			prompt: "把访谈做成一条有观点的短视频",
		});

		expect(session).toEqual({
			connections: {},
			selectedProvider: "local-free",
		});
		expect(result.ok).toBe(true);
		expect(result.provider).toBe("local-free");
		expect(result.model).toBe("visioncut-rules-v1");
		expect(result.text).toContain("当前方案只基于文字意图");
		expect(result.usage).toBeUndefined();
	});

	test("stores BYOK connections only in the supplied session storage", () => {
		const storage = new MemorySessionStorage();
		const state = {
			connections: {
				openai: { apiKey: "session-only-key", model: "gpt-5-mini" },
			},
			selectedProvider: "openai" as const,
		};

		expect(saveModelProviderSession({ state, storage })).toBe(true);
		expect([...storage.values.keys()]).toEqual([MODEL_PROVIDER_SESSION_KEY]);
		expect(loadModelProviderSession({ storage })).toEqual(state);
		expect(clearModelProviderSession({ storage })).toBe(true);
		expect(storage.values.size).toBe(0);
	});

	test("falls back to local-free when session data is malformed", () => {
		const storage = new MemorySessionStorage();
		storage.setItem(
			MODEL_PROVIDER_SESSION_KEY,
			JSON.stringify({
				connections: { openai: { apiKey: "short", model: "../../bad" } },
				selectedProvider: "openai",
			}),
		);

		expect(loadModelProviderSession({ storage })).toEqual(
			createDefaultModelProviderSession(),
		);
	});

	test("rejects arbitrary URLs, unsafe model paths, and local-free proxy calls", () => {
		const base = {
			apiKey: "test-api-key-123",
			model: "gpt-5-mini",
			prompt: "Hello",
			provider: "openai",
		};
		expect(
			aiCompletionRequestSchema.safeParse({
				...base,
				url: "http://169.254.169.254/latest/meta-data",
			}).success,
		).toBe(false);
		expect(
			aiCompletionRequestSchema.safeParse({
				...base,
				model: "../../internal",
			}).success,
		).toBe(false);
		expect(
			aiCompletionRequestSchema.safeParse({
				...base,
				provider: "local-free",
			}).success,
		).toBe(false);
		expect(
			aiCompletionRequestSchema.safeParse({
				...base,
				apiKey: "key with spaces",
			}).success,
		).toBe(false);
	});

	test("builds only fixed official provider requests", () => {
		const openai = buildFixedProviderRequest({
			request: createCompletionRequest(),
		});
		const anthropic = buildFixedProviderRequest({
			request: createCompletionRequest({
				model: "claude-sonnet-4-6",
				provider: "anthropic",
			}),
		});
		const gemini = buildFixedProviderRequest({
			request: createCompletionRequest({
				model: "gemini-3.5-flash",
				provider: "gemini",
			}),
		});

		expect(openai.url).toBe("https://api.openai.com/v1/responses");
		expect(anthropic.url).toBe("https://api.anthropic.com/v1/messages");
		expect(gemini.url).toBe(
			"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
		);
		for (const request of [openai, anthropic, gemini]) {
			expect(request.init.redirect).toBe("error");
			expect(request.init.cache).toBe("no-store");
			expect(request.init.method).toBe("POST");
		}
		expect(gemini.url).not.toContain("test-api-key-123");
		expect(JSON.parse(String(openai.init.body))).toMatchObject({
			model: "gpt-5-mini",
			store: false,
		});
	});

	test("normalizes text and usage across all supported providers", () => {
		expect(
			normalizeProviderPayload({
				model: "gpt-5-mini",
				payload: {
					output: [
						{
							content: [{ text: "OPENAI_OK", type: "output_text" }],
							type: "message",
						},
					],
					usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 },
				},
				provider: "openai",
			}),
		).toMatchObject({ text: "OPENAI_OK", usage: { totalTokens: 6 } });
		expect(
			normalizeProviderPayload({
				model: "claude-sonnet-4-6",
				payload: {
					content: [{ text: "CLAUDE_OK", type: "text" }],
					usage: { input_tokens: 3, output_tokens: 1 },
				},
				provider: "anthropic",
			}),
		).toMatchObject({ text: "CLAUDE_OK", usage: { outputTokens: 1 } });
		expect(
			normalizeProviderPayload({
				model: "gemini-3.5-flash",
				payload: {
					candidates: [
						{ content: { parts: [{ text: "GEMINI_OK" }], role: "model" } },
					],
					usageMetadata: { promptTokenCount: 2, totalTokenCount: 3 },
				},
				provider: "gemini",
			}),
		).toMatchObject({ text: "GEMINI_OK", usage: { inputTokens: 2 } });
	});
});

describe("VisionCut BYOK completion route", () => {
	test("proxies a valid request without returning or caching the key", async () => {
		const calls: Array<{ init: RequestInit | undefined; url: string }> = [];
		// eslint-disable-next-line opencut/prefer-object-params -- A fetch test double must match the platform signature.
		const fetchImpl: ModelProviderFetch = async (input, init) => {
			calls.push({ init, url: String(input) });
			return Response.json({
				output: [
					{
						content: [{ text: "VISIONCUT_OK", type: "output_text" }],
						type: "message",
					},
				],
				usage: { input_tokens: 7, output_tokens: 2, total_tokens: 9 },
			});
		};
		const response = await handleAiCompletion({
			fetchImpl,
			request: createRouteRequest({ body: createCompletionRequest() }),
		});
		const payloadText = await response.text();
		const payload: unknown = JSON.parse(payloadText);

		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toContain("no-store");
		expect(response.headers.get("Pragma")).toBe("no-cache");
		expect(payload).toMatchObject({
			model: "gpt-5-mini",
			ok: true,
			provider: "openai",
			text: "VISIONCUT_OK",
		});
		expect(payloadText).not.toContain("test-api-key-123");
		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe("https://api.openai.com/v1/responses");
		expect(calls[0]?.init?.redirect).toBe("error");
		expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
	});

	test("rejects an injected upstream URL before fetch", async () => {
		let fetchCalled = false;
		const fetchImpl: ModelProviderFetch = async () => {
			fetchCalled = true;
			return Response.json({});
		};
		const response = await handleAiCompletion({
			fetchImpl,
			request: createRouteRequest({
				body: {
					...createCompletionRequest(),
					url: "http://127.0.0.1/private",
				},
			}),
		});

		expect(response.status).toBe(400);
		expect(fetchCalled).toBe(false);
		expect(await response.json()).toMatchObject({
			error: { code: "invalid_request", retryable: false },
			ok: false,
		});
	});

	test("enforces request and upstream response size limits", async () => {
		let fetchCalled = false;
		const fetchImpl: ModelProviderFetch = async () => {
			fetchCalled = true;
			return new Response("{}", {
				headers: {
					"Content-Length": String(MAX_AI_RESPONSE_BYTES + 1),
					"Content-Type": "application/json",
				},
			});
		};
		const requestTooLarge = await handleAiCompletion({
			fetchImpl,
			request: createRouteRequest({
				body: createCompletionRequest(),
				contentLength: MAX_AI_REQUEST_BYTES + 1,
			}),
		});
		expect(requestTooLarge.status).toBe(413);
		expect(fetchCalled).toBe(false);

		const responseTooLarge = await handleAiCompletion({
			fetchImpl,
			request: createRouteRequest({ body: createCompletionRequest() }),
		});
		expect(responseTooLarge.status).toBe(502);
		expect(await responseTooLarge.json()).toMatchObject({
			error: { code: "upstream_response_too_large" },
			ok: false,
		});
	});

	test("normalizes provider errors without echoing the upstream body", async () => {
		const upstreamSecret = "upstream echoed secret test-api-key-123";
		const fetchImpl: ModelProviderFetch = async () =>
			Response.json({ error: { message: upstreamSecret } }, { status: 401 });
		const response = await handleAiCompletion({
			fetchImpl,
			request: createRouteRequest({ body: createCompletionRequest() }),
		});
		const body = await response.text();

		expect(response.status).toBe(401);
		expect(body).not.toContain(upstreamSecret);
		expect(body).not.toContain("test-api-key-123");
		expect(JSON.parse(body)).toMatchObject({
			error: {
				code: "invalid_api_key",
				message: "API Key 无效或已失效",
				retryable: false,
			},
			ok: false,
		});
	});

	test("normalizes an aborted upstream request as a retryable timeout", async () => {
		const fetchImpl: ModelProviderFetch = async () => {
			throw new DOMException("The operation timed out", "TimeoutError");
		};
		const response = await handleAiCompletion({
			fetchImpl,
			request: createRouteRequest({ body: createCompletionRequest() }),
		});

		expect(response.status).toBe(504);
		expect(await response.json()).toMatchObject({
			error: {
				code: "upstream_timeout",
				provider: "openai",
				retryable: true,
			},
			ok: false,
		});
	});
});
