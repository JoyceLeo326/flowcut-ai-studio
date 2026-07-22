"use client";

import {
	AlertTriangle,
	Check,
	CheckCheck,
	CircleDashed,
	CircleDot,
	LockKeyhole,
	ShieldCheck,
	X,
	type LucideIcon,
} from "lucide-react";
import {
	approveAllEditPlanOperations,
	approveEditPlanOperation,
	rejectAllEditPlanOperations,
	rejectEditPlanOperation,
	type EditPlanOperationStatus,
	type EditPlanRiskLevel,
	type ReviewableEditPlanOperation,
	type VersionedEditPlan,
} from "@/ai-studio/edit-plan";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/ui";

export interface VisionCutOperationReviewProps {
	plan: VersionedEditPlan;
	onPlanChange: (next: VersionedEditPlan) => void;
	disabled?: boolean;
}

interface StatusPresentation {
	label: string;
	icon: LucideIcon;
	className: string;
}

const STATUS_PRESENTATION: Record<EditPlanOperationStatus, StatusPresentation> =
	{
		proposed: {
			label: "待决定",
			icon: CircleDashed,
			className: "border-border bg-background text-muted-foreground",
		},
		approved: {
			label: "已批准",
			icon: Check,
			className:
				"border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
		},
		rejected: {
			label: "已拒绝",
			icon: X,
			className: "border-destructive/35 bg-destructive/10 text-destructive",
		},
		applied: {
			label: "已锁定",
			icon: LockKeyhole,
			className: "border-border bg-muted text-foreground",
		},
	};

const RISK_PRESENTATION: Record<
	EditPlanRiskLevel,
	{ label: string; className: string }
> = {
	low: {
		label: "低风险",
		className: "text-emerald-700 dark:text-emerald-400",
	},
	medium: {
		label: "中风险",
		className: "text-amber-700 dark:text-amber-400",
	},
	high: {
		label: "高风险",
		className: "text-destructive",
	},
};

function StatusBadge({ status }: { status: EditPlanOperationStatus }) {
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

function OperationDetail({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-2 text-xs leading-relaxed">
			<span className="font-medium text-muted-foreground">{label}</span>
			<div className="min-w-0 text-foreground/85">{children}</div>
		</div>
	);
}

function OperationRow({
	operation,
	plan,
	onPlanChange,
	disabled,
}: {
	operation: ReviewableEditPlanOperation;
	plan: VersionedEditPlan;
	onPlanChange: (next: VersionedEditPlan) => void;
	disabled: boolean;
}) {
	const risk = RISK_PRESENTATION[operation.risk.level];
	const isApplied = operation.status === "applied";

	return (
		<article className="border-t py-3 first:border-t-0">
			<div className="flex min-w-0 items-start justify-between gap-3">
				<div className="min-w-0">
					<h4 className="text-sm font-semibold leading-snug">
						{operation.title}
					</h4>
					<p className="mt-0.5 break-words text-[11px] text-muted-foreground">
						{operation.target}
					</p>
				</div>
				<StatusBadge status={operation.status} />
			</div>

			<div className="mt-3 space-y-2">
				<OperationDetail label="理由">{operation.reason}</OperationDetail>
				<OperationDetail label="预期">
					{operation.expectedImpact}
				</OperationDetail>
				<OperationDetail label="风险">
					<span className={cn("mr-1.5 font-medium", risk.className)}>
						{risk.label}
					</span>
					{operation.risk.description}
				</OperationDetail>
			</div>

			<div className="mt-3 flex items-center justify-end gap-2">
				<Button
					variant={operation.status === "rejected" ? "destructive" : "outline"}
					size="icon"
					className="size-11 rounded-[6px] xl:size-9"
					disabled={disabled || isApplied || operation.status === "rejected"}
					aria-label={`拒绝：${operation.title}`}
					aria-pressed={operation.status === "rejected"}
					title="拒绝这项操作"
					onClick={() =>
						onPlanChange(
							rejectEditPlanOperation({
								plan,
								operationId: operation.id,
							}),
						)
					}
				>
					<X aria-hidden="true" />
				</Button>
				<Button
					variant={operation.status === "approved" ? "default" : "outline"}
					size="icon"
					className="size-11 rounded-[6px] xl:size-9"
					disabled={disabled || isApplied || operation.status === "approved"}
					aria-label={`批准：${operation.title}`}
					aria-pressed={operation.status === "approved"}
					title="批准这项操作"
					onClick={() =>
						onPlanChange(
							approveEditPlanOperation({
								plan,
								operationId: operation.id,
							}),
						)
					}
				>
					<Check aria-hidden="true" />
				</Button>
			</div>
		</article>
	);
}

export function VisionCutOperationReview({
	plan,
	onPlanChange,
	disabled = false,
}: VisionCutOperationReviewProps) {
	const operations = plan.groups.flatMap((group) => group.operations);
	const reviewableOperations = operations.filter(
		(operation) => operation.status !== "applied",
	);
	const approvedCount = operations.filter(
		(operation) => operation.status === "approved",
	).length;
	const rejectedCount = operations.filter(
		(operation) => operation.status === "rejected",
	).length;
	const allReviewableApproved = reviewableOperations.every(
		(operation) => operation.status === "approved",
	);
	const allReviewableRejected = reviewableOperations.every(
		(operation) => operation.status === "rejected",
	);
	const hasReviewableOperations = reviewableOperations.length > 0;

	return (
		<div className="min-w-0">
			<header className="px-3 pb-3 pt-2 sm:px-4">
				<div className="flex min-w-0 items-start gap-3">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-[6px] border bg-muted/45">
						<ShieldCheck className="size-4" aria-hidden="true" />
					</div>
					<div className="min-w-0 flex-1">
						<h3 className="text-sm font-semibold">逐项审阅制作计划</h3>
						<p className="mt-1 break-all text-[11px] leading-relaxed text-muted-foreground">
							修订 {plan.revision} · {plan.versionId}
						</p>
					</div>
				</div>

				<div
					className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
					aria-live="polite"
				>
					<span>共 {operations.length} 项</span>
					<span className="text-emerald-700 dark:text-emerald-400">
						已批准 {approvedCount}
					</span>
					<span className="text-destructive">已拒绝 {rejectedCount}</span>
				</div>
			</header>

			<div className="border-y bg-muted/25 px-3 py-3 sm:px-4" role="note">
				<div className="flex items-start gap-2.5">
					<AlertTriangle
						className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400"
						aria-hidden="true"
					/>
					<p className="text-xs leading-relaxed text-muted-foreground">
						本计划来自创作意图与工作流，尚未分析素材内容。这里只记录批准或拒绝状态，不会修改时间线或媒体。
					</p>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-2 px-3 py-3 sm:px-4">
				<Button
					variant="outline"
					className="min-h-11 rounded-[6px] px-3"
					disabled={
						disabled || !hasReviewableOperations || allReviewableRejected
					}
					onClick={() => onPlanChange(rejectAllEditPlanOperations({ plan }))}
				>
					<X aria-hidden="true" />
					全部拒绝
				</Button>
				<Button
					className="min-h-11 rounded-[6px] px-3"
					disabled={
						disabled || !hasReviewableOperations || allReviewableApproved
					}
					onClick={() => onPlanChange(approveAllEditPlanOperations({ plan }))}
				>
					<CheckCheck aria-hidden="true" />
					全部批准
				</Button>
			</div>

			<div className="border-t">
				{plan.groups.map((group) => (
					<section
						key={group.domain}
						aria-labelledby={`review-${group.domain}`}
					>
						<div className="border-b bg-muted/15 px-3 py-3 sm:px-4">
							<div className="flex items-center justify-between gap-3">
								<div className="flex min-w-0 items-center gap-2">
									<CircleDot
										className="size-3.5 shrink-0 text-muted-foreground"
										aria-hidden="true"
									/>
									<h3
										id={`review-${group.domain}`}
										className="text-xs font-semibold"
									>
										{group.label}
									</h3>
								</div>
								<span className="shrink-0 text-[11px] text-muted-foreground">
									{group.operations.length} 项
								</span>
							</div>
							<p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
								{group.objective}
							</p>
						</div>

						<div className="px-3 sm:px-4">
							{group.operations.map((operation) => (
								<OperationRow
									key={operation.id}
									operation={operation}
									plan={plan}
									onPlanChange={onPlanChange}
									disabled={disabled}
								/>
							))}
						</div>
					</section>
				))}
			</div>
		</div>
	);
}
