"use client";

import {
	ArrowRight,
	ChevronLeft,
	ChevronRight,
	Clapperboard,
	Flag,
	Focus,
	Gauge,
	GripVertical,
	HeartPulse,
	Minus,
	Play,
	Plus,
	RefreshCw,
	Route,
	Sparkles,
	Swords,
	UserRound,
	Zap,
	type LucideIcon,
} from "lucide-react";
import {
	useCallback,
	useMemo,
	useRef,
	useState,
	type DragEvent,
	type KeyboardEvent,
	type PointerEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/ui";

type StoryNodeType =
	| "opening"
	| "character"
	| "conflict"
	| "emotion"
	| "climax"
	| "ending";

type StoryAccent = "chartreuse" | "cyan";

interface StoryNode {
	id: string;
	type: StoryNodeType;
	typeLabel: string;
	title: string;
	emotion: string;
	durationSeconds: number;
	score: number;
	energy: number;
	confidence: number;
	role: string;
	sourceSlots: number;
	plan: string;
	accent: StoryAccent;
}

export interface VisionCutStoryGraphProps {
	experience: "guided" | "pro";
	assetCount: number;
	onOpenDirector: () => void;
}

const INITIAL_STORY_NODES: StoryNode[] = [
	{
		id: "opening-signal",
		type: "opening",
		typeLabel: "Opening",
		title: "先给观众一个问题",
		emotion: "好奇",
		durationSeconds: 8,
		score: 82,
		energy: 46,
		confidence: 68,
		role: "Hook",
		sourceSlots: 2,
		plan: "用一个结果镜头或反常细节建立期待，素材匹配后再决定实际开场。",
		accent: "chartreuse",
	},
	{
		id: "character-context",
		type: "character",
		typeLabel: "Character",
		title: "让主角与目标出现",
		emotion: "亲近",
		durationSeconds: 16,
		score: 77,
		energy: 34,
		confidence: 64,
		role: "Context",
		sourceSlots: 3,
		plan: "交代人物、地点与目标，但不提前解释全部背景。",
		accent: "cyan",
	},
	{
		id: "conflict-pressure",
		type: "conflict",
		typeLabel: "Conflict",
		title: "阻力开始改变计划",
		emotion: "紧张",
		durationSeconds: 21,
		score: 86,
		energy: 67,
		confidence: 72,
		role: "Turn",
		sourceSlots: 4,
		plan: "优先寻找动作中断、语气变化或环境反差，形成第一个转折。",
		accent: "cyan",
	},
	{
		id: "emotion-connection",
		type: "emotion",
		typeLabel: "Emotion",
		title: "给反应留下空间",
		emotion: "共鸣",
		durationSeconds: 14,
		score: 79,
		energy: 58,
		confidence: 61,
		role: "Bond",
		sourceSlots: 2,
		plan: "保留人物反应与环境声；这里不预设慢镜头，待导演确认节奏。",
		accent: "chartreuse",
	},
	{
		id: "climax-release",
		type: "climax",
		typeLabel: "Climax",
		title: "把答案推到最高点",
		emotion: "释放",
		durationSeconds: 11,
		score: 91,
		energy: 92,
		confidence: 75,
		role: "Payoff",
		sourceSlots: 4,
		plan: "把最强动作、信息或情绪落点集中在同一段落，避免重复高潮。",
		accent: "chartreuse",
	},
	{
		id: "ending-aftertaste",
		type: "ending",
		typeLabel: "Ending",
		title: "用余韵完成离场",
		emotion: "笃定",
		durationSeconds: 9,
		score: 84,
		energy: 40,
		confidence: 70,
		role: "Resolve",
		sourceSlots: 2,
		plan: "回收开场提出的问题，再给发布版本预留一句行动信息。",
		accent: "cyan",
	},
];

const NODE_ICONS: Record<StoryNodeType, LucideIcon> = {
	opening: Play,
	character: UserRound,
	conflict: Swords,
	emotion: HeartPulse,
	climax: Zap,
	ending: Flag,
};

const ACCENT_STYLES: Record<
	StoryAccent,
	{
		line: string;
		icon: string;
		meter: string;
		badge: string;
	}
> = {
	chartreuse: {
		line: "bg-[#d7ff3f]",
		icon: "border-[#d7ff3f]/60 bg-[#d7ff3f]/10 text-[#c6ec32]",
		meter: "bg-[#d7ff3f]",
		badge: "border-[#d7ff3f]/45 bg-[#d7ff3f]/10 text-[#d7ff3f]",
	},
	cyan: {
		line: "bg-cyan-400",
		icon: "border-cyan-400/60 bg-cyan-400/10 text-cyan-300",
		meter: "bg-cyan-400",
		badge: "border-cyan-400/45 bg-cyan-400/10 text-cyan-300",
	},
};

const ZOOM_MIN = 75;
const ZOOM_MAX = 125;
const ZOOM_STEP = 10;

function formatDuration(totalSeconds: number) {
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return minutes > 0
		? `${minutes}:${seconds.toString().padStart(2, "0")}`
		: `${seconds}s`;
}

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}) {
	return Math.min(Math.max(value, min), max);
}

export function VisionCutStoryGraph({
	experience,
	assetCount,
	onOpenDirector,
}: VisionCutStoryGraphProps) {
	const [nodes, setNodes] = useState<StoryNode[]>(() =>
		INITIAL_STORY_NODES.map((node) => ({ ...node })),
	);
	const [selectedId, setSelectedId] = useState(INITIAL_STORY_NODES[0].id);
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const [zoom, setZoom] = useState(100);
	const draggingIdRef = useRef<string | null>(null);

	const selectedNode = nodes.find((node) => node.id === selectedId) ?? nodes[0];
	const selectedIndex = nodes.findIndex((node) => node.id === selectedNode.id);
	const totalDuration = useMemo(
		() => nodes.reduce((total, node) => total + node.durationSeconds, 0),
		[nodes],
	);
	const averageScore = useMemo(
		() =>
			Math.round(
				nodes.reduce((total, node) => total + node.score, 0) / nodes.length,
			),
		[nodes],
	);
	const requestedSources = useMemo(
		() => nodes.reduce((total, node) => total + node.sourceSlots, 0),
		[nodes],
	);

	const nodeWidth = Math.round(
		(experience === "pro" ? 232 : 216) * (zoom / 100),
	);
	const connectorWidth = Math.round(40 * (zoom / 100));

	const moveNode = useCallback((activeId: string, overId: string) => {
		if (activeId === overId) {
			return;
		}

		setNodes((currentNodes) => {
			const activeIndex = currentNodes.findIndex(
				(node) => node.id === activeId,
			);
			const overIndex = currentNodes.findIndex((node) => node.id === overId);
			if (activeIndex < 0 || overIndex < 0) {
				return currentNodes;
			}

			const reordered = [...currentNodes];
			const [activeNode] = reordered.splice(activeIndex, 1);
			reordered.splice(overIndex, 0, activeNode);
			return reordered;
		});
	}, []);

	const startDragging = useCallback((nodeId: string) => {
		draggingIdRef.current = nodeId;
		setDraggingId(nodeId);
		setSelectedId(nodeId);
	}, []);

	const stopDragging = useCallback(() => {
		draggingIdRef.current = null;
		setDraggingId(null);
	}, []);

	const handleDragStart = ({
		event,
		nodeId,
	}: {
		event: DragEvent<HTMLButtonElement>;
		nodeId: string;
	}) => {
		event.dataTransfer.effectAllowed = "move";
		event.dataTransfer.setData("text/plain", nodeId);
		startDragging(nodeId);
	};

	const handlePointerDown = ({
		event,
		nodeId,
	}: {
		event: PointerEvent<HTMLButtonElement>;
		nodeId: string;
	}) => {
		if (event.pointerType === "mouse") {
			return;
		}

		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
		startDragging(nodeId);
	};

	const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
		const activeId = draggingIdRef.current;
		if (!activeId || event.pointerType === "mouse") {
			return;
		}

		event.preventDefault();
		const target = document
			.elementFromPoint(event.clientX, event.clientY)
			?.closest<HTMLElement>("[data-story-node-id]");
		const overId = target?.dataset.storyNodeId;
		if (overId) {
			moveNode(activeId, overId);
		}
	};

	const moveSelectedBy = (offset: number) => {
		const targetNode = nodes[selectedIndex + offset];
		if (targetNode) {
			moveNode(selectedNode.id, targetNode.id);
		}
	};

	const adjustSelectedDuration = (offset: number) => {
		setNodes((currentNodes) =>
			currentNodes.map((node) =>
				node.id === selectedNode.id
					? {
							...node,
							durationSeconds: clamp({
								value: node.durationSeconds + offset,
								min: 3,
								max: 90,
							}),
						}
					: node,
			),
		);
	};

	const resetLayout = () => {
		setNodes(INITIAL_STORY_NODES.map((node) => ({ ...node })));
		setSelectedId(INITIAL_STORY_NODES[0].id);
		setZoom(100);
		stopDragging();
	};

	return (
		<section className="flex min-h-0 flex-col overflow-hidden rounded-md border border-white/10 bg-[#111315] text-zinc-100">
			<header className="border-b border-white/10 bg-[#15181a] px-3 py-3 sm:px-4">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-black/20 text-[#d7ff3f]">
								<Route className="size-4" aria-hidden="true" />
							</div>
							<div>
								<p className="text-[11px] font-medium tracking-normal text-zinc-500">
									VISIONCUT STORY
								</p>
								<h2 className="text-sm font-semibold tracking-normal text-zinc-50">
									故事脉络
								</h2>
							</div>
							<span className="rounded-sm border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-medium tracking-normal text-zinc-300">
								{experience === "pro" ? "专业深度" : "指导视图"}
							</span>
						</div>
						<p className="mt-2 text-xs leading-5 tracking-normal text-zinc-500">
							规划草案 · 尚未执行 AI 素材分析
						</p>
					</div>

					<Button
						className="min-h-11 border border-[#d7ff3f]/60 bg-[#d7ff3f] px-3 text-xs font-semibold text-[#111315] hover:bg-[#c9f039]"
						onClick={onOpenDirector}
					>
						<Sparkles aria-hidden="true" />
						打开 AI 导演
					</Button>
				</div>

				<div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-white/10 bg-white/10 sm:grid-cols-4">
					<StoryMetric label="结构节点" value={`${nodes.length}`} />
					<StoryMetric label="规划时长" value={formatDuration(totalDuration)} />
					<StoryMetric label="示意评分" value={`${averageScore}`} />
					<StoryMetric
						label="素材状态"
						value={assetCount > 0 ? `${assetCount} 待匹配` : "等待导入"}
					/>
				</div>
			</header>

			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#121517] px-3 py-2 sm:px-4">
				<div className="flex items-center gap-1" aria-label="画布缩放">
					<Button
						aria-label="缩小故事图"
						className="min-h-11 min-w-11 border-white/10 bg-transparent text-zinc-300 hover:bg-white/[0.06]"
						disabled={zoom <= ZOOM_MIN}
						onClick={() =>
							setZoom((value) =>
								clamp({
									value: value - ZOOM_STEP,
									min: ZOOM_MIN,
									max: ZOOM_MAX,
								}),
							)
						}
						title="缩小"
					>
						<Minus aria-hidden="true" />
					</Button>
					<button
						aria-label="重置为百分之百缩放"
						className="min-h-11 min-w-14 rounded-md border border-white/10 bg-transparent px-2 text-xs tabular-nums text-zinc-300 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300"
						onClick={() => setZoom(100)}
						title="重置缩放"
						type="button"
					>
						{zoom}%
					</button>
					<Button
						aria-label="放大故事图"
						className="min-h-11 min-w-11 border-white/10 bg-transparent text-zinc-300 hover:bg-white/[0.06]"
						disabled={zoom >= ZOOM_MAX}
						onClick={() =>
							setZoom((value) =>
								clamp({
									value: value + ZOOM_STEP,
									min: ZOOM_MIN,
									max: ZOOM_MAX,
								}),
							)
						}
						title="放大"
					>
						<Plus aria-hidden="true" />
					</Button>
				</div>

				<Button
					className="min-h-11 border-white/10 bg-transparent px-3 text-xs text-zinc-300 hover:bg-white/[0.06]"
					onClick={resetLayout}
					title="恢复节点顺序与缩放"
				>
					<RefreshCw aria-hidden="true" />
					自动布局
				</Button>
			</div>

			<div
				aria-label="故事节点图，可横向浏览并重排节点"
				className="min-h-0 touch-pan-x overflow-x-auto overscroll-x-contain scroll-smooth bg-[#0d0f10] [scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin]"
			>
				<div className="w-max min-w-full px-3 py-5 sm:px-5 sm:py-6">
					<div className="flex items-stretch">
						{nodes.map((node, index) => (
							<div className="flex items-center" key={node.id}>
								<StoryNodeCard
									draggingId={draggingId}
									experience={experience}
									node={node}
									onDragEnd={stopDragging}
									onDragEnter={() => {
										const activeId = draggingIdRef.current;
										if (activeId) {
											moveNode(activeId, node.id);
										}
									}}
									onDragStart={(event) =>
										handleDragStart({ event, nodeId: node.id })
									}
									onDrop={stopDragging}
									onPointerDown={(event) =>
										handlePointerDown({ event, nodeId: node.id })
									}
									onPointerMove={handlePointerMove}
									onPointerUp={stopDragging}
									onSelect={() => setSelectedId(node.id)}
									selected={selectedId === node.id}
									width={nodeWidth}
								/>
								{index < nodes.length - 1 && (
									<div
										aria-hidden="true"
										className="flex shrink-0 items-center px-1 text-zinc-700"
										style={{ width: connectorWidth }}
									>
										<div className="h-px flex-1 bg-white/15" />
										<ArrowRight className="size-4 shrink-0" />
									</div>
								)}
							</div>
						))}
					</div>

					<div className="mt-5 border-t border-white/10 pt-3">
						<div className="mb-2 flex items-center justify-between gap-4">
							<div className="flex items-center gap-2 text-[11px] font-medium tracking-normal text-zinc-500">
								<HeartPulse
									className="size-3.5 text-cyan-300"
									aria-hidden="true"
								/>
								情绪脉冲
							</div>
							<span className="text-[11px] tracking-normal text-zinc-600">
								结构参考，不代表观众预测
							</span>
						</div>
						<div className="flex h-16 items-end" aria-label="各节点情绪强度">
							{nodes.map((node, index) => (
								<div className="flex items-end" key={node.id}>
									<div
										className="flex items-end gap-2"
										style={{ width: nodeWidth }}
									>
										<div className="h-full w-1 bg-white/[0.05]">
											<div
												className={cn(
													"w-full",
													ACCENT_STYLES[node.accent].meter,
												)}
												style={{ height: `${node.energy}%` }}
											/>
										</div>
										<div className="min-w-0 pb-0.5">
											<p className="truncate text-[11px] font-medium tracking-normal text-zinc-300">
												{node.emotion}
											</p>
											<p className="mt-1 text-[10px] tabular-nums tracking-normal text-zinc-600">
												{node.energy}/100
											</p>
										</div>
									</div>
									{index < nodes.length - 1 && (
										<div style={{ width: connectorWidth }} />
									)}
								</div>
							))}
						</div>
					</div>
				</div>
			</div>

			<SelectedNodePanel
				assetCount={assetCount}
				experience={experience}
				node={selectedNode}
				onAdjustDuration={adjustSelectedDuration}
				onMoveLeft={() => moveSelectedBy(-1)}
				onMoveRight={() => moveSelectedBy(1)}
				onOpenDirector={onOpenDirector}
				requestedSources={requestedSources}
				selectedIndex={selectedIndex}
				totalNodes={nodes.length}
			/>
		</section>
	);
}

function StoryMetric({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0 bg-[#111315] px-3 py-2.5">
			<p className="text-[10px] font-medium tracking-normal text-zinc-600">
				{label}
			</p>
			<p className="mt-1 truncate text-xs font-semibold tabular-nums tracking-normal text-zinc-200">
				{value}
			</p>
		</div>
	);
}

function StoryNodeCard({
	node,
	selected,
	width,
	experience,
	draggingId,
	onSelect,
	onDragStart,
	onDragEnter,
	onDrop,
	onDragEnd,
	onPointerDown,
	onPointerMove,
	onPointerUp,
}: {
	node: StoryNode;
	selected: boolean;
	width: number;
	experience: "guided" | "pro";
	draggingId: string | null;
	onSelect: () => void;
	onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
	onDragEnter: () => void;
	onDrop: () => void;
	onDragEnd: () => void;
	onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
	onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
	onPointerUp: () => void;
}) {
	const Icon = NODE_ICONS[node.type];
	const accent = ACCENT_STYLES[node.accent];

	const handleKeyboardSelect = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key === "Enter" || event.key === " ") {
			onSelect();
		}
	};

	return (
		<article
			className={cn(
				"relative shrink-0 overflow-hidden rounded-md border bg-[#15181a] transition-colors duration-150",
				selected
					? "border-[#d7ff3f]/70 bg-[#181c18]"
					: "border-white/10 hover:border-white/20",
				draggingId === node.id && "opacity-55",
			)}
			data-story-node-id={node.id}
			onDragEnter={(event) => {
				event.preventDefault();
				onDragEnter();
			}}
			onDragOver={(event) => event.preventDefault()}
			onDrop={(event) => {
				event.preventDefault();
				onDrop();
			}}
			style={{ width }}
		>
			<div className={cn("absolute inset-y-0 left-0 w-1", accent.line)} />
			<button
				aria-pressed={selected}
				className="block min-h-[184px] w-full px-4 py-4 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-cyan-300"
				onClick={onSelect}
				onKeyDown={handleKeyboardSelect}
				type="button"
			>
				<div className="flex items-start justify-between gap-3">
					<div
						className={cn(
							"flex size-9 items-center justify-center rounded-md border",
							accent.icon,
						)}
					>
						<Icon className="size-4" aria-hidden="true" />
					</div>
					<span className="mr-8 rounded-sm border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-medium tabular-nums tracking-normal text-zinc-400">
						{formatDuration(node.durationSeconds)}
					</span>
				</div>
				<p className="mt-3 text-[10px] font-semibold tracking-normal text-zinc-500">
					{node.typeLabel}
				</p>
				<h3 className="mt-1 line-clamp-2 min-h-10 text-sm font-semibold leading-5 tracking-normal text-zinc-50">
					{node.title}
				</h3>
				<div className="mt-3 flex items-center justify-between gap-2">
					<span
						className={cn(
							"rounded-sm border px-2 py-1 text-[10px] font-medium tracking-normal",
							accent.badge,
						)}
					>
						{node.emotion}
					</span>
					<div className="flex items-center gap-1 text-[10px] tabular-nums tracking-normal text-zinc-500">
						<Gauge className="size-3" aria-hidden="true" />
						规划 {node.score}
					</div>
				</div>
				{experience === "pro" && (
					<div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-white/10 bg-white/10">
						<div className="bg-[#101214] px-2 py-2">
							<p className="text-[9px] tracking-normal text-zinc-600">
								结构角色
							</p>
							<p className="mt-1 text-[10px] font-medium tracking-normal text-zinc-300">
								{node.role}
							</p>
						</div>
						<div className="bg-[#101214] px-2 py-2">
							<p className="text-[9px] tracking-normal text-zinc-600">置信度</p>
							<p className="mt-1 text-[10px] font-medium tabular-nums tracking-normal text-zinc-300">
								{node.confidence}%
							</p>
						</div>
					</div>
				)}
			</button>

			<button
				aria-label={`移动 ${node.typeLabel} 节点`}
				className="absolute right-2 top-2 flex min-h-11 min-w-11 touch-none cursor-grab items-center justify-center rounded-md border border-transparent text-zinc-600 hover:border-white/10 hover:bg-white/[0.05] hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300 active:cursor-grabbing"
				draggable
				onDragEnd={onDragEnd}
				onDragStart={onDragStart}
				onPointerCancel={onPointerUp}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				title="移动故事节点"
				type="button"
			>
				<GripVertical className="size-4" aria-hidden="true" />
			</button>
		</article>
	);
}

function SelectedNodePanel({
	node,
	experience,
	assetCount,
	requestedSources,
	selectedIndex,
	totalNodes,
	onMoveLeft,
	onMoveRight,
	onAdjustDuration,
	onOpenDirector,
}: {
	node: StoryNode;
	experience: "guided" | "pro";
	assetCount: number;
	requestedSources: number;
	selectedIndex: number;
	totalNodes: number;
	onMoveLeft: () => void;
	onMoveRight: () => void;
	onAdjustDuration: (offset: number) => void;
	onOpenDirector: () => void;
}) {
	const accent = ACCENT_STYLES[node.accent];
	const sourceCoverage =
		assetCount === 0
			? "等待素材"
			: assetCount >= requestedSources
				? "数量可覆盖"
				: `${assetCount}/${requestedSources} 待分配`;

	return (
		<div className="border-t border-white/10 bg-[#15181a] px-3 py-4 sm:px-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<span
							className={cn(
								"rounded-sm border px-2 py-1 text-[10px] font-semibold tracking-normal",
								accent.badge,
							)}
						>
							{node.typeLabel}
						</span>
						<span className="text-[11px] tabular-nums tracking-normal text-zinc-600">
							节点 {selectedIndex + 1}/{totalNodes}
						</span>
					</div>
					<h3 className="mt-2 text-sm font-semibold leading-5 tracking-normal text-zinc-50">
						{node.title}
					</h3>
					<p className="mt-2 max-w-2xl text-xs leading-5 tracking-normal text-zinc-400">
						{node.plan}
					</p>
				</div>
				<div className="flex items-center gap-1">
					<Button
						aria-label="向前移动节点"
						className="min-h-11 min-w-11 border-white/10 bg-transparent text-zinc-300 hover:bg-white/[0.06]"
						disabled={selectedIndex <= 0}
						onClick={onMoveLeft}
						title="向前移动"
					>
						<ChevronLeft aria-hidden="true" />
					</Button>
					<Button
						aria-label="向后移动节点"
						className="min-h-11 min-w-11 border-white/10 bg-transparent text-zinc-300 hover:bg-white/[0.06]"
						disabled={selectedIndex >= totalNodes - 1}
						onClick={onMoveRight}
						title="向后移动"
					>
						<ChevronRight aria-hidden="true" />
					</Button>
				</div>
			</div>

			{experience === "guided" ? (
				<div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
					<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] tracking-normal text-zinc-500">
						<span className="flex items-center gap-1.5">
							<Clapperboard className="size-3.5" aria-hidden="true" />
							需要约 {node.sourceSlots} 个镜头
						</span>
						<span className="flex items-center gap-1.5">
							<Focus className="size-3.5" aria-hidden="true" />
							{sourceCoverage}
						</span>
					</div>
					<span className="rounded-sm border border-amber-300/20 bg-amber-300/[0.06] px-2 py-1 text-[10px] font-medium tracking-normal text-amber-200/80">
						待导演确认
					</span>
				</div>
			) : (
				<div className="mt-4 grid gap-px overflow-hidden rounded-md border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
					<ProDatum label="结构角色" value={node.role} />
					<ProDatum label="情绪强度" value={`${node.energy}/100`} />
					<ProDatum label="规划置信度" value={`${node.confidence}%`} />
					<ProDatum label="素材覆盖" value={sourceCoverage} />
				</div>
			)}

			{experience === "pro" && (
				<div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
					<div className="flex items-center gap-1">
						<span className="mr-1 text-[11px] font-medium tracking-normal text-zinc-500">
							规划时长
						</span>
						<Button
							aria-label="缩短节点时长"
							className="min-h-11 min-w-11 border-white/10 bg-transparent text-zinc-300 hover:bg-white/[0.06]"
							onClick={() => onAdjustDuration(-1)}
							title="缩短一秒"
						>
							<Minus aria-hidden="true" />
						</Button>
						<output className="min-w-12 text-center text-xs font-semibold tabular-nums tracking-normal text-zinc-200">
							{formatDuration(node.durationSeconds)}
						</output>
						<Button
							aria-label="延长节点时长"
							className="min-h-11 min-w-11 border-white/10 bg-transparent text-zinc-300 hover:bg-white/[0.06]"
							onClick={() => onAdjustDuration(1)}
							title="延长一秒"
						>
							<Plus aria-hidden="true" />
						</Button>
					</div>
					<Button
						className="min-h-11 border-white/10 bg-transparent px-3 text-xs text-zinc-300 hover:bg-white/[0.06]"
						onClick={onOpenDirector}
					>
						<Sparkles aria-hidden="true" />
						审阅此节点
					</Button>
				</div>
			)}
		</div>
	);
}

function ProDatum({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0 bg-[#101214] px-3 py-2.5">
			<p className="text-[10px] font-medium tracking-normal text-zinc-600">
				{label}
			</p>
			<p className="mt-1 truncate text-[11px] font-semibold tabular-nums tracking-normal text-zinc-300">
				{value}
			</p>
		</div>
	);
}
