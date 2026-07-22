"use client";

import {
	ArrowDown,
	ArrowUp,
	BadgeCheck,
	Clapperboard,
	Copy,
	GitMerge,
	Plus,
	Route,
	Timer,
	Trash2,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import {
	createStoryGraphNode,
	deleteStoryGraphNode,
	duplicateStoryGraphNode,
	mergeStoryGraphNodes,
	reorderStoryGraphNode,
	type StoryGraph,
	type StoryGraphEvidenceState,
	type StoryGraphNode,
} from "@/ai-studio/story-graph-model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/ui";

const EVIDENCE_LABELS: Record<StoryGraphEvidenceState, string> = {
	"timeline-and-media": "时间线 + 素材",
	"timeline-only": "仅时间线",
	"media-only": "仅素材",
	manual: "人工节点",
	merged: "合并节点",
};

interface VisionCutLiveStoryGraphProps {
	graph: StoryGraph;
	experience: "guided" | "pro";
	onOpenDirector: () => void;
	onGraphChange?: (next: StoryGraph) => void;
}

function formatTime(seconds: number): string {
	const minutes = Math.floor(seconds / 60);
	const remaining = Math.floor(seconds % 60);
	return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

function formatNodeRange(node: StoryGraphNode): string {
	if (node.timelineStart === null || node.timelineEnd === null) {
		return "尚未放入时间线";
	}
	return `${formatTime(node.timelineStart)} - ${formatTime(node.timelineEnd)}`;
}

export function VisionCutLiveStoryGraph({
	graph,
	experience,
	onOpenDirector,
	onGraphChange,
}: VisionCutLiveStoryGraphProps) {
	const [workingGraph, setWorkingGraph] = useState(graph);
	const [selectedId, setSelectedId] = useState<string | null>(
		graph.nodes[0]?.id ?? null,
	);
	const [newLabel, setNewLabel] = useState("");

	const selectedIndex = workingGraph.nodes.findIndex(
		(node) => node.id === selectedId,
	);
	const selectedNode =
		selectedIndex >= 0 ? workingGraph.nodes[selectedIndex] : null;
	const timelineNodeCount = useMemo(
		() =>
			workingGraph.nodes.filter((node) => node.timelineStart !== null).length,
		[workingGraph.nodes],
	);

	function commit({
		nextGraph,
		nextSelectedId,
	}: {
		nextGraph: StoryGraph;
		nextSelectedId?: string | null;
	}) {
		setWorkingGraph(nextGraph);
		onGraphChange?.(nextGraph);
		if (nextSelectedId !== undefined) setSelectedId(nextSelectedId);
	}

	function handleCreate(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const label = newLabel.trim();
		if (!label) return;
		const next = createStoryGraphNode({
			graph: workingGraph,
			node: { label },
		});
		commit({ nextGraph: next, nextSelectedId: next.nodes.at(-1)?.id ?? null });
		setNewLabel("");
	}

	function handleDelete() {
		if (!selectedNode) return;
		const next = deleteStoryGraphNode({
			graph: workingGraph,
			nodeId: selectedNode.id,
		});
		commit({
			nextGraph: next,
			nextSelectedId:
				next.nodes[Math.min(selectedIndex, next.nodes.length - 1)]?.id ?? null,
		});
	}

	function handleDuplicate() {
		if (!selectedNode) return;
		const next = duplicateStoryGraphNode({
			graph: workingGraph,
			nodeId: selectedNode.id,
		});
		commit({
			nextGraph: next,
			nextSelectedId: next.nodes[selectedIndex + 1]?.id ?? selectedNode.id,
		});
	}

	function handleMove(offset: -1 | 1) {
		if (!selectedNode) return;
		const toIndex = selectedIndex + offset;
		if (toIndex < 0 || toIndex >= workingGraph.nodes.length) return;
		commit({
			nextGraph: reorderStoryGraphNode({
				graph: workingGraph,
				nodeId: selectedNode.id,
				toIndex,
			}),
			nextSelectedId: selectedNode.id,
		});
	}

	function handleMergeNext() {
		if (!selectedNode) return;
		const nextNode = workingGraph.nodes[selectedIndex + 1];
		if (!nextNode) return;
		const next = mergeStoryGraphNodes({
			graph: workingGraph,
			nodeIds: [selectedNode.id, nextNode.id],
			label: `${selectedNode.label} / ${nextNode.label}`,
		});
		commit({
			nextGraph: next,
			nextSelectedId: next.nodes[selectedIndex]?.id ?? null,
		});
	}

	return (
		<div className="space-y-4 pb-5">
			<header className="border-b pb-3">
				<div className="flex items-start gap-3">
					<div className="flex size-10 shrink-0 items-center justify-center rounded-[7px] border bg-foreground text-background">
						<Route className="size-5" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-center justify-between gap-2">
							<h2 className="text-[14px] font-semibold">故事脉络</h2>
							<span className="text-[9px] text-muted-foreground">
								v{workingGraph.version}
							</span>
						</div>
						<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
							按真实素材和时间线组织，不推断人物、情绪或故事评分。
						</p>
					</div>
				</div>
				<div className="mt-3 grid grid-cols-3 divide-x border-y py-2 text-center">
					<div>
						<p className="text-[9px] text-muted-foreground">节点</p>
						<p className="mt-1 text-[11px] font-semibold">
							{workingGraph.nodes.length}
						</p>
					</div>
					<div>
						<p className="text-[9px] text-muted-foreground">已定位</p>
						<p className="mt-1 text-[11px] font-semibold">
							{timelineNodeCount}
						</p>
					</div>
					<div>
						<p className="text-[9px] text-muted-foreground">模式</p>
						<p className="mt-1 text-[11px] font-semibold">
							{experience === "pro" ? "专业" : "引导"}
						</p>
					</div>
				</div>
			</header>

			{workingGraph.nodes.length === 0 ? (
				<section className="border-y py-8 text-center">
					<Clapperboard className="mx-auto size-5 text-muted-foreground" />
					<p className="mt-2 text-[11px] font-medium">等待素材或时间线内容</p>
					<p className="mt-1 text-[9px] text-muted-foreground">
						导入素材后会生成有来源依据的节点。
					</p>
				</section>
			) : (
				<section className="space-y-2" aria-label="故事节点">
					{workingGraph.nodes.map((node, index) => {
						const selected = node.id === selectedId;
						return (
							<button
								key={node.id}
								type="button"
								aria-pressed={selected}
								className={cn(
									"flex min-h-16 w-full items-center gap-3 rounded-[8px] border p-3 text-left transition",
									selected
										? "border-foreground bg-muted/60"
										: "hover:bg-muted/35",
								)}
								onClick={() => setSelectedId(node.id)}
							>
								<span className="flex size-8 shrink-0 items-center justify-center rounded-[6px] border font-mono text-[10px] font-semibold">
									{String(index + 1).padStart(2, "0")}
								</span>
								<span className="min-w-0 flex-1">
									<span className="block truncate text-[11px] font-medium">
										{node.label}
									</span>
									<span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-muted-foreground">
										<span className="inline-flex items-center gap-1">
											<Timer className="size-3" />
											{formatNodeRange(node)}
										</span>
										<span className="inline-flex items-center gap-1">
											<BadgeCheck className="size-3" />
											{EVIDENCE_LABELS[node.evidenceState]}
										</span>
									</span>
								</span>
							</button>
						);
					})}
				</section>
			)}

			<section className="border-y py-3">
				<div className="grid grid-cols-5 gap-1">
					<Button
						variant="outline"
						size="icon"
						className="size-11"
						disabled={selectedIndex <= 0}
						onClick={() => handleMove(-1)}
						title="前移节点"
						aria-label="前移节点"
					>
						<ArrowUp className="size-4" />
					</Button>
					<Button
						variant="outline"
						size="icon"
						className="size-11"
						disabled={
							selectedIndex < 0 ||
							selectedIndex >= workingGraph.nodes.length - 1
						}
						onClick={() => handleMove(1)}
						title="后移节点"
						aria-label="后移节点"
					>
						<ArrowDown className="size-4" />
					</Button>
					<Button
						variant="outline"
						size="icon"
						className="size-11"
						disabled={!selectedNode}
						onClick={handleDuplicate}
						title="复制节点"
						aria-label="复制节点"
					>
						<Copy className="size-4" />
					</Button>
					<Button
						variant="outline"
						size="icon"
						className="size-11"
						disabled={
							!selectedNode || selectedIndex >= workingGraph.nodes.length - 1
						}
						onClick={handleMergeNext}
						title="与下一节点合并"
						aria-label="与下一节点合并"
					>
						<GitMerge className="size-4" />
					</Button>
					<Button
						variant="outline"
						size="icon"
						className="size-11"
						disabled={!selectedNode}
						onClick={handleDelete}
						title="删除节点"
						aria-label="删除节点"
					>
						<Trash2 className="size-4" />
					</Button>
				</div>
			</section>

			<form className="flex gap-2" onSubmit={handleCreate}>
				<Input
					value={newLabel}
					onChange={(event) => setNewLabel(event.target.value)}
					placeholder="新增故事节点"
					aria-label="新增故事节点名称"
					className="h-11 text-[11px]"
				/>
				<Button
					type="submit"
					variant="outline"
					size="icon"
					className="size-11 shrink-0"
					disabled={!newLabel.trim()}
					title="添加故事节点"
					aria-label="添加故事节点"
				>
					<Plus className="size-4" />
				</Button>
			</form>

			<section className="rounded-[8px] border p-3">
				<p className="text-[10px] font-medium">证据边界</p>
				<p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
					当前节点只来自素材名称与时间线位置。对白、人物、场景、情绪和高光仍未分析。
				</p>
				<Button
					variant="outline"
					className="mt-3 h-11 w-full"
					onClick={onOpenDirector}
				>
					<Clapperboard className="size-4" />
					带当前结构打开导演
				</Button>
			</section>
		</div>
	);
}
