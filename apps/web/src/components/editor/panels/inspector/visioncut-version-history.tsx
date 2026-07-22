"use client";

import { useCallback, useEffect, useState } from "react";
import {
	Download,
	FileClock,
	History,
	Loader2,
	RefreshCw,
	ShieldCheck,
} from "lucide-react";
import {
	exportProjectVersions,
	loadProjectVersionLedger,
	type ProjectVersion,
} from "@/ai-studio/project-version-store";
import { Button } from "@/components/ui/button";

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
							<p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
								只保存意图、计划和图结构引用，不复制原始视频。
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
				<p className="mt-3 border-l-2 border-destructive pl-3 text-[9px] leading-relaxed text-destructive">
					{error}
				</p>
			) : null}

			{!isLoading && versions.length === 0 ? (
				<div className="mt-4 flex items-start gap-2.5 border-t pt-4">
					<FileClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
					<p className="text-[9px] leading-relaxed text-muted-foreground">
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
								<span className="flex size-8 shrink-0 items-center justify-center rounded-[6px] border font-mono text-[9px]">
									v{version.version}
								</span>
								<div className="min-w-0 flex-1">
									<p className="truncate text-[10px] font-medium">
										{version.label}
									</p>
									<div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[8px] text-muted-foreground">
										<span>{SOURCE_LABELS[version.source]}</span>
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
							</div>
						))}
				</div>
			) : null}

			<div className="mt-3 flex items-start gap-2 text-[8px] leading-relaxed text-muted-foreground">
				<ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
				<span>本地 IndexedDB 优先；无账号、无网络、无付费服务。</span>
			</div>
		</section>
	);
}
