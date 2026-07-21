"use client";

import Image from "next/image";
import {
	ArrowUpRight,
	Clapperboard,
	Film,
	Loader2,
	Mic2,
	PanelTop,
	Sparkles,
	Wand2,
	Zap,
	type LucideIcon,
} from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/utils/ui";

const CREATION_STARTERS: Array<{
	id: string;
	label: string;
	intent: string;
	image: string;
	icon: LucideIcon;
}> = [
	{
		id: "talking-head",
		label: "口播精剪",
		intent: "把我的长口播清理成自然紧凑、带重点字幕和补镜的成片",
		image: "/flowcut/style-worlds/human-daylight.webp",
		icon: Mic2,
	},
	{
		id: "shorts",
		label: "长转短",
		intent: "从长视频中设计 3 个不同开场的竖屏短视频版本",
		image: "/flowcut/style-worlds/electric-noir.webp",
		icon: Zap,
	},
	{
		id: "brand",
		label: "品牌广告",
		intent: "根据产品素材设计一支克制、高级、信息清楚的品牌广告",
		image: "/flowcut/style-worlds/botanical-luxury.webp",
		icon: PanelTop,
	},
	{
		id: "story",
		label: "人物故事",
		intent: "把访谈和现场素材重构成有开场、转折和情绪高潮的人物故事",
		image: "/visioncut/generated-library/fisherman-dawn-portrait.webp",
		icon: Film,
	},
	{
		id: "travel",
		label: "旅行纪录",
		intent: "把旅行片段组织成有到达感、人物关系和记忆温度的短纪录片",
		image: "/flowcut/style-worlds/warm-memory.webp",
		icon: Clapperboard,
	},
];

export interface VisionCutHomeStudioProps {
	isCreating: boolean;
	onCreate: (intent: string) => Promise<void>;
}

export function VisionCutHomeStudio({
	isCreating,
	onCreate,
}: VisionCutHomeStudioProps) {
	const [intent, setIntent] = useState("");
	const inputRef = useRef<HTMLTextAreaElement>(null);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const nextIntent = intent.trim();
		if (!nextIntent || isCreating) return;
		await onCreate(nextIntent);
	}

	return (
		<section className="relative isolate overflow-hidden border-y border-white/10 bg-[#08090a] text-white">
		<Image
			src="/flowcut/style-worlds/electric-noir.webp"
			alt=""
			fill
			loading="eager"
			sizes="100vw"
			className="-z-20 object-cover object-center opacity-40"
		/>
		<div className="absolute inset-0 -z-10 bg-black/70" />

		<div className="mx-auto flex min-h-[360px] max-w-[1480px] flex-col justify-center px-4 py-8 sm:px-8 lg:min-h-[410px] lg:px-12">
			<div className="max-w-4xl">
				<div className="mb-3 flex items-center gap-2 text-[11px] font-medium text-[#d7ff3f]">
					<Sparkles className="size-4" />
					VISIONCUT CREATIVE BRAIN
				</div>
				<h1 className="max-w-3xl text-[28px] leading-[1.08] font-semibold sm:text-[36px] lg:text-[44px]">
					告诉 AI 你想让观众感受到什么
				</h1>
				<p className="mt-3 max-w-2xl text-[13px] leading-6 text-white/62 sm:text-[14px]">
					上传可以稍后完成。先定义成片目标，VisionCut 会把它拆成故事、镜头、声音与交付方案。
				</p>

				<form
					onSubmit={(event) => void submit(event)}
					className="mt-5 overflow-hidden rounded-[8px] border border-white/18 bg-black/55"
				>
					<Textarea
						ref={inputRef}
						value={intent}
						onChange={(event) => setIntent(event.target.value)}
						placeholder="例如：把这次产品发布会做成 60 秒、有明确高潮的品牌短片"
						className="min-h-24 resize-none border-0 bg-transparent p-4 text-[14px] leading-6 text-white shadow-none placeholder:text-white/35 focus-visible:ring-0 sm:min-h-28"
					/>
					<div className="flex items-center justify-between gap-3 border-t border-white/12 px-3 py-2.5">
						<span className="hidden text-[10px] text-white/42 sm:block">
							AI 先生成方案，执行前仍由你确认
						</span>
						<Button
							type="submit"
							disabled={!intent.trim() || isCreating}
							className="ml-auto h-11 bg-[#d7ff3f] px-4 text-black hover:bg-[#c8ef35]"
						>
							{isCreating ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<Wand2 className="size-4" />
							)}
							开始设计
						</Button>
					</div>
				</form>
			</div>

			<div className="scrollbar-hidden mt-5 flex gap-2 overflow-x-auto pb-1">
				{CREATION_STARTERS.map((starter) => {
					const Icon = starter.icon;
					const selected = intent === starter.intent;
					return (
						<button
							key={starter.id}
							type="button"
							aria-pressed={selected}
							className={cn(
								"group relative h-20 w-40 shrink-0 overflow-hidden rounded-[7px] border text-left sm:w-44",
								selected
									? "border-[#d7ff3f]"
									: "border-white/14 hover:border-white/35",
							)}
							onClick={() => {
								setIntent(starter.intent);
								inputRef.current?.focus();
							}}
						>
							<Image
								src={starter.image}
								alt=""
								fill
								sizes="176px"
								className="object-cover transition duration-200 group-hover:scale-[1.02]"
							/>
							<span className="absolute inset-0 bg-black/62" />
							<span className="absolute inset-x-2 bottom-2 flex items-center gap-1.5 text-[11px] font-medium">
								<Icon className="size-3.5 text-[#d7ff3f]" />
								{starter.label}
								<ArrowUpRight className="ml-auto size-3 text-white/55" />
							</span>
						</button>
					);
				})}
			</div>
		</div>
	</section>
	);
}
