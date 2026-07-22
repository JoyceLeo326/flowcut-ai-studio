import {
	aiCompletionRequestSchema,
	buildFixedProviderRequest,
	normalizeProviderPayload,
	type AiCompletionErrorCode,
	type AiCompletionFailure,
	type AiCompletionRequest,
	type RemoteModelProvider,
} from "@/ai-studio/model-provider";
import { checkRateLimit } from "@/auth/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export const MAX_AI_REQUEST_BYTES = 64 * 1024;
export const MAX_AI_RESPONSE_BYTES = 1024 * 1024;
export const AI_UPSTREAM_TIMEOUT_MS = 20_000;

export type ModelProviderFetch = typeof fetch;

const PRIVATE_RESPONSE_HEADERS = {
	"Cache-Control": "private, no-store, max-age=0",
	Pragma: "no-cache",
	"Referrer-Policy": "no-referrer",
	"X-Content-Type-Options": "nosniff",
};

class ModelProxyError extends Error {
	readonly code: AiCompletionErrorCode;
	readonly provider?: RemoteModelProvider;
	readonly retryable: boolean;
	readonly status: number;

	constructor({
		code,
		message,
		provider,
		retryable,
		status,
	}: {
		code: AiCompletionErrorCode;
		message: string;
		provider?: RemoteModelProvider;
		retryable: boolean;
		status: number;
	}) {
		super(message);
		this.name = "ModelProxyError";
		this.code = code;
		this.provider = provider;
		this.retryable = retryable;
		this.status = status;
	}
}

function errorResponse({ error }: { error: ModelProxyError }): Response {
	const payload: AiCompletionFailure = {
		error: {
			code: error.code,
			message: error.message,
			provider: error.provider,
			retryable: error.retryable,
		},
		ok: false,
	};
	return Response.json(payload, {
		headers: PRIVATE_RESPONSE_HEADERS,
		status: error.status,
	});
}

function parseContentLength({
	response,
}: {
	response: Response;
}): number | null {
	const value = response.headers.get("content-length");
	if (!value) return null;
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function readBoundedBytes({
	body,
	contentLength,
	limit,
	onTooLarge,
}: {
	body: ReadableStream<Uint8Array> | null;
	contentLength: number | null;
	limit: number;
	onTooLarge: () => ModelProxyError;
}): Promise<Uint8Array> {
	if (contentLength !== null && contentLength > limit) throw onTooLarge();
	if (!body) return new Uint8Array();

	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;
			total += value.byteLength;
			if (total > limit) throw onTooLarge();
			chunks.push(value);
		}
	} catch (error) {
		await reader.cancel().catch(() => undefined);
		throw error;
	} finally {
		reader.releaseLock();
	}

	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}

async function readRequestPayload({
	request,
}: {
	request: Request;
}): Promise<unknown> {
	const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
	if (!contentType.startsWith("application/json")) {
		throw new ModelProxyError({
			code: "invalid_request",
			message: "请求必须使用 JSON 格式",
			retryable: false,
			status: 415,
		});
	}

	const contentLengthHeader = request.headers.get("content-length");
	const contentLength = contentLengthHeader
		? Number(contentLengthHeader)
		: null;
	const bytes = await readBoundedBytes({
		body: request.body,
		contentLength:
			contentLength !== null && Number.isSafeInteger(contentLength)
				? contentLength
				: null,
		limit: MAX_AI_REQUEST_BYTES,
		onTooLarge: () =>
			new ModelProxyError({
				code: "request_too_large",
				message: "请求内容过大",
				retryable: false,
				status: 413,
			}),
	});
	if (bytes.byteLength === 0) {
		throw new ModelProxyError({
			code: "invalid_request",
			message: "请求内容为空",
			retryable: false,
			status: 400,
		});
	}

	try {
		return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
	} catch {
		throw new ModelProxyError({
			code: "invalid_request",
			message: "JSON 内容无效",
			retryable: false,
			status: 400,
		});
	}
}

async function readUpstreamPayload({
	provider,
	response,
}: {
	provider: RemoteModelProvider;
	response: Response;
}): Promise<unknown> {
	const bytes = await readBoundedBytes({
		body: response.body,
		contentLength: parseContentLength({ response }),
		limit: MAX_AI_RESPONSE_BYTES,
		onTooLarge: () =>
			new ModelProxyError({
				code: "upstream_response_too_large",
				message: "模型返回内容超过安全上限",
				provider,
				retryable: false,
				status: 502,
			}),
	});
	try {
		return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
	} catch {
		throw new ModelProxyError({
			code: "invalid_upstream_response",
			message: "模型返回了无法识别的响应",
			provider,
			retryable: true,
			status: 502,
		});
	}
}

function mapUpstreamStatus({
	provider,
	status,
}: {
	provider: RemoteModelProvider;
	status: number;
}): ModelProxyError {
	if (status === 401) {
		return new ModelProxyError({
			code: "invalid_api_key",
			message: "API Key 无效或已失效",
			provider,
			retryable: false,
			status: 401,
		});
	}
	if (status === 403) {
		return new ModelProxyError({
			code: "provider_forbidden",
			message: "该 API Key 没有访问此模型的权限",
			provider,
			retryable: false,
			status: 403,
		});
	}
	if (status === 404) {
		return new ModelProxyError({
			code: "model_not_found",
			message: "没有找到该模型，请核对模型名称和账号权限",
			provider,
			retryable: false,
			status: 404,
		});
	}
	if (status === 408 || status === 504) {
		return new ModelProxyError({
			code: "upstream_timeout",
			message: "模型响应超时，请稍后重试",
			provider,
			retryable: true,
			status: 504,
		});
	}
	if (status === 429) {
		return new ModelProxyError({
			code: "rate_limited",
			message: "模型平台暂时限流或额度不足，请检查账号用量",
			provider,
			retryable: true,
			status: 429,
		});
	}
	return new ModelProxyError({
		code: "upstream_unavailable",
		message: status >= 500 ? "模型平台暂时不可用" : "模型平台拒绝了当前请求",
		provider,
		retryable: status >= 500,
		status: status >= 500 ? 502 : 400,
	});
}

function isTimeoutError({ error }: { error: unknown }): boolean {
	return (
		error instanceof DOMException &&
		(error.name === "TimeoutError" || error.name === "AbortError")
	);
}

async function proxyCompletion({
	fetchImpl,
	request,
}: {
	fetchImpl: ModelProviderFetch;
	request: AiCompletionRequest;
}): Promise<Response> {
	const upstreamRequest = buildFixedProviderRequest({ request });
	let upstreamResponse: Response;
	try {
		upstreamResponse = await fetchImpl(upstreamRequest.url, {
			...upstreamRequest.init,
			signal: AbortSignal.timeout(AI_UPSTREAM_TIMEOUT_MS),
		});
	} catch (error) {
		throw new ModelProxyError({
			code: isTimeoutError({ error })
				? "upstream_timeout"
				: "upstream_unavailable",
			message: isTimeoutError({ error })
				? "模型响应超时，请稍后重试"
				: "无法连接模型平台，请稍后重试",
			provider: request.provider,
			retryable: true,
			status: isTimeoutError({ error }) ? 504 : 502,
		});
	}

	if (!upstreamResponse.ok) {
		await upstreamResponse.body?.cancel().catch(() => undefined);
		throw mapUpstreamStatus({
			provider: request.provider,
			status: upstreamResponse.status,
		});
	}

	const upstreamPayload = await readUpstreamPayload({
		provider: request.provider,
		response: upstreamResponse,
	});
	const completion = normalizeProviderPayload({
		model: request.model,
		payload: upstreamPayload,
		provider: request.provider,
	});
	if (!completion) {
		throw new ModelProxyError({
			code: "invalid_upstream_response",
			message: "模型没有返回可用文本",
			provider: request.provider,
			retryable: true,
			status: 502,
		});
	}

	return Response.json(completion, {
		headers: PRIVATE_RESPONSE_HEADERS,
		status: 200,
	});
}

export async function handleAiCompletion({
	fetchImpl = fetch,
	request,
}: {
	fetchImpl?: ModelProviderFetch;
	request: Request;
}): Promise<Response> {
	try {
		const { limited } = await checkRateLimit({ request });
		if (limited) {
			return Response.json(
				{
					error: {
						code: "rate_limited",
						message: "请求过于频繁，请稍后重试",
						retryable: true,
					},
					ok: false,
				} satisfies AiCompletionFailure,
				{
					headers: { ...PRIVATE_RESPONSE_HEADERS, "Retry-After": "60" },
					status: 429,
				},
			);
		}

		const payload = await readRequestPayload({ request });
		const parsed = aiCompletionRequestSchema.safeParse(payload);
		if (!parsed.success) {
			throw new ModelProxyError({
				code: "invalid_request",
				message: "模型请求参数无效",
				retryable: false,
				status: 400,
			});
		}
		return await proxyCompletion({ fetchImpl, request: parsed.data });
	} catch (error) {
		const normalizedError =
			error instanceof ModelProxyError
				? error
				: new ModelProxyError({
						code: "upstream_unavailable",
						message: "模型连接发生未知错误",
						retryable: true,
						status: 502,
					});
		return errorResponse({ error: normalizedError });
	}
}

export async function POST(request: Request): Promise<Response> {
	return handleAiCompletion({ request });
}
