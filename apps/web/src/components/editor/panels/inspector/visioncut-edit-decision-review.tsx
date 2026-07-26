"use client";

import {
	CheckCircle2,
	Clock3,
	Film,
	Layers3,
	Scissors,
	ShieldAlert,
	Undo2,
} from "lucide-react";
import type {
	EditDecisionOperation,
	LocalEditDecisionOrchestration,
} from "@/ai-studio/edit-decision-orchestrator";
import type { StudioExecutionPolicy } from "@/ai-studio/studio-execution-policy";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/utils/ui";

export interface VisionCutEditDecisionReviewProps {
	orchestration: LocalEditDecisionOrchestration;
	assetNames: Readonly<Record<string, string>>;
	approvedOperationIds: ReadonlySet<string>;
	onToggleOperation: ({
		operationId,
		approved,
	}: {
		operationId: string;
		approved: boolean;
	}) => void;
	onApply: () => void;
	applied?: boolean;
	canUndo?: boolean;
	onUndo?: () => void;
	executionPolicy?: StudioExecutionPolicy | null;
	operationApplicability?: Readonly<
		Record<
			string,
			{
				readonly canApply: boolean;
				readonly reason: string | null;
			}
		>
	>;
	canCreateAssembly?: boolean;
	onCreateAssembly?: () => void;
}

const OPERATION_LABELS: Record<EditDecisionOperation["kind"], string> = {
	trim: "边缘停顿",
	remove: "片中停顿",
	reorder: "素材顺序",
	primary: "主叙事候选",
	"b-roll": "B-roll 候选",
};

function formatTime(seconds: number): string {
	const safeSeconds = Math.max(0, seconds);
	const minutes = Math.floor(safeSeconds / 60);
	const remaining = safeSeconds - minutes * 60;
	return `${minutes}:${remaining.toFixed(2).padStart(5, "0")}`;
}

function formatRange(operation: EditDecisionOperation): string {
	return `${formatTime(operation.sourceRange.startSeconds)} - ${formatTime(
		operation.sourceRange.endSeconds,
	)}`;
}

function canApproveCut(operation: EditDecisionOperation): boolean {
	return (
		(operation.kind === "trim" || operation.kind === "remove") &&
		operation.availability !== "blocked"
	);
}

function SuggestionRow({
	operation,
	assetName,
}: {
	operation: EditDecisionOperation;
	assetName: string;
}) {
	return (
		<li className="flex min-w-0 items-start gap-2.5 border-t py-2.5 first:border-t-0">
			<div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-[6px] border text-muted-foreground">
				{operation.kind === "primary" ? (
					<Film className="size-3.5" aria-hidden="true" />
				) : (
					<Layers3 className="size-3.5" aria-hidden="true" />
				)}
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
					<p className="truncate text-[11px] font-medium">{assetName}</p>
					<span className="text-[10px] text-muted-foreground">
						{OPERATION_LABELS[operation.kind]} · {formatRange(operation)}
					</span>
				</div>
				<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
					{operation.availabilityReason}
				</p>
			</div>
		</li>
	);
}

export function VisionCutEditDecisionReview({
	orchestration,
	assetNames,
	approvedOperationIds,
	onToggleOperation,
	onApply,
	applied = false,
	canUndo = false,
	onUndo,
	executionPolicy,
	operationApplicability = {},
	canCreateAssembly = false,
	onCreateAssembly,
}: VisionCutEditDecisionReviewProps) {
	const { plan, review } = orchestration;
	const cutItems = review.items.filter(({ operation }) =>
		canApproveCut(operation),
	);
	const contextItems = review.items.filter(
		({ operation }) =>
			operation.kind === "primary" || operation.kind === "b-roll",
	);
	const approvedCount = cutItems.filter(
		({ operation }) =>
			approvedOperationIds.has(operation.operationId) &&
			(operationApplicability[operation.operationId]?.canApply ?? true),
	).length;
	const stale = review.freshness.state === "stale";

	return (
		<section className="overflow-hidden rounded-[8px] border">
			<header className="flex items-start gap-3 border-b px-3 py-3">
				<div className="flex size-8 shrink-0 items-center justify-center rounded-[6px] bg-foreground text-background">
					<Scissors className="size-4" aria-hidden="true" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<h3 className="text-xs font-semibold">素材决策审查</h3>
						<span
							className={cn(
								"text-[10px]",
								stale ? "text-destructive" : "text-emerald-700",
							)}
						>
							{stale
								? "证据已变化"
								: `${plan.inputs.assets.length} 个素材已绑定`}
						</span>
					</div>
					<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
						本地采样只定位画面变化和低能量区间。每个切口都要由你批准，主叙事与
						B-roll 只保留为建议。
					</p>
				</div>
			</header>

			{stale ? (
				<div className="flex items-start gap-2.5 border-b bg-destructive/5 px-3 py-3 text-destructive">
					<ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
					<div className="min-w-0">
						<p className="text-[11px] font-medium">素材或分析版本已经变化</p>
						<p className="mt-1 text-[10px] leading-relaxed">
							请重新分析后再生成决策。本版本不会继续执行旧时间码。
						</p>
					</div>
				</div>
			) : null}

			<div className="grid grid-cols-3 border-b">
				{[
					["候选切口", cutItems.length],
					["已批准", approvedCount],
					["内容建议", contextItems.length],
				].map(([label, value], index) => (
					<div
						key={String(label)}
						className={cn("min-w-0 px-3 py-2.5", index > 0 && "border-l")}
					>
						<p className="text-[9px] text-muted-foreground">{label}</p>
						<p className="mt-1 text-xs font-semibold">{value}</p>
					</div>
				))}
			</div>

			{executionPolicy ? (
				<details className="border-b">
					<summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-[11px] font-medium [&::-webkit-details-marker]:hidden">
						<span>专业控制如何影响本次决策</span>
						<span className="text-[10px] text-muted-foreground">
							{executionPolicy.roughCut.candidateGenerationStatus ===
							"automatic"
								? "采样候选已生效"
								: "等待音频采样"}
						</span>
					</summary>
					<div className="grid grid-cols-2 border-t text-[10px] min-[420px]:grid-cols-3">
						{[
							["静音阈值", `${executionPolicy.settings.silenceThresholdMs} ms`],
							["切口余量", `${executionPolicy.settings.cutPaddingMs} ms`],
							["镜头灵敏度", `${executionPolicy.settings.sceneSensitivity}%`],
							[
								"目标响度",
								`${executionPolicy.delivery.targetIntegratedLufs} LUFS`,
							],
							["交付版本", `${executionPolicy.variants.count} 个`],
							[
								"填充词",
								executionPolicy.filler.status === "blocked"
									? "等待逐字证据"
									: "逐项审阅",
							],
						].map(([label, value]) => (
							<div key={label} className="min-w-0 border-r border-t p-2.5">
								<p className="text-muted-foreground">{label}</p>
								<p className="mt-1 truncate font-medium">{value}</p>
							</div>
						))}
					</div>
					<p className="border-t px-3 py-2 text-[9px] leading-relaxed text-muted-foreground">
						参数只控制候选生成与交付要求。所有破坏性切口仍需逐项批准；没有响度测量、逐字时间码或人物跟踪时，不会宣称已经完成母带、口头禅清理或智能推近。
					</p>
				</details>
			) : null}

			{cutItems.length > 0 ? (
				<div className="px-3">
					{cutItems.map(({ operation }) => {
						const checkboxId = `decision-${operation.operationId}`;
						const checked = approvedOperationIds.has(operation.operationId);
						const applicability = operationApplicability[operation.operationId];
						const timelineBlocked = applicability?.canApply === false;
						return (
							<div
								key={operation.operationId}
								className="flex min-w-0 items-start gap-3 border-t py-3 first:border-t-0"
							>
								<Checkbox
									id={checkboxId}
									className="mt-0.5 size-5"
									checked={checked}
									disabled={stale || applied || timelineBlocked}
									onCheckedChange={(value) =>
										onToggleOperation({
											operationId: operation.operationId,
											approved: value === true,
										})
									}
								/>
								<label
									htmlFor={checkboxId}
									className={cn(
										"min-w-0 flex-1 cursor-pointer",
										(stale || applied || timelineBlocked) &&
											"cursor-default opacity-70",
									)}
								>
									<span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
										<span className="truncate text-[11px] font-medium">
											{assetNames[operation.assetId] ?? operation.assetId}
										</span>
										<span className="flex items-center gap-1 text-[10px] text-muted-foreground">
											<Clock3 className="size-3" aria-hidden="true" />
											{formatRange(operation)}
										</span>
									</span>
									<span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
										{operation.reason}
									</span>
									<span className="mt-1 block text-[9px] text-muted-foreground">
										{operation.evidenceIds.length} 条采样证据 ·{" "}
										{OPERATION_LABELS[operation.kind]}
									</span>
									{timelineBlocked ? (
										<span className="mt-1 block text-[9px] leading-relaxed text-amber-700 dark:text-amber-300">
											当前时间线暂不可执行：{applicability.reason}
										</span>
									) : null}
								</label>
							</div>
						);
					})}
				</div>
			) : (
				<div className="px-3 py-4 text-[10px] text-muted-foreground">
					没有发现达到本地规则阈值的低能量切口。
				</div>
			)}

			{contextItems.length > 0 ? (
				<details className="border-t">
					<summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-[11px] font-medium [&::-webkit-details-marker]:hidden">
						<span>查看主叙事与 B-roll 候选</span>
						<span className="text-[10px] text-muted-foreground">
							{contextItems.length} 条 · 不自动执行
						</span>
					</summary>
					<ul className="border-t px-3">
						{contextItems.map(({ operation }) => (
							<SuggestionRow
								key={operation.operationId}
								operation={operation}
								assetName={assetNames[operation.assetId] ?? operation.assetId}
							/>
						))}
					</ul>
				</details>
			) : null}

			<footer className="flex flex-col gap-2 border-t p-3 sm:flex-row">
				{canCreateAssembly && onCreateAssembly ? (
					<Button
						variant="outline"
						className="min-h-11 flex-1"
						onClick={onCreateAssembly}
					>
						<Layers3 className="size-4" aria-hidden="true" />
						创建可撤销初排
					</Button>
				) : null}
				<Button
					className="min-h-11 flex-1"
					disabled={stale || approvedCount === 0 || applied}
					onClick={onApply}
				>
					{applied ? (
						<CheckCircle2 className="size-4" aria-hidden="true" />
					) : (
						<Scissors className="size-4" aria-hidden="true" />
					)}
					{applied ? "已应用批准切口" : `应用 ${approvedCount} 个批准切口`}
				</Button>
				{applied && onUndo ? (
					<Button
						variant="outline"
						className="min-h-11"
						disabled={!canUndo}
						onClick={onUndo}
					>
						<Undo2 className="size-4" aria-hidden="true" />
						撤销本次初剪
					</Button>
				) : null}
			</footer>
		</section>
	);
}
