"use client";

import {
	AlertCircle,
	CheckCircle2,
	Cloud,
	Cpu,
	HardDrive,
	KeyRound,
	Loader2,
	LockKeyhole,
	PlugZap,
	ShieldCheck,
	Trash2,
	WalletCards,
	type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
	LOCAL_FREE_PROVIDER_ID,
	MODEL_PROVIDER_CATALOG,
	aiCompletionRequestSchema,
	clearModelProviderSession,
	completeWithLocalRules,
	createDefaultModelProviderSession,
	getModelProviderDefinition,
	isRemoteModelProvider,
	loadModelProviderSession,
	saveModelProviderSession,
	type ModelProviderId,
	type ModelProviderSessionState,
	type RemoteModelProvider,
	type SessionProviderConnection,
} from "@/ai-studio/model-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/utils/ui";

type ConnectionState = "idle" | "testing" | "success" | "error";

interface ConnectionNotice {
	state: ConnectionState;
	message: string;
}

export interface ModelSelectionSummary {
	provider: ModelProviderId;
	model: string;
	connected: boolean;
	local: boolean;
}

interface VisionCutModelCenterProps {
	className?: string;
	onSelectionChange?: (selection: ModelSelectionSummary) => void;
}

const PROVIDER_ICONS: Record<ModelProviderId, LucideIcon> = {
	"local-free": HardDrive,
	openai: Cloud,
	anthropic: Cpu,
	gemini: PlugZap,
};

function createDraftConnections({
	session,
}: {
	session: ModelProviderSessionState;
}): Record<RemoteModelProvider, SessionProviderConnection> {
	return {
		anthropic: session.connections.anthropic ?? {
			apiKey: "",
			model: getModelProviderDefinition({ provider: "anthropic" }).defaultModel,
		},
		gemini: session.connections.gemini ?? {
			apiKey: "",
			model: getModelProviderDefinition({ provider: "gemini" }).defaultModel,
		},
		openai: session.connections.openai ?? {
			apiKey: "",
			model: getModelProviderDefinition({ provider: "openai" }).defaultModel,
		},
	};
}

type ParsedCompletionResponse = { ok: true } | { message: string; ok: false };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readCompletionResponse(
	payload: unknown,
): ParsedCompletionResponse | null {
	if (!isRecord(payload)) return null;
	if (payload.ok === true && typeof payload.text === "string") {
		return { ok: true };
	}
	if (payload.ok !== false || !isRecord(payload.error)) return null;
	return typeof payload.error.message === "string"
		? { message: payload.error.message, ok: false }
		: null;
}

function modelSummary({
	session,
}: {
	session: ModelProviderSessionState;
}): ModelSelectionSummary {
	const provider = session.selectedProvider;
	if (!isRemoteModelProvider(provider)) {
		return {
			connected: true,
			local: true,
			model: getModelProviderDefinition({ provider }).defaultModel,
			provider,
		};
	}
	const connection = session.connections[provider];
	return {
		connected: Boolean(connection),
		local: false,
		model:
			connection?.model ??
			getModelProviderDefinition({ provider }).defaultModel,
		provider,
	};
}

export function VisionCutModelCenter({
	className,
	onSelectionChange,
}: VisionCutModelCenterProps) {
	const [session, setSession] = useState<ModelProviderSessionState>(() =>
		createDefaultModelProviderSession(),
	);
	const [drafts, setDrafts] = useState(() =>
		createDraftConnections({ session: createDefaultModelProviderSession() }),
	);
	const [showKey, setShowKey] = useState(false);
	const [notice, setNotice] = useState<ConnectionNotice>({
		message: "本地规则模式已就绪，不会产生模型费用。",
		state: "idle",
	});
	const [sessionStorageReady, setSessionStorageReady] = useState(false);
	const modelListId = useId();

	useEffect(() => {
		const timeoutId = window.setTimeout(() => {
			const loadedSession = loadModelProviderSession();
			setSession(loadedSession);
			setDrafts(createDraftConnections({ session: loadedSession }));
			setSessionStorageReady(true);
		}, 0);
		return () => window.clearTimeout(timeoutId);
	}, []);

	useEffect(() => {
		onSelectionChange?.(modelSummary({ session }));
	}, [onSelectionChange, session]);

	const selectedProvider = session.selectedProvider;
	const selectedDefinition = getModelProviderDefinition({
		provider: selectedProvider,
	});
	const selectedIsRemote = isRemoteModelProvider(selectedProvider);
	const selectedDraft = selectedIsRemote ? drafts[selectedProvider] : null;
	const savedConnection = selectedIsRemote
		? session.connections[selectedProvider]
		: undefined;
	const savedConnectionCount = Object.keys(session.connections).length;

	function persistSession({
		nextSession,
		successMessage,
	}: {
		nextSession: ModelProviderSessionState;
		successMessage?: string;
	}): boolean {
		setSession(nextSession);
		const saved = saveModelProviderSession({ state: nextSession });
		if (!saved) {
			setNotice({
				message: "浏览器阻止了会话存储。当前选择只会保留到页面刷新前。",
				state: "error",
			});
			return false;
		}
		if (successMessage) {
			setNotice({ message: successMessage, state: "success" });
		}
		return true;
	}

	function selectProvider({ provider }: { provider: ModelProviderId }) {
		setShowKey(false);
		const nextSession = { ...session, selectedProvider: provider };
		const saved = persistSession({ nextSession });
		if (!saved) return;
		setNotice(
			provider === LOCAL_FREE_PROVIDER_ID
				? {
						message: "本地规则模式已启用：零 API 请求，零模型平台费用。",
						state: "success",
					}
				: session.connections[provider]
					? {
							message: "已载入这个标签页保存的连接。",
							state: "idle",
						}
					: {
							message: "填写自己的 API Key 和模型后测试连接。",
							state: "idle",
						},
		);
	}

	function updateDraft({
		field,
		provider,
		value,
	}: {
		field: keyof SessionProviderConnection;
		provider: RemoteModelProvider;
		value: string;
	}) {
		setDrafts((current) => ({
			...current,
			[provider]: { ...current[provider], [field]: value },
		}));
		setNotice({ message: "尚未保存当前修改。", state: "idle" });
	}

	function validateSelectedDraft(): SessionProviderConnection | null {
		if (!selectedIsRemote || !selectedDraft) return null;
		const parsed = aiCompletionRequestSchema.safeParse({
			apiKey: selectedDraft.apiKey,
			maxOutputTokens: 32,
			model: selectedDraft.model,
			prompt: "VisionCut connection check",
			provider: selectedProvider,
			purpose: "connection-test",
		});
		if (!parsed.success) {
			setNotice({
				message:
					parsed.error.issues[0]?.message ?? "请检查 API Key 和模型名称。",
				state: "error",
			});
			return null;
		}
		return { apiKey: parsed.data.apiKey, model: parsed.data.model };
	}

	function saveSelectedConnection(): boolean {
		if (!selectedIsRemote) return true;
		const connection = validateSelectedDraft();
		if (!connection) return false;
		return persistSession({
			nextSession: {
				...session,
				connections: {
					...session.connections,
					[selectedProvider]: connection,
				},
			},
			successMessage: "连接已保存到当前浏览器标签页会话。",
		});
	}

	async function testSelectedConnection() {
		if (!selectedIsRemote || !selectedDraft) {
			const result = completeWithLocalRules({ prompt: "制作一条口播短视频" });
			setNotice({
				message:
					result.provider === LOCAL_FREE_PROVIDER_ID
						? "本地规则验证通过，全程未发起网络请求。"
						: "本地规则状态异常。",
				state: result.provider === LOCAL_FREE_PROVIDER_ID ? "success" : "error",
			});
			return;
		}

		const connection = validateSelectedDraft();
		if (!connection) return;
		setNotice({
			message: "正在向官方模型端点发起最小测试请求…",
			state: "testing",
		});

		try {
			const response = await fetch("/api/ai/complete", {
				body: JSON.stringify({
					...connection,
					maxOutputTokens: 32,
					prompt: "只回复 VISIONCUT_OK",
					provider: selectedProvider,
					purpose: "connection-test",
					systemPrompt: "这是连接测试。不要返回任何密钥或账号信息。",
				}),
				cache: "no-store",
				headers: { "Content-Type": "application/json" },
				method: "POST",
			});
			const payload: unknown = await response.json().catch(() => null);
			const result = readCompletionResponse(payload);
			if (!response.ok || !result || !result.ok) {
				setNotice({
					message:
						result && !result.ok
							? result.message
							: "连接测试失败，请检查 Key、模型或网络。",
					state: "error",
				});
				return;
			}

			const saved = persistSession({
				nextSession: {
					...session,
					connections: {
						...session.connections,
						[selectedProvider]: connection,
					},
				},
			});
			setNotice({
				message: saved
					? "连接成功，并已保存到当前标签页会话。"
					: "连接成功，但浏览器未允许保存会话。",
				state: saved ? "success" : "error",
			});
		} catch {
			setNotice({
				message: "连接测试未完成，请检查网络后重试。",
				state: "error",
			});
		}
	}

	function deleteSelectedKey() {
		if (!selectedIsRemote) return;
		const nextConnections = { ...session.connections };
		delete nextConnections[selectedProvider];
		setDrafts((current) => ({
			...current,
			[selectedProvider]: {
				apiKey: "",
				model: getModelProviderDefinition({ provider: selectedProvider })
					.defaultModel,
			},
		}));
		persistSession({
			nextSession: { ...session, connections: nextConnections },
			successMessage: "这个平台的 API Key 已从当前会话删除。",
		});
		setShowKey(false);
	}

	function clearAllKeys() {
		const cleared = clearModelProviderSession();
		const nextSession = createDefaultModelProviderSession();
		setSession(nextSession);
		setDrafts(createDraftConnections({ session: nextSession }));
		setShowKey(false);
		setNotice(
			cleared
				? {
						message: "所有 BYOK 密钥已删除，已恢复本地免费模式。",
						state: "success",
					}
				: {
						message: "浏览器未允许删除会话数据。请关闭此标签页以清除密钥。",
						state: "error",
					},
		);
	}

	const NoticeIcon =
		notice.state === "testing"
			? Loader2
			: notice.state === "success"
				? CheckCircle2
				: notice.state === "error"
					? AlertCircle
					: ShieldCheck;

	return (
		<div className={cn("min-w-0 space-y-4 pb-5", className)}>
			<header className="flex min-w-0 items-start gap-3 border-b pb-4">
				<span className="flex size-10 shrink-0 items-center justify-center rounded-[7px] border bg-foreground text-background">
					<KeyRound className="size-5" />
				</span>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<h2 className="text-[14px] font-semibold">模型中心</h2>
						<span className="inline-flex items-center gap-1 rounded-[5px] border px-2 py-1 text-[9px] text-emerald-700 dark:text-emerald-300">
							<ShieldCheck className="size-3" />
							免费默认
						</span>
					</div>
					<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
						不连接模型也能继续剪辑。需要更强推理时，再使用你自己的 API。
					</p>
				</div>
			</header>

			<section aria-labelledby="model-provider-heading">
				<div className="mb-2 flex items-center justify-between gap-2">
					<h3 id="model-provider-heading" className="text-[12px] font-semibold">
						运行方式
					</h3>
					<span className="text-[9px] text-muted-foreground">
						{selectedDefinition.shortLabel}
					</span>
				</div>
				<div
					className="grid grid-cols-2 gap-2 sm:grid-cols-4"
					role="radiogroup"
					aria-label="选择模型提供商"
				>
					{MODEL_PROVIDER_CATALOG.map((provider) => {
						const Icon = PROVIDER_ICONS[provider.id];
						const selected = selectedProvider === provider.id;
						const connected = isRemoteModelProvider(provider.id)
							? Boolean(session.connections[provider.id])
							: true;
						return (
							<button
								key={provider.id}
								type="button"
								role="radio"
								aria-checked={selected}
								disabled={notice.state === "testing"}
								onClick={() => selectProvider({ provider: provider.id })}
								className={cn(
									"relative flex min-h-16 min-w-0 flex-col items-start justify-between rounded-[7px] border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 disabled:cursor-not-allowed disabled:opacity-55",
									selected
										? "border-cyan-500/55 bg-cyan-500/8"
										: "hover:bg-accent/55",
								)}
							>
								<div className="flex w-full items-center justify-between gap-2">
									<Icon className="size-4 shrink-0" />
									<span
										className={cn(
											"size-1.5 shrink-0 rounded-full",
											connected ? "bg-emerald-500" : "bg-muted-foreground/35",
										)}
									/>
								</div>
								<span className="mt-2 break-words text-[10px] font-medium leading-tight">
									{provider.shortLabel}
								</span>
							</button>
						);
					})}
				</div>
			</section>

			{!selectedIsRemote ? (
				<section className="rounded-[8px] border border-emerald-500/30 bg-emerald-500/5 p-3.5">
					<div className="flex items-start gap-2.5">
						<HardDrive className="mt-0.5 size-4 shrink-0 text-emerald-600" />
						<div className="min-w-0 flex-1">
							<div className="flex flex-wrap items-center justify-between gap-2">
								<h3 className="text-[11px] font-semibold">本地规则已启用</h3>
								<span className="text-[9px] font-medium text-emerald-700 dark:text-emerald-300">
									0 API · 0 费用
								</span>
							</div>
							<p className="mt-1.5 text-[9px] leading-relaxed text-muted-foreground">
								负责意图分类、工作流推荐和可审阅蓝图。它不会声称已经识别对白、人物或场景。
							</p>
						</div>
					</div>
					<Button
						variant="outline"
						className="mt-3 h-11 w-full sm:h-10"
						onClick={() => void testSelectedConnection()}
					>
						<CheckCircle2 className="size-4" />
						验证本地路径
					</Button>
				</section>
			) : (
				<section className="space-y-3 border-y py-3.5">
					<div className="flex min-w-0 items-start justify-between gap-3">
						<div className="min-w-0">
							<h3 className="text-[12px] font-semibold">
								{selectedDefinition.label}
							</h3>
							<p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
								{selectedDefinition.description}
							</p>
						</div>
						{savedConnection ? (
							<span className="inline-flex shrink-0 items-center gap-1 text-[9px] text-emerald-700 dark:text-emerald-300">
								<CheckCircle2 className="size-3" />
								本会话已存
							</span>
						) : null}
					</div>

					<div className="space-y-1.5">
						<div className="flex items-center justify-between gap-2">
							<Label htmlFor="visioncut-model-api-key">API Key</Label>
							{selectedDraft?.apiKey ? (
								<Button
									variant="text"
									size="text"
									className="min-h-11 text-[9px] text-destructive xl:min-h-8"
									disabled={notice.state === "testing"}
									onClick={deleteSelectedKey}
								>
									<Trash2 className="size-3" />
									删除 Key
								</Button>
							) : null}
						</div>
						<Input
							id="visioncut-model-api-key"
							type="password"
							autoComplete="off"
							spellCheck={false}
							className="h-11 font-mono text-[12px] sm:h-10"
							disabled={notice.state === "testing"}
							placeholder={selectedDefinition.keyPlaceholder}
							value={selectedDraft?.apiKey ?? ""}
							showPassword={showKey}
							onShowPasswordChange={setShowKey}
							onChange={(event) =>
								updateDraft({
									field: "apiKey",
									provider: selectedProvider,
									value: event.target.value,
								})
							}
						/>
					</div>

					<div className="space-y-1.5">
						<div className="flex items-center justify-between gap-2">
							<Label htmlFor="visioncut-model-name">模型</Label>
							<span className="text-[8px] text-muted-foreground">可自定义</span>
						</div>
						<Input
							id="visioncut-model-name"
							list={modelListId}
							className="h-11 font-mono text-[12px] sm:h-10"
							disabled={notice.state === "testing"}
							spellCheck={false}
							value={selectedDraft?.model ?? ""}
							onChange={(event) =>
								updateDraft({
									field: "model",
									provider: selectedProvider,
									value: event.target.value,
								})
							}
						/>
						<datalist id={modelListId}>
							{selectedDefinition.modelSuggestions.map((model) => (
								<option key={model} value={model} />
							))}
						</datalist>
					</div>

					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
						<Button
							className="h-11 w-full sm:h-10"
							disabled={notice.state === "testing" || !sessionStorageReady}
							onClick={() => void testSelectedConnection()}
						>
							{notice.state === "testing" ? (
								<Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
							) : (
								<PlugZap className="size-4" />
							)}
							测试并启用
						</Button>
						<Button
							variant="outline"
							className="h-11 w-full sm:h-10"
							disabled={notice.state === "testing" || !sessionStorageReady}
							onClick={saveSelectedConnection}
						>
							<LockKeyhole className="size-4" />
							仅保存本会话
						</Button>
					</div>
				</section>
			)}

			<div
				className={cn(
					"flex min-w-0 items-start gap-2.5 rounded-[7px] border px-3 py-2.5",
					notice.state === "success" &&
						"border-emerald-500/30 bg-emerald-500/5",
					notice.state === "error" && "border-destructive/30 bg-destructive/5",
				)}
				role="status"
				aria-live="polite"
			>
				<NoticeIcon
					className={cn(
						"mt-0.5 size-3.5 shrink-0",
						notice.state === "testing" &&
							"animate-spin motion-reduce:animate-none",
						notice.state === "success" && "text-emerald-600",
						notice.state === "error" && "text-destructive",
					)}
				/>
				<p className="min-w-0 break-words text-[9px] leading-relaxed text-muted-foreground">
					{notice.message}
				</p>
			</div>

			<section
				aria-labelledby="model-privacy-heading"
				className="border-t pt-3.5"
			>
				<h3
					id="model-privacy-heading"
					className="flex items-center gap-1.5 text-[11px] font-semibold"
				>
					<ShieldCheck className="size-3.5 text-cyan-600" />
					隐私与费用边界
				</h3>
				<div className="mt-2 divide-y border-y">
					<div className="flex items-start gap-2.5 py-2.5">
						<LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
						<p className="text-[9px] leading-relaxed text-muted-foreground">
							Key 只写入当前标签页的 sessionStorage；不写入 VisionCut
							数据库、服务端配置或应用日志。关闭标签页后由浏览器清除。
						</p>
					</div>
					<div className="flex items-start gap-2.5 py-2.5">
						<Cloud className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
						<p className="text-[9px] leading-relaxed text-muted-foreground">
							远程请求只转发到所选平台的固定官方地址。每次调用会临时携带
							Key、模型和提示，不接受自定义 URL。
						</p>
					</div>
					<div className="flex items-start gap-2.5 py-2.5">
						<WalletCards className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
						<p className="text-[9px] leading-relaxed text-muted-foreground">
							VisionCut 默认路径不收费。BYOK
							调用及“测试连接”可能由模型平台按你的账号、额度和价格计费。
						</p>
					</div>
				</div>
				{savedConnectionCount > 0 ? (
					<Button
						variant="outline"
						className="mt-3 h-11 w-full text-destructive sm:h-10"
						onClick={clearAllKeys}
					>
						<Trash2 className="size-4" />
						删除全部会话密钥 ({savedConnectionCount})
					</Button>
				) : null}
			</section>
		</div>
	);
}
