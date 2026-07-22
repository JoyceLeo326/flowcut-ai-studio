"use client";

import {
	AlertCircle,
	ArrowRight,
	Ban,
	BookOpenText,
	Check,
	CheckCircle2,
	CircleDashed,
	Clock3,
	Clapperboard,
	Database,
	GitBranch,
	LoaderCircle,
	Music2,
	Palette,
	Play,
	RotateCcw,
	Scissors,
	ShieldCheck,
	Sparkles,
	Target,
	TrendingUp,
	X,
	type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import {
	approveAgentTask,
	completeAgentTask,
	failAgentTask,
	rejectAgentTask,
	retryAgentTask,
	startAgentTask,
	type AgentEvidenceKind,
	type AgentOrchestration,
	type AgentRole,
	type AgentTask,
	type AgentTaskStatus,
} from "@/ai-studio/agent-orchestrator";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/ui";

export interface VisionCutAgentOrchestrationProps {
	orchestration: AgentOrchestration;
	onChange: (next: AgentOrchestration) => void;
	disabled?: boolean;
}

interface RolePresentation {
	label: string;
	description: string;
	icon: LucideIcon;
}

interface StatusPresentation {
	label: string;
	icon: LucideIcon;
	className: string;
}

const ROLE_PRESENTATION: Record<AgentRole, RolePresentation> = {
	director: {
		label: "导演",
		description: "把创作意图与已引用证据整理成制作简报",
		icon: Clapperboard,
	},
	story: {
		label: "故事",
		description: "在导演简报基础上组织可审阅的叙事结构",
		icon: BookOpenText,
	},
	editor: {
		label: "剪辑",
		description: "依据故事方案与媒体证据提出可逆剪辑决策",
		icon: Scissors,
	},
	color: {
		label: "调色",
		description: "根据意图与视觉证据规划色彩处理",
		icon: Palette,
	},
	sound: {
		label: "声音",
		description: "根据音频证据规划对白、音乐、环境与混音",
		icon: Music2,
	},
	growth: {
		label: "增长",
		description: "围绕受众与发布目标规划包装和分发",
		icon: TrendingUp,
	},
};

const STATUS_PRESENTATION: Record<AgentTaskStatus, StatusPresentation> = {
	blocked: {
		label: "被阻塞",
		icon: AlertCircle,
		className:
			"border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
	},
	"awaiting-approval": {
		label: "待审批",
		icon: Clock3,
		className: "border-border bg-muted/35 text-muted-foreground",
	},
	ready: {
		label: "可运行",
		icon: Play,
		className: "border-foreground/25 bg-foreground/5 text-foreground",
	},
	running: {
		label: "运行中",
		icon: LoaderCircle,
		className: "border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-300",
	},
	succeeded: {
		label: "计划已生成",
		icon: CheckCircle2,
		className:
			"border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
	},
	failed: {
		label: "失败",
		icon: AlertCircle,
		className: "border-destructive/35 bg-destructive/10 text-destructive",
	},
	rejected: {
		label: "已拒绝",
		icon: Ban,
		className: "border-border bg-muted text-muted-foreground",
	},
};

const EVIDENCE_KIND_LABELS: Record<AgentEvidenceKind, string> = {
	"intent-spec": "创作意图",
	"publication-target": "发布目标",
	"asset-metadata": "素材元数据",
	"audio-metadata": "音频元数据",
	"scene-analysis": "场景分析",
	transcript: "转写文本",
	"visual-analysis": "视觉分析",
	"audio-analysis": "音频分析",
	"audience-brief": "受众简报",
	"brand-guideline": "品牌规范",
	"style-reference": "风格参考",
	"performance-data": "表现数据",
	"human-note": "人工备注",
};

const LIMITATION_TRANSLATIONS: Record<string, string> = {
	"This task produces a reviewable plan reference only; it does not analyze or mutate media.":
		"此任务只生成可审阅的计划引用，不分析或修改媒体。",
	"Local rules can organize intent and evidence, but cannot claim creative model judgment.":
		"本地规则可以组织意图和证据，但不会冒充大模型的创意判断。",
	"Without transcript or scene evidence, story suggestions must remain conceptual and must not describe unseen footage.":
		"缺少转写或场景证据时，故事建议只能停留在概念层，不能描述未读取的画面。",
	"No cut, trim, timing, or footage-quality claim is valid without referenced media evidence.":
		"没有媒体证据时，不会声称已经判断切点、修剪、节奏或素材质量。",
	"The task cannot claim exposure, palette, skin-tone, or grading findings without imported visual evidence.":
		"没有导入视觉证据时，不会声称已经判断曝光、色板、肤色或调色问题。",
	"The task cannot claim silence, loudness, speech quality, or music fit without cited audio evidence.":
		"没有音频证据时，不会声称已经判断静音、响度、语音质量或音乐适配度。",
	"The task cannot claim predicted retention or virality without cited performance evidence.":
		"没有表现数据时，不会声称已经预测留存或传播效果。",
};

function transitionTimestamp({
	orchestration,
	offset = 1,
}: {
	orchestration: AgentOrchestration;
	offset?: number;
}): string {
	const updatedAt = Date.parse(orchestration.updatedAt);
	const baseline = Number.isFinite(updatedAt) ? updatedAt : 0;
	return new Date(Math.max(Date.now(), baseline) + offset).toISOString();
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "本地状态转换失败。";
}

function localArtifactReference(outputId: string): string {
	return `local-rule-result:${outputId}`;
}

function formatTime(value: string | null): string {
	if (value === null) return "尚未决定";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat("zh-CN", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

function StatusBadge({ status }: { status: AgentTaskStatus }) {
	const presentation = STATUS_PRESENTATION[status];
	const Icon = presentation.icon;

	return (
		<span
			className={cn(
				"inline-flex min-h-6 shrink-0 items-center gap-1 rounded-[5px] border px-2 text-[11px] font-medium",
				presentation.className,
			)}
		>
			<Icon className="size-3.5" aria-hidden="true" />
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

function AgentTaskRow({
	task,
	orchestration,
	onChange,
	disabled,
}: {
	task: AgentTask;
	orchestration: AgentOrchestration;
	onChange: (next: AgentOrchestration) => void;
	disabled: boolean;
}) {
	const role = ROLE_PRESENTATION[task.role];
	const RoleIcon = role.icon;
	const [rejectionOpen, setRejectionOpen] = useState(false);
	const [rejectionNote, setRejectionNote] = useState("");
	const [actionError, setActionError] = useState<string | null>(null);
	const dependencies = task.dependencyTaskIds
		.map((taskId) =>
			orchestration.tasks.find((candidate) => candidate.taskId === taskId),
		)
		.filter((candidate): candidate is AgentTask => candidate !== undefined);
	const evidence = task.inputEvidenceIds
		.map((evidenceId) =>
			orchestration.evidence.find(
				(candidate) => candidate.evidenceId === evidenceId,
			),
		)
		.filter((candidate) => candidate !== undefined);
	const canDecide = task.approvalGate.status === "pending";
	const canRetry =
		task.status === "failed" &&
		task.failure?.retryable === true &&
		task.retryCount < task.maxRetries;

	const emit = (next: AgentOrchestration) => {
		setActionError(null);
		onChange(next);
	};

	const handleApprove = () => {
		try {
			emit(
				approveAgentTask({
					orchestration,
					taskId: task.taskId,
					approvedBy: "local-user",
					at: transitionTimestamp({ orchestration }),
					note: "用户在 Multi-Agent 工作台明确批准此任务。",
				}),
			);
		} catch (error) {
			setActionError(errorMessage(error));
		}
	};

	const handleReject = () => {
		const note = rejectionNote.trim();
		if (!note) {
			setActionError("请先填写拒绝原因，便于后续版本理解这次决定。");
			return;
		}
		try {
			emit(
				rejectAgentTask({
					orchestration,
					taskId: task.taskId,
					rejectedBy: "local-user",
					at: transitionTimestamp({ orchestration }),
					note,
				}),
			);
			setRejectionOpen(false);
			setRejectionNote("");
		} catch (error) {
			setActionError(errorMessage(error));
		}
	};

	const handleRun = () => {
		let started: AgentOrchestration | null = null;
		try {
			started = startAgentTask({
				orchestration,
				taskId: task.taskId,
				at: transitionTimestamp({ orchestration }),
			});
			const startedTask = started.tasks.find(
				(candidate) => candidate.taskId === task.taskId,
			);
			if (startedTask === undefined) {
				throw new Error("运行后的任务状态不存在。");
			}
			const completed = completeAgentTask({
				orchestration: started,
				taskId: task.taskId,
				at: transitionTimestamp({ orchestration: started }),
				outputs: startedTask.outputReferences.map((output) => ({
					outputId: output.outputId,
					artifactReference: localArtifactReference(output.outputId),
					origin: "local-rule-result" as const,
				})),
			});
			emit(completed);
		} catch (error) {
			const message = errorMessage(error);
			if (started !== null) {
				try {
					emit(
						failAgentTask({
							orchestration: started,
							taskId: task.taskId,
							at: transitionTimestamp({ orchestration: started }),
							code: "local-rule-runtime-error",
							message,
							retryable: true,
						}),
					);
				} catch (failureError) {
					setActionError(
						`${message}；记录失败状态时又发生：${errorMessage(failureError)}`,
					);
				}
			} else {
				setActionError(message);
			}
		}
	};

	const handleRetry = () => {
		try {
			emit(
				retryAgentTask({
					orchestration,
					taskId: task.taskId,
					at: transitionTimestamp({ orchestration }),
				}),
			);
		} catch (error) {
			setActionError(errorMessage(error));
		}
	};

	return (
		<article
			className="px-3 py-4 sm:px-4"
			aria-labelledby={`agent-${task.role}`}
		>
			<div className="flex min-w-0 items-start gap-3">
				<div className="flex size-10 shrink-0 items-center justify-center rounded-[7px] border bg-muted/35">
					<RoleIcon className="size-4.5" aria-hidden="true" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
						<div className="min-w-0">
							<h3 id={`agent-${task.role}`} className="text-sm font-semibold">
								{role.label} Agent
							</h3>
							<p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
								{role.description}
							</p>
						</div>
						<StatusBadge status={task.status} />
					</div>
				</div>
			</div>

			<div className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2">
				<section>
					<SectionLabel icon={GitBranch}>任务依赖</SectionLabel>
					<div className="mt-1 space-y-1.5">
						{dependencies.length === 0 ? (
							<p className="text-[11px] text-muted-foreground">
								无前置任务，可独立审批。
							</p>
						) : (
							dependencies.map((dependency) => {
								const DependencyIcon = ROLE_PRESENTATION[dependency.role].icon;
								return (
									<div
										key={dependency.taskId}
										className="flex min-w-0 items-center gap-2 text-[11px]"
									>
										<DependencyIcon
											className="size-3.5 shrink-0 text-muted-foreground"
											aria-hidden="true"
										/>
										<span className="min-w-0 flex-1 truncate">
											{ROLE_PRESENTATION[dependency.role].label}
										</span>
										<ArrowRight
											className="size-3 shrink-0 text-muted-foreground"
											aria-hidden="true"
										/>
										<span className="shrink-0 text-muted-foreground">
											{STATUS_PRESENTATION[dependency.status].label}
										</span>
									</div>
								);
							})
						)}
					</div>
				</section>

				<section>
					<SectionLabel icon={Database}>引用证据</SectionLabel>
					<div className="mt-1 space-y-1.5">
						{evidence.map((item) => (
							<div
								key={item.evidenceId}
								className="flex min-w-0 items-center gap-2 text-[11px]"
							>
								<Check
									className="size-3.5 shrink-0 text-emerald-600"
									aria-hidden="true"
								/>
								<span className="min-w-0 flex-1 truncate">{item.label}</span>
								<span className="shrink-0 text-[9px] text-muted-foreground">
									{EVIDENCE_KIND_LABELS[item.kind]}
								</span>
							</div>
						))}
					</div>
				</section>
			</div>

			<section className="mt-4 border-y py-3">
				<SectionLabel icon={Target}>证据门槛</SectionLabel>
				<div className="mt-1.5 space-y-2">
					{task.evidenceRequirements.map((requirement) => {
						const matchingCount = orchestration.evidence.filter((item) =>
							requirement.anyOfKinds.includes(item.kind),
						).length;
						const satisfied = matchingCount >= requirement.minimum;
						return (
							<div
								key={requirement.requirementId}
								className="flex items-start gap-2 text-[11px]"
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
								<div className="min-w-0 flex-1">
									<p className="leading-relaxed">{requirement.description}</p>
									<p className="mt-0.5 text-[9px] text-muted-foreground">
										{matchingCount}/{requirement.minimum} ·{" "}
										{requirement.anyOfKinds
											.map((kind) => EVIDENCE_KIND_LABELS[kind])
											.join(" / ")}
									</p>
								</div>
							</div>
						);
					})}
				</div>
			</section>

			{task.blockers.length > 0 ? (
				<section className="mt-3" aria-label="当前阻塞">
					<SectionLabel icon={AlertCircle}>当前阻塞</SectionLabel>
					<div className="mt-1.5 space-y-1.5">
						{task.blockers.map((blocker) => (
							<div
								key={`${blocker.kind}-${blocker.referenceId}`}
								className="flex items-start gap-2 text-[11px] text-amber-800 dark:text-amber-200"
							>
								<AlertCircle
									className="mt-0.5 size-3.5 shrink-0"
									aria-hidden="true"
								/>
								<p className="min-w-0 leading-relaxed">{blocker.message}</p>
							</div>
						))}
					</div>
				</section>
			) : null}

			<section className="mt-4 grid gap-4 sm:grid-cols-2">
				<div>
					<SectionLabel icon={ShieldCheck}>人工审批</SectionLabel>
					<p className="mt-1 text-[11px] leading-relaxed">
						{task.approvalGate.status === "pending"
							? "等待你明确批准或拒绝，未审批不会运行。"
							: `${task.approvalGate.status === "approved" ? "已批准" : "已拒绝"} · ${formatTime(task.approvalGate.decidedAt)}`}
					</p>
					{task.approvalGate.note ? (
						<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
							{task.approvalGate.note}
						</p>
					) : null}
				</div>

				<div>
					<SectionLabel icon={Sparkles}>计划输出</SectionLabel>
					<div className="mt-1 space-y-2">
						{task.outputReferences.map((output) => (
							<div key={output.outputId} className="min-w-0 text-[11px]">
								<div className="flex items-center gap-2">
									{output.state === "available" ? (
										<CheckCircle2
											className="size-3.5 shrink-0 text-emerald-600"
											aria-hidden="true"
										/>
									) : (
										<CircleDashed
											className="size-3.5 shrink-0 text-muted-foreground"
											aria-hidden="true"
										/>
									)}
									<span>{output.label}</span>
								</div>
								<p className="mt-1 break-all font-mono text-[9px] text-muted-foreground">
									{output.artifactReference ?? output.outputId}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			<section className="mt-4 border-t pt-3">
				<SectionLabel icon={AlertCircle}>能力边界</SectionLabel>
				<ul className="mt-1.5 space-y-1.5 text-[10px] leading-relaxed text-muted-foreground">
					{task.limitations.map((limitation) => (
						<li key={limitation} className="flex items-start gap-2">
							<span className="mt-[0.45rem] size-1 shrink-0 rounded-full bg-muted-foreground/60" />
							<span>{LIMITATION_TRANSLATIONS[limitation] ?? limitation}</span>
						</li>
					))}
				</ul>
			</section>

			{task.failure ? (
				<div
					className="mt-4 border-y border-destructive/30 bg-destructive/5 py-3"
					role="alert"
				>
					<div className="flex items-start gap-2">
						<AlertCircle
							className="mt-0.5 size-4 shrink-0 text-destructive"
							aria-hidden="true"
						/>
						<div className="min-w-0">
							<p className="text-[11px] font-semibold text-destructive">
								本地规则运行失败
							</p>
							<p className="mt-1 break-words text-[10px] leading-relaxed text-muted-foreground">
								{task.failure.message}
							</p>
							<p className="mt-1 font-mono text-[9px] text-muted-foreground">
								{task.failure.code} · 尝试 {task.failure.attempt}
							</p>
						</div>
					</div>
				</div>
			) : null}

			{actionError ? (
				<p
					className="mt-3 text-[11px] leading-relaxed text-destructive"
					role="alert"
				>
					{actionError}
				</p>
			) : null}

			{rejectionOpen && canDecide ? (
				<div className="mt-4 border-t pt-3">
					<label
						htmlFor={`reject-${task.taskId}`}
						className="text-[11px] font-medium"
					>
						拒绝原因
					</label>
					<textarea
						id={`reject-${task.taskId}`}
						value={rejectionNote}
						disabled={disabled}
						maxLength={500}
						placeholder="说明为什么不让这个 Agent 继续"
						className="mt-2 min-h-20 w-full resize-y rounded-[6px] border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
						onChange={(event) => setRejectionNote(event.target.value)}
					/>
					<p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
						拒绝会终止当前版本中的该任务；依赖它的任务将保持阻塞。
					</p>
					<div className="mt-3 grid grid-cols-2 gap-2">
						<Button
							variant="outline"
							className="min-h-11 rounded-[6px]"
							disabled={disabled}
							onClick={() => {
								setRejectionOpen(false);
								setActionError(null);
							}}
						>
							取消
						</Button>
						<Button
							variant="destructive"
							className="min-h-11 rounded-[6px]"
							disabled={disabled || rejectionNote.trim().length === 0}
							onClick={handleReject}
						>
							<X aria-hidden="true" />
							确认拒绝
						</Button>
					</div>
				</div>
			) : (
				<div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-3">
					{canDecide ? (
						<>
							<Button
								variant="outline"
								className="min-h-11 rounded-[6px] px-3"
								disabled={disabled}
								onClick={() => {
									setRejectionOpen(true);
									setActionError(null);
								}}
							>
								<X aria-hidden="true" />
								拒绝
							</Button>
							<Button
								className="min-h-11 rounded-[6px] px-3"
								disabled={disabled}
								onClick={handleApprove}
							>
								<Check aria-hidden="true" />
								批准任务
							</Button>
						</>
					) : null}
					{task.status === "ready" ? (
						<Button
							className="min-h-11 rounded-[6px] px-3"
							disabled={disabled}
							onClick={handleRun}
						>
							<Play aria-hidden="true" />
							运行本地规则
						</Button>
					) : null}
					{task.status === "failed" ? (
						<Button
							variant="outline"
							className="min-h-11 rounded-[6px] px-3"
							disabled={disabled || !canRetry}
							onClick={handleRetry}
						>
							<RotateCcw aria-hidden="true" />
							{canRetry ? "准备重试" : "不可重试"}
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
	disabled = false,
}: VisionCutAgentOrchestrationProps) {
	const succeededCount = orchestration.tasks.filter(
		(task) => task.status === "succeeded",
	).length;
	const actionableCount = orchestration.tasks.filter(
		(task) => task.status === "ready" || task.status === "awaiting-approval",
	).length;
	const blockedCount = orchestration.tasks.filter(
		(task) => task.status === "blocked",
	).length;

	return (
		<div className="min-w-0 pb-5">
			<header className="px-3 pb-4 pt-2 sm:px-4">
				<div className="flex min-w-0 items-start gap-3">
					<div className="flex size-10 shrink-0 items-center justify-center rounded-[7px] border bg-foreground text-background">
						<GitBranch className="size-5" aria-hidden="true" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
							<h2 className="text-sm font-semibold">Multi-Agent 制作台</h2>
							<span className="text-[10px] text-muted-foreground">
								修订 {orchestration.revision}
							</span>
						</div>
						<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
							六个专业角色按真实依赖逐步产生可审阅计划，每一步都需要你的明确决定。
						</p>
					</div>
				</div>

				<div
					className="mt-4 grid grid-cols-3 divide-x border-y text-center"
					aria-live="polite"
				>
					{[
						["计划已生成", succeededCount],
						["可处理", actionableCount],
						["被阻塞", blockedCount],
					].map(([label, value]) => (
						<div key={label} className="min-w-0 px-2 py-2.5">
							<p className="text-[9px] text-muted-foreground">{label}</p>
							<p className="mt-1 text-xs font-semibold">{value}</p>
						</div>
					))}
				</div>
			</header>

			<div className="border-y bg-muted/20 px-3 py-3 sm:px-4" role="note">
				<div className="flex items-start gap-2.5">
					<ShieldCheck
						className="mt-0.5 size-4 shrink-0 text-emerald-600"
						aria-hidden="true"
					/>
					<div className="min-w-0">
						<p className="text-[11px] font-medium">本地规则的真实边界</p>
						<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
							当前编排不联网、不调用模型、不分析素材，也不修改媒体。运行只会生成带稳定引用的计划结果。
						</p>
					</div>
				</div>
			</div>

			<div className="divide-y">
				{orchestration.tasks.map((task) => (
					<AgentTaskRow
						key={task.taskId}
						task={task}
						orchestration={orchestration}
						onChange={onChange}
						disabled={disabled}
					/>
				))}
			</div>
		</div>
	);
}
