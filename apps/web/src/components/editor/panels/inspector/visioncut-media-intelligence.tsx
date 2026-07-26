"use client";

import {
	AlertTriangle,
	Check,
	CircleStop,
	Clock3,
	FileSearch,
	Loader2,
	MapPin,
	RefreshCw,
	Scissors,
	ShieldCheck,
	Undo2,
	X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ApplyRoughCutCommand } from "@/ai-studio/apply-rough-cut-command";
import {
	captureLocalMediaSamples,
	type LocalMediaSamplingProgress,
} from "@/ai-studio/local-media-sampler";
import {
	createLocalAssetFingerprint,
	createLocalAssetFingerprintForMediaAsset,
	createMediaIndexFromLocalCapture,
} from "@/ai-studio/media-index-adapter";
import { createRoughCutPlanFromMediaIndex } from "@/ai-studio/media-index-rough-cut";
import {
	loadMediaIndexHistory,
	saveMediaIndex,
} from "@/ai-studio/media-index-store";
import type { MediaIndex } from "@/ai-studio/media-index";
import {
	reviewAllRoughCutOperations,
	reviewRoughCutOperation,
	type RoughCutPlan,
} from "@/ai-studio/rough-cut-plan";
import { inspectRoughCutApplicability } from "@/ai-studio/rough-cut-executor";
import { Button } from "@/components/ui/button";
import { useEditor } from "@/editor/use-editor";
import type { MediaAsset } from "@/media/types";
import type { TScene, TimelineElement, TimelineTrack } from "@/timeline";
import { mediaTimeFromSeconds, mediaTimeToSeconds } from "@/wasm";
import { cn } from "@/utils/ui";

interface TimelineTarget {
	readonly trackId: string;
	readonly trackName: string;
	readonly element: TimelineElement;
}

interface VisionCutMediaIntelligenceProps {
	readonly projectId: string | null;
	readonly assets: readonly MediaAsset[];
	onMediaIndexChange?: (change: {
		readonly assetId: string;
		readonly index: MediaIndex | null;
	}) => void;
}

function formatTime(seconds: number): string {
	const safe = Math.max(0, seconds);
	const minutes = Math.floor(safe / 60);
	const remainder = safe - minutes * 60;
	return `${minutes}:${remainder.toFixed(2).padStart(5, "0")}`;
}

function assetFingerprint(asset: MediaAsset): string {
	return createLocalAssetFingerprintForMediaAsset({ asset });
}

function allTracks(scene: TScene): TimelineTrack[] {
	return [scene.tracks.main, ...scene.tracks.overlay, ...scene.tracks.audio];
}

function targetsForAsset({
	scene,
	assetId,
}: {
	scene: TScene | null;
	assetId: string;
}): TimelineTarget[] {
	if (scene === null) return [];
	const targets: TimelineTarget[] = [];
	for (const track of allTracks(scene)) {
		for (const element of track.elements) {
			if (!("mediaId" in element) || element.mediaId !== assetId) continue;
			if (element.type !== "video" && element.type !== "audio") continue;
			if (element.type === "audio" && element.sourceType !== "upload") continue;
			targets.push({ trackId: track.id, trackName: track.name, element });
		}
	}
	return targets.sort(
		(left, right) => left.element.startTime - right.element.startTime,
	);
}

function CoverageLine({
	label,
	state,
	count,
	last,
}: {
	label: string;
	state: string;
	count: number;
	last: number | null;
}) {
	return (
		<div className="flex min-h-11 items-center justify-between gap-3 border-t py-2 text-[10px]">
			<span className="font-medium">{label}</span>
			<span className="text-right font-mono text-[9px] text-muted-foreground">
				{state === "sampled"
					? `${count} 样本 · 至 ${formatTime(last ?? 0)}`
					: state === "no-track"
						? "无轨道"
						: "未采样"}
			</span>
		</div>
	);
}

export function VisionCutMediaIntelligence({
	projectId,
	assets,
	onMediaIndexChange,
}: VisionCutMediaIntelligenceProps) {
	const editor = useEditor();
	const scene = useEditor((value) => value.scenes.getActiveSceneOrNull());
	const analyzableAssets = useMemo(
		() => assets.filter((asset) => asset.type !== "image"),
		[assets],
	);
	const [selectedAssetId, setSelectedAssetId] = useState(
		() => analyzableAssets[0]?.id ?? "",
	);
	const [mediaIndex, setMediaIndex] = useState<MediaIndex | null>(null);
	const [progress, setProgress] = useState<LocalMediaSamplingProgress | null>(
		null,
	);
	const [isAnalyzing, setIsAnalyzing] = useState(false);
	const [isLoadingStored, setIsLoadingStored] = useState(false);
	const [analysisError, setAnalysisError] = useState<string | null>(null);
	const [roughCutPlan, setRoughCutPlan] = useState<RoughCutPlan | null>(null);
	const [targetElementId, setTargetElementId] = useState("");
	const [appliedPlanId, setAppliedPlanId] = useState<string | null>(null);
	const [appliedCommand, setAppliedCommand] =
		useState<ApplyRoughCutCommand | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	const effectiveSelectedAssetId = analyzableAssets.some(
		(asset) => asset.id === selectedAssetId,
	)
		? selectedAssetId
		: (analyzableAssets[0]?.id ?? "");

	const selectedAsset =
		analyzableAssets.find((asset) => asset.id === effectiveSelectedAssetId) ??
		null;
	const timelineTargets = useMemo(
		() =>
			targetsForAsset({
				scene,
				assetId: effectiveSelectedAssetId,
			}),
		[effectiveSelectedAssetId, scene],
	);

	const effectiveTargetElementId = timelineTargets.some(
		(target) => target.element.id === targetElementId,
	)
		? targetElementId
		: (timelineTargets[0]?.element.id ?? "");

	const target =
		timelineTargets.find(
			(candidate) => candidate.element.id === effectiveTargetElementId,
		) ?? null;

	useEffect(() => {
		let active = true;
		void Promise.resolve().then(() => {
			if (!active) return;
			setRoughCutPlan(null);
			setAppliedPlanId(null);
			setAppliedCommand(null);
			setAnalysisError(null);
		});
		if (!projectId || !selectedAsset) {
			void Promise.resolve().then(() => {
				if (active) setMediaIndex(null);
			});
			return () => {
				active = false;
			};
		}
		void Promise.resolve().then(() => {
			if (active) setIsLoadingStored(true);
		});
		void loadMediaIndexHistory({
			projectId,
			assetId: selectedAsset.id,
		})
			.then((history) => {
				if (!active) return;
				const record = history?.records.at(-1) ?? null;
				const currentFingerprint = assetFingerprint(selectedAsset);
				const next =
					record?.assetFingerprint === currentFingerprint ? record.index : null;
				setMediaIndex(next);
				onMediaIndexChange?.({ assetId: selectedAsset.id, index: next });
				if (record && next === null) {
					setAnalysisError("素材内容或元数据已变化，请重新执行本地分析。");
				}
			})
			.catch((error: unknown) => {
				if (!active) return;
				setMediaIndex(null);
				onMediaIndexChange?.({ assetId: selectedAsset.id, index: null });
				setAnalysisError(
					error instanceof Error ? error.message : "无法读取本地分析记录。",
				);
			})
			.finally(() => {
				if (active) setIsLoadingStored(false);
			});
		return () => {
			active = false;
		};
	}, [onMediaIndexChange, projectId, selectedAsset]);

	const handleAnalyze = async () => {
		if (!projectId || !selectedAsset || isAnalyzing) return;
		const controller = new AbortController();
		abortRef.current = controller;
		setIsAnalyzing(true);
		setAnalysisError(null);
		setRoughCutPlan(null);
		try {
			const capture = await captureLocalMediaSamples({
				asset: selectedAsset,
				signal: controller.signal,
				onProgress: setProgress,
			});
			const index = createMediaIndexFromLocalCapture({ capture });
			const fingerprint = createLocalAssetFingerprint({ capture });
			await saveMediaIndex({
				projectId,
				assetFingerprint: fingerprint,
				createdAt: new Date().toISOString(),
				index,
			});
			setMediaIndex(index);
			onMediaIndexChange?.({ assetId: selectedAsset.id, index });
			toast.success("本地证据分析完成", {
				description: `${index.sceneBoundaries.length} 个帧变化候选，${index.audioActivityCandidates.length} 个音频能量区间。`,
			});
		} catch (error) {
			if (controller.signal.aborted) {
				toast.info("已取消本地分析");
				return;
			}
			const message =
				error instanceof Error ? error.message : "当前浏览器无法分析该素材。";
			setAnalysisError(message);
			toast.error("本地分析失败", { description: message });
		} finally {
			if (abortRef.current === controller) abortRef.current = null;
			setIsAnalyzing(false);
			setProgress(null);
		}
	};

	const handleCreateRoughCut = () => {
		if (!projectId || !mediaIndex || !selectedAsset || !target || !scene)
			return;
		const element = target.element;
		const rate = "retime" in element ? (element.retime?.rate ?? 1) : 1;
		if (rate !== 1) {
			toast.error("当前片段已变速", {
				description: "恢复 1x 后再生成本地低能量粗剪。",
			});
			return;
		}
		const plan = createRoughCutPlanFromMediaIndex({
			index: mediaIndex,
			assetFingerprint: assetFingerprint(selectedAsset),
			clip: {
				projectId,
				sceneId: scene.id,
				trackId: target.trackId,
				elementId: element.id,
				assetId: selectedAsset.id,
				timelineStartSeconds: mediaTimeToSeconds({ time: element.startTime }),
				sourceStartSeconds: mediaTimeToSeconds({ time: element.trimStart }),
				durationSeconds: mediaTimeToSeconds({ time: element.duration }),
				playbackRate: 1,
			},
			createdAt: new Date().toISOString(),
		});
		setRoughCutPlan(plan);
		setAppliedPlanId(null);
		setAppliedCommand(null);
		if (plan.operations.length === 0) {
			toast.info("没有可建议的长低能量区间", {
				description: "不会为了产生切口而降低证据阈值。",
			});
		}
	};

	const reviewOperation = ({
		operationId,
		status,
	}: {
		operationId: string;
		status: "approved" | "rejected";
	}) => {
		setRoughCutPlan((current) =>
			current
				? reviewRoughCutOperation({
						plan: current,
						operationId,
						status,
						updatedAt: new Date().toISOString(),
					})
				: null,
		);
	};

	const approveAll = () => {
		setRoughCutPlan((current) =>
			current
				? reviewAllRoughCutOperations({
						plan: current,
						status: "approved",
						updatedAt: new Date().toISOString(),
					})
				: null,
		);
	};

	const seekToSourceTime = (sourceSeconds: number) => {
		if (!target) return;
		const sourceStart = mediaTimeToSeconds({ time: target.element.trimStart });
		const timelineStart = mediaTimeToSeconds({
			time: target.element.startTime,
		});
		const duration = mediaTimeToSeconds({ time: target.element.duration });
		const mapped = Math.max(
			timelineStart,
			Math.min(
				timelineStart + duration,
				timelineStart + sourceSeconds - sourceStart,
			),
		);
		editor.playback.seek({ time: mediaTimeFromSeconds({ seconds: mapped }) });
	};

	const applicability = useMemo(() => {
		if (!roughCutPlan || !scene) return null;
		return inspectRoughCutApplicability({
			tracks: scene.tracks,
			plan: roughCutPlan,
			hasTimelineBookmarks: scene.bookmarks.length > 0,
			currentAssetFingerprint: selectedAsset
				? assetFingerprint(selectedAsset)
				: "",
			currentMediaIndexId: mediaIndex?.mediaIndexId ?? "",
		});
	}, [mediaIndex?.mediaIndexId, roughCutPlan, scene, selectedAsset]);

	const handleApply = () => {
		if (!roughCutPlan || !applicability?.canApply) return;
		const command = new ApplyRoughCutCommand(roughCutPlan);
		editor.command.execute({ command });
		setAppliedPlanId(roughCutPlan.planId);
		setAppliedCommand(command);
		toast.success(`已执行 ${applicability.approvedOperationCount} 个批准切口`, {
			description: "整组时间线修改可以一次撤销。",
		});
	};

	const canUndoAppliedPlan =
		appliedCommand !== null &&
		editor.command.isLatest(appliedCommand) &&
		scene?.id === appliedCommand.sceneId;

	const handleUndo = () => {
		if (!appliedCommand || !canUndoAppliedPlan) {
			toast.error("这次粗剪已不是当前场景的最近一次编辑，不能越过后续修改撤销。");
			return;
		}
		editor.command.undo();
		setAppliedPlanId(null);
		setAppliedCommand(null);
		toast.success("已撤销本次低能量粗剪");
	};

	if (!projectId) {
		return <p className="py-8 text-center text-[10px]">项目尚未加载。</p>;
	}

	if (analyzableAssets.length === 0) {
		return (
			<section className="rounded-[8px] border border-dashed p-6 text-center">
				<FileSearch className="mx-auto size-5 text-muted-foreground" />
				<p className="mt-2 text-[11px] font-semibold">导入视频或音频后再分析</p>
				<p className="mt-1 text-[9px] text-muted-foreground">
					分析在浏览器本地执行，不上传原素材。
				</p>
			</section>
		);
	}

	return (
		<div className="space-y-4 pb-5" data-testid="visioncut-media-intelligence">
			<section className="overflow-hidden rounded-[8px] border">
				<div className="flex items-start gap-3 p-3">
					<span className="flex size-9 shrink-0 items-center justify-center rounded-[7px] border bg-background">
						<FileSearch className="size-4" />
					</span>
					<div className="min-w-0 flex-1">
						<h2 className="text-[12px] font-semibold">素材证据分析</h2>
						<p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
							只测量帧变化、亮度和音频能量；不声称识别对白、人物、情绪或故事含义。
						</p>
					</div>
					<ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
				</div>
				<div className="border-t p-2.5">
					<p className="mb-2 text-[9px] font-medium text-muted-foreground">
						选择素材
					</p>
					<div className="scrollbar-hidden flex gap-1.5 overflow-x-auto pb-1">
						{analyzableAssets.map((asset) => (
							<button
								key={asset.id}
								type="button"
								className={cn(
									"min-h-11 min-w-32 max-w-48 truncate rounded-[6px] border px-2.5 text-left text-[10px]",
									effectiveSelectedAssetId === asset.id
										? "border-foreground bg-foreground text-background"
										: "bg-background",
								)}
								onClick={() => {
									setSelectedAssetId(asset.id);
									setMediaIndex(null);
									setRoughCutPlan(null);
									setAppliedPlanId(null);
									setAnalysisError(null);
								}}
							>
								{asset.name}
							</button>
						))}
					</div>

					{isAnalyzing && progress ? (
						<div className="mt-3 border-t pt-3" aria-live="polite">
							<div className="flex items-center justify-between gap-3 text-[10px]">
								<span className="flex items-center gap-2 font-medium">
									<Loader2 className="size-3.5 animate-spin" />
									{progress.message}
								</span>
								<span className="font-mono text-[9px]">
									{Math.round(progress.progress)}%
								</span>
							</div>
							<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
								<div
									className="h-full bg-foreground transition-[width]"
									style={{ width: `${progress.progress}%` }}
								/>
							</div>
						</div>
					) : null}

					{analysisError ? (
						<p className="mt-3 flex items-start gap-2 border-t pt-3 text-[9px] leading-relaxed text-amber-700">
							<AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
							{analysisError}
						</p>
					) : null}

					<div className="mt-3 flex gap-2">
						<Button
							className="h-11 flex-1 xl:h-9"
							disabled={isAnalyzing || isLoadingStored}
							onClick={handleAnalyze}
						>
							{mediaIndex ? (
								<RefreshCw className="size-4" />
							) : (
								<FileSearch className="size-4" />
							)}
							{mediaIndex ? "重新分析" : "开始本地分析"}
						</Button>
						{isAnalyzing ? (
							<Button
								variant="outline"
								size="icon"
								className="size-11 xl:size-9"
								onClick={() => abortRef.current?.abort()}
								title="取消分析"
								aria-label="取消分析"
							>
								<CircleStop className="size-4" />
							</Button>
						) : null}
					</div>
				</div>
			</section>

			{mediaIndex ? (
				<>
					<section className="rounded-[8px] border p-3">
						<div className="flex items-center justify-between gap-3">
							<h3 className="text-[11px] font-semibold">分析覆盖</h3>
							<span className="font-mono text-[8px] text-muted-foreground">
								{mediaIndex.algorithm.version}
							</span>
						</div>
						<CoverageLine
							label="画面"
							state={mediaIndex.summary.videoCoverage.state}
							count={mediaIndex.summary.videoCoverage.sampleCount}
							last={mediaIndex.summary.videoCoverage.lastSampleSeconds}
						/>
						<CoverageLine
							label="音频"
							state={mediaIndex.summary.audioCoverage.state}
							count={mediaIndex.summary.audioCoverage.sampleCount}
							last={mediaIndex.summary.audioCoverage.lastSampleSeconds}
						/>
						<div className="grid grid-cols-3 divide-x border-t pt-2 text-center">
							<div>
								<p className="font-mono text-[13px] font-semibold">
									{mediaIndex.sceneBoundaries.length}
								</p>
								<p className="text-[8px] text-muted-foreground">帧变化</p>
							</div>
							<div>
								<p className="font-mono text-[13px] font-semibold">
									{
										mediaIndex.audioActivityCandidates.filter(
											(item) => item.candidateType === "silence",
										).length
									}
								</p>
								<p className="text-[8px] text-muted-foreground">低能量</p>
							</div>
							<div>
								<p className="font-mono text-[13px] font-semibold">
									{mediaIndex.qualityWarnings.length}
								</p>
								<p className="text-[8px] text-muted-foreground">质量提示</p>
							</div>
						</div>
					</section>

					{mediaIndex.sceneBoundaries.length > 0 ? (
						<section>
							<div className="mb-2 flex items-center justify-between gap-3">
								<h3 className="text-[11px] font-semibold">帧变化候选</h3>
								<span className="text-[8px] text-muted-foreground">
									点击定位
								</span>
							</div>
							<div className="grid grid-cols-2 gap-1.5">
								{mediaIndex.sceneBoundaries.map((boundary) => (
									<button
										key={boundary.findingId}
										type="button"
										className="flex min-h-11 items-center justify-between rounded-[6px] border px-2.5 text-left text-[9px]"
										onClick={() => seekToSourceTime(boundary.boundaryAtSeconds)}
									>
										<span className="flex items-center gap-1.5 font-medium">
											<MapPin className="size-3" />
											{formatTime(boundary.boundaryAtSeconds)}
										</span>
										<span className="font-mono text-muted-foreground">
											{Math.round(boundary.confidence.score * 100)}
										</span>
									</button>
								))}
							</div>
						</section>
					) : null}

					{mediaIndex.qualityWarnings.length > 0 ? (
						<section className="rounded-[8px] border p-3">
							<h3 className="text-[11px] font-semibold">质量提示</h3>
							<div className="mt-2 divide-y">
								{mediaIndex.qualityWarnings.map((warning) => (
									<p
										key={warning.findingId}
										className="py-2 text-[9px] leading-relaxed text-muted-foreground"
									>
										{warning.message}
									</p>
								))}
							</div>
						</section>
					) : null}

					<section className="overflow-hidden rounded-[8px] border">
						<div className="flex items-start justify-between gap-3 p-3">
							<div>
								<h3 className="text-[11px] font-semibold">可审阅低能量粗剪</h3>
								<p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
									只建议持续低音频能量区间，不判断“废话”或语义重点。
								</p>
							</div>
							<Scissors className="size-4 shrink-0" />
						</div>
						<div className="border-t p-2.5">
							{timelineTargets.length > 0 ? (
								<div className="space-y-1.5">
									{timelineTargets.map((candidate) => (
										<button
											key={`${candidate.trackId}:${candidate.element.id}`}
											type="button"
											className={cn(
												"flex min-h-11 w-full items-center justify-between rounded-[6px] border px-2.5 text-left text-[9px]",
										effectiveTargetElementId === candidate.element.id &&
													"border-foreground",
											)}
											onClick={() => setTargetElementId(candidate.element.id)}
										>
											<span className="truncate font-medium">
												{candidate.element.name}
											</span>
											<span className="shrink-0 font-mono text-muted-foreground">
												{candidate.trackName}
											</span>
										</button>
									))}
								</div>
							) : (
								<p className="text-[9px] text-muted-foreground">
									先把这段素材加入时间线，再生成可执行切口。
								</p>
							)}
							<Button
								variant="outline"
								className="mt-2 h-11 w-full xl:h-9"
								disabled={!target}
								onClick={handleCreateRoughCut}
							>
								<Scissors className="size-4" />
								生成切口建议
							</Button>
						</div>
					</section>

					{roughCutPlan ? (
						<section className="rounded-[8px] border p-3">
							<div className="flex items-center justify-between gap-3">
								<div>
									<h3 className="text-[11px] font-semibold">切口审阅</h3>
									<p className="mt-0.5 font-mono text-[8px] text-muted-foreground">
										{roughCutPlan.evidenceArtifact.mediaIndexId}
									</p>
								</div>
								<Button
									variant="outline"
									className="h-11 xl:h-9"
									disabled={roughCutPlan.operations.length === 0}
									onClick={approveAll}
								>
									<Check className="size-3.5" />
									全部批准
								</Button>
							</div>
							<div className="mt-2 divide-y border-y">
								{roughCutPlan.operations.map((operation) => (
									<div key={operation.operationId} className="py-2.5">
										<button
											type="button"
											className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
											onClick={() =>
												seekToSourceTime(operation.sourceRange.startSeconds)
											}
										>
											<span>
												<span className="block text-[10px] font-medium">
													{formatTime(operation.sourceRange.startSeconds)} –{" "}
													{formatTime(operation.sourceRange.endSeconds)}
												</span>
												<span className="mt-0.5 block text-[8px] text-muted-foreground">
													移除 {operation.removedSeconds.toFixed(2)} 秒 · 证据{" "}
													{Math.round(operation.confidence * 100)}
												</span>
											</span>
											<Clock3 className="size-3.5 shrink-0 text-muted-foreground" />
										</button>
										<div className="mt-1.5 grid grid-cols-2 gap-1.5">
											<Button
												variant="outline"
												className={cn(
													"h-11 xl:h-9",
													operation.status === "approved" &&
														"border-emerald-600 text-emerald-700",
												)}
												onClick={() =>
													reviewOperation({
														operationId: operation.operationId,
														status: "approved",
													})
												}
											>
												<Check className="size-3.5" />
												保留切口
											</Button>
											<Button
												variant="outline"
												className={cn(
													"h-11 xl:h-9",
													operation.status === "rejected" &&
														"border-foreground text-foreground",
												)}
												onClick={() =>
													reviewOperation({
														operationId: operation.operationId,
														status: "rejected",
													})
												}
											>
												<X className="size-3.5" />
												不剪这里
											</Button>
										</div>
									</div>
								))}
							</div>

							{applicability && applicability.blockers.length > 0 ? (
								<div className="mt-2 space-y-1.5">
									{applicability.blockers.map((blocker) => (
										<p
											key={blocker}
											className="flex gap-2 text-[9px] leading-relaxed text-amber-700"
										>
											<AlertTriangle className="mt-0.5 size-3 shrink-0" />
											{blocker}
										</p>
									))}
								</div>
							) : null}

							<div className="mt-3 flex gap-2">
								<Button
									className="h-11 min-w-0 flex-1 xl:h-9"
									disabled={
										!applicability?.canApply ||
										appliedPlanId === roughCutPlan.planId
									}
									onClick={handleApply}
								>
									<Scissors className="size-4" />
									执行批准切口
								</Button>
								{appliedPlanId === roughCutPlan.planId ? (
									<Button
										variant="outline"
										className="h-11 xl:h-9"
										disabled={!canUndoAppliedPlan}
										onClick={handleUndo}
										title={
											canUndoAppliedPlan
												? "撤销本次粗剪"
												: "已有后续编辑或场景已切换，不能在这里撤销"
										}
									>
										<Undo2 className="size-4" />
										撤销
									</Button>
								) : null}
							</div>
						</section>
					) : null}
				</>
			) : null}
		</div>
	);
}
