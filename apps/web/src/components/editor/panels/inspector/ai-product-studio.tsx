"use client";

import Image from "next/image";
import {
	Aperture,
	ArrowLeft,
	AudioLines,
	BadgeCheck,
	BookOpenText,
	Boxes,
	BrainCircuit,
	Check,
	ChevronLeft,
	ChevronRight,
	CircleGauge,
	Clapperboard,
	Cloud,
	Download,
	ExternalLink,
	Film,
	FolderOpen,
	Gauge,
	Grid3X3,
	ImagePlus,
	Images,
	Layers3,
	Library,
	Loader2,
	Mic2,
	MonitorPlay,
	Music2,
	PanelTop,
	Palette,
	RefreshCw,
	Route,
	Scissors,
	Search,
	Settings2,
	ShieldCheck,
	Sparkles,
	TrendingUp,
	Volume2,
	Wand2,
	Zap,
	type LucideIcon,
} from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	AUTOMATION_RECIPES,
	DEFAULT_STUDIO_PRO_SETTINGS,
	VISUAL_WORLDS,
	createAutomationRun,
	createVisualGenerationJobs,
	recommendAutomationRecipes,
	type AutomationCategory,
	type AutomationRecipeId,
	type StudioExperience,
	type StudioProSettings,
	type VisualAspectRatio,
	type VisualGenerationJob,
	type VisualUseCase,
	type VisualWorldId,
} from "@/ai-studio/catalog";
import {
	parseOpenverseSearchResult,
	type OpenverseSearchItem,
	type OpenverseSearchResult,
} from "@/ai-studio/openverse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { VisionCutStoryGraph } from "@/components/editor/panels/inspector/visioncut-story-graph";
import { VisionCutGeneratedLibrary } from "@/components/editor/panels/inspector/visioncut-generated-library";
import { cn } from "@/utils/ui";

type StudioView = "workflows" | "story" | "visual" | "library";
type CatalogRecipe = (typeof AUTOMATION_RECIPES)[number];

interface AIProductStudioProps {
	assetCount: number;
	initialIntent?: string;
	onImportMedia: () => void;
	onOpenDirector: () => void;
	onImportOpenverse: (item: OpenverseSearchItem) => Promise<void>;
	onUseRecipe: ({
		recipeId,
		settings,
	}: {
		recipeId: AutomationRecipeId;
		settings: StudioProSettings;
		intent?: string;
	}) => void;
}

const STUDIO_VIEWS: Array<{
	id: StudioView;
	label: string;
	icon: LucideIcon;
}> = [
	{ id: "workflows", label: "AI 配方", icon: Sparkles },
	{ id: "story", label: "故事图", icon: Route },
	{ id: "visual", label: "视觉实验室", icon: Aperture },
	{ id: "library", label: "开放素材", icon: Library },
];

const CATEGORIES: Array<{
	id: "all" | AutomationCategory;
	label: string;
	icon: LucideIcon;
}> = [
	{ id: "all", label: "全部", icon: Grid3X3 },
	{ id: "speech", label: "口播与访谈", icon: Mic2 },
	{ id: "social", label: "长转短", icon: Zap },
	{ id: "story", label: "故事与活动", icon: Film },
	{ id: "commerce", label: "商业内容", icon: PanelTop },
	{ id: "music", label: "音乐节奏", icon: Music2 },
];

const RECIPE_ICONS: Partial<Record<AutomationRecipeId, LucideIcon>> = {
	"talking-head-cleanup": Mic2,
	"long-to-shorts": Zap,
	"podcast-multicam": AudioLines,
	"event-recap": Clapperboard,
	"product-story": PanelTop,
	"interview-story": BookOpenText,
	"course-tutorial": MonitorPlay,
	"travel-vlog": Film,
	"music-beat-cut": Music2,
	"sports-highlight": Gauge,
	"ugc-ad": BadgeCheck,
	"cinematic-trailer": Clapperboard,
	"real-estate-tour": Boxes,
};

const RECIPE_WORLDS: Partial<Record<AutomationRecipeId, VisualWorldId>> = {
	"talking-head-cleanup": "human-daylight",
	"long-to-shorts": "electric-noir",
	"podcast-multicam": "documentary-grain",
	"event-recap": "sport-impact",
	"product-story": "botanical-luxury",
	"interview-story": "documentary-grain",
	"course-tutorial": "editorial-paper",
	"travel-vlog": "warm-memory",
	"music-beat-cut": "electric-noir",
	"sports-highlight": "sport-impact",
	"ugc-ad": "human-daylight",
	"cinematic-trailer": "electric-noir",
	"real-estate-tour": "chrome-future",
};

const VISUAL_USE_CASES: Array<{
	id: VisualUseCase;
	label: string;
	description: string;
	icon: LucideIcon;
}> = [
	{
		id: "storyboard",
		label: "分镜",
		description: "构图与调度",
		icon: Clapperboard,
	},
	{ id: "broll", label: "B-roll", description: "内容补镜", icon: Film },
	{ id: "cover", label: "封面", description: "标题留白", icon: ImagePlus },
	{
		id: "background",
		label: "背景",
		description: "可叠加底图",
		icon: Layers3,
	},
	{
		id: "product-shot",
		label: "产品镜头",
		description: "材质与细节",
		icon: Aperture,
	},
	{
		id: "transition",
		label: "过渡镜头",
		description: "形状与动作桥",
		icon: RefreshCw,
	},
];

const ASPECT_RATIOS: VisualAspectRatio[] = ["16:9", "9:16", "4:5", "1:1"];
const JOBS_PER_PAGE = 12;

const PRODUCTION_AGENTS: Array<{
	label: string;
	role: string;
	icon: LucideIcon;
	requiresAssets: boolean;
}> = [
	{ label: "Director", role: "创意蓝图", icon: Clapperboard, requiresAssets: false },
	{ label: "Story", role: "叙事结构", icon: Route, requiresAssets: false },
	{ label: "Editor", role: "粗剪节奏", icon: Scissors, requiresAssets: true },
	{ label: "Color", role: "视觉统一", icon: Palette, requiresAssets: true },
	{ label: "Sound", role: "声音世界", icon: Volume2, requiresAssets: true },
	{ label: "Growth", role: "平台版本", icon: TrendingUp, requiresAssets: false },
	{ label: "Creator DNA", role: "等待反馈", icon: BrainCircuit, requiresAssets: false },
];

function getRecipeWorld(recipeId: AutomationRecipeId) {
	const worldId = RECIPE_WORLDS[recipeId] ?? "human-daylight";
	return VISUAL_WORLDS.find((world) => world.id === worldId) ?? VISUAL_WORLDS[0];
}

function formatEstimatedTime(seconds: number): string {
	const minutes = Math.max(1, Math.round(seconds / 60));
	return `约 ${minutes} 分钟分析`;
}

function updateNumberSetting({
	settings,
	field,
	value,
}: {
	settings: StudioProSettings;
	field: Exclude<keyof StudioProSettings, "fillerHandling">;
	value: number;
}): StudioProSettings {
	return { ...settings, [field]: value };
}

function ProSlider({
	label,
	valueLabel,
	value,
	min,
	max,
	step = 1,
	onChange,
}: {
	label: string;
	valueLabel: string;
	value: number;
	min: number;
	max: number;
	step?: number;
	onChange: (value: number) => void;
}) {
	return (
		<div className="flowcut-pro-control border-t py-3">
			<div className="mb-2 flex items-center justify-between gap-3 text-[11px]">
				<span className="font-medium">{label}</span>
				<span className="font-mono text-[10px] text-muted-foreground">
					{valueLabel}
				</span>
			</div>
			<Slider
				value={[value]}
				min={min}
				max={max}
				step={step}
				onValueChange={(values) => onChange(values[0] ?? value)}
				aria-label={label}
			/>
		</div>
	);
}

function ExperienceSwitch({
	experience,
	onChange,
}: {
	experience: StudioExperience;
	onChange: (experience: StudioExperience) => void;
}) {
	return (
		<div className="flowcut-experience-switch grid grid-cols-2 rounded-[7px] border p-0.5">
			{([
				["guided", "指导模式", Sparkles],
				["pro", "专业模式", Settings2],
			] as const).map(([id, label, Icon]) => (
				<button
					key={id}
					type="button"
					aria-pressed={experience === id}
					className={cn(
						"flex min-h-9 items-center justify-center gap-1.5 rounded-[5px] px-2 text-[10px] font-medium transition",
						experience === id
							? "bg-foreground text-background"
							: "text-muted-foreground hover:text-foreground",
					)}
					onClick={() => onChange(id)}
				>
					<Icon className="size-3.5" />
					{label}
				</button>
			))}
		</div>
	);
}

function WorkflowCard({
	recipe,
	selected,
	experience,
	onSelect,
}: {
	recipe: CatalogRecipe;
	selected: boolean;
	experience: StudioExperience;
	onSelect: () => void;
}) {
	const Icon = RECIPE_ICONS[recipe.id] ?? Film;
	const world = getRecipeWorld(recipe.id);
	return (
		<button
			type="button"
			aria-pressed={selected}
			className="flowcut-workflow-card group min-w-0 overflow-hidden rounded-[8px] border text-left"
			data-selected={selected ? "true" : "false"}
			onClick={onSelect}
		>
			<div className="relative aspect-[16/8.5] overflow-hidden border-b">
				<Image
					src={world.image}
					alt=""
					fill
					sizes="(max-width: 1199px) 50vw, 320px"
					className="object-cover transition duration-300 group-hover:scale-[1.025]"
				/>
				<span className="absolute top-2 left-2 flex size-7 items-center justify-center rounded-[6px] border border-white/20 bg-black/70 text-white backdrop-blur-sm">
					<Icon className="size-3.5" />
				</span>
				{"featured" in recipe && recipe.featured ? (
					<span className="absolute top-2 right-2 rounded-[4px] bg-[#d7ff3f] px-1.5 py-1 text-[8px] font-bold text-black">
						推荐
					</span>
				) : null}
			</div>
			<div className="p-2.5">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0">
						<p className="truncate text-[12px] font-semibold">{recipe.title}</p>
						<p className="mt-0.5 truncate text-[9px] text-muted-foreground">
							{recipe.kicker}
						</p>
					</div>
					<ChevronRight
						className={cn(
							"mt-0.5 size-3.5 shrink-0 text-muted-foreground transition",
							selected && "translate-x-0.5 text-foreground",
						)}
					/>
				</div>
				<p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
					{experience === "guided"
						? recipe.beginnerOutcome
						: recipe.proOutcome}
				</p>
			</div>
		</button>
	);
}

function ProductionTeamRail({ assetCount }: { assetCount: number }) {
	return (
		<section className="overflow-hidden rounded-[8px] border">
			<div className="flex items-center justify-between gap-3 border-b px-3 py-2.5">
				<div>
					<h3 className="text-[11px] font-semibold">AI 制作角色</h3>
					<p className="mt-0.5 text-[8px] text-muted-foreground">
						工作流预览，不代表已执行素材分析
					</p>
				</div>
				<span className="font-mono text-[9px] text-cyan-600">07 ROLES</span>
			</div>
			<div className="scrollbar-hidden flex overflow-x-auto divide-x">
				{PRODUCTION_AGENTS.map((agent) => {
					const Icon = agent.icon;
					const status = agent.label === "Creator DNA"
						? "待启用"
						: agent.requiresAssets && assetCount === 0
							? "待素材"
							: "纳入规划";
					return (
						<div
							key={agent.label}
							className="flex min-w-28 shrink-0 items-center gap-2 px-2.5 py-2.5"
						>
							<span className="flex size-7 shrink-0 items-center justify-center rounded-[6px] border bg-background">
								<Icon className="size-3.5" />
							</span>
							<div className="min-w-0">
								<p className="truncate text-[9px] font-semibold">{agent.label}</p>
								<p className="truncate text-[8px] text-muted-foreground">
									{agent.role}
								</p>
								<p
									className={cn(
										"mt-1 text-[8px]",
										status === "纳入规划"
											? "text-cyan-600"
											: "text-muted-foreground",
									)}
								>
									{status}
								</p>
							</div>
						</div>
					);
				})}
			</div>
		</section>
	);
}

function WorkflowView({
	assetCount,
	experience,
	initialIntent,
	settings,
	onSettingsChange,
	onImportMedia,
	onUseRecipe,
}: {
	assetCount: number;
	experience: StudioExperience;
	initialIntent: string;
	settings: StudioProSettings;
	onSettingsChange: (settings: StudioProSettings) => void;
	onImportMedia: () => void;
	onUseRecipe: (args: {
		recipeId: AutomationRecipeId;
		intent: string;
	}) => void;
}) {
	const [query, setQuery] = useState(initialIntent);
	const deferredQuery = useDeferredValue(query);
	const [category, setCategory] = useState<"all" | AutomationCategory>("all");
	const [selectedRecipeId, setSelectedRecipeId] = useState<AutomationRecipeId>(
		() => recommendAutomationRecipes(initialIntent)[0]?.id ?? "talking-head-cleanup",
	);
	const recommended = useMemo(() => {
		const ranked = deferredQuery.trim()
			? recommendAutomationRecipes(deferredQuery)
			: [...AUTOMATION_RECIPES];
		return ranked.filter(
			(recipe) => category === "all" || recipe.category === category,
		);
	}, [category, deferredQuery]);
	const selectedRecipe =
		AUTOMATION_RECIPES.find((recipe) => recipe.id === selectedRecipeId) ??
		AUTOMATION_RECIPES[0];
	const world = getRecipeWorld(selectedRecipe.id);
	const run = createAutomationRun({
		recipeId: selectedRecipe.id,
		experience,
		assetCount,
		settings,
	});

	return (
		<div className="space-y-4 pb-5">
			<section className="flowcut-studio-feature overflow-hidden rounded-[8px] border">
				<div className="relative aspect-[16/7.2] min-h-36 overflow-hidden border-b">
					<Image
						src={world.image}
						alt={`${world.label}视觉风格`}
						fill
						loading="eager"
						sizes="(max-width: 1199px) 100vw, 420px"
						className="object-cover"
					/>
					<div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-black/72 p-3 text-white backdrop-blur-[2px]">
						<div className="min-w-0">
							<p className="text-[9px] font-medium text-white/60">
								{selectedRecipe.kicker}
							</p>
							<h2 className="mt-0.5 truncate text-[17px] font-semibold">
								{selectedRecipe.title}
							</h2>
						</div>
						<span className="shrink-0 text-[9px] text-white/70">
							{run.nodes.length} 个节点
						</span>
					</div>
				</div>
				<div className="p-3">
					<p className="text-[11px] leading-relaxed text-muted-foreground">
						{experience === "guided"
							? selectedRecipe.beginnerOutcome
							: selectedRecipe.proOutcome}
					</p>
					<div className="mt-3 grid grid-cols-3 divide-x border-y py-2 text-center">
						<div>
							<p className="text-[9px] text-muted-foreground">素材</p>
							<p className="mt-0.5 text-[11px] font-semibold">
								{assetCount > 0 ? `${assetCount} 个` : "待导入"}
							</p>
						</div>
						<div>
							<p className="text-[9px] text-muted-foreground">本机</p>
							<p className="mt-0.5 text-[11px] font-semibold text-emerald-600">
								{run.summary.localCount} 项
							</p>
						</div>
						<div>
							<p className="text-[9px] text-muted-foreground">语义精剪</p>
							<p className="mt-0.5 text-[11px] font-semibold text-cyan-600">
								{run.summary.chatCutCount} 项
							</p>
						</div>
					</div>
					<div className="mt-3 flex gap-2">
						<Button
							className="h-10 min-w-0 flex-1 bg-[#d7ff3f] text-black hover:bg-[#c8ef35]"
							onClick={() =>
								onUseRecipe({
									recipeId: selectedRecipe.id,
									intent: deferredQuery.trim(),
								})
							}
						>
							<Wand2 className="size-4" />
							用这套流程开始
						</Button>
						<Button
							variant="outline"
							size="icon"
							className="size-10"
							onClick={onImportMedia}
							title="导入素材"
							aria-label="导入素材"
						>
							<FolderOpen className="size-4" />
						</Button>
					</div>
				</div>
			</section>

			<ProductionTeamRail assetCount={assetCount} />

			<section>
				<div className="relative">
					<Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="例如：去掉口播停顿，做成 60 秒竖屏"
						className="h-10 pl-9 text-[11px]"
					/>
				</div>
				<div className="scrollbar-hidden mt-2 flex gap-1.5 overflow-x-auto pb-1">
					{CATEGORIES.map((item) => {
						const Icon = item.icon;
						return (
							<button
								key={item.id}
								type="button"
								aria-pressed={category === item.id}
								className={cn(
									"flex min-h-8 shrink-0 items-center gap-1.5 rounded-[6px] border px-2.5 text-[9px] font-medium transition",
									category === item.id
										? "border-foreground bg-foreground text-background"
										: "text-muted-foreground hover:text-foreground",
								)}
								onClick={() => setCategory(item.id)}
							>
								<Icon className="size-3" />
								{item.label}
							</button>
						);
					})}
				</div>
			</section>

			<section>
				<div className="mb-2 flex items-center justify-between gap-3">
					<h3 className="text-[12px] font-semibold">创作配方</h3>
					<span className="text-[9px] text-muted-foreground">
						{recommended.length} 种工作流
					</span>
				</div>
				<div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
					{recommended.map((recipe) => (
						<WorkflowCard
							key={recipe.id}
							recipe={recipe}
							selected={selectedRecipe.id === recipe.id}
							experience={experience}
							onSelect={() => setSelectedRecipeId(recipe.id)}
						/>
					))}
				</div>
			</section>

			<section className="flowcut-run-panel overflow-hidden rounded-[8px] border">
				<div className="flex items-center justify-between gap-3 border-b p-3">
					<div>
						<h3 className="text-[12px] font-semibold">导演执行队列</h3>
						<p className="mt-0.5 text-[9px] text-muted-foreground">
							{formatEstimatedTime(run.summary.estimatedSeconds)}
						</p>
					</div>
					<span className="font-mono text-[10px] text-muted-foreground">
						{run.summary.total.toString().padStart(2, "0")}
					</span>
				</div>
				{run.groups.map((group, groupIndex) => (
					<div
						key={group.id}
						className={cn("p-3", groupIndex > 0 && "border-t")}
					>
						<div className="mb-2 flex items-center gap-2">
							<span className="flex size-5 items-center justify-center rounded-[4px] bg-foreground text-[8px] font-bold text-background">
								{groupIndex + 1}
							</span>
							<div>
								<p className="text-[10px] font-semibold">{group.label}</p>
								<p className="text-[8px] text-muted-foreground">
									{group.description}
								</p>
							</div>
						</div>
						<div className="divide-y border-y">
							{group.nodes.map((node) => (
								<div key={node.id} className="flex items-start gap-2 py-2.5">
									<span
										className={cn(
											"mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
											node.availability === "blocked"
												? "text-muted-foreground"
												: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
										)}
									>
										<Check className="size-2.5" />
									</span>
									<div className="min-w-0 flex-1">
										<div className="flex items-center justify-between gap-2">
											<p className="text-[10px] font-medium">
												{experience === "guided"
													? node.beginnerLabel
													: node.title}
											</p>
											<span
												className={cn(
													"shrink-0 text-[8px]",
													node.executor === "local"
														? "text-emerald-600"
														: "text-cyan-600",
												)}
											>
												{node.executor === "local" ? "本机" : "ChatCut"}
											</span>
										</div>
										{experience === "pro" ? (
											<p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
												{node.proDescription}
												{node.settingLabel ? ` · ${node.settingLabel}` : ""}
											</p>
										) : null}
									</div>
								</div>
							))}
						</div>
					</div>
				))}
			</section>

			{experience === "pro" ? (
				<section className="flowcut-pro-panel rounded-[8px] border p-3">
					<div className="mb-1 flex items-center justify-between gap-3">
						<h3 className="flex items-center gap-1.5 text-[12px] font-semibold">
							<CircleGauge className="size-3.5" />
							专业控制
						</h3>
						<button
							type="button"
							className="text-[9px] text-muted-foreground hover:text-foreground"
							onClick={() => onSettingsChange(DEFAULT_STUDIO_PRO_SETTINGS)}
						>
							恢复推荐值
						</button>
					</div>
					<ProSlider
						label="停顿阈值"
						valueLabel={`${settings.silenceThresholdMs} ms`}
						value={settings.silenceThresholdMs}
						min={150}
						max={2000}
						step={10}
						onChange={(value) =>
							onSettingsChange(
								updateNumberSetting({
									settings,
									field: "silenceThresholdMs",
									value,
								}),
							)
						}
					/>
					<ProSlider
						label="切点呼吸边距"
						valueLabel={`${settings.cutPaddingMs} ms`}
						value={settings.cutPaddingMs}
						min={0}
						max={800}
						step={10}
						onChange={(value) =>
							onSettingsChange(
								updateNumberSetting({
									settings,
									field: "cutPaddingMs",
									value,
								}),
							)
						}
					/>
					<ProSlider
						label="镜头识别灵敏度"
						valueLabel={`${settings.sceneSensitivity}%`}
						value={settings.sceneSensitivity}
						min={0}
						max={100}
						onChange={(value) =>
							onSettingsChange(
								updateNumberSetting({
									settings,
									field: "sceneSensitivity",
									value,
								}),
							)
						}
					/>
					<ProSlider
						label="B-roll 覆盖密度"
						valueLabel={`${settings.brollDensity}%`}
						value={settings.brollDensity}
						min={0}
						max={100}
						onChange={(value) =>
							onSettingsChange(
								updateNumberSetting({
									settings,
									field: "brollDensity",
									value,
								}),
							)
						}
					/>
					<ProSlider
						label="字幕信息密度"
						valueLabel={`${settings.captionDensity}%`}
						value={settings.captionDensity}
						min={0}
						max={100}
						onChange={(value) =>
							onSettingsChange(
								updateNumberSetting({
									settings,
									field: "captionDensity",
									value,
								}),
							)
						}
					/>
					<ProSlider
						label="重点推近幅度"
						valueLabel={`${settings.punchInIntensity}%`}
						value={settings.punchInIntensity}
						min={0}
						max={24}
						onChange={(value) =>
							onSettingsChange(
								updateNumberSetting({
									settings,
									field: "punchInIntensity",
									value,
								}),
							)
						}
					/>
					<ProSlider
						label="目标响度"
						valueLabel={`${settings.targetLufs} LUFS`}
						value={settings.targetLufs}
						min={-24}
						max={-6}
						onChange={(value) =>
							onSettingsChange(
								updateNumberSetting({
									settings,
									field: "targetLufs",
									value,
								}),
							)
						}
					/>
					<ProSlider
						label="交付版本"
						valueLabel={`${settings.outputCount} 个`}
						value={settings.outputCount}
						min={1}
						max={8}
						onChange={(value) =>
							onSettingsChange(
								updateNumberSetting({
									settings,
									field: "outputCount",
									value,
								}),
							)
						}
					/>
					<div className="border-t pt-3">
						<div className="mb-2 flex items-center justify-between gap-2 text-[11px]">
							<span className="font-medium">口头禅策略</span>
							<span className="text-[9px] text-muted-foreground">可随时复核</span>
						</div>
						<div className="grid grid-cols-3 gap-1 rounded-[6px] border p-1">
							{([
								["review", "先复核"],
								["remove", "自动删除"],
								["keep", "保留"],
							] as const).map(([id, label]) => (
								<button
									key={id}
									type="button"
									className={cn(
										"min-h-8 rounded-[4px] text-[9px] font-medium",
										settings.fillerHandling === id
											? "bg-foreground text-background"
											: "text-muted-foreground",
									)}
									onClick={() =>
										onSettingsChange({
											...settings,
											fillerHandling: id,
										})
									}
								>
									{label}
								</button>
							))}
						</div>
					</div>
				</section>
			) : null}
		</div>
	);
}

function VisualJobCard({
	job,
	index,
}: {
	job: VisualGenerationJob;
	index: number;
}) {
	const world = VISUAL_WORLDS.find((item) => item.id === job.worldId) ??
		VISUAL_WORLDS[0];
	return (
		<div className="flowcut-job-card overflow-hidden rounded-[8px] border">
			<div className="relative aspect-[16/9] overflow-hidden border-b">
				<Image
					src={world.image}
					alt=""
					fill
					sizes="240px"
					className="object-cover opacity-55 grayscale-[0.25]"
				/>
				<div className="absolute inset-0 flex items-center justify-center bg-background/55 backdrop-blur-[1px]">
					<div className="text-center">
						<span className="font-mono text-[13px] font-semibold">
							{String(index + 1).padStart(3, "0")}
						</span>
						<p className="mt-1 text-[8px] text-muted-foreground">等待生成</p>
					</div>
				</div>
			</div>
			<div className="flex items-center justify-between gap-2 p-2 text-[9px]">
				<span className="truncate font-medium">{job.useCase}</span>
				<span className="shrink-0 font-mono text-muted-foreground">
					{job.aspectRatio}
				</span>
			</div>
		</div>
	);
}

function VisualLabView() {
	const [surface, setSurface] = useState<"generator" | "originals">("originals");
	const [worldId, setWorldId] =
		useState<VisualWorldId>("electric-noir");
	const [prompt, setPrompt] = useState(
		"一位创作者在夜色城市中讲述从零开始的创业故事",
	);
	const [useCases, setUseCases] = useState<VisualUseCase[]>([
		"storyboard",
		"broll",
		"cover",
	]);
	const [aspectRatios, setAspectRatios] = useState<VisualAspectRatio[]>([
		"9:16",
		"16:9",
	]);
	const [count, setCount] = useState(12);
	const [jobs, setJobs] = useState<VisualGenerationJob[]>([]);
	const [page, setPage] = useState(0);
	const totalPages = Math.max(1, Math.ceil(jobs.length / JOBS_PER_PAGE));
	const visibleJobs = jobs.slice(
		page * JOBS_PER_PAGE,
		(page + 1) * JOBS_PER_PAGE,
	);
	const selectedWorld =
		VISUAL_WORLDS.find((world) => world.id === worldId) ?? VISUAL_WORLDS[0];

	function toggleUseCase(useCase: VisualUseCase) {
		setUseCases((current) =>
			current.includes(useCase)
				? current.filter((item) => item !== useCase)
				: [...current, useCase],
		);
	}

	function toggleAspectRatio(aspectRatio: VisualAspectRatio) {
		setAspectRatios((current) =>
			current.includes(aspectRatio)
				? current.filter((item) => item !== aspectRatio)
				: [...current, aspectRatio],
		);
	}

	function createBatch() {
		const nextJobs = createVisualGenerationJobs({
			prompt,
			worldId,
			useCases,
			aspectRatios,
			count,
		});
		setJobs(nextJobs);
		setPage(0);
		toast.success(`已建立 ${nextJobs.length} 张视觉生成队列`, {
			description: "可在连接图像模型后分批执行，并逐张复核。",
		});
	}

	const surfaceSwitch = (
		<div className="grid grid-cols-2 rounded-[7px] border p-0.5">
			{([
				["originals", "原创素材", Images],
				["generator", "概念图生成", Wand2],
			] as const).map(([id, label, Icon]) => (
				<button
					key={id}
					type="button"
					aria-pressed={surface === id}
					className={cn(
						"flex min-h-10 items-center justify-center gap-1.5 rounded-[5px] px-2 text-[10px] font-medium transition",
						surface === id
							? "bg-foreground text-background"
							: "text-muted-foreground hover:text-foreground",
					)}
					onClick={() => setSurface(id)}
				>
					<Icon className="size-3.5" />
					{label}
				</button>
			))}
		</div>
	);

	if (surface === "originals") {
		return (
			<div className="space-y-3 pb-5">
				{surfaceSwitch}
				<VisionCutGeneratedLibrary className="min-h-[720px] rounded-[8px] border border-white/10" />
			</div>
		);
	}

	return (
		<div className="space-y-4 pb-5">
			{surfaceSwitch}
			<section className="flowcut-visual-hero overflow-hidden rounded-[8px] border">
				<div className="relative aspect-[16/7.2] min-h-36 overflow-hidden border-b">
					<Image
						src={selectedWorld.image}
						alt={`${selectedWorld.label}风格预览`}
						fill
						loading="eager"
						sizes="(max-width: 1199px) 100vw, 420px"
						className="object-cover"
					/>
					<div className="absolute right-2 bottom-2 left-2 flex items-end justify-between gap-2 rounded-[6px] border border-white/15 bg-black/72 p-2.5 text-white backdrop-blur-sm">
						<div>
							<p className="text-[9px] text-white/55">STYLE WORLD</p>
							<h2 className="mt-0.5 text-[16px] font-semibold">
								{selectedWorld.title}
							</h2>
						</div>
						<div className="flex gap-1">
							{selectedWorld.palette.map((color) => (
								<span
									key={color}
									className="size-3 rounded-[3px] border border-white/25"
									style={{ backgroundColor: color }}
								/>
							))}
						</div>
					</div>
				</div>
				<div className="flex items-center justify-between gap-3 p-3">
					<div>
						<p className="text-[11px] font-medium">概念图生成队列</p>
						<p className="mt-0.5 text-[9px] text-muted-foreground">
							分镜、补镜、封面和多画幅统一排队
						</p>
					</div>
					<span className="font-mono text-[18px] font-semibold">{count}</span>
				</div>
			</section>

			<section>
				<div className="mb-2 flex items-center justify-between gap-3">
					<h3 className="text-[12px] font-semibold">风格世界</h3>
					<span className="text-[9px] text-muted-foreground">
						{VISUAL_WORLDS.length} 套原创母版
					</span>
				</div>
				<div className="grid grid-cols-2 gap-2">
					{VISUAL_WORLDS.map((world) => (
						<button
							key={world.id}
							type="button"
							aria-pressed={world.id === worldId}
							className="flowcut-world-card group overflow-hidden rounded-[8px] border text-left"
							data-selected={world.id === worldId ? "true" : "false"}
							onClick={() => setWorldId(world.id)}
						>
							<div className="relative aspect-[16/9] overflow-hidden border-b">
								<Image
									src={world.image}
									alt=""
									fill
									sizes="220px"
									className="object-cover transition duration-300 group-hover:scale-[1.03]"
								/>
								{world.id === worldId ? (
									<span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-[5px] bg-[#d7ff3f] text-black">
										<Check className="size-3" />
									</span>
								) : null}
							</div>
							<div className="p-2">
								<p className="truncate text-[10px] font-semibold">{world.label}</p>
								<p className="mt-0.5 truncate text-[8px] text-muted-foreground">
									{world.description}
								</p>
							</div>
						</button>
					))}
				</div>
			</section>

			<section className="flowcut-generator-panel rounded-[8px] border p-3">
				<label htmlFor="visual-prompt" className="text-[11px] font-semibold">
					镜头意图
				</label>
				<Textarea
					id="visual-prompt"
					value={prompt}
					onChange={(event) => setPrompt(event.target.value)}
					className="mt-2 min-h-24 resize-none text-[11px] leading-relaxed"
				/>

				<div className="mt-4 border-t pt-3">
					<p className="mb-2 text-[10px] font-medium">生成用途</p>
					<div className="grid grid-cols-2 gap-1.5 min-[440px]:grid-cols-3">
						{VISUAL_USE_CASES.map((item) => {
							const Icon = item.icon;
							const selected = useCases.includes(item.id);
							return (
								<button
									key={item.id}
									type="button"
									aria-pressed={selected}
									className={cn(
										"min-h-14 rounded-[7px] border p-2 text-left transition",
										selected
											? "border-foreground bg-foreground text-background"
											: "hover:bg-muted/50",
									)}
									onClick={() => toggleUseCase(item.id)}
								>
									<Icon className="size-3.5" />
									<p className="mt-1 text-[9px] font-semibold">{item.label}</p>
									<p
										className={cn(
											"mt-0.5 text-[8px]",
											selected
												? "text-background/65"
												: "text-muted-foreground",
										)}
									>
										{item.description}
									</p>
								</button>
							);
						})}
					</div>
				</div>

				<div className="mt-4 border-t pt-3">
					<div className="mb-2 flex items-center justify-between gap-3">
						<p className="text-[10px] font-medium">目标画幅</p>
						<span className="text-[8px] text-muted-foreground">可多选</span>
					</div>
					<div className="grid grid-cols-4 gap-1">
						{ASPECT_RATIOS.map((ratio) => {
							const selected = aspectRatios.includes(ratio);
							return (
								<button
									key={ratio}
									type="button"
									aria-pressed={selected}
									className={cn(
										"flex min-h-10 items-center justify-center rounded-[6px] border font-mono text-[9px]",
										selected
											? "border-foreground bg-foreground text-background"
											: "text-muted-foreground",
									)}
									onClick={() => toggleAspectRatio(ratio)}
								>
									{ratio}
								</button>
							);
						})}
					</div>
				</div>

				<div className="mt-4 border-t pt-3">
					<div className="mb-2 flex items-center justify-between gap-3">
						<p className="text-[10px] font-medium">生成数量</p>
						<span className="font-mono text-[11px] font-semibold">{count}</span>
					</div>
					<Slider
						value={[count]}
						min={4}
						max={100}
						step={4}
						onValueChange={(values) => setCount(values[0] ?? count)}
						aria-label="生成数量"
					/>
					<div className="mt-1.5 flex justify-between font-mono text-[8px] text-muted-foreground">
						<span>4</span>
						<span>100</span>
					</div>
				</div>

				<Button
					className="mt-4 h-11 w-full bg-[#d7ff3f] text-black hover:bg-[#c8ef35]"
					disabled={
						prompt.trim().length === 0 ||
						useCases.length === 0 ||
						aspectRatios.length === 0
					}
					onClick={createBatch}
				>
					<ImagePlus className="size-4" />
					建立 {count} 张生成队列
				</Button>
			</section>

			{jobs.length > 0 ? (
				<section>
					<div className="mb-2 flex items-center justify-between gap-3">
						<div>
							<h3 className="text-[12px] font-semibold">生成墙</h3>
							<p className="mt-0.5 text-[8px] text-muted-foreground">
								{jobs.length} 张 · 每页 {JOBS_PER_PAGE} 张
							</p>
						</div>
						<div className="flex items-center gap-1">
							<Button
								variant="outline"
								size="icon"
								className="size-8"
								disabled={page === 0}
								onClick={() => setPage((current) => Math.max(0, current - 1))}
								aria-label="上一页"
							>
								<ChevronLeft className="size-3.5" />
							</Button>
							<span className="min-w-12 text-center font-mono text-[9px] text-muted-foreground">
								{page + 1}/{totalPages}
							</span>
							<Button
								variant="outline"
								size="icon"
								className="size-8"
								disabled={page >= totalPages - 1}
								onClick={() =>
									setPage((current) => Math.min(totalPages - 1, current + 1))
								}
								aria-label="下一页"
							>
								<ChevronRight className="size-3.5" />
							</Button>
						</div>
					</div>
					<div className="grid grid-cols-2 gap-2 min-[440px]:grid-cols-3">
						{visibleJobs.map((job, index) => (
							<VisualJobCard
								key={job.id}
								job={job}
								index={page * JOBS_PER_PAGE + index}
							/>
						))}
					</div>
				</section>
			) : null}
		</div>
	);
}

function OpenverseCard({
	item,
	isImporting,
	onImport,
}: {
	item: OpenverseSearchItem;
	isImporting: boolean;
	onImport: () => Promise<void>;
}) {
	return (
		<article className="flowcut-source-card min-w-0 overflow-hidden rounded-[8px] border">
			<div className="relative aspect-[4/3] overflow-hidden border-b bg-muted">
				<Image
					src={item.thumbnailUrl}
					alt={item.title}
					fill
					sizes="240px"
					className="object-cover"
				/>
			</div>
			<div className="p-2.5">
				<p className="truncate text-[10px] font-semibold">{item.title}</p>
				<p className="mt-1 truncate text-[8px] text-muted-foreground">
					{item.creator} · {item.license}
				</p>
				<div className="mt-2 flex gap-1.5">
					<Button
						variant="outline"
						className="h-9 min-w-0 flex-1 px-2 text-[9px]"
						disabled={isImporting}
						onClick={() => void onImport()}
					>
						{isImporting ? (
							<Loader2 className="size-3 animate-spin" />
						) : (
							<Download className="size-3" />
						)}
						加入素材库
					</Button>
					<a
						href={item.sourceUrl}
						target="_blank"
						rel="noreferrer"
						className="flex size-9 shrink-0 items-center justify-center rounded-[6px] border text-cyan-600 hover:bg-accent"
						title="查看来源与许可"
						aria-label="查看来源与许可"
					>
						<ExternalLink className="size-3.5" />
					</a>
				</div>
			</div>
		</article>
	);
}

function OpenLibraryView({
	onImportOpenverse,
}: {
	onImportOpenverse: (item: OpenverseSearchItem) => Promise<void>;
}) {
	const [query, setQuery] = useState("cinematic city");
	const [result, setResult] = useState<OpenverseSearchResult | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [importingId, setImportingId] = useState<string | null>(null);

	async function importItem(item: OpenverseSearchItem) {
		setImportingId(item.id);
		try {
			await onImportOpenverse(item);
		} finally {
			setImportingId(null);
		}
	}

	async function searchOpenverse() {
		if (query.trim().length < 2) return;
		setIsLoading(true);
		setError(null);
		try {
			const response = await fetch(
				`/api/media/openverse?q=${encodeURIComponent(query.trim())}&pageSize=24`,
			);
			const payload: unknown = await response.json();
			if (!response.ok) throw new Error("开放素材服务暂时不可用");
			const parsed = parseOpenverseSearchResult(payload);
			if (!parsed) throw new Error("开放素材返回了无法识别的数据");
			setResult(parsed);
		} catch (searchError) {
			setError(
				searchError instanceof Error ? searchError.message : "搜索失败",
			);
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<div className="space-y-4 pb-5">
			<section className="flowcut-source-console rounded-[8px] border p-3">
				<div className="flex items-center justify-between gap-3">
					<div>
						<p className="text-[9px] font-medium text-cyan-600">OPEN MEDIA</p>
						<h2 className="mt-0.5 text-[16px] font-semibold">开放素材源</h2>
					</div>
					<ShieldCheck className="size-5 text-emerald-600" />
				</div>
				<div className="mt-3 flex gap-1.5">
					<Input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") void searchOpenverse();
						}}
						placeholder="搜索可商用图片"
						className="h-10 min-w-0 flex-1 text-[11px]"
					/>
					<Button
						size="icon"
						className="size-10"
						disabled={isLoading || query.trim().length < 2}
						onClick={() => void searchOpenverse()}
						aria-label="搜索开放素材"
					>
						{isLoading ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<Search className="size-4" />
						)}
					</Button>
				</div>
				<p className="mt-2 text-[9px] leading-relaxed text-muted-foreground">
					默认筛选 Openverse 可商用许可，使用前仍需按素材卡保留署名与来源。
				</p>
			</section>

			<section>
				<h3 className="mb-2 text-[12px] font-semibold">素材连接器</h3>
				<div className="divide-y overflow-hidden rounded-[8px] border">
					{[
						["Openverse", "已接入", "开放许可图片", true],
						["Pexels", "需要 API Key", "图片与视频", false],
						["Unsplash", "需要 API Key", "摄影与插画", false],
						["图像模型", "待连接", "批量生成与编辑", false],
					].map(([name, state, scope, connected]) => (
						<div key={String(name)} className="flex items-center gap-2.5 p-2.5">
							<span
								className={cn(
									"flex size-7 items-center justify-center rounded-[6px] border",
									connected
										? "border-emerald-500/35 bg-emerald-500/10 text-emerald-600"
										: "text-muted-foreground",
								)}
							>
								{connected ? (
									<ShieldCheck className="size-3.5" />
								) : (
									<Cloud className="size-3.5" />
								)}
							</span>
							<div className="min-w-0 flex-1">
								<p className="text-[10px] font-medium">{name}</p>
								<p className="text-[8px] text-muted-foreground">{scope}</p>
							</div>
							<span
								className={cn(
									"text-[8px]",
									connected ? "text-emerald-600" : "text-muted-foreground",
								)}
							>
								{state}
							</span>
						</div>
					))}
				</div>
			</section>

			{error ? (
				<div className="rounded-[8px] border border-rose-500/30 bg-rose-500/5 p-3 text-[10px] text-rose-600">
					{error}
				</div>
			) : null}

			{result ? (
				<section>
					<div className="mb-2 flex items-center justify-between gap-3">
						<h3 className="text-[12px] font-semibold">搜索结果</h3>
						<span className="text-[9px] text-muted-foreground">
							约 {result.total.toLocaleString()} 项
						</span>
					</div>
					<div className="grid grid-cols-2 gap-2 min-[520px]:grid-cols-3">
						{result.items.map((item) => (
							<OpenverseCard
								key={item.id}
								item={item}
								isImporting={importingId === item.id}
								onImport={() => importItem(item)}
							/>
						))}
					</div>
				</section>
			) : (
				<section className="rounded-[8px] border border-dashed p-6 text-center">
					<Images className="mx-auto size-5 text-muted-foreground" />
					<p className="mt-2 text-[10px] font-medium">搜索开放授权的参考图与补镜</p>
				</section>
			)}
		</div>
	);
}

export function AIProductStudio({
	assetCount,
	initialIntent = "",
	onImportMedia,
	onOpenDirector,
	onImportOpenverse,
	onUseRecipe,
}: AIProductStudioProps) {
	const [view, setView] = useState<StudioView>("workflows");
	const [experience, setExperience] =
		useState<StudioExperience>("guided");
	const [settings, setSettings] = useState<StudioProSettings>(
		DEFAULT_STUDIO_PRO_SETTINGS,
	);

	return (
		<div className="flowcut-studio-shell flex h-full min-h-0 flex-col bg-background">
			<header className="shrink-0 border-b">
				<div className="flex items-center gap-2 p-2.5">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-[7px] bg-foreground text-sm font-black text-background">
						V/
					</div>
					<div className="min-w-0 flex-1">
						<p className="truncate text-[12px] font-semibold">VisionCut AI</p>
						<p className="mt-0.5 text-[8px] text-muted-foreground">
							{assetCount > 0 ? `${assetCount} 个素材在线` : "新创作"}
						</p>
					</div>
					<Button
						variant="outline"
						size="icon"
						className="size-9 shrink-0"
						onClick={onOpenDirector}
						title="打开导演蓝图"
						aria-label="打开导演蓝图"
					>
						<Clapperboard className="size-4" />
					</Button>
				</div>
				<div className="px-2.5 pb-2.5">
					<ExperienceSwitch
						experience={experience}
						onChange={setExperience}
					/>
				</div>
				<nav className="grid grid-cols-4 border-t" aria-label="AI 创作工作面">
					{STUDIO_VIEWS.map((item) => {
						const Icon = item.icon;
						return (
							<button
								key={item.id}
								type="button"
								aria-current={view === item.id ? "page" : undefined}
								className="flowcut-studio-tab relative flex min-h-11 items-center justify-center gap-1.5 border-r px-1 text-[9px] font-medium last:border-r-0"
								data-active={view === item.id ? "true" : "false"}
								onClick={() => setView(item.id)}
							>
								<Icon className="size-3.5" />
								{item.label}
							</button>
						);
					})}
				</nav>
			</header>

			<ScrollArea className="min-h-0 flex-1">
				<div className="flowcut-studio-view p-3" key={view}>
					{view === "workflows" ? (
						<WorkflowView
							key={initialIntent || "new-creation"}
							assetCount={assetCount}
							experience={experience}
							initialIntent={initialIntent}
							settings={settings}
							onSettingsChange={setSettings}
							onImportMedia={onImportMedia}
							onUseRecipe={({ recipeId, intent }) =>
								onUseRecipe({ recipeId, settings, intent })
							}
						/>
					) : null}
					{view === "story" ? (
						<VisionCutStoryGraph
							experience={experience}
							assetCount={assetCount}
							onOpenDirector={onOpenDirector}
						/>
					) : null}
					{view === "visual" ? <VisualLabView /> : null}
					{view === "library" ? (
						<OpenLibraryView onImportOpenverse={onImportOpenverse} />
					) : null}
				</div>
			</ScrollArea>
		</div>
	);
}

export function StudioBackButton({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			className="flex min-h-9 items-center gap-1.5 text-[10px] font-medium text-muted-foreground transition hover:text-foreground"
			onClick={onClick}
		>
			<ArrowLeft className="size-3.5" />
			返回创作中心
		</button>
	);
}
