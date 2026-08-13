"use client";

import {
	AlertCircle,
	Ban,
	BookOpenText,
	Bot,
	Check,
	CheckCircle2,
	CircleDashed,
	Clapperboard,
	Clock3,
	Database,
	FileJson2,
	GitMerge,
	LoaderCircle,
	Music2,
	Palette,
	Play,
	RefreshCcw,
	RotateCcw,
	Scissors,
	ShieldCheck,
	Square,
	Target,
	TrendingUp,
	Video,
	X,
	type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	approveAgentTask,
	rejectAgentTask,
	type AgentEvidenceKind,
	type AgentOrchestration,
	type AgentRole,
	type AgentTask,
} from "@/ai-studio/agent-orchestrator";
import {
	activateAgentIntentPatch,
	approveAgentOperationProposal,
	createAgentOperationReviewLedger,
	getActiveAgentIntentPatches,
	rejectAgentOperationProposal,
	undoAgentIntentPatch,
	type AgentOperationProposal,
	type AgentOperationReviewLedger,
} from "@/ai-studio/agent-operation-review";
import {
	IndexedDBAgentOperationReviewStorage,
	loadAgentOperationReviewLedger,
	saveAgentOperationReviewLedger,
} from "@/ai-studio/agent-operation-review-store";
import {
	AGENT_RUNTIME_DEFAULT_ROLES,
	createAgentRuntimeSession,
	executeAgentRuntimeSession,
	resolveAgentRuntimeRoleSelection,
	retryAgentRuntimeRuns,
	type AgentModelInvocationResult,
	type AgentModelInvoker,
	type AgentRuntimeAction,
	type AgentRuntimeEvidenceSources,
	type AgentRuntimeModelBinding,
	type AgentRuntimeRun,
	type AgentRuntimeRunStatus,
	type AgentRuntimeSession,
	type AgentRuntimeSessionStatus,
	type AgentRuntimeUpdate,
} from "@/ai-studio/agent-runtime";
import {
	IndexedDBAgentSessionStorage,
	listProjectAgentRuntimeSessions,
	saveAgentRuntimeSession,
} from "@/ai-studio/agent-session-store";
import {
	isRemoteModelProvider,
	loadModelProviderSession,
	type RemoteModelProvider,
	type SessionProviderConnection,
} from "@/ai-studio/model-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/ui";

export interface VisionCutAgentOrchestrationProps {
	orchestration: AgentOrchestration;
	onChange: (next: AgentOrchestration) => void;
	evidenceSources?: AgentRuntimeEvidenceSources;
	disabled?: boolean;
}

type RuntimePreference = "local" | "byok";

interface RolePresentation {
	label: string;
	description: string;
	icon: LucideIcon;
}

interface StatusPresentation {
	label: string;
	className: string;
	icon: LucideIcon;
}

const ROLE_PRESENTATION: Record<AgentRole, RolePresentation> = {
	director: {
		label: "导演",
		description: "把创作意图与证据整理成制作方向。",
		icon: Clapperboard,
	},
	story: {
		label: "故事",
		description: "组织叙事结构，不描述证据之外的素材。",
		icon: BookOpenText,
	},
	camera: {
		label: "镜头",
		description: "依据场景或视觉证据规划构图、运动与镜头覆盖。",
		icon: Video,
	},
	editor: {
		label: "剪辑",
		description: "提出带证据引用的可逆剪辑决策。",
		icon: Scissors,
	},
	color: {
		label: "调色",
		description: "基于视觉证据提出色彩处理方案。",
		icon: Palette,
	},
	sound: {
		label: "声音",
		description: "基于音频证据规划对白、音乐与混音。",
		icon: Music2,
	},
	growth: {
		label: "增长",
		description: "围绕受众和平台规划包装与分发。",
		icon: TrendingUp,
	},
};

const RUN_STATUS: Record<AgentRuntimeRunStatus, StatusPresentation> = {
	queued: {
		label: "排队",
		className: "border-border text-muted-foreground",
		icon: Clock3,
	},
	running: {
		label: "运行中",
		className: "border-sky-500/40 text-sky-700 dark:text-sky-300",
		icon: LoaderCircle,
	},
	succeeded: {
		label: "模型完成",
		className: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
		icon: CheckCircle2,
	},
	"local-evidence-only": {
		label: "仅本地证据",
		className: "border-cyan-500/40 text-cyan-700 dark:text-cyan-300",
		icon: Database,
	},
	failed: {
		label: "失败",
		className: "border-destructive/40 text-destructive",
		icon: AlertCircle,
	},
	aborted: {
		label: "已取消",
		className: "border-amber-500/40 text-amber-700 dark:text-amber-300",
		icon: Square,
	},
};

const SESSION_STATUS: Record<AgentRuntimeSessionStatus, string> = {
	queued: "等待运行",
	running: "正在运行",
	succeeded: "全部完成",
	"local-evidence-only": "本地证据整理完成",
	partial: "部分完成",
	failed: "运行失败",
	aborted: "已取消",
};

const EVIDENCE_LABELS: Record<AgentEvidenceKind, string> = {
	"intent-spec": "创作意图",
	"publication-target": "发布目标",
	"asset-metadata": "素材元数据",
	"audio-metadata": "音频元数据",
	"scene-analysis": "场景候选",
	transcript: "转写文本",
	"visual-analysis": "视觉分析",
	"audio-analysis": "音频分析",
	"audience-brief": "受众简报",
	"brand-guideline": "品牌规范",
	"style-reference": "风格参考",
	"performance-data": "表现数据",
	"human-note": "人工备注",
};

const ACTION_STATUS = {
	eligible: {
		label: "证据合格",
		className: "text-emerald-700 dark:text-emerald-300",
	},
	"review-only": {
		label: "仅供审阅",
		className: "text-muted-foreground",
	},
	blocked: {
		label: "证据不足",
		className: "text-amber-700 dark:text-amber-300",
	},
} as const;

const DEFAULT_SELECTED_ROLES = new Set<AgentRole>(AGENT_RUNTIME_DEFAULT_ROLES);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "运行时发生未知错误。";
}

function transitionTimestamp(orchestration: AgentOrchestration): string {
	const updatedAt = Date.parse(orchestration.updatedAt);
	const baseline = Number.isFinite(updatedAt) ? updatedAt : 0;
	return new Date(Math.max(Date.now(), baseline + 1)).toISOString();
}

function operationTransitionTimestamp(
	ledger: AgentOperationReviewLedger,
): string {
	const updatedAt = Date.parse(ledger.updatedAt);
	const baseline = Number.isFinite(updatedAt) ? updatedAt : 0;
	return new Date(Math.max(Date.now(), baseline + 1)).toISOString();
}

function formatTime(value: string | null): string {
	if (value === null) return "尚未结束";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat("zh-CN", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).format(date);
}

function formatDuration(value: number | null): string {
	if (value === null) return "计时中";
	if (value < 1_000) return `${value} ms`;
	return `${(value / 1_000).toFixed(1)} s`;
}

function createSessionNonce(): string {
	const random =
		typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
			? crypto.randomUUID()
			: Math.random().toString(36).slice(2);
	return `${Date.now()}-${random}`;
}

function parseCompletionPayload(
	payload: unknown,
): AgentModelInvocationResult | null {
	if (!isRecord(payload) || typeof payload.ok !== "boolean") return null;
	if (payload.ok) {
		if (typeof payload.text !== "string") return null;
		const usage = isRecord(payload.usage)
			? {
					...(typeof payload.usage.inputTokens === "number"
						? { inputTokens: payload.usage.inputTokens }
						: {}),
					...(typeof payload.usage.outputTokens === "number"
						? { outputTokens: payload.usage.outputTokens }
						: {}),
					...(typeof payload.usage.totalTokens === "number"
						? { totalTokens: payload.usage.totalTokens }
						: {}),
				}
			: undefined;
		return {
			ok: true,
			text: payload.text,
			...(usage === undefined ? {} : { usage }),
		};
	}
	if (
		!isRecord(payload.error) ||
		typeof payload.error.code !== "string" ||
		typeof payload.error.message !== "string" ||
		typeof payload.error.retryable !== "boolean"
	) {
		return null;
	}
	return {
		ok: false,
		error: {
			code: payload.error.code,
			message: payload.error.message,
			retryable: payload.error.retryable,
		},
	};
}

function createByokInvoker({
	provider,
	connection,
}: {
	provider: RemoteModelProvider;
	connection: SessionProviderConnection;
}): AgentModelInvoker {
	const apiKey = connection.apiKey;
	return async (request) => {
		try {
			const response = await fetch("/api/ai/complete", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				cache: "no-store",
				signal: request.signal,
				body: JSON.stringify({
					provider,
					apiKey,
					model: connection.model,
					prompt: request.prompt,
					systemPrompt: request.systemPrompt,
					maxOutputTokens: 1_400,
					purpose: "completion",
				}),
			});
			const payload: unknown = await response.json().catch(() => null);
			const parsed = parseCompletionPayload(payload);
			if (parsed !== null) return parsed;
			return {
				ok: false,
				error: {
					code: "invalid-runtime-response",
					message: "模型接口返回了无法识别的结果。",
					retryable: response.status >= 500,
				},
			};
		} catch (error) {
			if (
				request.signal.aborted ||
				(error instanceof Error && error.name === "AbortError")
			) {
				throw error;
			}
			return {
				ok: false,
				error: {
					code: "model-request-failed",
					message: errorMessage(error),
					retryable: true,
				},
			};
		}
	};
}

function resolveModelBinding({
	preference,
}: {
	preference: RuntimePreference;
}): AgentRuntimeModelBinding | undefined {
	if (preference === "local") return undefined;
	const providerSession = loadModelProviderSession();
	if (!isRemoteModelProvider(providerSession.selectedProvider)) {
		throw new Error("当前没有选中 BYOK 模型，请先在模型页连接提供商。");
	}
	const connection =
		providerSession.connections[providerSession.selectedProvider];
	if (connection === undefined) {
		throw new Error("当前模型没有会话级 API Key，请先在模型页保存连接。");
	}
	return {
		provider: providerSession.selectedProvider,
		model: connection.model,
		invoke: createByokInvoker({
			provider: providerSession.selectedProvider,
			connection,
		}),
	};
}

function StatusBadge({ status }: { status: AgentRuntimeRunStatus }) {
	const presentation = RUN_STATUS[status];
	const Icon = presentation.icon;
	return (
		<span
			className={cn(
				"inline-flex min-h-6 shrink-0 items-center gap-1 rounded-[5px] border px-2 text-[10px] font-medium",
				presentation.className,
			)}
		>
			<Icon
				className={cn("size-3.5", status === "running" && "animate-spin")}
				aria-hidden="true"
			/>
			{presentation.label}
		</span>
	);
}

function SectionLabel({
	icon: Icon,
	children,
}: {
	icon: LucideIcon;
	children: React.ReactNode;
}) {
	return (
		<div className="flex min-h-7 items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
			<Icon className="size-3.5" aria-hidden="true" />
			<span>{children}</span>
		</div>
	);
}

function ActionRow({
	action,
	proposal,
	disabled,
	onApprove,
	onReject,
	onActivate,
	onUndo,
}: {
	action: AgentRuntimeAction;
	proposal: AgentOperationProposal | null;
	disabled: boolean;
	onApprove: (proposalId: string) => Promise<void>;
	onReject: (proposalId: string, note: string) => Promise<void>;
	onActivate: (proposalId: string) => Promise<void>;
	onUndo: (proposalId: string, receiptId: string) => Promise<void>;
}) {
	const status = ACTION_STATUS[action.applicability];
	const [showReject, setShowReject] = useState(false);
	const [rejectionNote, setRejectionNote] = useState("");
	const [busy, setBusy] = useState(false);
	const [reviewError, setReviewError] = useState<string | null>(null);
	const runReviewAction = async (operation: () => Promise<void>) => {
		setBusy(true);
		setReviewError(null);
		try {
			await operation();
		} catch (error) {
			setReviewError(errorMessage(error));
		} finally {
			setBusy(false);
		}
	};
	const submitRejection = () => {
		if (proposal === null || !rejectionNote.trim()) return;
		void runReviewAction(async () => {
			await onReject(proposal.proposalId, rejectionNote.trim());
			setShowReject(false);
			setRejectionNote("");
		});
	};
	return (
		<div className="border-t py-2.5 first:border-t-0">
			<div className="flex min-w-0 items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="text-[11px] font-medium">{action.title}</p>
					<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
						{action.description}
					</p>
				</div>
				<span
					className={cn("shrink-0 text-[9px] font-medium", status.className)}
				>
					{status.label}
				</span>
			</div>
			{action.evidenceIds.length > 0 ? (
				<p className="mt-1.5 break-all font-mono text-[9px] text-muted-foreground">
					证据：{action.evidenceIds.join(" · ")}
				</p>
			) : null}
			{action.blockers.length > 0 ? (
				<ul className="mt-1.5 space-y-1 text-[9px] leading-relaxed text-amber-700 dark:text-amber-300">
					{action.blockers.map((blocker) => (
						<li key={blocker}>{blocker}</li>
					))}
				</ul>
			) : null}
			{proposal ? (
				<div className="mt-2.5 border-y bg-muted/20 px-2.5 py-2.5">
					<div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
						<div className="min-w-0">
							<p className="text-[10px] font-semibold">可执行意图补丁</p>
							<p className="mt-0.5 font-mono text-[8px] text-muted-foreground">
								{proposal.patch.operation}
							</p>
						</div>
						<span
							className={cn(
								"text-[9px] font-medium",
								proposal.availability === "conflicted"
									? "text-amber-700 dark:text-amber-300"
									: proposal.activation.status === "active"
										? "text-emerald-700 dark:text-emerald-300"
										: "text-muted-foreground",
							)}
						>
							{proposal.availability === "conflicted"
								? "冲突待处理"
								: proposal.activation.status === "active"
									? "已激活"
									: proposal.activation.status === "undone"
										? "已撤销"
										: proposal.review.status === "approved"
											? "已批准"
											: proposal.review.status === "rejected"
												? "已拒绝"
												: "待人工审批"}
						</span>
					</div>
					<p className="mt-2 break-all text-[9px] leading-relaxed text-muted-foreground">
						目标：{proposal.targetReference}
					</p>
					<p className="mt-1 break-all font-mono text-[8px] text-muted-foreground">
						补丁：{proposal.patch.patchFingerprint}
					</p>
					{proposal.blockers.length > 0 ? (
						<ul className="mt-2 space-y-1 text-[9px] leading-relaxed text-amber-700 dark:text-amber-300">
							{proposal.blockers.map((blocker) => (
								<li key={blocker}>{blocker}</li>
							))}
						</ul>
					) : null}
					{proposal.review.note ? (
						<p className="mt-2 text-[9px] leading-relaxed text-muted-foreground">
							审批备注：{proposal.review.note}
						</p>
					) : null}
					{proposal.activation.receiptId ? (
						<p className="mt-1 break-all font-mono text-[8px] text-muted-foreground">
							回执：{proposal.activation.receiptId}
						</p>
					) : null}
					{showReject && proposal.review.status === "pending" ? (
						<div className="mt-2.5 border-t pt-2.5">
							<label
								htmlFor={`reject-operation-${proposal.proposalId}`}
								className="text-[9px] font-medium"
							>
								拒绝原因
							</label>
							<textarea
								id={`reject-operation-${proposal.proposalId}`}
								value={rejectionNote}
								disabled={disabled || busy}
								maxLength={800}
								className="mt-1.5 min-h-20 w-full resize-y rounded-[6px] border bg-background px-3 py-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
								placeholder="说明为什么不采用这条建议"
								onChange={(event) => setRejectionNote(event.target.value)}
							/>
							<div className="mt-2 grid grid-cols-2 gap-2">
								<Button
									variant="outline"
									className="min-h-11 rounded-[6px]"
									disabled={disabled || busy}
									onClick={() => setShowReject(false)}
								>
									<X aria-hidden="true" />
									取消
								</Button>
								<Button
									variant="destructive"
									className="min-h-11 rounded-[6px]"
									disabled={disabled || busy || !rejectionNote.trim()}
									onClick={submitRejection}
								>
									<Ban aria-hidden="true" />
									确认拒绝
								</Button>
							</div>
						</div>
					) : (
						<div className="mt-2.5 flex flex-wrap justify-end gap-2 border-t pt-2.5">
							{proposal.availability === "ready" &&
							proposal.review.status === "pending" ? (
								<>
									<Button
										variant="ghost"
										className="min-h-11 rounded-[6px]"
										disabled={disabled || busy}
										onClick={() => setShowReject(true)}
									>
										<Ban aria-hidden="true" />
										拒绝建议
									</Button>
									<Button
										variant="outline"
										className="min-h-11 rounded-[6px]"
										disabled={disabled || busy}
										onClick={() =>
											void runReviewAction(() => onApprove(proposal.proposalId))
										}
									>
										<ShieldCheck aria-hidden="true" />
										批准建议
									</Button>
								</>
							) : null}
							{proposal.review.status === "approved" &&
							proposal.activation.status === "inactive" ? (
								<Button
									className="min-h-11 rounded-[6px]"
									disabled={disabled || busy}
									onClick={() =>
										void runReviewAction(() => onActivate(proposal.proposalId))
									}
								>
									<Play aria-hidden="true" />
									激活意图补丁
								</Button>
							) : null}
							{proposal.activation.status === "active" &&
							proposal.activation.receiptId ? (
								<Button
									variant="outline"
									className="min-h-11 rounded-[6px]"
									disabled={disabled || busy}
									onClick={() =>
										void runReviewAction(() =>
											onUndo(
												proposal.proposalId,
												proposal.activation.receiptId!,
											),
										)
									}
								>
									<RotateCcw aria-hidden="true" />
									撤销补丁
								</Button>
							) : null}
						</div>
					)}
					{reviewError ? (
						<p className="mt-2 text-[9px] text-destructive" role="alert">
							{reviewError}
						</p>
					) : null}
					<p className="mt-2 text-[8px] leading-relaxed text-muted-foreground">
						激活仅写入可撤销的项目意图，不会直接调色、混音、发布或修改媒体。
					</p>
				</div>
			) : null}
		</div>
	);
}

function RuntimeAudit({ run }: { run: AgentRuntimeRun }) {
	const attempt = run.attempts.at(-1);
	if (attempt === undefined) {
		return (
			<p className="text-[10px] text-muted-foreground">
				尚未执行，未产生 Prompt/Response 审计记录。
			</p>
		);
	}
	return (
		<div>
			<div className="grid gap-2 text-[10px] sm:grid-cols-2">
				<p>
					<span className="text-muted-foreground">提供方：</span>
					{attempt.provider} / {attempt.model}
				</p>
				<p>
					<span className="text-muted-foreground">耗时：</span>
					{formatDuration(attempt.durationMs)}
				</p>
				<p>
					<span className="text-muted-foreground">开始：</span>
					{formatTime(attempt.startedAt)}
				</p>
				<p>
					<span className="text-muted-foreground">结束：</span>
					{formatTime(attempt.endedAt)}
				</p>
			</div>
			<details className="mt-2 border-t pt-2">
				<summary className="min-h-8 cursor-pointer text-[10px] font-medium">
					查看脱敏 Prompt / Response
				</summary>
				<div className="mt-2 grid gap-2">
					<pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words bg-muted/30 p-2 text-[9px] leading-relaxed">
						{attempt.promptAudit}
					</pre>
					<pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words bg-muted/30 p-2 text-[9px] leading-relaxed">
						{attempt.responseAudit ?? "没有保存模型响应。"}
					</pre>
				</div>
			</details>
		</div>
	);
}

function AgentRow({
	task,
	runtimeRun,
	selected,
	disabled,
	executing,
	orchestration,
	onToggle,
	onChange,
	onRetry,
	operationProposals,
	operationReviewDisabled,
	onApproveOperation,
	onRejectOperation,
	onActivateOperation,
	onUndoOperation,
}: {
	task: AgentTask;
	runtimeRun: AgentRuntimeRun | null;
	selected: boolean;
	disabled: boolean;
	executing: boolean;
	orchestration: AgentOrchestration;
	onToggle: (role: AgentRole) => void;
	onChange: (next: AgentOrchestration) => void;
	onRetry: (runId: string) => Promise<void>;
	operationProposals: readonly AgentOperationProposal[];
	operationReviewDisabled: boolean;
	onApproveOperation: (proposalId: string) => Promise<void>;
	onRejectOperation: (proposalId: string, note: string) => Promise<void>;
	onActivateOperation: (proposalId: string) => Promise<void>;
	onUndoOperation: (proposalId: string, receiptId: string) => Promise<void>;
}) {
	const presentation = ROLE_PRESENTATION[task.role];
	const RoleIcon = presentation.icon;
	const [showReject, setShowReject] = useState(false);
	const [rejectionNote, setRejectionNote] = useState("");
	const [actionError, setActionError] = useState<string | null>(null);
	const canDecide = task.approvalGate.status === "pending";
	const retryable =
		runtimeRun !== null &&
		(runtimeRun.status === "failed" || runtimeRun.status === "aborted") &&
		runtimeRun.attempts.at(-1)?.failure?.retryable === true &&
		runtimeRun.retryCount < runtimeRun.maxRetries;

	const approve = () => {
		try {
			onChange(
				approveAgentTask({
					orchestration,
					taskId: task.taskId,
					approvedBy: "local-user",
					at: transitionTimestamp(orchestration),
					note: "用户批准该角色生成可审阅计划。",
				}),
			);
			setActionError(null);
		} catch (error) {
			setActionError(errorMessage(error));
		}
	};

	const reject = () => {
		const note = rejectionNote.trim();
		if (!note) {
			setActionError("请填写拒绝原因。");
			return;
		}
		try {
			onChange(
				rejectAgentTask({
					orchestration,
					taskId: task.taskId,
					rejectedBy: "local-user",
					at: transitionTimestamp(orchestration),
					note,
				}),
			);
			setShowReject(false);
			setRejectionNote("");
			setActionError(null);
		} catch (error) {
			setActionError(errorMessage(error));
		}
	};

	return (
		<article className="border-t px-3 py-4 first:border-t-0 sm:px-4">
			<div className="flex min-w-0 items-start gap-3">
				<label className="flex min-h-11 shrink-0 cursor-pointer items-center">
					<input
						type="checkbox"
						checked={selected}
						disabled={disabled || executing}
						className="size-4 accent-cyan-500"
						aria-label={`选择${presentation.label} Agent`}
						onChange={() => onToggle(task.role)}
					/>
				</label>
				<div className="flex size-10 shrink-0 items-center justify-center rounded-[7px] border bg-muted/30">
					<RoleIcon className="size-4.5" aria-hidden="true" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
						<div className="min-w-0">
							<h3 className="text-sm font-semibold">
								{presentation.label} Agent
							</h3>
							<p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
								{presentation.description}
							</p>
						</div>
						{runtimeRun ? (
							<StatusBadge status={runtimeRun.status} />
						) : (
							<span className="text-[10px] text-muted-foreground">
								尚无运行记录
							</span>
						)}
					</div>
				</div>
			</div>

			<div className="mt-4 grid gap-4 sm:grid-cols-2">
				<section>
					<SectionLabel icon={ShieldCheck}>合同审批</SectionLabel>
					<p className="mt-1 text-[10px] leading-relaxed">
						{task.approvalGate.status === "pending"
							? "待明确批准，未批准不会进入运行时。"
							: task.approvalGate.status === "approved"
								? `已批准 · ${formatTime(task.approvalGate.decidedAt)}`
								: `已拒绝 · ${formatTime(task.approvalGate.decidedAt)}`}
					</p>
					{task.approvalGate.note ? (
						<p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
							{task.approvalGate.note}
						</p>
					) : null}
				</section>
				<section>
					<SectionLabel icon={Database}>输入证据</SectionLabel>
					<div className="mt-1 space-y-1.5">
						{task.inputEvidenceIds.map((evidenceId) => {
							const evidence = orchestration.evidence.find(
								(candidate) => candidate.evidenceId === evidenceId,
							);
							return (
								<div
									key={evidenceId}
									className="flex min-w-0 items-center gap-2 text-[10px]"
								>
									<Check
										className="size-3.5 shrink-0 text-emerald-600"
										aria-hidden="true"
									/>
									<span className="min-w-0 flex-1 truncate">
										{evidence?.label ?? evidenceId}
									</span>
									<span className="shrink-0 text-[8px] text-muted-foreground">
										{evidence ? EVIDENCE_LABELS[evidence.kind] : "引用"}
									</span>
								</div>
							);
						})}
					</div>
				</section>
			</div>

			<section className="mt-4 border-y py-3">
				<SectionLabel icon={Target}>证据门槛</SectionLabel>
				<div className="mt-1.5 space-y-2">
					{task.evidenceRequirements.map((requirement) => {
						const matching = orchestration.evidence.filter((item) =>
							requirement.anyOfKinds.includes(item.kind),
						).length;
						const satisfied = matching >= requirement.minimum;
						return (
							<div
								key={requirement.requirementId}
								className="flex items-start gap-2 text-[10px]"
							>
								{satisfied ? (
									<CheckCircle2
										className="mt-0.5 size-3.5 shrink-0 text-emerald-600"
										aria-hidden="true"
									/>
								) : (
									<CircleDashed
										className="mt-0.5 size-3.5 shrink-0 text-amber-600"
										aria-hidden="true"
									/>
								)}
								<div className="min-w-0">
									<p>{requirement.description}</p>
									<p className="mt-0.5 text-[8px] text-muted-foreground">
										{matching}/{requirement.minimum} ·{" "}
										{requirement.anyOfKinds
											.map((kind) => EVIDENCE_LABELS[kind])
											.join(" / ")}
									</p>
								</div>
							</div>
						);
					})}
				</div>
			</section>

			<section className="mt-4 grid gap-3 sm:grid-cols-2">
				<div>
					<SectionLabel icon={FileJson2}>输出合同</SectionLabel>
					<p className="mt-1 text-[10px] leading-relaxed">
						{task.outputReferences[0]?.label}
					</p>
					<p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
						{task.outputReferences[0]?.kind}
					</p>
				</div>
				<div>
					<SectionLabel icon={AlertCircle}>能力边界</SectionLabel>
					<ul className="mt-1 space-y-1 text-[10px] leading-relaxed text-muted-foreground">
						{task.limitations.map((limitation) => (
							<li key={limitation}>• {limitation}</li>
						))}
					</ul>
				</div>
			</section>

			{runtimeRun?.artifact ? (
				<section className="mt-4">
					<SectionLabel icon={FileJson2}>结构化产物</SectionLabel>
					<p className="mt-1 text-[10px] leading-relaxed">
						{runtimeRun.artifact.summary}
					</p>
					{runtimeRun.artifact.actions.length > 0 ? (
						<div className="mt-2">
							{runtimeRun.artifact.actions.map((action) => {
								const proposal =
									operationProposals.find(
										(candidate) =>
											candidate.source.runId === runtimeRun.runId &&
											candidate.source.actionId === action.actionId,
									) ?? null;
								return (
									<ActionRow
										key={action.actionId}
										action={action}
										proposal={proposal}
										disabled={operationReviewDisabled}
										onApprove={onApproveOperation}
										onReject={onRejectOperation}
										onActivate={onActivateOperation}
										onUndo={onUndoOperation}
									/>
								);
							})}
						</div>
					) : (
						<p className="mt-2 text-[9px] text-muted-foreground">
							没有生成剪辑动作。本地模式只整理现有证据。
						</p>
					)}
				</section>
			) : null}

			<section className="mt-4 border-t pt-3">
				<SectionLabel icon={Clock3}>执行审计</SectionLabel>
				<div className="mt-1">
					{runtimeRun ? (
						<RuntimeAudit run={runtimeRun} />
					) : (
						<p className="text-[10px] text-muted-foreground">
							运行后记录提供方、模型、时间、耗时、重试和脱敏输入输出。
						</p>
					)}
				</div>
			</section>

			{runtimeRun?.attempts.at(-1)?.failure ? (
				<div
					className="mt-3 border-y border-destructive/30 py-3 text-[10px]"
					role="alert"
				>
					<p className="font-medium text-destructive">
						{runtimeRun.attempts.at(-1)?.failure?.message}
					</p>
					<p className="mt-1 font-mono text-[8px] text-muted-foreground">
						{runtimeRun.attempts.at(-1)?.failure?.code} · 已重试{" "}
						{runtimeRun.retryCount}/{runtimeRun.maxRetries}
					</p>
				</div>
			) : null}

			{actionError ? (
				<p className="mt-3 text-[10px] text-destructive" role="alert">
					{actionError}
				</p>
			) : null}

			{showReject && canDecide ? (
				<div className="mt-4 border-t pt-3">
					<label
						htmlFor={`reject-agent-${task.role}`}
						className="text-[10px] font-medium"
					>
						拒绝原因
					</label>
					<textarea
						id={`reject-agent-${task.role}`}
						value={rejectionNote}
						disabled={disabled || executing}
						maxLength={500}
						className="mt-2 min-h-20 w-full resize-y rounded-[6px] border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
						placeholder="说明为什么不让该角色参与本次运行"
						onChange={(event) => setRejectionNote(event.target.value)}
					/>
					<div className="mt-2 grid grid-cols-2 gap-2">
						<Button
							variant="outline"
							className="min-h-11 rounded-[6px]"
							onClick={() => setShowReject(false)}
						>
							<X aria-hidden="true" />
							取消
						</Button>
						<Button
							variant="destructive"
							className="min-h-11 rounded-[6px]"
							disabled={!rejectionNote.trim()}
							onClick={reject}
						>
							<Ban aria-hidden="true" />
							确认拒绝
						</Button>
					</div>
				</div>
			) : (
				<div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-3">
					{canDecide ? (
						<>
							<Button
								variant="ghost"
								className="min-h-11 rounded-[6px]"
								disabled={disabled || executing}
								onClick={() => setShowReject(true)}
							>
								<Ban aria-hidden="true" />
								拒绝
							</Button>
							<Button
								variant="outline"
								className="min-h-11 rounded-[6px]"
								disabled={disabled || executing}
								onClick={approve}
							>
								<Check aria-hidden="true" />
								批准角色
							</Button>
						</>
					) : null}
					{retryable && runtimeRun ? (
						<Button
							variant="outline"
							className="min-h-11 rounded-[6px]"
							disabled={disabled || executing}
							onClick={() => void onRetry(runtimeRun.runId)}
						>
							<RotateCcw aria-hidden="true" />
							重试该角色
						</Button>
					) : null}
				</div>
			)}
		</article>
	);
}

export function VisionCutAgentOrchestration({
	orchestration,
	onChange,
	evidenceSources,
	disabled = false,
}: VisionCutAgentOrchestrationProps) {
	const storageRef = useRef(new IndexedDBAgentSessionStorage());
	const operationStorageRef = useRef(
		new IndexedDBAgentOperationReviewStorage(),
	);
	const abortRef = useRef<AbortController | null>(null);
	const [runtimeSession, setRuntimeSession] =
		useState<AgentRuntimeSession | null>(null);
	const [selectedRoles, setSelectedRoles] = useState<Set<AgentRole>>(
		() => new Set(DEFAULT_SELECTED_ROLES),
	);
	const [preference, setPreference] = useState<RuntimePreference>("local");
	const [concurrencyLimit, setConcurrencyLimit] = useState(3);
	const [isExecuting, setIsExecuting] = useState(false);
	const [isLoadingHistory, setIsLoadingHistory] = useState(true);
	const [runtimeError, setRuntimeError] = useState<string | null>(null);
	const [operationLedger, setOperationLedger] =
		useState<AgentOperationReviewLedger | null>(null);
	const [isLoadingOperations, setIsLoadingOperations] = useState(false);

	const providerSummary = (() => {
		const session = loadModelProviderSession();
		if (!isRemoteModelProvider(session.selectedProvider)) {
			return { connected: false, label: "未连接 BYOK 模型" };
		}
		const connection = session.connections[session.selectedProvider];
		return connection
			? {
					connected: true,
					label: `${session.selectedProvider} / ${connection.model}`,
				}
			: {
					connected: false,
					label: `${session.selectedProvider} 尚未保存会话密钥`,
				};
	})();

	useEffect(() => {
		let active = true;
		void listProjectAgentRuntimeSessions({
			projectId: orchestration.projectId,
			orchestrationId: orchestration.orchestrationId,
			storage: storageRef.current,
		})
			.then((sessions) => {
				if (!active) return;
				setRuntimeSession(sessions[0] ?? null);
				setIsLoadingHistory(false);
			})
			.catch((error: unknown) => {
				if (!active) return;
				setRuntimeError(errorMessage(error));
				setIsLoadingHistory(false);
			});
		return () => {
			active = false;
		};
	}, [orchestration.orchestrationId, orchestration.projectId]);

	useEffect(() => {
		if (
			runtimeSession === null ||
			runtimeSession.status === "queued" ||
			runtimeSession.status === "running"
		) {
			return;
		}
		let active = true;
		queueMicrotask(() => {
			if (active) setIsLoadingOperations(true);
		});
		void loadAgentOperationReviewLedger({
			session: runtimeSession,
			storage: operationStorageRef.current,
		})
			.then(async (stored) => {
				if (!active) return;
				if (stored !== null) {
					setOperationLedger(stored);
					return;
				}
				const created = createAgentOperationReviewLedger({
					session: runtimeSession,
					createdAt: new Date().toISOString(),
				});
				const saved = await saveAgentOperationReviewLedger({
					ledger: created,
					storage: operationStorageRef.current,
				});
				if (active) setOperationLedger(saved);
			})
			.catch((error: unknown) => {
				if (!active) return;
				setRuntimeError(errorMessage(error));
				setOperationLedger(null);
			})
			.finally(() => {
				if (active) setIsLoadingOperations(false);
			});
		return () => {
			active = false;
		};
	}, [runtimeSession]);

	const currentOperationLedger = useMemo(() => {
		if (
			operationLedger === null ||
			runtimeSession === null ||
			operationLedger.sessionId !== runtimeSession.sessionId ||
			operationLedger.mergeFingerprint !== runtimeSession.merge.fingerprint ||
			operationLedger.sourceRuntimeRevision !== runtimeSession.revision
		) {
			return null;
		}
		return operationLedger;
	}, [operationLedger, runtimeSession]);

	const persistUpdate = useCallback(async ({ session }: AgentRuntimeUpdate) => {
		const saved = await saveAgentRuntimeSession({
			session,
			storage: storageRef.current,
		});
		setRuntimeSession(saved);
	}, []);

	const selected = useMemo(
		() =>
			orchestration.tasks
				.map((task) => task.role)
				.filter((role) => selectedRoles.has(role)),
		[orchestration.tasks, selectedRoles],
	);
	const approvedSelected = selected.filter((role) => {
		const task = orchestration.tasks.find(
			(candidate) => candidate.role === role,
		);
		return task?.approvalGate.status === "approved";
	});
	const pendingSelected = selected.filter((role) => {
		const task = orchestration.tasks.find(
			(candidate) => candidate.role === role,
		);
		return task?.approvalGate.status === "pending";
	});
	const rejectedSelected = selected.filter((role) => {
		const task = orchestration.tasks.find(
			(candidate) => candidate.role === role,
		);
		return task?.approvalGate.status === "rejected";
	});

	const toggleRole = (role: AgentRole) => {
		setSelectedRoles((current) => {
			if (!current.has(role)) {
				return new Set(
					resolveAgentRuntimeRoleSelection({
						orchestration,
						roles: [...current, role],
					}),
				);
			}
			const next = new Set(current);
			const removedTaskIds = new Set(
				orchestration.tasks
					.filter((task) => task.role === role)
					.map((task) => task.taskId),
			);
			next.delete(role);
			let changed = true;
			while (changed) {
				changed = false;
				for (const task of orchestration.tasks) {
					if (
						!next.has(task.role) ||
						!task.dependencyTaskIds.some((taskId) => removedTaskIds.has(taskId))
					) {
						continue;
					}
					next.delete(task.role);
					removedTaskIds.add(task.taskId);
					changed = true;
				}
			}
			return next;
		});
	};

	const approveSelected = () => {
		let next = orchestration;
		try {
			for (const role of selected) {
				const task = next.tasks.find((candidate) => candidate.role === role);
				if (task?.approvalGate.status !== "pending") continue;
				next = approveAgentTask({
					orchestration: next,
					taskId: task.taskId,
					approvedBy: "local-user",
					at: transitionTimestamp(next),
					note: "用户批量批准该角色生成可审阅计划。",
				});
			}
			onChange(next);
			setRuntimeError(null);
		} catch (error) {
			setRuntimeError(errorMessage(error));
		}
	};

	const runSelected = async () => {
		if (selected.length === 0) {
			setRuntimeError("请至少选择一个 Agent。");
			return;
		}
		if (pendingSelected.length > 0) {
			setRuntimeError(
				`先批准所选角色：${pendingSelected.map((role) => ROLE_PRESENTATION[role].label).join("、")}。`,
			);
			return;
		}
		if (rejectedSelected.length > 0) {
			setRuntimeError(
				`已拒绝的角色不能运行：${rejectedSelected.map((role) => ROLE_PRESENTATION[role].label).join("、")}。请取消选择该角色及依赖它的下游角色。`,
			);
			return;
		}
		setRuntimeError(null);
		setIsExecuting(true);
		const controller = new AbortController();
		abortRef.current = controller;
		try {
			const model = resolveModelBinding({ preference });
			const created = createAgentRuntimeSession({
				orchestration,
				roles: approvedSelected,
				concurrencyLimit,
				createdAt: new Date().toISOString(),
				sessionNonce: createSessionNonce(),
				evidenceSources,
			});
			const saved = await saveAgentRuntimeSession({
				session: created,
				storage: storageRef.current,
			});
			setRuntimeSession(saved);
			const completed = await executeAgentRuntimeSession({
				session: saved,
				orchestration,
				...(model === undefined ? {} : { model }),
				signal: controller.signal,
				onUpdate: persistUpdate,
			});
			setRuntimeSession(completed);
		} catch (error) {
			setRuntimeError(errorMessage(error));
		} finally {
			abortRef.current = null;
			setIsExecuting(false);
		}
	};

	const retryRun = async (runId: string) => {
		if (runtimeSession === null) return;
		setRuntimeError(null);
		setIsExecuting(true);
		const controller = new AbortController();
		abortRef.current = controller;
		try {
			const model = resolveModelBinding({ preference });
			const completed = await retryAgentRuntimeRuns({
				session: runtimeSession,
				orchestration,
				runIds: [runId],
				...(model === undefined ? {} : { model }),
				signal: controller.signal,
				onUpdate: persistUpdate,
			});
			setRuntimeSession(completed);
		} catch (error) {
			setRuntimeError(errorMessage(error));
		} finally {
			abortRef.current = null;
			setIsExecuting(false);
		}
	};

	const persistOperationLedger = useCallback(
		async (next: AgentOperationReviewLedger) => {
			const saved = await saveAgentOperationReviewLedger({
				ledger: next,
				storage: operationStorageRef.current,
			});
			setOperationLedger(saved);
		},
		[],
	);

	const approveOperation = useCallback(
		async (proposalId: string) => {
			if (currentOperationLedger === null || runtimeSession === null) {
				throw new Error("可执行建议仍在加载，请稍后重试。");
			}
			await persistOperationLedger(
				approveAgentOperationProposal({
					ledger: currentOperationLedger,
					session: runtimeSession,
					proposalId,
					approvedBy: "local-user",
					at: operationTransitionTimestamp(currentOperationLedger),
					note: "用户批准将证据约束建议转为项目意图补丁。",
				}),
			);
		},
		[currentOperationLedger, persistOperationLedger, runtimeSession],
	);

	const rejectOperation = useCallback(
		async (proposalId: string, note: string) => {
			if (currentOperationLedger === null || runtimeSession === null) {
				throw new Error("可执行建议仍在加载，请稍后重试。");
			}
			await persistOperationLedger(
				rejectAgentOperationProposal({
					ledger: currentOperationLedger,
					session: runtimeSession,
					proposalId,
					rejectedBy: "local-user",
					at: operationTransitionTimestamp(currentOperationLedger),
					note,
				}),
			);
		},
		[currentOperationLedger, persistOperationLedger, runtimeSession],
	);

	const activateOperation = useCallback(
		async (proposalId: string) => {
			if (currentOperationLedger === null || runtimeSession === null) {
				throw new Error("可执行建议仍在加载，请稍后重试。");
			}
			await persistOperationLedger(
				activateAgentIntentPatch({
					ledger: currentOperationLedger,
					session: runtimeSession,
					proposalId,
					activatedBy: "local-user",
					at: operationTransitionTimestamp(currentOperationLedger),
				}),
			);
		},
		[currentOperationLedger, persistOperationLedger, runtimeSession],
	);

	const undoOperation = useCallback(
		async (proposalId: string, receiptId: string) => {
			if (currentOperationLedger === null || runtimeSession === null) {
				throw new Error("可执行建议仍在加载，请稍后重试。");
			}
			await persistOperationLedger(
				undoAgentIntentPatch({
					ledger: currentOperationLedger,
					session: runtimeSession,
					proposalId,
					activationReceiptId: receiptId,
					undoneBy: "local-user",
					at: operationTransitionTimestamp(currentOperationLedger),
				}),
			);
		},
		[currentOperationLedger, persistOperationLedger, runtimeSession],
	);

	const activeIntentPatchCount = useMemo(() => {
		if (currentOperationLedger === null || runtimeSession === null) return 0;
		try {
			return getActiveAgentIntentPatches({
				ledger: currentOperationLedger,
				session: runtimeSession,
			}).length;
		} catch {
			return 0;
		}
	}, [currentOperationLedger, runtimeSession]);

	const cancel = () => {
		abortRef.current?.abort();
	};

	return (
		<div className="min-w-0">
			<header className="border-y px-3 py-4 sm:px-4">
				<div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<Bot className="size-4" aria-hidden="true" />
							<h2 className="text-sm font-semibold">Multi-Agent 运行台</h2>
						</div>
						<p className="mt-1 max-w-xl text-[10px] leading-relaxed text-muted-foreground">
							所选角色并行生成可审阅产物。默认只整理本地证据，不调用模型，也不会自动修改媒体。
						</p>
					</div>
					<div className="text-right text-[9px] text-muted-foreground">
						<p>合同修订 {orchestration.revision}</p>
						<p className="mt-0.5">
							{runtimeSession
								? `${SESSION_STATUS[runtimeSession.status]} · 审计修订 ${runtimeSession.revision}`
								: isLoadingHistory
									? "读取审计记录"
									: "尚无运行会话"}
						</p>
					</div>
				</div>

				<div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
					<div>
						<p className="text-[9px] font-medium text-muted-foreground">
							执行来源
						</p>
						<div className="mt-1 grid grid-cols-2 gap-1 rounded-[7px] border p-1">
							<button
								type="button"
								className={cn(
									"min-h-11 rounded-[5px] px-3 text-[10px] font-medium",
									preference === "local"
										? "bg-foreground text-background"
										: "text-muted-foreground hover:bg-muted/50",
								)}
								disabled={disabled || isExecuting}
								onClick={() => setPreference("local")}
							>
								本地证据
							</button>
							<button
								type="button"
								className={cn(
									"min-h-11 rounded-[5px] px-3 text-[10px] font-medium",
									preference === "byok"
										? "bg-foreground text-background"
										: "text-muted-foreground hover:bg-muted/50",
								)}
								disabled={disabled || isExecuting}
								onClick={() => setPreference("byok")}
							>
								BYOK 模型
							</button>
						</div>
						<p className="mt-1 text-[8px] text-muted-foreground">
							{preference === "local"
								? "本机默认，不访问网络。"
								: providerSummary.label}
						</p>
					</div>

					<label className="block">
						<span className="text-[9px] font-medium text-muted-foreground">
							并发上限
						</span>
						<select
							value={concurrencyLimit}
							disabled={disabled || isExecuting}
							className="mt-1 min-h-11 w-full rounded-[6px] border bg-background px-3 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring lg:w-28"
							onChange={(event) =>
								setConcurrencyLimit(Number(event.target.value))
							}
						>
							<option value={1}>1 路</option>
							<option value={2}>2 路</option>
							<option value={3}>3 路</option>
							<option value={4}>4 路</option>
							<option value={6}>6 路</option>
						</select>
					</label>
				</div>

				<div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
					<p className="text-[9px] text-muted-foreground">
						已选 {selected.length} · 已批准 {approvedSelected.length} · 并发{" "}
						{concurrencyLimit}
					</p>
					<div className="flex flex-wrap gap-2">
						{pendingSelected.length > 0 ? (
							<Button
								variant="outline"
								className="min-h-11 rounded-[6px]"
								disabled={disabled || isExecuting}
								onClick={approveSelected}
							>
								<ShieldCheck aria-hidden="true" />
								批准所选
							</Button>
						) : null}
						{isExecuting ? (
							<Button
								variant="destructive"
								className="min-h-11 rounded-[6px]"
								onClick={cancel}
							>
								<Square aria-hidden="true" />
								取消运行
							</Button>
						) : (
							<Button
								className="min-h-11 rounded-[6px]"
								disabled={disabled || selected.length === 0}
								onClick={() => void runSelected()}
							>
								<Play aria-hidden="true" />
								运行所选
							</Button>
						)}
					</div>
				</div>

				{runtimeError ? (
					<div
						className="mt-3 flex items-start gap-2 border-y border-destructive/30 py-2 text-[10px] text-destructive"
						role="alert"
					>
						<AlertCircle className="mt-0.5 size-3.5 shrink-0" />
						<p>{runtimeError}</p>
					</div>
				) : null}
			</header>

			<section aria-label="Agent 角色">
				{orchestration.tasks.map((task) => (
					<AgentRow
						key={task.taskId}
						task={task}
						runtimeRun={
							runtimeSession?.runs.find((run) => run.role === task.role) ?? null
						}
						selected={selectedRoles.has(task.role)}
						disabled={disabled}
						executing={isExecuting}
						orchestration={orchestration}
						operationProposals={currentOperationLedger?.proposals ?? []}
						operationReviewDisabled={
							disabled || isExecuting || isLoadingOperations
						}
						onToggle={toggleRole}
						onChange={onChange}
						onRetry={retryRun}
						onApproveOperation={approveOperation}
						onRejectOperation={rejectOperation}
						onActivateOperation={activateOperation}
						onUndoOperation={undoOperation}
					/>
				))}
			</section>

			{runtimeSession ? (
				<footer className="border-y px-3 py-4 sm:px-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<section>
							<SectionLabel icon={GitMerge}>确定性合并</SectionLabel>
							<p className="mt-1 text-[10px] leading-relaxed">
								证据合格动作 {runtimeSession.merge.eligibleActionIds.length} ·
								仅审阅 {runtimeSession.merge.reviewOnlyActionIds.length} · 阻塞{" "}
								{runtimeSession.merge.blockedActionIds.length}
							</p>
							<p className="mt-1 break-all font-mono text-[8px] text-muted-foreground">
								{runtimeSession.merge.fingerprint}
							</p>
							<p className="mt-1 text-[9px] text-muted-foreground">
								可审批意图 {currentOperationLedger?.proposals.length ?? 0} ·
								已激活 {activeIntentPatchCount}
								{isLoadingOperations ? " · 正在读取审批账本" : ""}
							</p>
						</section>
						<section>
							<SectionLabel icon={RefreshCcw}>冲突</SectionLabel>
							{runtimeSession.merge.conflicts.length === 0 ? (
								<p className="mt-1 text-[10px] text-muted-foreground">
									当前产物没有检测到跨角色目标冲突。
								</p>
							) : (
								<div className="mt-1 space-y-2">
									{runtimeSession.merge.conflicts.map((conflict) => (
										<div key={conflict.conflictId} className="text-[10px]">
											<p className="font-medium">{conflict.targetReference}</p>
											<p className="mt-0.5 leading-relaxed text-muted-foreground">
												{conflict.description}
											</p>
											<p className="mt-0.5 font-mono text-[8px] text-muted-foreground">
												{conflict.roles.join(" + ")}
											</p>
										</div>
									))}
								</div>
							)}
						</section>
					</div>
					<div className="mt-4 flex items-start gap-2 border-t pt-3 text-[9px] leading-relaxed text-muted-foreground">
						<ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
						<p>
							IndexedDB
							保存输入证据、提供方/模型、时间、耗时、失败、重试、结构化产物、冲突、建议审批和撤销回执；API
							Key 只在当前会话闭包中用于请求，不进入运行时或审计记录。
						</p>
					</div>
				</footer>
			) : null}
		</div>
	);
}
