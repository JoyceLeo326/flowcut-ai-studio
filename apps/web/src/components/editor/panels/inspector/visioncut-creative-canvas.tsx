"use client";

import {
	AudioLines,
	Clapperboard,
	Focus,
	HeartPulse,
	Link2,
	Minus,
	Plus,
	Trash2,
	UserRound,
	X,
	type LucideIcon,
} from "lucide-react";
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	type WheelEvent,
} from "react";
import {
	connectStoryGraphCanvasNodes,
	createStoryGraphCanvasAggregate,
	createStoryGraphCanvasDraftNode,
	deleteStoryGraphCanvasDraftNode,
	fitStoryGraphCanvasViewport,
	getStoryGraphCanvasEdgeGeometry,
	getStoryGraphCanvasNodeSize,
	moveStoryGraphCanvasNode,
	setStoryGraphCanvasViewport,
	STORY_GRAPH_CANVAS_MAX_ZOOM,
	STORY_GRAPH_CANVAS_MIN_ZOOM,
	STORY_GRAPH_CANVAS_TOUCH_MIN_ZOOM,
	StoryGraphCanvasInvariantError,
	type StoryGraphCanvasAggregate,
	type StoryGraphCanvasDocument,
	type StoryGraphCanvasNode,
	type StoryGraphCanvasNodeType,
	type StoryGraphCanvasViewport,
} from "@/ai-studio/story-graph-canvas-model";
import {
	createStoryGraphCanvasStorageKey,
	defaultStoryGraphCanvasStorage,
	loadStoryGraphCanvasAggregate,
	saveStoryGraphCanvasAggregate,
	StoryGraphCanvasRevisionConflictError,
	type StoryGraphCanvasStorageAdapter,
	type StoryGraphCanvasStorageIdentity,
} from "@/ai-studio/story-graph-canvas-store";
import type { StoryGraph } from "@/ai-studio/story-graph-model";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/ui";

const WORLD_WIDTH = 6400;
const WORLD_HEIGHT = 3200;

const NODE_PRESENTATION: Record<
	StoryGraphCanvasNodeType,
	{
		readonly label: string;
		readonly draftLabel: string;
		readonly icon: LucideIcon;
		readonly laneY: number;
	}
> = {
	scene: {
		label: "场景",
		draftLabel: "场景草稿",
		icon: Clapperboard,
		laneY: 224,
	},
	character: {
		label: "人物",
		draftLabel: "人物草稿",
		icon: UserRound,
		laneY: 72,
	},
	emotion: {
		label: "情绪",
		draftLabel: "情绪草稿",
		icon: HeartPulse,
		laneY: 424,
	},
	audio: {
		label: "声音",
		draftLabel: "声音草稿",
		icon: AudioLines,
		laneY: 584,
	},
};

const NODE_TYPES: readonly StoryGraphCanvasNodeType[] = [
	"scene",
	"character",
	"emotion",
	"audio",
];

type StorageState = "loading" | "saving" | "saved" | "conflict" | "error";

function fitCanvasDocument({
	document,
	width,
	height,
}: {
	document: StoryGraphCanvasDocument;
	width: number;
	height: number;
}): StoryGraphCanvasDocument {
	const touchLayout =
		typeof window !== "undefined" &&
		(window.innerWidth <= 1199 ||
			window.matchMedia("(pointer: coarse)").matches);
	return fitStoryGraphCanvasViewport({
		document,
		width,
		height,
		minZoom: touchLayout
			? STORY_GRAPH_CANVAS_TOUCH_MIN_ZOOM
			: STORY_GRAPH_CANVAS_MIN_ZOOM,
	});
}

type PointerOperation =
	| {
			readonly kind: "pan";
			readonly pointerId: number;
			readonly originClient: { readonly x: number; readonly y: number };
			readonly originDocument: StoryGraphCanvasDocument;
			readonly moved: boolean;
	  }
	| {
			readonly kind: "node";
			readonly pointerId: number;
			readonly nodeId: string;
			readonly originClient: { readonly x: number; readonly y: number };
			readonly originPosition: { readonly x: number; readonly y: number };
			readonly originDocument: StoryGraphCanvasDocument;
			readonly moved: boolean;
	  };

export interface VisionCutCreativeCanvasProps {
	readonly graph: StoryGraph;
	readonly className?: string;
	readonly fitOnMount?: boolean;
	readonly selectedNodeId?: string | null;
	readonly storage?: StoryGraphCanvasStorageAdapter;
	readonly onSelectNode?: (node: StoryGraphCanvasNode) => void;
	readonly onLocateTime?: ({
		seconds,
		node,
	}: {
		seconds: number;
		node: StoryGraphCanvasNode;
	}) => void;
	readonly onGraphChange?: (aggregate: StoryGraphCanvasAggregate) => void;
}

function formatTime(seconds: number): string {
	const safeSeconds = Math.max(0, Math.floor(seconds));
	const minutes = Math.floor(safeSeconds / 60);
	const remaining = safeSeconds % 60;
	return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

function documentIdentity({
	document,
}: {
	document: StoryGraphCanvasDocument;
}): StoryGraphCanvasStorageIdentity {
	return {
		projectId: document.projectId,
		graphId: document.graphId,
		graphVersion: document.graphVersion,
	};
}

function documentsShareIdentity({
	left,
	right,
}: {
	left: StoryGraphCanvasDocument;
	right: StoryGraphCanvasDocument;
}): boolean {
	return (
		left.projectId === right.projectId &&
		left.graphId === right.graphId &&
		left.graphVersion === right.graphVersion
	);
}

function nodeEvidenceLabel({ node }: { node: StoryGraphCanvasNode }): string {
	if (node.provenance.kind === "user-draft") {
		return "用户草稿 · 未做语义识别";
	}
	return `时间线依据 · ${node.provenance.timelineElementIds.length} 段`;
}

function nodeTimelineLabel({ node }: { node: StoryGraphCanvasNode }): string {
	if (node.timeline === null) return "未定位";
	return `${formatTime(node.timeline.start)}–${formatTime(node.timeline.end)}`;
}

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}): number {
	return Math.min(max, Math.max(min, value));
}

function nextViewportAroundPoint({
	viewport,
	nextZoom,
	screenPoint,
}: {
	viewport: StoryGraphCanvasViewport;
	nextZoom: number;
	screenPoint: { readonly x: number; readonly y: number };
}): StoryGraphCanvasViewport {
	const zoom = clamp({
		value: nextZoom,
		min: STORY_GRAPH_CANVAS_MIN_ZOOM,
		max: STORY_GRAPH_CANVAS_MAX_ZOOM,
	});
	const worldX = (screenPoint.x - viewport.x) / viewport.zoom;
	const worldY = (screenPoint.y - viewport.y) / viewport.zoom;
	return {
		x: screenPoint.x - worldX * zoom,
		y: screenPoint.y - worldY * zoom,
		zoom,
	};
}

export function VisionCutCreativeCanvas({
	graph,
	className,
	fitOnMount = false,
	selectedNodeId,
	storage = defaultStoryGraphCanvasStorage,
	onSelectNode,
	onLocateTime,
	onGraphChange,
}: VisionCutCreativeCanvasProps) {
	const markerId = `visioncut-canvas-arrow-${useId().replaceAll(":", "")}`;
	const viewportRef = useRef<HTMLDivElement>(null);
	const pointerOperationRef = useRef<PointerOperation | null>(null);
	const wheelSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const fittedIdentityRef = useRef<string | null>(null);
	const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
	const saveSequenceRef = useRef(0);
	const saveGenerationRef = useRef(0);
	const persistedRevisionRef = useRef<number | null>(null);
	const queuedRevisionRef = useRef<number | null>(null);
	const mountedRef = useRef(true);
	const onGraphChangeRef = useRef(onGraphChange);
	const baselineAggregate = useMemo(
		() => createStoryGraphCanvasAggregate({ graph }),
		[graph],
	);
	const baseline = baselineAggregate.canvas;
	const baselineStorageKey = useMemo(
		() =>
			createStoryGraphCanvasStorageKey({
				identity: documentIdentity({ document: baseline }),
			}),
		[baseline],
	);
	const [documentState, setDocumentState] =
		useState<StoryGraphCanvasDocument>(baseline);
	const activeDocument = documentsShareIdentity({
		left: documentState,
		right: baseline,
	})
		? documentState
		: baseline;
	const documentRef = useRef(activeDocument);
	const [localSelectedId, setLocalSelectedId] = useState<string | null>(
		activeDocument.nodes[0]?.id ?? null,
	);
	const [connectionSourceId, setConnectionSourceId] = useState<string | null>(
		null,
	);
	const [storageState, setStorageState] = useState<StorageState>("loading");
	const [statusMessage, setStatusMessage] = useState(
		"人物、情绪和声音节点由用户明确创建为草稿。",
	);

	useEffect(() => {
		onGraphChangeRef.current = onGraphChange;
	}, [onGraphChange]);

	useEffect(() => {
		mountedRef.current = true;
		fittedIdentityRef.current = null;
		saveGenerationRef.current += 1;
		persistedRevisionRef.current = null;
		queuedRevisionRef.current = null;
		let cancelled = false;
		const fitLoadedDocument = (
			document: StoryGraphCanvasDocument,
		): StoryGraphCanvasDocument => {
			if (!fitOnMount) return document;
			const rect = viewportRef.current?.getBoundingClientRect();
			if (!rect || rect.width <= 0 || rect.height <= 0) return document;
			fittedIdentityRef.current = baselineStorageKey;
			return fitCanvasDocument({
				document,
				width: rect.width,
				height: rect.height,
			});
		};
		void loadStoryGraphCanvasAggregate({
			graph,
			storage,
		})
			.then((stored) => {
				if (cancelled) return;
				persistedRevisionRef.current = stored?.revision ?? null;
				queuedRevisionRef.current = stored?.revision ?? null;
				const next = fitLoadedDocument(stored?.canvas ?? baseline);
				documentRef.current = next;
				setDocumentState(next);
				setStorageState("saved");
				onGraphChangeRef.current?.(
					createStoryGraphCanvasAggregate({
						graph,
						canvas: next,
					}),
				);
			})
			.catch(() => {
				if (cancelled) return;
				const next = fitLoadedDocument(baseline);
				documentRef.current = next;
				setDocumentState(next);
				setStorageState("error");
				setStatusMessage("本地布局读取失败，本次操作仍保留在当前会话。");
				onGraphChangeRef.current?.(baselineAggregate);
			});
		return () => {
			cancelled = true;
			mountedRef.current = false;
		};
	}, [
		baseline,
		baselineAggregate,
		baselineStorageKey,
		fitOnMount,
		graph,
		storage,
	]);

	useEffect(() => {
		documentRef.current = activeDocument;
	}, [activeDocument]);

	useEffect(() => {
		if (
			!fitOnMount ||
			storageState === "loading" ||
			fittedIdentityRef.current === baselineStorageKey
		) {
			return;
		}
		let attempts = 0;
		let frame: number | null = null;
		let timer: ReturnType<typeof setTimeout> | null = null;
		const fitWhenVisible = () => {
			attempts += 1;
			const rect = viewportRef.current?.getBoundingClientRect();
			if (!rect || rect.width <= 0 || rect.height <= 0) {
				if (attempts < 8) {
					timer = setTimeout(() => {
						frame = requestAnimationFrame(fitWhenVisible);
					}, 50);
				}
				return;
			}
			fittedIdentityRef.current = baselineStorageKey;
			const next = fitCanvasDocument({
				document: documentRef.current,
				width: rect.width,
				height: rect.height,
			});
			documentRef.current = next;
			setDocumentState(next);
			onGraphChangeRef.current?.(
				createStoryGraphCanvasAggregate({
					graph,
					canvas: next,
				}),
			);
		};
		frame = requestAnimationFrame(fitWhenVisible);
		return () => {
			if (frame !== null) cancelAnimationFrame(frame);
			if (timer !== null) clearTimeout(timer);
		};
	}, [baselineStorageKey, fitOnMount, graph, storageState]);

	useEffect(
		() => () => {
			if (wheelSaveTimerRef.current !== null) {
				clearTimeout(wheelSaveTimerRef.current);
			}
		},
		[],
	);

	const aggregateForDocument = useCallback(
		(next: StoryGraphCanvasDocument) =>
			createStoryGraphCanvasAggregate({
				graph,
				canvas: next,
			}),
		[graph],
	);

	const queueSave = useCallback(
		(next: StoryGraphCanvasDocument) => {
			const aggregate = aggregateForDocument(next);
			const expectedRevision = queuedRevisionRef.current;
			const generation = saveGenerationRef.current;
			const sequence = saveSequenceRef.current + 1;
			saveSequenceRef.current = sequence;
			queuedRevisionRef.current = aggregate.revision;
			setStorageState("saving");
			saveQueueRef.current = saveQueueRef.current
				.catch(() => undefined)
				.then(async () => {
					if (saveGenerationRef.current !== generation) return;
					await saveStoryGraphCanvasAggregate({
						aggregate,
						expectedRevision,
						storage,
					});
					if (saveGenerationRef.current !== generation) return;
					persistedRevisionRef.current = aggregate.revision;
					if (mountedRef.current && saveSequenceRef.current === sequence) {
						setStorageState("saved");
					}
				})
				.catch(async (error: unknown) => {
					if (saveGenerationRef.current !== generation) return;
					saveGenerationRef.current += 1;
					queuedRevisionRef.current = persistedRevisionRef.current;
					if (error instanceof StoryGraphCanvasRevisionConflictError) {
						try {
							const latest = await loadStoryGraphCanvasAggregate({
								graph,
								storage,
							});
							if (latest !== null && mountedRef.current) {
								persistedRevisionRef.current = latest.revision;
								queuedRevisionRef.current = latest.revision;
								documentRef.current = latest.canvas;
								setDocumentState(latest.canvas);
								onGraphChangeRef.current?.(latest);
							}
						} catch {
							// The current in-memory document remains available.
						}
						if (mountedRef.current) {
							setStorageState("conflict");
							setStatusMessage(
								"检测到另一窗口已更新画布，已载入最新版本；本次冲突没有覆盖对方修改。",
							);
						}
						return;
					}
					if (mountedRef.current && saveSequenceRef.current === sequence) {
						setStorageState("error");
						setStatusMessage(
							"布局暂未写入浏览器存储，当前会话中的修改仍然可用。",
						);
					}
				});
		},
		[aggregateForDocument, graph, storage],
	);

	const previewDocument = useCallback((next: StoryGraphCanvasDocument) => {
		documentRef.current = next;
		setDocumentState(next);
	}, []);

	const commitDocument = useCallback(
		(next: StoryGraphCanvasDocument) => {
			documentRef.current = next;
			setDocumentState(next);
			onGraphChangeRef.current?.(aggregateForDocument(next));
			queueSave(next);
		},
		[aggregateForDocument, queueSave],
	);

	const selectedId =
		selectedNodeId ??
		(activeDocument.nodes.some((node) => node.id === localSelectedId)
			? localSelectedId
			: (activeDocument.nodes[0]?.id ?? null));
	const selectedNode =
		activeDocument.nodes.find((node) => node.id === selectedId) ?? null;
	const effectiveConnectionSourceId =
		connectionSourceId === null
			? null
			: connectionSourceId === "" ||
				  activeDocument.nodes.some((node) => node.id === connectionSourceId)
				? connectionSourceId
				: "";
	const derivedSceneCount = activeDocument.nodes.filter(
		(node) => node.provenance.kind === "timeline-derived",
	).length;
	const draftCount = activeDocument.nodes.length - derivedSceneCount;

	function handleSelect({ node }: { node: StoryGraphCanvasNode }) {
		setLocalSelectedId(node.id);
		onSelectNode?.(node);
	}

	function handleLocate({ node }: { node: StoryGraphCanvasNode }) {
		if (node.timeline === null) return;
		onLocateTime?.({ seconds: node.timeline.start, node });
		setStatusMessage(`已定位到 ${formatTime(node.timeline.start)}。`);
	}

	function handleCreateDraft({ type }: { type: StoryGraphCanvasNodeType }) {
		const viewport = viewportRef.current;
		const current = documentRef.current;
		const size = getStoryGraphCanvasNodeSize({ type });
		const rect = viewport?.getBoundingClientRect();
		const centerX = rect ? rect.width / 2 : 420;
		const worldCenterX = (centerX - current.viewport.x) / current.viewport.zoom;
		const sameTypeCount = current.nodes.filter(
			(node) => node.type === type,
		).length;
		const next = createStoryGraphCanvasDraftNode({
			document: current,
			type,
			label: `${NODE_PRESENTATION[type].draftLabel} ${sameTypeCount + 1}`,
			position: {
				x: Math.max(24, worldCenterX - size.width / 2 + sameTypeCount * 18),
				y: NODE_PRESENTATION[type].laneY,
			},
			...(selectedNode === null ? {} : { sourceNodeIds: [selectedNode.id] }),
		});
		const created = next.nodes.at(-1);
		if (created) {
			setLocalSelectedId(created.id);
			onSelectNode?.(created);
		}
		setStatusMessage(`${NODE_PRESENTATION[type].label}草稿已创建。`);
		commitDocument(next);
	}

	function handleDeleteSelected() {
		if (selectedNode?.provenance.kind !== "user-draft") return;
		const next = deleteStoryGraphCanvasDraftNode({
			document: documentRef.current,
			nodeId: selectedNode.id,
		});
		setLocalSelectedId(next.nodes[0]?.id ?? null);
		setConnectionSourceId(null);
		setStatusMessage("草稿节点及其手动关系已删除。");
		commitDocument(next);
	}

	function handleConnectionNode({ node }: { node: StoryGraphCanvasNode }) {
		handleSelect({ node });
		if (
			effectiveConnectionSourceId === null ||
			effectiveConnectionSourceId === ""
		) {
			setConnectionSourceId(node.id);
			setStatusMessage("已选择关系起点。");
			return;
		}
		if (effectiveConnectionSourceId === node.id) {
			setConnectionSourceId(null);
			setStatusMessage("已取消关系起点。");
			return;
		}
		try {
			const next = connectStoryGraphCanvasNodes({
				document: documentRef.current,
				sourceNodeId: effectiveConnectionSourceId,
				targetNodeId: node.id,
				label: "关联",
			});
			commitDocument(next);
			setConnectionSourceId(null);
			setStatusMessage("手动关系草稿已创建。");
		} catch (error) {
			setStatusMessage(
				error instanceof StoryGraphCanvasInvariantError
					? error.message
					: "关系创建失败。",
			);
		}
	}

	function handleNodePointerDown({
		event,
		node,
	}: {
		event: ReactPointerEvent<HTMLElement>;
		node: StoryGraphCanvasNode;
	}) {
		if (event.button !== 0) return;
		event.stopPropagation();
		if (connectionModeActive) {
			handleConnectionNode({ node });
			return;
		}
		handleSelect({ node });
		event.currentTarget.setPointerCapture(event.pointerId);
		pointerOperationRef.current = {
			kind: "node",
			pointerId: event.pointerId,
			nodeId: node.id,
			originClient: { x: event.clientX, y: event.clientY },
			originPosition: { ...node.position },
			originDocument: documentRef.current,
			moved: false,
		};
	}

	function handleCanvasPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
		if (event.button !== 0) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		pointerOperationRef.current = {
			kind: "pan",
			pointerId: event.pointerId,
			originClient: { x: event.clientX, y: event.clientY },
			originDocument: documentRef.current,
			moved: false,
		};
	}

	function handleCanvasPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
		const operation = pointerOperationRef.current;
		if (!operation || operation.pointerId !== event.pointerId) return;
		const deltaX = event.clientX - operation.originClient.x;
		const deltaY = event.clientY - operation.originClient.y;
		if (!operation.moved && Math.hypot(deltaX, deltaY) < 2) return;
		pointerOperationRef.current = { ...operation, moved: true };
		if (operation.kind === "pan") {
			previewDocument(
				setStoryGraphCanvasViewport({
					document: operation.originDocument,
					viewport: {
						x: operation.originDocument.viewport.x + deltaX,
						y: operation.originDocument.viewport.y + deltaY,
						zoom: operation.originDocument.viewport.zoom,
					},
				}),
			);
			return;
		}
		previewDocument(
			moveStoryGraphCanvasNode({
				document: operation.originDocument,
				nodeId: operation.nodeId,
				position: {
					x:
						operation.originPosition.x +
						deltaX / operation.originDocument.viewport.zoom,
					y:
						operation.originPosition.y +
						deltaY / operation.originDocument.viewport.zoom,
				},
			}),
		);
	}

	function handleCanvasPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
		const operation = pointerOperationRef.current;
		if (!operation || operation.pointerId !== event.pointerId) return;
		pointerOperationRef.current = null;
		if (operation.moved) {
			commitDocument(documentRef.current);
		} else if (operation.kind === "pan") {
			setLocalSelectedId(null);
		}
	}

	function handleCanvasPointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
		const operation = pointerOperationRef.current;
		if (!operation || operation.pointerId !== event.pointerId) return;
		pointerOperationRef.current = null;
		previewDocument(operation.originDocument);
	}

	function scheduleViewportSave(next: StoryGraphCanvasDocument) {
		previewDocument(next);
		onGraphChangeRef.current?.(aggregateForDocument(next));
		if (wheelSaveTimerRef.current !== null) {
			clearTimeout(wheelSaveTimerRef.current);
		}
		wheelSaveTimerRef.current = setTimeout(() => {
			wheelSaveTimerRef.current = null;
			queueSave(documentRef.current);
		}, 160);
	}

	function handleWheel(event: WheelEvent<HTMLDivElement>) {
		event.preventDefault();
		const rect = event.currentTarget.getBoundingClientRect();
		const current = documentRef.current;
		const factor = event.deltaY > 0 ? 0.9 : 1.1;
		scheduleViewportSave(
			setStoryGraphCanvasViewport({
				document: current,
				viewport: nextViewportAroundPoint({
					viewport: current.viewport,
					nextZoom: current.viewport.zoom * factor,
					screenPoint: {
						x: event.clientX - rect.left,
						y: event.clientY - rect.top,
					},
				}),
			}),
		);
	}

	function handleZoom({ factor }: { factor: number }) {
		const viewport = viewportRef.current;
		const rect = viewport?.getBoundingClientRect();
		const current = documentRef.current;
		const next = setStoryGraphCanvasViewport({
			document: current,
			viewport: nextViewportAroundPoint({
				viewport: current.viewport,
				nextZoom: current.viewport.zoom * factor,
				screenPoint: {
					x: (rect?.width ?? 840) / 2,
					y: (rect?.height ?? 560) / 2,
				},
			}),
		});
		commitDocument(next);
	}

	function handleFit() {
		const rect = viewportRef.current?.getBoundingClientRect();
		if (!rect) return;
		commitDocument(
			fitCanvasDocument({
				document: documentRef.current,
				width: rect.width,
				height: rect.height,
			}),
		);
		setStatusMessage("画布已适配到当前视口。");
	}

	function handleNodeKeyDown({
		event,
		node,
	}: {
		event: KeyboardEvent<HTMLElement>;
		node: StoryGraphCanvasNode;
	}) {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			if (connectionModeActive) {
				handleConnectionNode({ node });
			} else {
				handleSelect({ node });
			}
			return;
		}
		const delta =
			event.key === "ArrowLeft"
				? { x: -16, y: 0 }
				: event.key === "ArrowRight"
					? { x: 16, y: 0 }
					: event.key === "ArrowUp"
						? { x: 0, y: -16 }
						: event.key === "ArrowDown"
							? { x: 0, y: 16 }
							: null;
		if (delta === null) return;
		event.preventDefault();
		commitDocument(
			moveStoryGraphCanvasNode({
				document: documentRef.current,
				nodeId: node.id,
				position: {
					x: node.position.x + delta.x,
					y: node.position.y + delta.y,
				},
			}),
		);
	}

	function toggleConnectionMode() {
		if (effectiveConnectionSourceId !== null) {
			setConnectionSourceId(null);
			setStatusMessage("已退出连线。");
			return;
		}
		setConnectionSourceId("");
		setStatusMessage("选择一个节点作为关系起点。");
	}

	const connectionModeActive = connectionSourceId !== null;

	return (
		<section
			className={cn(
				"flex h-[min(76vh,780px)] min-h-[520px] w-full flex-col overflow-hidden rounded-[8px] border bg-background",
				className,
			)}
			aria-label="Creative Canvas"
		>
			<header className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-3 py-2">
				<div className="mr-auto min-w-[180px]">
					<div className="flex items-center gap-2">
						<Clapperboard className="size-4 text-cyan-500" />
						<h2 className="text-[13px] font-semibold">Creative Canvas</h2>
						<span className="text-[10px] text-muted-foreground">
							v{activeDocument.graphVersion}
						</span>
					</div>
					<p className="mt-0.5 text-[10px] text-muted-foreground">
						{derivedSceneCount} 个时间线场景 · {draftCount} 个用户草稿
					</p>
				</div>

				<div
					className="flex flex-wrap items-center gap-1"
					aria-label="添加草稿节点"
				>
					{NODE_TYPES.map((type) => {
						const presentation = NODE_PRESENTATION[type];
						const Icon = presentation.icon;
						return (
							<Button
								key={type}
								type="button"
								variant="outline"
								className="min-h-11 rounded-[6px] px-3 text-[11px]"
								onClick={() => handleCreateDraft({ type })}
							>
								<Icon className="size-4" />
								{presentation.label}
							</Button>
						);
					})}
				</div>

				<div className="flex items-center gap-1 border-l pl-2">
					<Button
						type="button"
						variant={connectionModeActive ? "secondary" : "ghost"}
						size="icon"
						className={cn(
							"size-11 rounded-[6px]",
							connectionModeActive && "text-cyan-500",
						)}
						aria-pressed={connectionModeActive}
						aria-label={connectionModeActive ? "退出连线" : "创建关系"}
						title={connectionModeActive ? "退出连线" : "创建关系"}
						onClick={toggleConnectionMode}
					>
						{connectionModeActive ? (
							<X className="size-4" />
						) : (
							<Link2 className="size-4" />
						)}
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-11 rounded-[6px]"
						aria-label="缩小画布"
						title="缩小画布"
						onClick={() => handleZoom({ factor: 0.85 })}
					>
						<Minus className="size-4" />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-11 rounded-[6px]"
						aria-label="放大画布"
						title="放大画布"
						onClick={() => handleZoom({ factor: 1.15 })}
					>
						<Plus className="size-4" />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-11 rounded-[6px]"
						aria-label="适配全部节点"
						title="适配全部节点"
						onClick={handleFit}
					>
						<Focus className="size-4" />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-11 rounded-[6px] text-destructive"
						disabled={selectedNode?.provenance.kind !== "user-draft"}
						aria-label="删除所选草稿节点"
						title="删除所选草稿节点"
						onClick={handleDeleteSelected}
					>
						<Trash2 className="size-4" />
					</Button>
				</div>
			</header>

			<div
				ref={viewportRef}
				className={cn(
					"relative min-h-0 flex-1 touch-none overflow-hidden bg-neutral-950 text-white select-none",
					connectionModeActive ? "cursor-crosshair" : "cursor-grab",
				)}
				aria-label="故事图谱画布"
				onPointerDown={handleCanvasPointerDown}
				onPointerMove={handleCanvasPointerMove}
				onPointerUp={handleCanvasPointerUp}
				onPointerCancel={handleCanvasPointerCancel}
				onWheel={handleWheel}
			>
				{activeDocument.nodes.length === 0 ? (
					<div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center">
						<div>
							<Clapperboard className="mx-auto size-6 text-neutral-500" />
							<p className="mt-3 text-[12px] font-medium text-neutral-200">
								时间线中还没有可定位场景
							</p>
							<p className="mt-1 text-[10px] text-neutral-500">
								你仍可从顶部创建明确标记的草稿节点。
							</p>
						</div>
					</div>
				) : null}

				<div
					className="absolute left-0 top-0 motion-safe:transition-none motion-reduce:transition-none"
					style={{
						width: WORLD_WIDTH,
						height: WORLD_HEIGHT,
						transform: `translate(${activeDocument.viewport.x}px, ${activeDocument.viewport.y}px) scale(${activeDocument.viewport.zoom})`,
						transformOrigin: "0 0",
					}}
				>
					<svg
						className="pointer-events-none absolute inset-0 overflow-visible"
						width={WORLD_WIDTH}
						height={WORLD_HEIGHT}
						aria-hidden="true"
					>
						<defs>
							<marker
								id={markerId}
								viewBox="0 0 8 8"
								refX="7"
								refY="4"
								markerWidth="7"
								markerHeight="7"
								orient="auto-start-reverse"
							>
								<path d="M 0 0 L 8 4 L 0 8 Z" fill="currentColor" />
							</marker>
						</defs>
						{activeDocument.edges.map((edge) => {
							const geometry = getStoryGraphCanvasEdgeGeometry({
								edge,
								nodes: activeDocument.nodes,
							});
							const manual = edge.provenance.kind === "user-draft";
							return (
								<g
									key={edge.id}
									className={manual ? "text-cyan-400/80" : "text-neutral-600"}
								>
									<path
										d={geometry.path}
										fill="none"
										stroke="currentColor"
										strokeWidth={manual ? 1.5 : 1}
										strokeDasharray={manual ? "5 5" : undefined}
										markerEnd={`url(#${markerId})`}
									/>
									<text
										x={geometry.label.x}
										y={geometry.label.y}
										textAnchor="middle"
										fill="currentColor"
										fontSize="10"
									>
										{edge.relation === "sequence" ? "顺序" : edge.label}
									</text>
								</g>
							);
						})}
					</svg>

					{activeDocument.nodes.map((node) => {
						const presentation = NODE_PRESENTATION[node.type];
						const Icon = presentation.icon;
						const size = getStoryGraphCanvasNodeSize({ type: node.type });
						const selected = node.id === selectedId;
						const isConnectionSource = node.id === effectiveConnectionSourceId;
						const draft = node.provenance.kind === "user-draft";
						return (
							<div
								key={node.id}
								data-canvas-node
								role="button"
								tabIndex={0}
								aria-pressed={selected}
								aria-label={`${presentation.label}：${node.label}`}
								className={cn(
									"absolute overflow-hidden rounded-[8px] border bg-neutral-900 text-left outline-none motion-safe:transition-colors motion-reduce:transition-none",
									draft
										? "border-dashed border-amber-500/60"
										: "border-neutral-700",
									selected &&
										"border-cyan-400 bg-neutral-800 outline outline-1 outline-cyan-400/40",
									isConnectionSource &&
										"border-cyan-300 outline outline-1 outline-cyan-300",
								)}
								style={{
									left: node.position.x,
									top: node.position.y,
									width: size.width,
									height: size.height,
									touchAction: "none",
								}}
								onPointerDown={(event) =>
									handleNodePointerDown({ event, node })
								}
								onDoubleClick={() => handleLocate({ node })}
								onKeyDown={(event) => handleNodeKeyDown({ event, node })}
							>
								<div className="flex h-full min-w-0 items-start gap-3 p-3 pr-12">
									<div
										className={cn(
											"flex size-9 shrink-0 items-center justify-center rounded-[6px] border",
											draft
												? "border-amber-500/40 text-amber-400"
												: "border-neutral-700 text-cyan-400",
										)}
									>
										<Icon className="size-4" />
									</div>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<span className="text-[9px] font-medium text-neutral-400">
												{presentation.label}
											</span>
											<span className="text-[9px] text-neutral-500">
												{nodeTimelineLabel({ node })}
											</span>
										</div>
										<p className="mt-1 truncate text-[11px] font-medium text-neutral-100">
											{node.label}
										</p>
										<p className="mt-1 truncate text-[9px] text-neutral-500">
											{nodeEvidenceLabel({ node })}
										</p>
									</div>
								</div>
								<button
									type="button"
									className="absolute bottom-1 right-1 flex size-11 items-center justify-center rounded-[6px] text-neutral-400 outline-none motion-safe:transition-colors hover:bg-neutral-800 hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-400 motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-30"
									style={{
										transform: `scale(${1 / activeDocument.viewport.zoom})`,
										transformOrigin: "bottom right",
									}}
									disabled={node.timeline === null}
									aria-label={`定位 ${node.label}`}
									title={node.timeline === null ? "草稿尚未定位" : "定位到时间"}
									onPointerDown={(event) => event.stopPropagation()}
									onClick={(event) => {
										event.stopPropagation();
										handleLocate({ node });
									}}
								>
									<Focus className="size-4" />
								</button>
							</div>
						);
					})}
				</div>

				<div className="pointer-events-none absolute bottom-3 left-3 flex min-h-8 items-center rounded-[6px] border border-neutral-800 bg-neutral-950/90 px-2 text-[10px] text-neutral-400">
					{Math.round(activeDocument.viewport.zoom * 100)}%
				</div>
			</div>

			<footer className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 border-t bg-muted/20 px-3 py-2 text-[10px]">
				<p className="min-w-0 flex-1 truncate text-muted-foreground">
					{selectedNode
						? `${NODE_PRESENTATION[selectedNode.type].label} · ${selectedNode.label} · ${nodeEvidenceLabel({ node: selectedNode })}`
						: statusMessage}
				</p>
				<p className="text-muted-foreground" aria-live="polite">
					{connectionModeActive ? statusMessage : null}
				</p>
				<span
					className={cn(
						"shrink-0",
						storageState === "error" || storageState === "conflict"
							? "text-amber-600"
							: storageState === "saved"
								? "text-emerald-600"
								: "text-muted-foreground",
					)}
				>
					{storageState === "loading"
						? "读取布局"
						: storageState === "saving"
							? "保存中"
							: storageState === "saved"
								? "已保存到本机"
								: storageState === "conflict"
									? "已处理版本冲突"
									: "会话内保存"}
				</span>
			</footer>
		</section>
	);
}
