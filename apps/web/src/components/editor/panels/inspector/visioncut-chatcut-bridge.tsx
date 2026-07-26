"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
	Check,
	CheckCircle2,
	ClipboardCheck,
	Copy,
	Download,
	FileJson,
	History,
	Import,
	Loader2,
	RotateCcw,
	RotateCw,
	ShieldCheck,
	TriangleAlert,
	UploadCloud,
	XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EditorCore } from "@/core";
import type { MediaAsset } from "@/media/types";
import type { TProject } from "@/project/types";
import type { TScene } from "@/timeline";
import { mediaTimeFromSeconds } from "@/wasm";
import {
	createChatCutHandoff,
	formatChatCutTask,
	type EditPlan,
	type HandoffMediaItem,
} from "@/ai-edit";
import { ApplyChatCutImportCommand } from "@/ai-studio/apply-chatcut-import-command";
import {
	inspectChatCutImportApplicability,
	type ChatCutImportApplicability,
} from "@/ai-studio/chatcut-executor";
import {
	appendChatCutImportStateTransition,
	listProjectChatCutImportEntries,
	saveChatCutImportReceipt,
	type ChatCutImportHistoryEntry,
} from "@/ai-studio/chatcut-import-store";
import type { MediaIndex } from "@/ai-studio/media-index";
import {
	compareChatCutResult,
	finalizeChatCutResultImport,
	prepareChatCutResultImport,
	validateChatCutResult,
	type ChatCutImportApplyReceipt,
	type ChatCutResultComparison,
	type ChatCutResultEnvelope,
} from "@/ai-studio/chatcut-result";
import {
	createChatCutTargetState,
	createChatCutVersionIdentity,
	fingerprintChatCutTimeline,
} from "@/ai-studio/chatcut-timeline-adapter";

const RESULT_FILE_LIMIT_BYTES = 2_000_000;

const OPERATION_LABELS: Record<
	ChatCutResultEnvelope["operations"][number]["kind"],
	string
> = {
	trim: "裁切片段",
	split: "分割片段",
	remove: "删除区间",
	reorder: "重排结构",
	"caption-fix": "修正转录词",
};

function downloadJson({ value, filename }: { value: unknown; filename: string }) {
	const blob = new Blob([JSON.stringify(value, null, 2)], {
		type: "application/json;charset=utf-8",
	});
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}

function shortFingerprint(value: string): string {
	return `${value.slice(0, 15)}…${value.slice(-8)}`;
}

function formatFrames({
	frames,
	fps,
}: {
	frames: number;
	fps: { numerator: number; denominator: number };
}): string {
	const seconds = (frames * fps.denominator) / fps.numerator;
	return seconds < 10 ? `${seconds.toFixed(2)} 秒` : `${seconds.toFixed(1)} 秒`;
}

function resultOperationSummary({
	result,
	operationId,
}: {
	result: ChatCutResultEnvelope;
	operationId: string;
}): string {
	const diff = result.preview.operationDiffs.find(
		(candidate) => candidate.operationId === operationId,
	);
	if (!diff) return "等待核对差异";
	if (diff.removedTimelineFrames > 0) {
		return `减少 ${formatFrames({
			frames: diff.removedTimelineFrames,
			fps: result.timebase.fps,
		})}`;
	}
	if (diff.movedSegmentCount > 0) {
		return `移动 ${diff.movedSegmentCount} 个结构片段`;
	}
	if (diff.correctedWordCount > 0) {
		return `修正 ${diff.correctedWordCount} 个词`;
	}
	return "不改变总时长";
}

export function VisionCutChatCutBridge({
	project,
	scene,
	assets,
	mediaIndexes,
	plan,
	planReviewed,
	onImportApplied,
	onImportUndone,
}: {
	project: TProject;
	scene: TScene;
	assets: readonly MediaAsset[];
	mediaIndexes: readonly MediaIndex[];
	plan: EditPlan | null;
	planReviewed: boolean;
	onImportApplied?: (receipt: ChatCutImportApplyReceipt) => void;
	onImportUndone?: (receipt: ChatCutImportApplyReceipt) => void;
}) {
	const editor = EditorCore.getInstance();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [history, setHistory] = useState<
		readonly ChatCutImportHistoryEntry[]
	>([]);
	const [historyError, setHistoryError] = useState<string | null>(null);
	const [result, setResult] = useState<ChatCutResultEnvelope | null>(null);
	const [validationIssues, setValidationIssues] = useState<readonly string[]>(
		[],
	);
	const [approvedOperationIds, setApprovedOperationIds] = useState<
		ReadonlySet<string>
	>(new Set());
	const [isApplying, setIsApplying] = useState(false);
	const [isChangingImportState, setIsChangingImportState] = useState(false);
	const [lastImport, setLastImport] = useState<{
		command: ApplyChatCutImportCommand;
		receipt: ChatCutImportApplyReceipt;
		state: "applied" | "undone";
	} | null>(null);

	useEffect(() => {
		let cancelled = false;
		void listProjectChatCutImportEntries({ projectId: project.metadata.id })
			.then((entries) => {
				if (!cancelled) {
					setHistoryError(null);
					setHistory(entries);
				}
			})
			.catch((error: unknown) => {
				if (!cancelled) {
					setHistoryError(
						error instanceof Error ? error.message : "无法读取导入历史。",
					);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [project.metadata.id]);

	const bundle = useMemo(
		() =>
			createChatCutTargetState({
				project,
				scene,
				assets,
				mediaIndexes,
				appliedImports: history
					.filter(({ state }) => state === "applied")
					.map(({ record }) => record.receipt),
			}),
		[assets, history, mediaIndexes, project, scene],
	);

	const handoff = useMemo(() => {
		if (!plan) return null;
		const assetState = new Map(
			bundle.target.assets.map((asset) => [asset.assetId, asset] as const),
		);
		const media: HandoffMediaItem[] = bundle.assetIdentities.map((asset) => ({
			visionCutAssetId: asset.assetId,
			name: asset.name,
			type: asset.type,
			fingerprint: asset.fingerprint,
			durationFrames: assetState.get(asset.assetId)?.durationFrames ?? 1,
			...(asset.durationSeconds === null
				? {}
				: { durationSeconds: asset.durationSeconds }),
			sizeBytes: asset.sizeBytes,
			lastModified: asset.lastModified,
		}));
		return createChatCutHandoff({
			project: { id: project.metadata.id, name: project.metadata.name },
			media,
			plan,
			targetState: bundle.target,
			timebase: bundle.timebase,
		});
	}, [bundle, plan, project.metadata.id, project.metadata.name]);

	const handoffMismatch = Boolean(
		result && (!handoff || result.handoffId !== handoff.handoffId),
	);

	const comparison = useMemo<ChatCutResultComparison | null>(() => {
		if (!result) return null;
		return compareChatCutResult({ result, current: bundle.target });
	}, [bundle.target, result]);

	const preparation = useMemo(() => {
		if (!result || handoffMismatch) return null;
		return prepareChatCutResultImport({
			result,
			current: bundle.target,
			approvedOperationIds: [...approvedOperationIds],
		});
	}, [approvedOperationIds, bundle.target, handoffMismatch, result]);

	const applicability = useMemo<ChatCutImportApplicability | null>(() => {
		if (!preparation || preparation.status !== "ready") return null;
		return inspectChatCutImportApplicability({
			tracks: scene.tracks,
			plan: preparation.plan,
			fps: bundle.timebase.fps,
			hasTimelineBookmarks: scene.bookmarks.length > 0,
		});
	}, [bundle.timebase.fps, preparation, scene.bookmarks.length, scene.tracks]);

	const allApproved = Boolean(
		result &&
		result.operations.length > 0 &&
		result.operations.every(({ id }) => approvedOperationIds.has(id)),
	);

	const handleCopyHandoff = async () => {
		if (!handoff || !planReviewed) return;
		try {
			await navigator.clipboard.writeText(formatChatCutTask(handoff));
			toast.success("ChatCut v2 任务已复制", {
				description: "需同时附上原素材；返回时导入 result JSON。",
			});
		} catch {
			toast.error("浏览器不允许写入剪贴板，请下载交接包。");
		}
	};

	const handleResultFile = async (file: File | null) => {
		if (!file) return;
		setValidationIssues([]);
		setResult(null);
		setApprovedOperationIds(new Set());
		if (file.size > RESULT_FILE_LIMIT_BYTES) {
			setValidationIssues(["结果文件超过 2 MB，已拒绝读取。"]);
			return;
		}
		const validation = validateChatCutResult(await file.text());
		if (!validation.ok) {
			setValidationIssues(
				validation.issues.map(({ path, message }) => `${path}：${message}`),
			);
			return;
		}
		setResult(validation.value);
		toast.success("结果协议有效", {
			description: `${validation.value.operations.length} 项操作等待逐项审核。`,
		});
	};

	const toggleApproval = (operationId: string) => {
		setApprovedOperationIds((current) => {
			const next = new Set(current);
			if (next.has(operationId)) next.delete(operationId);
			else next.add(operationId);
			return next;
		});
	};

	const seekToOperation = (operationId: string) => {
		if (!result) return;
		const diff = result.preview.operationDiffs.find(
			(candidate) => candidate.operationId === operationId,
		);
		const frame = diff?.affectedTimelineRanges[0]?.startFrame;
		if (frame === undefined) return;
		editor.playback.seek({
			time: mediaTimeFromSeconds({
				seconds:
					(frame * result.timebase.fps.denominator) /
					result.timebase.fps.numerator,
			}),
		});
	};

	const handleApply = async () => {
		if (!result || !handoff || !planReviewed || !allApproved) return;
		setIsApplying(true);
		let command: ApplyChatCutImportCommand | null = null;
		let auditCommitted = false;
		try {
			const freshHistory = await listProjectChatCutImportEntries({
				projectId: project.metadata.id,
			});
			const priorImport = freshHistory.find(
				({ record }) =>
					record.handoffId === result.handoffId &&
					record.resultId === result.resultId,
			);
			const activeScene = editor.scenes.getActiveScene();
			const freshBundle = createChatCutTargetState({
				project,
				scene: activeScene,
				assets,
				mediaIndexes,
				appliedImports: freshHistory
					.filter(({ state }) => state === "applied")
					.map(({ record }) => record.receipt),
			});
			if (result.handoffId !== handoff.handoffId) {
				throw new Error("结果不属于当前审核过的交接包。");
			}
			const prepared = prepareChatCutResultImport({
				result,
				current: freshBundle.target,
				approvedOperationIds: result.operations.map(({ id }) => id),
			});
			if (prepared.status !== "ready") {
				throw new Error(
					prepared.status === "already-applied"
						? "这个结果已经导入过。"
						: "时间线或素材在审核后发生变化，请重新导出交接包。",
				);
			}
			const latestApplicability = inspectChatCutImportApplicability({
				tracks: activeScene.tracks,
				plan: prepared.plan,
				fps: freshBundle.timebase.fps,
				hasTimelineBookmarks: activeScene.bookmarks.length > 0,
			});
			if (!latestApplicability.canApply) {
				throw new Error(latestApplicability.blockers.join(" "));
			}
			command = new ApplyChatCutImportCommand({
				sceneId: activeScene.id,
				plan: prepared.plan,
				fps: freshBundle.timebase.fps,
			});
			editor.command.execute({ command });
			const resultingTimelineFingerprint = fingerprintChatCutTimeline({
				project,
				scene: editor.scenes.getActiveScene(),
			});
			const resultingVersion = prepared.plan.guards.expectedProjectVersion + 1;
			const { versionId: resultingVersionId } = createChatCutVersionIdentity({
				projectVersion: resultingVersion,
				timelineFingerprint: resultingTimelineFingerprint,
			});
			let receipt: ChatCutImportApplyReceipt;
			if (priorImport !== undefined) {
				if (priorImport.state !== "undone") {
					throw new Error("这个 ChatCut 结果当前已经生效。");
				}
				if (
					resultingTimelineFingerprint !==
					priorImport.record.resultingTimelineFingerprint
				) {
					throw new Error(
						"恢复后的时间线与原始回执不一致，已停止写入并撤销本次恢复。",
					);
				}
				const transition = await appendChatCutImportStateTransition({
					projectId: project.metadata.id,
					receiptId: priorImport.record.receipt.receiptId,
					transition: "redone",
				});
				auditCommitted = true;
				receipt = priorImport.record.receipt;
				setHistory(
					freshHistory.map((entry) =>
						entry.record.receipt.receiptId === receipt.receiptId
							? {
									...entry,
									state: "applied",
									lastTransition: transition,
								}
							: entry,
					),
				);
			} else {
				receipt = finalizeChatCutResultImport({
					plan: prepared.plan,
					appliedAt: new Date().toISOString(),
					resultingVersion,
					resultingVersionId,
					resultingTimelineFingerprint,
				});
				const savedRecord = await saveChatCutImportReceipt({
					handoffId: result.handoffId,
					receipt,
				});
				auditCommitted = true;
				setHistory([
					...freshHistory,
					{
						record: savedRecord,
						state: "applied",
						lastTransition: null,
					},
				]);
			}
			setLastImport({ command, receipt, state: "applied" });
			onImportApplied?.(receipt);
			toast.success("ChatCut 结果已原子应用", {
				description: `${receipt.operationIds.length} 项操作已写入新版本，可立即撤销。`,
			});
		} catch (error) {
			if (
				!auditCommitted &&
				command &&
				editor.command.isLatest(command) &&
				editor.scenes.getActiveScene().id === command.sceneId
			) {
				editor.command.undo();
			}
			toast.error("未应用 ChatCut 结果", {
				description: error instanceof Error ? error.message : "执行失败。",
			});
		} finally {
			setIsApplying(false);
		}
	};

	const refreshHistory = async () => {
		try {
			const entries = await listProjectChatCutImportEntries({
				projectId: project.metadata.id,
			});
			setHistory(entries);
			setHistoryError(null);
		} catch (error) {
			setHistoryError(
				error instanceof Error ? error.message : "无法读取导入历史。",
			);
		}
	};

	const handleUndo = async () => {
		if (
			!lastImport ||
			!editor.command.isLatest(lastImport.command) ||
			editor.scenes.getActiveScene().id !== lastImport.command.sceneId
		) {
			toast.error("该导入已不是最近一次编辑，不能越过后续修改撤销。");
			return;
		}
		setIsChangingImportState(true);
		let timelineChanged = false;
		try {
			editor.command.undo();
			timelineChanged = true;
			await appendChatCutImportStateTransition({
				projectId: project.metadata.id,
				receiptId: lastImport.receipt.receiptId,
				transition: "undone",
			});
		} catch (error) {
			if (
				timelineChanged &&
				editor.command.isNextRedo(lastImport.command) &&
				editor.scenes.getActiveScene().id === lastImport.command.sceneId
			) {
				editor.command.redo();
			}
			setIsChangingImportState(false);
			toast.error("未能撤销 ChatCut 导入", {
				description:
					error instanceof Error ? error.message : "无法写入撤销审计记录。",
			});
			return;
		}
		setLastImport({ ...lastImport, state: "undone" });
		onImportUndone?.(lastImport.receipt);
		await refreshHistory();
		setIsChangingImportState(false);
		toast.success("已撤销本次 ChatCut 导入");
	};

	const handleRedo = async () => {
		if (
			!lastImport ||
			!editor.command.isNextRedo(lastImport.command) ||
			editor.scenes.getActiveScene().id !== lastImport.command.sceneId
		) {
			toast.error("重做栈已变化，不能恢复这次导入。");
			return;
		}
		setIsChangingImportState(true);
		let timelineChanged = false;
		try {
			editor.command.redo();
			timelineChanged = true;
			await appendChatCutImportStateTransition({
				projectId: project.metadata.id,
				receiptId: lastImport.receipt.receiptId,
				transition: "redone",
			});
		} catch (error) {
			if (
				timelineChanged &&
				editor.command.isLatest(lastImport.command) &&
				editor.scenes.getActiveScene().id === lastImport.command.sceneId
			) {
				editor.command.undo();
			}
			setIsChangingImportState(false);
			toast.error("未能恢复 ChatCut 导入", {
				description:
					error instanceof Error ? error.message : "无法写入恢复审计记录。",
			});
			return;
		}
		setLastImport({ ...lastImport, state: "applied" });
		await refreshHistory();
		setIsChangingImportState(false);
		toast.success("已恢复本次 ChatCut 导入");
	};

	return (
		<div className="space-y-4">
			<section className="border-y py-3">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<h2 className="flex items-center gap-2 text-[13px] font-semibold">
							<Import className="size-4 text-cyan-600" />
							ChatCut 协作
						</h2>
						<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
							交接与回收都绑定当前时间线。结果不会直接写入，必须通过协议校验和逐项审批。
						</p>
					</div>
					<ShieldCheck className="size-5 shrink-0 text-emerald-600" />
				</div>
				<div className="mt-3 grid grid-cols-3 divide-x border-y text-center text-[9px]">
					<div className="py-2">
						<p className="font-semibold">v{bundle.target.projectVersion}</p>
						<p className="mt-0.5 text-muted-foreground">基线版本</p>
					</div>
					<div className="py-2">
						<p className="font-semibold">{bundle.target.items.length}</p>
						<p className="mt-0.5 text-muted-foreground">可定位片段</p>
					</div>
					<div className="py-2">
						<p className="font-semibold">{bundle.target.silenceAnalyses.length}</p>
						<p className="mt-0.5 text-muted-foreground">本地证据</p>
					</div>
				</div>
				<p className="mt-2 truncate font-mono text-[8px] text-muted-foreground">
					{shortFingerprint(bundle.target.timelineFingerprint)}
				</p>
			</section>

			<section className="border-b pb-4">
				<div className="flex items-center justify-between gap-2">
					<div>
						<h3 className="text-[11px] font-semibold">1. 导出审核过的交接包</h3>
						<p className="mt-1 text-[9px] text-muted-foreground">
							只含计划、指纹与证据引用，不含视频文件或 API 密钥。
						</p>
					</div>
					{handoff && planReviewed ? (
						<CheckCircle2 className="size-4 text-emerald-600" />
					) : (
						<TriangleAlert className="size-4 text-amber-600" />
					)}
				</div>
				{handoff ? (
					<p className="mt-2 truncate font-mono text-[8px] text-muted-foreground">
						{handoff.handoffId}
					</p>
				) : null}
				{!plan || !planReviewed ? (
					<p className="mt-3 border-l-2 border-amber-500 pl-2 text-[10px] leading-relaxed text-muted-foreground">
						先在导演工作面生成蓝图、完成逐项审阅并确认方向，才能锁定交接基线。
					</p>
				) : null}
				<div className="mt-3 grid grid-cols-2 gap-2">
					<Button
						variant="outline"
						className="h-11 rounded-[8px]"
						disabled={!handoff || !planReviewed}
						onClick={() => void handleCopyHandoff()}
					>
						<Copy className="size-4" />
						复制任务
					</Button>
					<Button
						variant="outline"
						className="h-11 rounded-[8px]"
						disabled={!handoff || !planReviewed}
						onClick={() =>
							handoff &&
							downloadJson({
								value: handoff,
								filename: `visioncut-chatcut-${handoff.handoffId}.json`,
							})
						}
					>
						<Download className="size-4" />
						下载交接包
					</Button>
				</div>
			</section>

			<section className="border-b pb-4">
				<h3 className="text-[11px] font-semibold">2. 导入 ChatCut 结果</h3>
				<p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
					仅接受 visioncut.chatcut-result/v1 JSON；自由文本指令不会在这里执行。
				</p>
				<input
					ref={fileInputRef}
					type="file"
					accept="application/json,.json"
					className="sr-only"
					onChange={(event) => {
						void handleResultFile(event.target.files?.[0] ?? null);
						event.currentTarget.value = "";
					}}
				/>
				<Button
					variant="outline"
					className="mt-3 h-11 w-full rounded-[8px]"
					onClick={() => fileInputRef.current?.click()}
				>
					<UploadCloud className="size-4" />
					选择结果 JSON
				</Button>
				{validationIssues.length > 0 ? (
					<div className="mt-3 border-l-2 border-rose-500 pl-2">
						<p className="text-[10px] font-semibold text-rose-600">
							协议校验未通过
						</p>
						<ul className="mt-1 space-y-1 text-[9px] leading-relaxed text-muted-foreground">
							{validationIssues.slice(0, 6).map((issue) => (
								<li key={issue}>{issue}</li>
							))}
						</ul>
					</div>
				) : null}
			</section>

			{result ? (
				<section className="border-b pb-4">
					<div className="flex items-start justify-between gap-3">
						<div>
							<h3 className="text-[11px] font-semibold">3. 逐项审核差异</h3>
							<p className="mt-1 text-[9px] text-muted-foreground">
								{result.operations.length} 项操作 · 共减少 {formatFrames({
									frames: result.preview.summary.removedTimelineFrames,
									fps: result.timebase.fps,
								})}
							</p>
						</div>
						{comparison?.status === "ready" && !handoffMismatch ? (
							<CheckCircle2 className="size-4 text-emerald-600" />
						) : (
							<XCircle className="size-4 text-rose-600" />
						)}
					</div>

					{handoffMismatch ? (
						<p className="mt-3 border-l-2 border-rose-500 pl-2 text-[10px] leading-relaxed text-muted-foreground">
							结果的 handoffId 不属于当前审核交接包，已阻止应用。
						</p>
					) : null}
					{comparison?.status === "conflict" ? (
						<div className="mt-3 border-l-2 border-rose-500 pl-2">
							<p className="text-[10px] font-semibold text-rose-600">
								基线已变化
							</p>
							<ul className="mt-1 space-y-1 text-[9px] leading-relaxed text-muted-foreground">
								{comparison.conflicts.slice(0, 8).map((conflict) => (
									<li key={`${conflict.code}:${conflict.path}`}>
										{conflict.code} · {conflict.path}
									</li>
								))}
							</ul>
						</div>
					) : null}
					{comparison?.status === "already-applied" ? (
						<p className="mt-3 border-l-2 border-emerald-500 pl-2 text-[10px] text-muted-foreground">
							该结果已有本地回执，不会重复执行。
						</p>
					) : null}

					<div className="mt-3 divide-y border-y">
						{result.operations.map((operation) => {
							const approved = approvedOperationIds.has(operation.id);
							return (
								<div key={operation.id} className="flex min-h-14 items-center gap-2 py-2">
									<Checkbox
										checked={approved}
										disabled={
											handoffMismatch || comparison?.status !== "ready"
										}
										onCheckedChange={() => toggleApproval(operation.id)}
										aria-label={`批准${OPERATION_LABELS[operation.kind]}`}
									/>
									<button
										type="button"
										className="min-h-11 min-w-0 flex-1 text-left"
										onClick={() => seekToOperation(operation.id)}
									>
										<span className="block text-[10px] font-medium">
											{OPERATION_LABELS[operation.kind]}
										</span>
										<span className="mt-0.5 block truncate text-[9px] text-muted-foreground">
											{resultOperationSummary({
												result,
												operationId: operation.id,
											})}
										</span>
									</button>
									{approved ? (
										<Check className="size-3.5 text-emerald-600" />
									) : null}
								</div>
							);
						})}
					</div>
					<Button
						variant="ghost"
						className="mt-2 h-11 w-full rounded-[8px]"
						disabled={handoffMismatch || comparison?.status !== "ready"}
						onClick={() =>
							setApprovedOperationIds(
								allApproved
									? new Set()
									: new Set(result.operations.map(({ id }) => id)),
							)
						}
					>
						<ClipboardCheck className="size-4" />
						{allApproved ? "取消全部批准" : "批准全部操作"}
					</Button>
				</section>
			) : null}

			{applicability && !applicability.canApply ? (
				<section className="border-b pb-4">
					<h3 className="flex items-center gap-2 text-[10px] font-semibold text-amber-600">
						<TriangleAlert className="size-4" />
						执行前仍有阻止项
					</h3>
					<ul className="mt-2 space-y-1 text-[9px] leading-relaxed text-muted-foreground">
						{applicability.blockers.map((blocker) => (
							<li key={blocker}>{blocker}</li>
						))}
					</ul>
				</section>
			) : null}

			{result ? (
				<section className="border-b pb-4">
					<Button
						className="h-12 w-full rounded-[8px]"
						disabled={
							isApplying ||
							!planReviewed ||
							!allApproved ||
							handoffMismatch ||
							preparation?.status !== "ready" ||
							!applicability?.canApply
						}
						onClick={() => void handleApply()}
					>
						{isApplying ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<FileJson className="size-4" />
						)}
						{isApplying ? "重新校验并应用中" : "原子应用已批准操作"}
					</Button>
					{lastImport ? (
						<div className="mt-2 grid grid-cols-2 gap-2">
							<Button
								variant="outline"
								className="h-11 rounded-[8px]"
								disabled={
									isChangingImportState || lastImport.state !== "applied"
								}
								onClick={() => void handleUndo()}
							>
								<RotateCcw className="size-4" />
								撤销导入
							</Button>
							<Button
								variant="outline"
								className="h-11 rounded-[8px]"
								disabled={
									isChangingImportState || lastImport.state !== "undone"
								}
								onClick={() => void handleRedo()}
							>
								<RotateCw className="size-4" />
								恢复导入
							</Button>
						</div>
					) : null}
				</section>
			) : null}

			<section>
				<h3 className="flex items-center gap-2 text-[11px] font-semibold">
					<History className="size-4" />
					本地回执历史
				</h3>
				{historyError ? (
					<p className="mt-2 text-[9px] text-rose-600">{historyError}</p>
				) : null}
				{history.length === 0 && !historyError ? (
					<p className="mt-2 text-[9px] text-muted-foreground">
						暂无导入记录。回执只存结构化版本信息，不保存视频。
					</p>
				) : null}
				<div className="mt-2 divide-y border-y">
					{[...history].reverse().slice(0, 8).map(({ record, state }) => (
						<div key={record.receipt.receiptId} className="flex items-center gap-2 py-2">
							{state === "applied" ? (
								<CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
							) : (
								<RotateCcw className="size-3.5 shrink-0 text-muted-foreground" />
							)}
							<div className="min-w-0 flex-1">
								<p className="truncate text-[9px] font-medium">
									v{record.resultingVersion} · {record.appliedOperationIds.length} 项操作
								</p>
								<p className="mt-0.5 truncate font-mono text-[8px] text-muted-foreground">
									{record.resultId}
								</p>
							</div>
							<span className="text-[8px] text-muted-foreground">
								{state === "applied"
									? new Date(record.appliedAt).toLocaleDateString("zh-CN")
									: "已撤销"}
							</span>
						</div>
					))}
				</div>
			</section>
		</div>
	);
}
