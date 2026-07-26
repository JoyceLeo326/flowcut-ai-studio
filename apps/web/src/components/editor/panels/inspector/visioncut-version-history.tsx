"use client";

import { useCallback, useEffect, useState } from "react";
import {
	Download,
	FileClock,
	History,
	Loader2,
	RefreshCw,
	RotateCcw,
	ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
	appendProjectVersion,
	exportProjectVersions,
	loadProjectVersionLedger,
	loadProjectVersionRestorePayload,
	type ProjectVersion,
} from "@/ai-studio/project-version-store";
import {
	captureProjectVersionRestorePayload,
	restoreProjectFromVersionPayload,
} from "@/ai-studio/project-version-restore";
import {
	emitProjectCreativeStateRestored,
	loadLatestProjectCreativeStateSnapshot,
	parseProjectCreativeStateSnapshot,
} from "@/ai-studio/project-creative-state";
import { RestoreProjectVersionCommand } from "@/ai-studio/restore-project-version-command";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { EditorCore } from "@/core";

const SOURCE_LABELS: Record<ProjectVersion["source"], string> = {
	user: "用户操作",
	"intent-spec": "创作意图",
	"edit-plan": "剪辑蓝图",
	"story-graph": "故事图",
	"automation-run": "自动化运行",
	timeline: "时间线",
	import: "素材导入",
};

function downloadText({
	value,
	filename,
}: {
	value: string;
	filename: string;
}) {
	const url = URL.createObjectURL(
		new Blob([value], { type: "application/json;charset=utf-8" }),
	);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}

export function VisionCutVersionHistory({ projectId }: { projectId: string }) {
	const [versions, setVersions] = useState<readonly ProjectVersion[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [versionToRestore, setVersionToRestore] =
		useState<ProjectVersion | null>(null);
	const [restoringVersionId, setRestoringVersionId] = useState<string | null>(
		null,
	);

	const refresh = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const ledger = await loadProjectVersionLedger({ projectId });
			setVersions(ledger?.versions ?? []);
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : "无法读取版本历史");
		} finally {
			setIsLoading(false);
		}
	}, [projectId]);

	useEffect(() => {
		let active = true;
		void loadProjectVersionLedger({ projectId })
			.then((ledger) => {
				if (!active) return;
				setVersions(ledger?.versions ?? []);
				setIsLoading(false);
			})
			.catch((reason: unknown) => {
				if (!active) return;
				setError(reason instanceof Error ? reason.message : "无法读取版本历史");
				setIsLoading(false);
			});
		return () => {
			active = false;
		};
	}, [projectId]);

	const handleExport = async () => {
		try {
			const value = await exportProjectVersions({ projectId });
			downloadText({
				value,
				filename: `visioncut-${projectId}-versions.json`,
			});
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : "无法导出版本历史");
		}
	};

	const handleRestore = async () => {
		const version = versionToRestore;
		if (version === null || version.restorePayload === undefined) return;
		setRestoringVersionId(version.versionId);
		setError(null);
		try {
			const editor = EditorCore.getInstance();
			const currentProject = editor.project.getActive();
			const assets = editor.media.getAssets();
			const payload = await loadProjectVersionRestorePayload({
				projectId,
				versionId: version.versionId,
			});
			if (payload === null) {
				throw new Error("该历史版本只有引用记录，没有可恢复快照。");
			}
			const creativeState =
				payload.creativeState === undefined
					? null
					: parseProjectCreativeStateSnapshot({
							value: payload.creativeState,
						});
			if (payload.creativeState !== undefined && creativeState === null) {
				throw new Error("该版本的创作状态校验失败，未执行任何恢复。");
			}
			const previousCreativeState =
				await loadLatestProjectCreativeStateSnapshot({ projectId });
			const restoredProject = restoreProjectFromVersionPayload({
				payload,
				currentProject,
				assets,
			});
			const command = new RestoreProjectVersionCommand({
				project: restoredProject,
				...(creativeState === null
					? {}
					: {
							onExecute: () =>
								emitProjectCreativeStateRestored({
									snapshot: creativeState,
								}),
						}),
				...(previousCreativeState === null
					? {}
					: {
							onUndo: () =>
								emitProjectCreativeStateRestored({
									snapshot: previousCreativeState,
								}),
						}),
			});
			editor.command.execute({ command });
			const restoredAt = new Date().toISOString();
			try {
				await appendProjectVersion({
					projectId,
					label: `Restored project version v${version.version}`,
					createdAt: restoredAt,
					source: "user",
					refs: version.refs,
					restorePayload: captureProjectVersionRestorePayload({
						project: restoredProject,
						assets,
						snapshotId: `snapshot-${crypto.randomUUID()}`,
						capturedAt: restoredAt,
						...(creativeState === null ? {} : { creativeState }),
					}),
				});
			} catch (reason) {
				if (editor.command.isLatest(command)) editor.command.undo();
				throw reason;
			}
			if (creativeState !== null) {
				emitProjectCreativeStateRestored({ snapshot: creativeState });
			}
			await refresh();
			toast.success(`已恢复到 v${version.version}`, {
				description:
					creativeState === null
						? "旧快照只包含项目与时间线；恢复已作为新版本记录。"
						: "项目、时间线与创作状态已同步恢复；待执行建议必须重新审阅。",
			});
		} catch (reason) {
			const message =
				reason instanceof Error ? reason.message : "无法恢复这个项目版本";
			setError(message);
			toast.error("项目版本未恢复", { description: message });
		} finally {
			setRestoringVersionId(null);
			setVersionToRestore(null);
		}
	};

	return (
		<section
			className="mt-4 border-y py-4"
			aria-labelledby="version-history-title"
		>
			<header className="flex items-start gap-3">
				<span className="flex size-10 shrink-0 items-center justify-center rounded-[7px] border bg-foreground text-background">
					<History className="size-5" />
				</span>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div>
							<h2
								id="version-history-title"
								className="text-[12px] font-semibold"
							>
								项目版本
							</h2>
							<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
								新版本同时保存项目结构、创作状态与素材指纹，不复制原始视频；旧版记录会明确标注恢复范围。
							</p>
						</div>
						<div className="flex gap-1.5">
							<Button
								variant="outline"
								size="icon"
								className="size-11 xl:size-9"
								onClick={() => void refresh()}
								disabled={isLoading}
								aria-label="刷新项目版本"
								title="刷新"
							>
								{isLoading ? (
									<Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
								) : (
									<RefreshCw className="size-4" />
								)}
							</Button>
							<Button
								variant="outline"
								size="icon"
								className="size-11 xl:size-9"
								onClick={() => void handleExport()}
								disabled={versions.length === 0}
								aria-label="导出项目版本 JSON"
								title="导出版本 JSON"
							>
								<Download className="size-4" />
							</Button>
						</div>
					</div>
				</div>
			</header>

			{error ? (
				<p className="mt-3 border-l-2 border-destructive pl-3 text-[11px] leading-relaxed text-destructive">
					{error}
				</p>
			) : null}

			{!isLoading && versions.length === 0 ? (
				<div className="mt-4 flex items-start gap-2.5 border-t pt-4">
					<FileClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
					<p className="text-[11px] leading-relaxed text-muted-foreground">
						生成并确认第一版创作蓝图后，这里会出现连续版本。
					</p>
				</div>
			) : null}

			{versions.length > 0 ? (
				<div className="mt-4 divide-y border-y">
					{[...versions]
						.reverse()
						.slice(0, 8)
						.map((version) => (
							<div key={version.versionId} className="flex min-w-0 gap-3 py-3">
								<span className="flex size-8 shrink-0 items-center justify-center rounded-[6px] border font-mono text-[10px]">
									v{version.version}
								</span>
								<div className="min-w-0 flex-1">
									<p className="truncate text-[11px] font-medium">
										{version.label}
									</p>
									<div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
										<span>{SOURCE_LABELS[version.source]}</span>
										<span>
											{version.restorePayload?.creativeState
												? "完整可恢复"
												: version.restorePayload
													? "时间线可恢复"
													: "仅引用"}
										</span>
										<time dateTime={version.createdAt}>
											{new Date(version.createdAt).toLocaleString("zh-CN", {
												month: "2-digit",
												day: "2-digit",
												hour: "2-digit",
												minute: "2-digit",
											})}
										</time>
									</div>
								</div>
								<Button
									variant="ghost"
									size="icon"
									className="size-11 shrink-0 xl:size-9"
									disabled={
										version.restorePayload === undefined ||
										restoringVersionId !== null
									}
									onClick={() => setVersionToRestore(version)}
									aria-label={`恢复项目版本 v${version.version}`}
									title={
										version.restorePayload
											? `恢复到 v${version.version}`
											: "旧版只有引用记录，不能直接恢复"
									}
								>
									{restoringVersionId === version.versionId ? (
										<Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
									) : (
										<RotateCcw className="size-4" />
									)}
								</Button>
							</div>
						))}
				</div>
			) : null}

			<div className="mt-3 flex items-start gap-2 text-[10px] leading-relaxed text-muted-foreground">
				<ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
				<span>本地 IndexedDB 优先；无账号、无网络、无付费服务。</span>
			</div>

			<AlertDialog
				open={versionToRestore !== null}
				onOpenChange={(open) => {
					if (!open && restoringVersionId === null) setVersionToRestore(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							恢复到 v{versionToRestore?.version}？
						</AlertDialogTitle>
						<AlertDialogDescription>
							{versionToRestore?.restorePayload?.creativeState
								? "项目、场景、时间线、意图、剪辑蓝图、Story Graph、Agent 审批状态和转写修订会同步恢复。待执行建议会清空并要求重新审阅。"
								: "这是旧版时间线快照，只恢复项目、场景和时间线。"}
							原始媒体不会复制或删除；恢复会作为新版本记录，并可立即撤销时间线。
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={restoringVersionId !== null}>
							取消
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={restoringVersionId !== null}
							onClick={(event) => {
								event.preventDefault();
								void handleRestore();
							}}
						>
							{restoringVersionId ? (
								<Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
							) : (
								<RotateCcw className="size-4" />
							)}
							确认恢复
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	);
}
