"use client";

import Image from "next/image";
import {
	ArrowUpRight,
	Clapperboard,
	Film,
	FileVideo2,
	Loader2,
	Mic2,
	PanelTop,
	Sparkles,
	UploadCloud,
	Wand2,
	X,
	Zap,
	type LucideIcon,
} from "lucide-react";
import {
	useRef,
	useState,
	type DragEvent,
	type FormEvent,
	type ChangeEvent,
} from "react";
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
	onCreate: ({
		intent,
		files,
	}: {
		intent: string;
		files: File[];
	}) => Promise<void>;
}

const MAX_STARTER_FILES = 20;

function selectSupportedFiles(files: File[]): File[] {
	return files
		.filter(
			(file) =>
				file.type.startsWith("video/") ||
				file.type.startsWith("audio/") ||
				file.type.startsWith("image/"),
		)
		.slice(0, MAX_STARTER_FILES);
}

export function VisionCutHomeStudio({
	isCreating,
	onCreate,
}: VisionCutHomeStudioProps) {
	const [intent, setIntent] = useState("");
	const [files, setFiles] = useState<File[]>([]);
	const [isDragOver, setIsDragOver] = useState(false);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const nextIntent = intent.trim();
		if (!nextIntent || isCreating) return;
		await onCreate({ intent: nextIntent, files });
	}

	function addFiles(nextFiles: File[]) {
		setFiles((current) =>
			selectSupportedFiles([
				...current,
				...nextFiles.filter(
					(file) =>
						!current.some(
							(existing) =>
								existing.name === file.name &&
								existing.size === file.size &&
								existing.lastModified === file.lastModified,
						),
				),
			]),
		);
	}

	function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
		addFiles(Array.from(event.target.files ?? []));
		event.target.value = "";
	}

	function handleDrop(event: DragEvent<HTMLDivElement>) {
		event.preventDefault();
		setIsDragOver(false);
		addFiles(Array.from(event.dataTransfer.files));
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
						<span className="block sm:inline">告诉 AI</span>{" "}
						<span>你想让观众感受到什么</span>
					</h1>
					<p className="mt-3 max-w-2xl text-[13px] leading-6 text-white/62 sm:text-[14px]">
						上传可以稍后完成。先定义成片目标，VisionCut
						会把它拆成故事、镜头、声音与交付方案。
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
						<div
							className={cn(
								"flex min-h-14 items-center gap-3 border-t border-white/12 px-3 py-2.5 transition-colors",
								isDragOver && "bg-white/10",
							)}
							onDragEnter={(event) => {
								event.preventDefault();
								setIsDragOver(true);
							}}
							onDragOver={(event) => event.preventDefault()}
							onDragLeave={(event) => {
								const relatedTarget = event.relatedTarget;
								if (
									!(relatedTarget instanceof Node) ||
									!event.currentTarget.contains(relatedTarget)
								) {
									setIsDragOver(false);
								}
							}}
							onDrop={handleDrop}
						>
							<input
								ref={fileInputRef}
								type="file"
								multiple
								accept="video/*,audio/*,image/*"
								className="sr-only"
								onChange={handleFileChange}
							/>
							<Button
								type="button"
								variant="outline"
								className="h-11 border-white/18 bg-white/7 text-white hover:bg-white/12 hover:text-white"
								onClick={() => fileInputRef.current?.click()}
							>
								<UploadCloud className="size-4" />
								选择素材
							</Button>
							<div className="min-w-0 flex-1">
								<p className="truncate text-[11px] font-medium">
									{files.length > 0
										? `${files.length} 个素材已就绪`
										: "把视频片段拖到这里"}
								</p>
								<p className="mt-0.5 truncate text-[9px] text-white/42">
									{files.length > 0
										? files.map((file) => file.name).join("、")
										: "视频、音频或图片，最多 20 个"}
								</p>
							</div>
							{files.length > 0 ? (
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-11 shrink-0 text-white/60 hover:bg-white/10 hover:text-white"
									onClick={() => setFiles([])}
									title="清空待导入素材"
									aria-label="清空待导入素材"
								>
									<X className="size-4" />
								</Button>
							) : (
								<FileVideo2 className="size-4 shrink-0 text-white/35" />
							)}
						</div>
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
								{files.length > 0 ? "创建并导入" : "建立创作蓝图"}
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
