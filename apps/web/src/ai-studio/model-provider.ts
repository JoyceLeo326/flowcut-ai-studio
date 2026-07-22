import { z } from "zod";

export const LOCAL_FREE_PROVIDER_ID = "local-free" as const;
export const LOCAL_FREE_MODEL_ID = "visioncut-rules-v1" as const;
export const REMOTE_MODEL_PROVIDER_IDS = [
	"openai",
	"anthropic",
	"gemini",
] as const;
export const MODEL_PROVIDER_IDS = [
	LOCAL_FREE_PROVIDER_ID,
	...REMOTE_MODEL_PROVIDER_IDS,
] as const;

export type RemoteModelProvider = (typeof REMOTE_MODEL_PROVIDER_IDS)[number];
export type ModelProviderId = (typeof MODEL_PROVIDER_IDS)[number];

export interface ModelProviderDefinition {
	id: ModelProviderId;
	label: string;
	shortLabel: string;
	description: string;
	defaultModel: string;
	modelSuggestions: readonly string[];
	keyPlaceholder?: string;
}

export const MODEL_PROVIDER_CATALOG: readonly ModelProviderDefinition[] = [
	{
		id: LOCAL_FREE_PROVIDER_ID,
		label: "VisionCut 本地规则",
		shortLabel: "本地免费",
		description: "在当前浏览器内完成意图分类与剪辑蓝图，不请求模型 API。",
		defaultModel: LOCAL_FREE_MODEL_ID,
		modelSuggestions: [LOCAL_FREE_MODEL_ID],
	},
	{
		id: "openai",
		label: "OpenAI",
		shortLabel: "OpenAI",
		description: "使用你自己的 OpenAI API Key 与可访问模型。",
		defaultModel: "gpt-5-mini",
		modelSuggestions: ["gpt-5-mini", "gpt-5", "gpt-4.1-mini"],
		keyPlaceholder: "sk-...",
	},
	{
		id: "anthropic",
		label: "Anthropic",
		shortLabel: "Claude",
		description: "使用你自己的 Anthropic API Key 与 Claude 模型。",
		defaultModel: "claude-sonnet-4-6",
		modelSuggestions: [
			"claude-sonnet-4-6",
			"claude-opus-4-6",
			"claude-haiku-4-5",
		],
		keyPlaceholder: "sk-ant-...",
	},
	{
		id: "gemini",
		label: "Google Gemini",
		shortLabel: "Gemini",
		description: "使用你自己的 Gemini API Key 与可访问模型。",
		defaultModel: "gemini-3.5-flash",
		modelSuggestions: [
			"gemini-3.5-flash",
			"gemini-3.5-pro",
			"gemini-2.5-flash",
		],
		keyPlaceholder: "AIza...",
	},
];

export const MODEL_PROVIDER_SESSION_KEY = "visioncut:model-provider-session:v1";

export const apiKeySchema = z
	.string()
	.trim()
	.min(8, "API Key 长度不足")
	.max(512, "API Key 过长")
	.refine((value) => !/\s/.test(value), "API Key 不能包含空白字符");

export const modelIdSchema = z
	.string()
	.trim()
	.min(1, "请输入模型名称")
	.max(128, "模型名称过长")
	.regex(
		/^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
		"模型名称只能包含字母、数字、点、下划线、冒号和连字符",
	);

export const aiCompletionRequestSchema = z
	.object({
		provider: z.enum(REMOTE_MODEL_PROVIDER_IDS),
		apiKey: apiKeySchema,
		model: modelIdSchema,
		prompt: z.string().trim().min(1, "请输入内容").max(24_000),
		systemPrompt: z.string().trim().max(8_000).optional(),
		maxOutputTokens: z.number().int().min(1).max(4_096).default(768),
		purpose: z.enum(["completion", "connection-test"]).default("completion"),
	})
	.strict();

export type AiCompletionRequest = z.infer<typeof aiCompletionRequestSchema>;

export interface NormalizedTokenUsage {
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
}

export interface AiCompletionSuccess {
	ok: true;
	provider: ModelProviderId;
	model: string;
	text: string;
	usage?: NormalizedTokenUsage;
}

export type AiCompletionErrorCode =
	| "invalid_request"
	| "invalid_api_key"
	| "provider_forbidden"
	| "model_not_found"
	| "rate_limited"
	| "request_too_large"
	| "upstream_timeout"
	| "upstream_unavailable"
	| "upstream_response_too_large"
	| "invalid_upstream_response";

export interface AiCompletionFailure {
	ok: false;
	error: {
		code: AiCompletionErrorCode;
		message: string;
		provider?: RemoteModelProvider;
		retryable: boolean;
	};
}

export type AiCompletionResponse = AiCompletionSuccess | AiCompletionFailure;

export interface SessionProviderConnection {
	apiKey: string;
	model: string;
}

export interface ModelProviderSessionState {
	selectedProvider: ModelProviderId;
	connections: Partial<Record<RemoteModelProvider, SessionProviderConnection>>;
}

export interface SessionStorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

const sessionConnectionSchema = z
	.object({
		apiKey: apiKeySchema,
		model: modelIdSchema,
	})
	.strict();

const modelProviderSessionSchema = z
	.object({
		selectedProvider: z.enum(MODEL_PROVIDER_IDS),
		connections: z
			.object({
				openai: sessionConnectionSchema.optional(),
				anthropic: sessionConnectionSchema.optional(),
				gemini: sessionConnectionSchema.optional(),
			})
			.strict(),
	})
	.strict();

export function createDefaultModelProviderSession(): ModelProviderSessionState {
	return { connections: {}, selectedProvider: LOCAL_FREE_PROVIDER_ID };
}

function getBrowserSessionStorage(): SessionStorageLike | null {
	if (typeof window === "undefined") return null;
	try {
		return window.sessionStorage;
	} catch {
		return null;
	}
}

export function loadModelProviderSession({
	storage = getBrowserSessionStorage(),
}: {
	storage?: SessionStorageLike | null;
} = {}): ModelProviderSessionState {
	if (!storage) return createDefaultModelProviderSession();

	try {
		const value = storage.getItem(MODEL_PROVIDER_SESSION_KEY);
		if (!value) return createDefaultModelProviderSession();
		const parsed: unknown = JSON.parse(value);
		const result = modelProviderSessionSchema.safeParse(parsed);
		return result.success ? result.data : createDefaultModelProviderSession();
	} catch {
		return createDefaultModelProviderSession();
	}
}

export function saveModelProviderSession({
	state,
	storage = getBrowserSessionStorage(),
}: {
	state: ModelProviderSessionState;
	storage?: SessionStorageLike | null;
}): boolean {
	if (!storage) return false;
	const parsed = modelProviderSessionSchema.safeParse(state);
	if (!parsed.success) return false;

	try {
		storage.setItem(MODEL_PROVIDER_SESSION_KEY, JSON.stringify(parsed.data));
		return true;
	} catch {
		return false;
	}
}

export function clearModelProviderSession({
	storage = getBrowserSessionStorage(),
}: {
	storage?: SessionStorageLike | null;
} = {}): boolean {
	if (!storage) return false;
	try {
		storage.removeItem(MODEL_PROVIDER_SESSION_KEY);
		return true;
	} catch {
		return false;
	}
}

export function getModelProviderDefinition({
	provider,
}: {
	provider: ModelProviderId;
}): ModelProviderDefinition {
	return (
		MODEL_PROVIDER_CATALOG.find((item) => item.id === provider) ??
		MODEL_PROVIDER_CATALOG[0]
	);
}

export function isRemoteModelProvider(
	provider: ModelProviderId,
): provider is RemoteModelProvider {
	return provider !== LOCAL_FREE_PROVIDER_ID;
}

interface LocalRuleProfile {
	match: readonly string[];
	goal: string;
	structure: string;
	craft: string;
}

const LOCAL_RULE_PROFILES: readonly LocalRuleProfile[] = [
	{
		match: ["口播", "访谈", "播客", "采访", "课程", "教程"],
		goal: "优先保留观点与表达完整性",
		structure: "结论前置 → 关键论据 → 例子 → 明确收束",
		craft: "标记重复表达、长停顿与口头填充词，执行前逐项复核",
	},
	{
		match: ["短视频", "竖屏", "抖音", "小红书", "reels", "shorts"],
		goal: "在前三秒建立清楚的信息承诺",
		structure: "Hook → 信息增量 → 证据或反差 → 单一行动点",
		craft: "采用紧凑镜头节奏，并为字幕与竖屏主体保留安全区",
	},
	{
		match: ["广告", "产品", "品牌", "电商", "商品", "转化"],
		goal: "把用户问题、产品价值与可信证据连接起来",
		structure: "场景痛点 → 产品出现 → 关键利益 → 证据 → 品牌收尾",
		craft: "先确认素材中真实存在的卖点，禁止补写未经证实的承诺",
	},
	{
		match: ["旅行", "纪录片", "活动", "婚礼", "故事", "vlog"],
		goal: "建立地点、人物和情绪变化",
		structure: "进入情境 → 发现 → 转折或高点 → 余韵",
		craft: "使用环境声与动作匹配连接段落，不把生成画面伪装成纪实素材",
	},
];

export function completeWithLocalRules({
	prompt,
}: {
	prompt: string;
}): AiCompletionSuccess {
	const normalizedPrompt = prompt.trim().toLowerCase();
	const profile =
		LOCAL_RULE_PROFILES.find(({ match }) =>
			match.some((keyword) => normalizedPrompt.includes(keyword.toLowerCase())),
		) ??
		({
			goal: "先明确成片目标，再组织素材与节奏",
			structure: "开场意图 → 主要信息 → 变化或证据 → 清楚收束",
			craft: "先生成可审阅蓝图，只对用户批准的步骤执行本地修改",
		} satisfies Omit<LocalRuleProfile, "match">);

	return {
		ok: true,
		provider: LOCAL_FREE_PROVIDER_ID,
		model: LOCAL_FREE_MODEL_ID,
		text: [
			"本地导演蓝图",
			`目标：${profile.goal}`,
			`结构：${profile.structure}`,
			`执行：${profile.craft}`,
			"边界：当前方案只基于文字意图，尚未分析对白、人物、场景或情绪。",
		].join("\n"),
	};
}

export interface FixedProviderRequest {
	url: string;
	init: RequestInit;
}

export function buildFixedProviderRequest({
	request,
}: {
	request: AiCompletionRequest;
}): FixedProviderRequest {
	const commonInit: RequestInit = {
		cache: "no-store",
		method: "POST",
		redirect: "error",
	};

	if (request.provider === "openai") {
		return {
			url: "https://api.openai.com/v1/responses",
			init: {
				...commonInit,
				body: JSON.stringify({
					input: request.prompt,
					instructions: request.systemPrompt,
					max_output_tokens: request.maxOutputTokens,
					model: request.model,
					store: false,
				}),
				headers: {
					Accept: "application/json",
					Authorization: `Bearer ${request.apiKey}`,
					"Content-Type": "application/json",
				},
			},
		};
	}

	if (request.provider === "anthropic") {
		return {
			url: "https://api.anthropic.com/v1/messages",
			init: {
				...commonInit,
				body: JSON.stringify({
					max_tokens: request.maxOutputTokens,
					messages: [{ content: request.prompt, role: "user" }],
					model: request.model,
					system: request.systemPrompt,
				}),
				headers: {
					Accept: "application/json",
					"anthropic-version": "2023-06-01",
					"Content-Type": "application/json",
					"x-api-key": request.apiKey,
				},
			},
		};
	}

	return {
		url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent`,
		init: {
			...commonInit,
			body: JSON.stringify({
				contents: [{ parts: [{ text: request.prompt }], role: "user" }],
				generationConfig: { maxOutputTokens: request.maxOutputTokens },
				systemInstruction: request.systemPrompt
					? { parts: [{ text: request.systemPrompt }] }
					: undefined,
			}),
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
				"x-goog-api-key": request.apiKey,
			},
		},
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNonNegativeNumber({
	record,
	key,
}: {
	record: Record<string, unknown>;
	key: string;
}): number | undefined {
	const value = record[key];
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: undefined;
}

function compactUsage({
	inputTokens,
	outputTokens,
	totalTokens,
}: NormalizedTokenUsage): NormalizedTokenUsage | undefined {
	if (
		inputTokens === undefined &&
		outputTokens === undefined &&
		totalTokens === undefined
	) {
		return undefined;
	}
	return { inputTokens, outputTokens, totalTokens };
}

function parseOpenAiPayload(payload: unknown): {
	text: string;
	usage?: NormalizedTokenUsage;
} | null {
	if (!isRecord(payload)) return null;
	const textParts: string[] = [];
	if (typeof payload.output_text === "string") {
		textParts.push(payload.output_text);
	}
	if (Array.isArray(payload.output)) {
		for (const output of payload.output) {
			if (!isRecord(output) || !Array.isArray(output.content)) continue;
			for (const content of output.content) {
				if (
					isRecord(content) &&
					content.type === "output_text" &&
					typeof content.text === "string"
				) {
					textParts.push(content.text);
				}
			}
		}
	}
	const text = [...new Set(textParts.map((part) => part.trim()))]
		.filter(Boolean)
		.join("\n");
	if (!text) return null;

	const usage = isRecord(payload.usage)
		? compactUsage({
				inputTokens: readNonNegativeNumber({
					key: "input_tokens",
					record: payload.usage,
				}),
				outputTokens: readNonNegativeNumber({
					key: "output_tokens",
					record: payload.usage,
				}),
				totalTokens: readNonNegativeNumber({
					key: "total_tokens",
					record: payload.usage,
				}),
			})
		: undefined;
	return { text, usage };
}

function parseAnthropicPayload(payload: unknown): {
	text: string;
	usage?: NormalizedTokenUsage;
} | null {
	if (!isRecord(payload) || !Array.isArray(payload.content)) return null;
	const text = payload.content
		.filter(
			(item): item is Record<string, unknown> =>
				isRecord(item) && item.type === "text" && typeof item.text === "string",
		)
		.map((item) => String(item.text).trim())
		.filter(Boolean)
		.join("\n");
	if (!text) return null;
	const usage = isRecord(payload.usage)
		? compactUsage({
				inputTokens: readNonNegativeNumber({
					key: "input_tokens",
					record: payload.usage,
				}),
				outputTokens: readNonNegativeNumber({
					key: "output_tokens",
					record: payload.usage,
				}),
			})
		: undefined;
	return { text, usage };
}

function parseGeminiPayload(payload: unknown): {
	text: string;
	usage?: NormalizedTokenUsage;
} | null {
	if (!isRecord(payload) || !Array.isArray(payload.candidates)) return null;
	const textParts: string[] = [];
	for (const candidate of payload.candidates) {
		if (!isRecord(candidate) || !isRecord(candidate.content)) continue;
		if (!Array.isArray(candidate.content.parts)) continue;
		for (const part of candidate.content.parts) {
			if (isRecord(part) && typeof part.text === "string") {
				textParts.push(part.text.trim());
			}
		}
	}
	const text = textParts.filter(Boolean).join("\n");
	if (!text) return null;
	const usage = isRecord(payload.usageMetadata)
		? compactUsage({
				inputTokens: readNonNegativeNumber({
					key: "promptTokenCount",
					record: payload.usageMetadata,
				}),
				outputTokens: readNonNegativeNumber({
					key: "candidatesTokenCount",
					record: payload.usageMetadata,
				}),
				totalTokens: readNonNegativeNumber({
					key: "totalTokenCount",
					record: payload.usageMetadata,
				}),
			})
		: undefined;
	return { text, usage };
}

export function normalizeProviderPayload({
	model,
	payload,
	provider,
}: {
	model: string;
	payload: unknown;
	provider: RemoteModelProvider;
}): AiCompletionSuccess | null {
	const parsed =
		provider === "openai"
			? parseOpenAiPayload(payload)
			: provider === "anthropic"
				? parseAnthropicPayload(payload)
				: parseGeminiPayload(payload);
	if (!parsed) return null;
	return {
		model,
		ok: true,
		provider,
		text: parsed.text,
		usage: parsed.usage,
	};
}
