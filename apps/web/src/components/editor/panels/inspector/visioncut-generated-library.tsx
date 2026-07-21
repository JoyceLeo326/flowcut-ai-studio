"use client";

import Image from "next/image";
import {
	Aperture,
	Building2,
	Check,
	ChevronLeft,
	ChevronRight,
	Cpu,
	Grid3X3,
	ImageOff,
	Images,
	MapPinned,
	Mic2,
	Package,
	Search,
	Sparkles,
	Trophy,
	UsersRound,
	UtensilsCrossed,
	UserRound,
	type LucideIcon,
} from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import {
	VISIONCUT_AVAILABLE_GENERATED_LIBRARY,
	VISIONCUT_LIBRARY_CATEGORIES,
	type VisionCutGeneratedAsset,
	type VisionCutLibraryCategoryId,
} from "@/ai-studio/generated-library";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/ui";

const PAGE_SIZE = 20;

type CategoryFilter = "all" | VisionCutLibraryCategoryId;

const CATEGORY_ICONS = {
	"talking-head": Mic2,
	"product-detail": Package,
	"city-night": Aperture,
	"travel-place": MapPinned,
	"food-life": UtensilsCrossed,
	"sports-action": Trophy,
	"event-crowd": UsersRound,
	"tech-device": Cpu,
	"documentary-human": UserRound,
	"architecture-space": Building2,
} satisfies Record<VisionCutLibraryCategoryId, LucideIcon>;

const FALLBACK_SURFACES = [
	"bg-[#171b1d] text-[#d8e4e6]",
	"bg-[#1c1a17] text-[#e6dfd2]",
	"bg-[#161c19] text-[#d6e6dc]",
	"bg-[#1a191e] text-[#e0dce8]",
	"bg-[#1a1d22] text-[#d8e0eb]",
	"bg-[#1d1818] text-[#eadbd7]",
	"bg-[#171d1d] text-[#d2e7e5]",
	"bg-[#1d1c17] text-[#e8e3cf]",
	"bg-[#181a20] text-[#d9ddec]",
	"bg-[#1b181d] text-[#e5d8e3]",
] as const;

export interface VisionCutGeneratedLibraryProps {
	className?: string;
	defaultSelectedIds?: readonly string[];
	onSelectionChange?: (assets: readonly VisionCutGeneratedAsset[]) => void;
}

function getFallbackSurface(id: string) {
	const index = [...id].reduce((total, character) => {
		return total + character.charCodeAt(0);
	}, 0);

	return FALLBACK_SURFACES[index % FALLBACK_SURFACES.length];
}

function GeneratedAssetPreview({ asset }: { asset: VisionCutGeneratedAsset }) {
	const [failed, setFailed] = useState(false);

	if (failed) {
		return (
			<div
				className={cn(
					"absolute inset-0 flex flex-col items-center justify-center gap-2 px-5 text-center",
					getFallbackSurface(asset.id),
				)}
				role="img"
				aria-label={`${asset.alt}，预览图待生成`}
			>
				<ImageOff className="size-5 opacity-70" aria-hidden="true" />
				<span className="line-clamp-2 text-xs leading-5 font-medium">
					{asset.title}
				</span>
				<span className="text-[10px] opacity-55">图像待生成</span>
			</div>
		);
	}

	return (
		<Image
			src={asset.path}
			alt={asset.alt}
			fill
			unoptimized
			draggable={false}
			sizes="(max-width: 479px) 100vw, (max-width: 1023px) 50vw, 33vw"
			className="object-cover transition-transform duration-200 motion-reduce:transition-none group-hover:scale-[1.015]"
			onError={() => setFailed(true)}
		/>
	);
}

function LibraryCard({
	asset,
	selected,
	onToggle,
}: {
	asset: VisionCutGeneratedAsset;
	selected: boolean;
	onToggle: () => void;
}) {
	return (
		<article
			className={cn(
				"overflow-hidden rounded-[6px] border bg-[#101214] transition-colors duration-150 motion-reduce:transition-none",
				selected
					? "border-[#d7ff3f]/75 bg-[#151812]"
					: "border-white/10 hover:border-white/25",
			)}
		>
			<button
				type="button"
				className="group block min-h-11 w-full cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-[#9ce9f2] focus-visible:ring-inset"
				onClick={onToggle}
				aria-pressed={selected}
				aria-label={`${selected ? "取消选择" : "选择"}${asset.title}`}
			>
				<div className="relative aspect-[16/10] overflow-hidden border-b border-white/10 bg-[#17191b]">
					<GeneratedAssetPreview asset={asset} />
					<div className="absolute top-2 left-2 flex min-h-6 items-center gap-1 rounded-[4px] border border-white/15 bg-black/70 px-2 text-[10px] font-medium text-white backdrop-blur-sm">
						<Sparkles className="size-3 text-[#d7ff3f]" aria-hidden="true" />
						VisionCut Original AI
					</div>
					<div
						className={cn(
							"absolute top-2 right-2 flex size-7 items-center justify-center rounded-[4px] border backdrop-blur-sm",
							selected
								? "border-[#d7ff3f] bg-[#d7ff3f] text-black"
								: "border-white/20 bg-black/55 text-white/65",
						)}
						aria-hidden="true"
					>
						{selected ? <Check className="size-4" /> : null}
					</div>
				</div>

				<div className="space-y-3 p-3">
					<div className="min-w-0">
						<div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-white/45">
							<span>{asset.category}</span>
							<span>{asset.aspectRatio}</span>
						</div>
						<h3 className="truncate text-[13px] leading-5 font-semibold text-white">
							{asset.title}
						</h3>
						<p className="mt-1 line-clamp-2 min-h-9 text-[11px] leading-[18px] text-white/58">
							{asset.scene}
						</p>
					</div>

					<dl className="grid grid-cols-2 border-t border-white/8 pt-2.5 text-[10px] leading-4">
						<div className="min-w-0 border-r border-white/8 pr-2">
							<dt className="text-white/38">镜头</dt>
							<dd className="truncate text-white/72">{asset.shotScale}</dd>
						</div>
						<div className="min-w-0 pl-2">
							<dt className="text-white/38">用途</dt>
							<dd className="truncate text-white/72">{asset.useCase}</dd>
						</div>
					</dl>

					<div className="truncate text-[10px] text-[#9ce9f2]/75">
						{asset.styleWorld}
					</div>
				</div>
			</button>
		</article>
	);
}

export function VisionCutGeneratedLibrary({
	className,
	defaultSelectedIds = [],
	onSelectionChange,
}: VisionCutGeneratedLibraryProps) {
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState<CategoryFilter>("all");
	const [page, setPage] = useState(1);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
		const validIds = new Set(
			VISIONCUT_AVAILABLE_GENERATED_LIBRARY.map((asset) => asset.id),
		);
		return new Set(defaultSelectedIds.filter((id) => validIds.has(id)));
	});
	const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());

	const filteredAssets = useMemo(() => {
		return VISIONCUT_AVAILABLE_GENERATED_LIBRARY.filter((asset) => {
			if (category !== "all" && asset.categoryId !== category) {
				return false;
			}

			if (!deferredQuery) {
				return true;
			}

			return [
				asset.title,
				asset.category,
				asset.scene,
				asset.shotScale,
				asset.useCase,
				asset.styleWorld,
				asset.alt,
			]
				.join(" ")
				.toLocaleLowerCase()
				.includes(deferredQuery);
		});
	}, [category, deferredQuery]);

	const pageCount = Math.max(1, Math.ceil(filteredAssets.length / PAGE_SIZE));
	const currentPage = Math.min(page, pageCount);
	const pageAssets = filteredAssets.slice(
		(currentPage - 1) * PAGE_SIZE,
		currentPage * PAGE_SIZE,
	);
	const firstVisible = filteredAssets.length
		? (currentPage - 1) * PAGE_SIZE + 1
		: 0;
	const lastVisible = Math.min(currentPage * PAGE_SIZE, filteredAssets.length);

	function commitSelection(nextIds: Set<string>) {
		setSelectedIds(nextIds);
		onSelectionChange?.(
			VISIONCUT_AVAILABLE_GENERATED_LIBRARY.filter((asset) =>
				nextIds.has(asset.id),
			),
		);
	}

	function toggleAsset(assetId: string) {
		const nextIds = new Set(selectedIds);
		if (nextIds.has(assetId)) {
			nextIds.delete(assetId);
		} else {
			nextIds.add(assetId);
		}
		commitSelection(nextIds);
	}

	return (
		<section
			className={cn(
				"flex min-h-0 flex-col overflow-hidden bg-[#090a0b] text-white",
				className,
			)}
			aria-labelledby="visioncut-library-title"
		>
			<header className="border-b border-white/10 px-3 py-3 sm:px-4 sm:py-4">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="mb-1 flex items-center gap-2 text-[10px] font-medium text-[#9ce9f2]">
							<Images className="size-3.5" aria-hidden="true" />
							ORIGINALS / {VISIONCUT_AVAILABLE_GENERATED_LIBRARY.length}
						</div>
						<h2
							id="visioncut-library-title"
							className="text-[15px] leading-5 font-semibold"
						>
							AI 生成素材库
						</h2>
						<p className="mt-1 max-w-xl text-[11px] leading-[18px] text-white/55">
							按内容语义选择已完成的原创镜头，直接加入视觉规划。
						</p>
					</div>
					<div className="flex min-h-11 shrink-0 items-center gap-2 rounded-[6px] border border-white/10 bg-white/[0.035] px-3">
						<Sparkles className="size-3.5 text-[#d7ff3f]" aria-hidden="true" />
						<div>
							<div className="text-[10px] text-white/42">授权</div>
							<div className="text-[10px] font-medium text-white/82">
								VisionCut Original AI
							</div>
						</div>
					</div>
				</div>
			</header>

			<div className="space-y-3 border-b border-white/10 px-3 py-3 sm:px-4">
				<div className="flex flex-col gap-2 min-[560px]:flex-row min-[560px]:items-center">
					<div className="relative min-w-0 flex-1">
						<Search
							className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/38"
							aria-hidden="true"
						/>
						<Input
							value={query}
							onChange={(event) => {
								setQuery(event.target.value);
								setPage(1);
							}}
							placeholder="搜索场景、用途、镜头或风格"
							aria-label="搜索 VisionCut 生成素材"
							className="h-11 rounded-[6px] border-white/10 bg-white/[0.035] pr-3 pl-10 text-[13px] text-white shadow-none placeholder:text-white/35 focus-visible:border-[#9ce9f2]/50 focus-visible:ring-[#9ce9f2]/15"
						/>
					</div>

					<div className="flex min-h-11 items-center justify-between gap-2 border-l-2 border-[#d7ff3f] bg-[#d7ff3f]/[0.055] px-3 min-[560px]:min-w-44">
						<span className="text-[11px] text-white/65">
							已选{" "}
							<strong className="font-semibold text-white">
								{selectedIds.size}
							</strong>{" "}
							张
						</span>
						<button
							type="button"
							className="h-11 min-w-11 cursor-pointer rounded-[4px] px-3 text-[11px] text-white/62 outline-none hover:bg-white/8 hover:text-white focus-visible:ring-2 focus-visible:ring-[#9ce9f2] disabled:pointer-events-none disabled:opacity-40"
							disabled={selectedIds.size === 0}
							onClick={() => commitSelection(new Set())}
						>
							清空
						</button>
					</div>
				</div>

				<nav
					className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
					aria-label="素材类别"
				>
					<button
						type="button"
						className={cn(
							"flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[4px] border px-3 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#9ce9f2]",
							category === "all"
								? "border-[#9ce9f2]/60 bg-[#9ce9f2]/10 text-[#c9f7fb]"
								: "border-transparent text-white/58 hover:border-white/10 hover:bg-white/[0.045] hover:text-white",
						)}
						onClick={() => {
							setCategory("all");
							setPage(1);
						}}
						aria-pressed={category === "all"}
					>
						<Grid3X3 className="size-3.5" aria-hidden="true" />
						全部 {VISIONCUT_AVAILABLE_GENERATED_LIBRARY.length}
					</button>

					{VISIONCUT_LIBRARY_CATEGORIES.map((item) => {
						const Icon = CATEGORY_ICONS[item.id];
						const active = category === item.id;

						return (
							<button
								key={item.id}
								type="button"
								className={cn(
									"flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[4px] border px-3 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#9ce9f2]",
									active
										? "border-[#9ce9f2]/60 bg-[#9ce9f2]/10 text-[#c9f7fb]"
										: "border-transparent text-white/58 hover:border-white/10 hover:bg-white/[0.045] hover:text-white",
								)}
								onClick={() => {
									setCategory(item.id);
									setPage(1);
								}}
								aria-pressed={active}
								title={item.description}
							>
								<Icon className="size-3.5" aria-hidden="true" />
								{item.label}
							</button>
						);
					})}
				</nav>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 sm:py-4">
				<div className="mb-3 flex items-center justify-between gap-3 text-[10px] text-white/42">
					<span aria-live="polite">
						显示 {firstVisible}–{lastVisible} / {filteredAssets.length}
					</span>
					<span>每页 {PAGE_SIZE} 张</span>
				</div>

				{pageAssets.length ? (
					<div
						className="grid grid-cols-1 gap-2.5 min-[460px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
						role="list"
					>
						{pageAssets.map((asset) => (
							<div key={asset.id} role="listitem">
								<LibraryCard
									asset={asset}
									selected={selectedIds.has(asset.id)}
									onToggle={() => toggleAsset(asset.id)}
								/>
							</div>
						))}
					</div>
				) : (
					<div className="flex min-h-64 flex-col items-center justify-center border-y border-white/8 px-5 text-center">
						<ImageOff
							className="mb-3 size-5 text-white/32"
							aria-hidden="true"
						/>
						<h3 className="text-[13px] font-medium">没有匹配的镜头</h3>
						<p className="mt-1 max-w-xs text-[11px] leading-[18px] text-white/45">
							缩短关键词，或切换到全部类别继续浏览。
						</p>
						<button
							type="button"
							className="mt-4 h-11 cursor-pointer rounded-[4px] border border-white/15 bg-transparent px-4 text-[11px] font-medium text-white outline-none hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-[#9ce9f2]"
							onClick={() => {
								setQuery("");
								setCategory("all");
								setPage(1);
							}}
						>
							查看全部素材
						</button>
					</div>
				)}
			</div>

			<footer className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-[#0c0d0f] px-3 py-2.5 sm:px-4">
				<div className="text-[10px] text-white/45" aria-live="polite">
					第 <span className="font-medium text-white/78">{currentPage}</span> /{" "}
					{pageCount} 页
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						className="flex size-11 cursor-pointer items-center justify-center rounded-[4px] border border-white/12 bg-transparent text-white/70 outline-none hover:bg-white/[0.05] hover:text-white focus-visible:ring-2 focus-visible:ring-[#9ce9f2] disabled:pointer-events-none disabled:opacity-35"
						disabled={currentPage <= 1}
						onClick={() => setPage(Math.max(1, currentPage - 1))}
						aria-label="上一页"
					>
						<ChevronLeft className="size-4" />
					</button>
					<button
						type="button"
						className="flex size-11 cursor-pointer items-center justify-center rounded-[4px] border border-white/12 bg-transparent text-white/70 outline-none hover:bg-white/[0.05] hover:text-white focus-visible:ring-2 focus-visible:ring-[#9ce9f2] disabled:pointer-events-none disabled:opacity-35"
						disabled={currentPage >= pageCount}
						onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
						aria-label="下一页"
					>
						<ChevronRight className="size-4" />
					</button>
				</div>
			</footer>
		</section>
	);
}
