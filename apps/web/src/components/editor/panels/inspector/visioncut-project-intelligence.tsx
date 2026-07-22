"use client";

import {
	AlertTriangle,
	CheckCircle2,
	CircleDashed,
	FileAudio2,
	FileImage,
	FileVideo2,
	FolderOpen,
	Gauge,
	HardDrive,
	ScanSearch,
	ShieldCheck,
	Wand2,
	type LucideIcon,
} from "lucide-react";
import type { MediaAsset } from "@/media/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/ui";

export interface ProjectIntelligenceSnapshot {
	assets: readonly MediaAsset[];
	timelineElementCount: number;
	usedMediaCount: number;
	durationSeconds: number;
}

interface VisionCutProjectIntelligenceProps {
	snapshot: ProjectIntelligenceSnapshot;
	onImportMedia: () => void;
	onOpenDirector: () => void;
	onOpenModels?: () => void;
}

type ReadinessState = "ready" | "current" | "waiting";

const MEDIA_ICONS: Record<MediaAsset["type"], LucideIcon> = {
	video: FileVideo2,
	audio: FileAudio2,
	image: FileImage,
};

function formatDuration(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
	const rounded = Math.round(seconds);
	const hours = Math.floor(rounded / 3600);
	const minutes = Math.floor((rounded % 3600) / 60);
	const remaining = rounded % 60;
	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, "0")}:${remaining
			.toString()
			.padStart(2, "0")}`;
	}
	return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB"];
	const exponent = Math.min(
		Math.floor(Math.log(bytes) / Math.log(1024)),
		units.length - 1,
	);
	const value = bytes / 1024 ** exponent;
	return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function getAssetDetail(asset: MediaAsset): string {
	const details: string[] = [];
	if (asset.width && asset.height)
		details.push(`${asset.width}×${asset.height}`);
	if (asset.duration) details.push(formatDuration(asset.duration));
	if (asset.fps) details.push(`${Math.round(asset.fps)} fps`);
	if (details.length === 0) details.push(formatBytes(asset.file.size));
	return details.join(" · ");
}

function ReadinessRow({
	index,
	title,
	detail,
	state,
}: {
	index: string;
	title: string;
	detail: string;
	state: ReadinessState;
}) {
	const Icon = state === "ready" ? CheckCircle2 : CircleDashed;
	return (
		<div className="flex min-w-0 items-start gap-2.5 border-t py-2.5 first:border-t-0">
			<span
				className={cn(
					"mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[5px] border text-[8px] font-semibold",
					state === "ready" &&
						"border-emerald-500/35 bg-emerald-500/10 text-emerald-600",
					state === "current" &&
						"border-[#d7ff3f]/60 bg-[#d7ff3f]/10 text-foreground",
					state === "waiting" && "text-muted-foreground",
				)}
			>
				{index}
			</span>
			<div className="min-w-0 flex-1">
				<div className="flex items-center justify-between gap-2">
					<p className="text-[11px] font-medium">{title}</p>
					<Icon
						className={cn(
							"size-3.5 shrink-0",
							state === "ready" ? "text-emerald-600" : "text-muted-foreground",
						)}
					/>
				</div>
				<p className="mt-0.5 text-[9px] leading-relaxed text-muted-foreground">
					{detail}
				</p>
			</div>
		</div>
	);
}

export function VisionCutProjectIntelligence({
	snapshot,
	onImportMedia,
	onOpenDirector,
	onOpenModels,
}: VisionCutProjectIntelligenceProps) {
	const { assets, timelineElementCount, usedMediaCount, durationSeconds } =
		snapshot;
	const videoAssets = assets.filter((asset) => asset.type === "video");
	const audioAssets = assets.filter((asset) => asset.type === "audio");
	const imageAssets = assets.filter((asset) => asset.type === "image");
	const totalBytes = assets.reduce(
		(total, asset) => total + asset.file.size,
		0,
	);
	const unusedMediaCount = Math.max(0, assets.length - usedMediaCount);
	const frameRates = new Set(
		videoAssets
			.map((asset) => asset.fps)
			.filter((fps): fps is number => typeof fps === "number")
			.map((fps) => Math.round(fps)),
	);
	const portraitCount = assets.filter(
		(asset) => asset.width && asset.height && asset.height > asset.width,
	).length;
	const landscapeCount = assets.filter(
		(asset) => asset.width && asset.height && asset.width > asset.height,
	).length;
	const missingMetadataCount = assets.filter(
		(asset) => asset.type !== "audio" && (!asset.width || !asset.height),
	).length;
	const ephemeralCount = assets.filter((asset) => asset.ephemeral).length;

	const observations: string[] = [];
	if (unusedMediaCount > 0) {
		observations.push(
			`${unusedMediaCount} 个素材尚未进入时间线，可先生成顺排粗剪。`,
		);
	}
	if (frameRates.size > 1) {
		observations.push(
			`检测到 ${[...frameRates].sort((a, b) => a - b).join(" / ")} fps，精剪前应确认项目帧率。`,
		);
	}
	if (portraitCount > 0 && landscapeCount > 0) {
		observations.push("横竖素材混合，发布前需要逐镜头检查主体与字幕安全区。");
	}
	if (missingMetadataCount > 0) {
		observations.push(`${missingMetadataCount} 个视觉素材缺少完整尺寸元数据。`);
	}
	if (ephemeralCount > 0) {
		observations.push(
			`${ephemeralCount} 个素材为临时引用，关闭来源后可能需要重新定位。`,
		);
	}
	if (durationSeconds > 900) {
		observations.push(
			"当前成片超过 15 分钟，建议分章处理以降低浏览器内存压力。",
		);
	}
	if (observations.length === 0 && assets.length > 0) {
		observations.push("未发现明显的元数据或时间线阻塞，可以进入成片蓝图设计。");
	}

	const hasAssets = assets.length > 0;
	const hasTimeline = timelineElementCount > 0;
	const nextAction = !hasAssets
		? {
				title: "导入第一批原片",
				detail: "视频、图片和音频默认保留在浏览器本地。",
				label: "选择素材",
				icon: FolderOpen,
				onClick: onImportMedia,
			}
		: !hasTimeline
			? {
					title: "生成第一版成片蓝图",
					detail: "先确认故事、画幅与执行步骤，再让本机改动时间线。",
					label: "打开 AI 导演",
					icon: Wand2,
					onClick: onOpenDirector,
				}
			: {
					title: "复核当前剪辑方向",
					detail: "基于现有时间线生成新方案，所有本机修改可整组撤销。",
					label: "继续导演",
					icon: Wand2,
					onClick: onOpenDirector,
				};
	const NextActionIcon = nextAction.icon;
	const mediaStats: Array<{
		icon: LucideIcon;
		label: string;
		value: number;
	}> = [
		{ icon: FileVideo2, label: "视频", value: videoAssets.length },
		{ icon: FileAudio2, label: "音频", value: audioAssets.length },
		{ icon: FileImage, label: "图片", value: imageAssets.length },
	];

	return (
		<div className="space-y-4 pb-5">
			<section className="overflow-hidden rounded-[8px] border">
				<div className="flex items-start gap-3 p-3.5">
					<div className="flex size-10 shrink-0 items-center justify-center rounded-[7px] border bg-foreground text-background">
						<ScanSearch className="size-5" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-center justify-between gap-2">
							<h2 className="text-[14px] font-semibold">项目智能台</h2>
							<span className="inline-flex items-center gap-1 text-[9px] text-emerald-700 dark:text-emerald-300">
								<ShieldCheck className="size-3" />
								免费本机
							</span>
						</div>
						<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
							这里只显示浏览器已经读取到的文件与时间线事实，不伪造内容评分。
						</p>
					</div>
				</div>
				<div className="grid grid-cols-4 divide-x border-t text-center">
					{[
						["原始素材", `${assets.length}`],
						["已用素材", `${usedMediaCount}`],
						["时间线", `${timelineElementCount}`],
						["成片", formatDuration(durationSeconds)],
					].map(([label, value]) => (
						<div key={label} className="min-w-0 px-1.5 py-2.5">
							<p className="text-[8px] text-muted-foreground">{label}</p>
							<p className="mt-1 truncate text-[11px] font-semibold">{value}</p>
						</div>
					))}
				</div>
			</section>

			<section>
				<div className="mb-2 flex items-center justify-between gap-2">
					<h3 className="text-[12px] font-semibold">制作就绪度</h3>
					<span className="text-[9px] text-muted-foreground">真实状态</span>
				</div>
				<div className="border-y">
					<ReadinessRow
						index="01"
						title="素材接收"
						detail={
							hasAssets
								? `${assets.length} 个文件，共 ${formatBytes(totalBytes)}`
								: "等待导入原始视频、图片或音频"
						}
						state={hasAssets ? "ready" : "current"}
					/>
					<ReadinessRow
						index="02"
						title="时间线组织"
						detail={
							hasTimeline
								? `${timelineElementCount} 个元素已进入剪辑结构`
								: hasAssets
									? "素材已就绪，可生成顺排与画幅方案"
									: "导入素材后开始"
						}
						state={hasTimeline ? "ready" : hasAssets ? "current" : "waiting"}
					/>
					<ReadinessRow
						index="03"
						title="内容理解"
						detail="当前仅有媒体元数据；对白、场景、人物与情绪需要本地模型或你的 API"
						state={hasAssets ? "current" : "waiting"}
					/>
					<ReadinessRow
						index="04"
						title="交付检查"
						detail={
							durationSeconds > 0
								? "已有可预览时间线，导出前仍需画幅、声音和黑帧复核"
								: "形成可播放时间线后开始"
						}
						state={durationSeconds > 0 ? "current" : "waiting"}
					/>
				</div>
			</section>

			{hasAssets ? (
				<section>
					<div className="mb-2 flex items-center justify-between gap-2">
						<h3 className="text-[12px] font-semibold">素材构成</h3>
						<span className="text-[9px] text-muted-foreground">
							{formatBytes(totalBytes)}
						</span>
					</div>
					<div className="grid grid-cols-3 divide-x border-y py-2 text-center">
						{mediaStats.map(({ icon: MediaIcon, label, value }) => {
							return (
								<div key={label} className="min-w-0 px-2">
									<MediaIcon className="mx-auto size-3.5 text-muted-foreground" />
									<p className="mt-1 text-[9px] text-muted-foreground">
										{label}
									</p>
									<p className="mt-0.5 text-xs font-semibold">{value}</p>
								</div>
							);
						})}
					</div>
					<div className="mt-2 divide-y border-y">
						{assets.slice(0, 5).map((asset) => {
							const Icon = MEDIA_ICONS[asset.type];
							return (
								<div
									key={asset.id}
									className="flex min-w-0 items-center gap-2 py-2"
								>
									<span className="flex size-7 shrink-0 items-center justify-center rounded-[5px] border">
										<Icon className="size-3.5" />
									</span>
									<div className="min-w-0 flex-1">
										<p className="truncate text-[10px] font-medium">
											{asset.name}
										</p>
										<p className="mt-0.5 truncate text-[8px] text-muted-foreground">
											{getAssetDetail(asset)}
										</p>
									</div>
								</div>
							);
						})}
					</div>
					{assets.length > 5 ? (
						<p className="mt-2 text-[9px] text-muted-foreground">
							另有 {assets.length - 5} 个素材已收录
						</p>
					) : null}
				</section>
			) : null}

			{observations.length > 0 ? (
				<section className="rounded-[8px] border p-3">
					<h3 className="flex items-center gap-1.5 text-[11px] font-semibold">
						<AlertTriangle className="size-3.5 text-amber-600" />
						制作提醒
					</h3>
					<ul className="mt-2 space-y-2">
						{observations.map((observation) => (
							<li
								key={observation}
								className="flex gap-1.5 text-[9px] leading-relaxed text-muted-foreground"
							>
								<span className="mt-1.5 size-1 shrink-0 rounded-full bg-amber-500" />
								<span>{observation}</span>
							</li>
						))}
					</ul>
				</section>
			) : null}

			<section className="rounded-[8px] border p-3">
				<div className="flex items-start gap-2.5">
					<div className="flex size-8 shrink-0 items-center justify-center rounded-[6px] bg-[#d7ff3f] text-black">
						<NextActionIcon className="size-4" />
					</div>
					<div className="min-w-0 flex-1">
						<h3 className="text-[11px] font-semibold">{nextAction.title}</h3>
						<p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
							{nextAction.detail}
						</p>
					</div>
				</div>
				<Button className="mt-3 h-10 w-full" onClick={nextAction.onClick}>
					<NextActionIcon className="size-4" />
					{nextAction.label}
				</Button>
				{onOpenModels ? (
					<Button
						variant="outline"
						className="mt-2 h-10 w-full"
						onClick={onOpenModels}
					>
						<Gauge className="size-4" />
						配置本地模型或自己的 API
					</Button>
				) : null}
			</section>

			<div className="flex gap-2 px-1 text-[9px] leading-relaxed text-muted-foreground">
				<HardDrive className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
				<p>
					免费路径包含素材管理、时间线编辑、画幅调整、撤销和浏览器导出。模型能力保持可选，不连接也能继续工作。
				</p>
			</div>
		</div>
	);
}
