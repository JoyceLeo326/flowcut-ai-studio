import { describe, expect, test } from "bun:test";
import {
	createStoryGraphNode,
	deriveStoryGraph,
	type StoryGraph,
} from "./story-graph-model";
import {
	assertStoryGraphCanvasAggregateInvariants,
	assertStoryGraphCanvasInvariants,
	connectStoryGraphCanvasNodes,
	createStoryGraphCanvasAggregate,
	createStoryGraphCanvasDraftNode,
	deleteStoryGraphCanvasDraftNode,
	deriveStoryGraphCanvas,
	fitStoryGraphCanvasViewport,
	getStoryGraphCanvasEdgeGeometry,
	moveStoryGraphCanvasNode,
	rebaseStoryGraphCanvasAggregate,
	renameStoryGraphCanvasDraftNode,
	setStoryGraphCanvasViewport,
	StoryGraphCanvasInvariantError,
	type StoryGraphCanvasDocument,
	type StoryGraphCanvasNodeType,
} from "./story-graph-canvas-model";

function timelineGraph(projectId = "canvas-project"): StoryGraph {
	return deriveStoryGraph({
		projectId,
		media: [
			{
				id: "media-opening",
				name: "Opening.mp4",
				type: "video",
				duration: 4,
				width: 1920,
				height: 1080,
				thumbnailUrl: "blob:opening",
			},
			{
				id: "media-detail",
				name: "Detail.mp4",
				type: "video",
				duration: 5,
				width: 1920,
				height: 1080,
			},
			{
				id: "media-unused",
				name: "Unused.mp4",
				type: "video",
				duration: 3,
			},
		],
		scenes: [
			{
				id: "scene-main",
				name: "Main",
				isMain: true,
				tracks: {
					main: {
						id: "track-main",
						name: "Main",
						type: "video",
						elements: [
							{
								id: "element-opening",
								name: "Opening",
								type: "video",
								mediaId: "media-opening",
								startTime: 0,
								duration: 4,
							},
							{
								id: "element-detail",
								name: "Detail",
								type: "video",
								mediaId: "media-detail",
								startTime: 4,
								duration: 5,
							},
						],
					},
					overlay: [],
					audio: [],
				},
			},
		],
	});
}

function addDraft({
	document,
	type,
	label,
	x,
	y,
}: {
	document: StoryGraphCanvasDocument;
	type: StoryGraphCanvasNodeType;
	label: string;
	x: number;
	y: number;
}): StoryGraphCanvasDocument {
	return createStoryGraphCanvasDraftNode({
		document,
		type,
		label,
		position: { x, y },
	});
}

describe("VisionCut Story Graph Creative Canvas model", () => {
	test("derives only timeline-backed scene nodes and deterministic sequence edges", () => {
		const graphWithManualNode = createStoryGraphNode({
			graph: timelineGraph(),
			node: { label: "Unverified narrative idea" },
		});
		const document = deriveStoryGraphCanvas({ graph: graphWithManualNode });

		expect(document.projectId).toBe(graphWithManualNode.projectId);
		expect(document.graphId).toBe(graphWithManualNode.graphId);
		expect(document.graphVersion).toBe(graphWithManualNode.version);
		expect(document.nodes).toHaveLength(2);
		expect(document.nodes.map((node) => node.type)).toEqual(["scene", "scene"]);
		expect(document.nodes[0].timeline).toEqual({ start: 0, end: 4 });
		expect(document.nodes[0].provenance).toMatchObject({
			kind: "timeline-derived",
			storyNodeId: graphWithManualNode.nodes[0].id,
			timelineElementIds: ["element-opening"],
			semanticAnalysisPerformed: false,
		});
		expect(document.nodes[0].thumbnail?.sourceAssetId).toBe("media-opening");
		expect(document.edges).toHaveLength(1);
		expect(document.edges[0]).toMatchObject({
			sourceNodeId: document.nodes[0].id,
			targetNodeId: document.nodes[1].id,
			relation: "sequence",
			provenance: {
				kind: "timeline-order",
				semanticAnalysisPerformed: false,
			},
		});
		expect(document.guarantees).toEqual({
			localOnly: true,
			semanticInferencePerformed: false,
			derivedSceneNodesRequireTimelineEvidence: true,
			semanticNodesRequireUserDraftProvenance: true,
		});
	});

	test("creates Character, Emotion, and Audio only as explicit user drafts", () => {
		let document = deriveStoryGraphCanvas({ graph: timelineGraph() });
		document = addDraft({
			document,
			type: "character",
			label: "Host candidate",
			x: 120,
			y: 40,
		});
		document = addDraft({
			document,
			type: "emotion",
			label: "Calm direction",
			x: 380,
			y: 420,
		});
		document = addDraft({
			document,
			type: "audio",
			label: "Music direction",
			x: 640,
			y: 560,
		});

		const drafts = document.nodes.filter(
			(node) => node.provenance.kind === "user-draft",
		);
		expect(drafts.map((node) => node.type)).toEqual([
			"character",
			"emotion",
			"audio",
		]);
		for (const draft of drafts) {
			expect(draft.timeline).toBeNull();
			expect(draft.provenance).toMatchObject({
				kind: "user-draft",
				createdBy: "user",
				semanticAnalysisPerformed: false,
			});
			expect(draft.provenance.notice).toContain("User-created draft");
		}
	});

	test("moves and renames drafts while keeping timeline labels graph-owned", () => {
		let document = deriveStoryGraphCanvas({ graph: timelineGraph() });
		const scene = document.nodes[0];
		document = addDraft({
			document,
			type: "character",
			label: "Speaker draft",
			x: 100,
			y: 100,
		});
		const draft = document.nodes.at(-1);
		expect(draft).toBeDefined();
		if (!draft) return;

		document = moveStoryGraphCanvasNode({
			document,
			nodeId: draft.id,
			position: { x: 440, y: 128 },
		});
		document = renameStoryGraphCanvasDraftNode({
			document,
			nodeId: draft.id,
			label: "  Interview speaker  ",
		});

		expect(document.nodes.find((node) => node.id === draft.id)).toMatchObject({
			label: "Interview speaker",
			position: { x: 440, y: 128 },
		});
		expect(() =>
			renameStoryGraphCanvasDraftNode({
				document,
				nodeId: scene.id,
				label: "Invented scene",
			}),
		).toThrow(StoryGraphCanvasInvariantError);
	});

	test("creates manual relationships and removes their draft endpoints atomically", () => {
		let document = deriveStoryGraphCanvas({ graph: timelineGraph() });
		document = addDraft({
			document,
			type: "audio",
			label: "Sparse score",
			x: 340,
			y: 500,
		});
		const scene = document.nodes[0];
		const audio = document.nodes.at(-1);
		expect(audio).toBeDefined();
		if (!audio) return;

		document = connectStoryGraphCanvasNodes({
			document,
			sourceNodeId: scene.id,
			targetNodeId: audio.id,
			label: "Supports",
		});
		const manualEdge = document.edges.at(-1);
		expect(manualEdge).toMatchObject({
			relation: "related",
			label: "Supports",
			provenance: {
				kind: "user-draft",
				createdBy: "user",
				semanticAnalysisPerformed: false,
			},
		});
		expect(() =>
			connectStoryGraphCanvasNodes({
				document,
				sourceNodeId: scene.id,
				targetNodeId: audio.id,
			}),
		).toThrow(StoryGraphCanvasInvariantError);

		document = deleteStoryGraphCanvasDraftNode({
			document,
			nodeId: audio.id,
		});
		expect(document.nodes.some((node) => node.id === audio.id)).toBe(false);
		expect(
			document.edges.some(
				(edge) =>
					edge.sourceNodeId === audio.id || edge.targetNodeId === audio.id,
			),
		).toBe(false);
		expect(() =>
			deleteStoryGraphCanvasDraftNode({
				document,
				nodeId: scene.id,
			}),
		).toThrow(StoryGraphCanvasInvariantError);
	});

	test("clamps zoom, fits the visible graph, and returns stable edge geometry", () => {
		let document = deriveStoryGraphCanvas({ graph: timelineGraph() });
		document = setStoryGraphCanvasViewport({
			document,
			viewport: { x: -40, y: 70, zoom: 99 },
		});
		expect(document.viewport.zoom).toBe(2.5);

		document = fitStoryGraphCanvasViewport({
			document,
			width: 900,
			height: 520,
			padding: 48,
		});
		expect(document.viewport.zoom).toBeGreaterThanOrEqual(0.2);
		expect(document.viewport.zoom).toBeLessThanOrEqual(2.5);
		expect(Number.isFinite(document.viewport.x)).toBe(true);
		expect(Number.isFinite(document.viewport.y)).toBe(true);

		const geometry = getStoryGraphCanvasEdgeGeometry({
			edge: document.edges[0],
			nodes: document.nodes,
		});
		expect(geometry.path).toStartWith("M ");
		expect(geometry.path).toContain(" Q ");
		expect(Number.isFinite(geometry.label.x)).toBe(true);
		expect(Number.isFinite(geometry.label.y)).toBe(true);
	});

	test("supports a touch-safe minimum zoom when fitting a narrow viewport", () => {
		const fitted = fitStoryGraphCanvasViewport({
			document: deriveStoryGraphCanvas({ graph: timelineGraph() }),
			width: 320,
			height: 480,
			padding: 48,
			minZoom: 0.55,
		});

		expect(fitted.viewport.zoom).toBeGreaterThanOrEqual(0.55);
		const firstNode = fitted.nodes[0];
		expect(
			firstNode.position.x * fitted.viewport.zoom + fitted.viewport.x,
		).toBe(48);
	});

	test("rejects semantic node types that pretend to have timeline evidence", () => {
		const document = deriveStoryGraphCanvas({ graph: timelineGraph() });
		const source = document.nodes[0];
		const malformed = {
			...document,
			nodes: [
				...document.nodes,
				{
					...source,
					id: "fake-character",
					type: "character",
				},
			],
		} as StoryGraphCanvasDocument;

		expect(() =>
			assertStoryGraphCanvasInvariants({ document: malformed }),
		).toThrow(StoryGraphCanvasInvariantError);
	});

	test("binds canvas layout and user drafts to one versioned Story Graph aggregate", () => {
		const graph = timelineGraph();
		let canvas = deriveStoryGraphCanvas({ graph });
		canvas = createStoryGraphCanvasDraftNode({
			document: canvas,
			type: "emotion",
			label: "Quiet tension",
			position: { x: 360, y: 440 },
			sourceNodeIds: [canvas.nodes[0].id],
		});
		const draft = canvas.nodes.at(-1);
		expect(draft).toBeDefined();
		if (!draft) return;
		canvas = moveStoryGraphCanvasNode({
			document: canvas,
			nodeId: draft.id,
			position: { x: 520, y: 468 },
		});
		canvas = connectStoryGraphCanvasNodes({
			document: canvas,
			sourceNodeId: canvas.nodes[0].id,
			targetNodeId: draft.id,
			label: "User direction",
		});

		const aggregate = createStoryGraphCanvasAggregate({ graph, canvas });

		expect(aggregate.projectId).toBe(graph.projectId);
		expect(aggregate.graphVersion).toBe(graph.version);
		expect(aggregate.revision).toBe(canvas.revision);
		expect(aggregate.canvas).toEqual(canvas);
		expect(aggregate.canvas.nodes.at(-1)?.provenance).toMatchObject({
			kind: "user-draft",
			semanticAnalysisPerformed: false,
		});
		expect(() =>
			assertStoryGraphCanvasAggregateInvariants({ aggregate }),
		).not.toThrow();
	});

	test("rejects forged timeline provenance even when the canvas shape is valid", () => {
		const graph = timelineGraph();
		const canvas = deriveStoryGraphCanvas({ graph });
		const first = canvas.nodes[0];
		if (first.provenance.kind !== "timeline-derived") return;
		const forged = {
			...canvas,
			nodes: [
				{
					...first,
					provenance: {
						...first.provenance,
						timelineElementIds: ["forged-element"],
					},
				},
				...canvas.nodes.slice(1),
			],
		} as StoryGraphCanvasDocument;

		expect(() =>
			assertStoryGraphCanvasInvariants({ document: forged }),
		).not.toThrow();
		expect(() =>
			createStoryGraphCanvasAggregate({
				graph,
				canvas: forged,
			}),
		).toThrow(StoryGraphCanvasInvariantError);
	});

	test("refuses to rebase an aggregate across projects or graph snapshots", () => {
		const graph = timelineGraph();
		const aggregate = createStoryGraphCanvasAggregate({ graph });
		const otherProjectGraph = timelineGraph("other-canvas-project");

		expect(() =>
			rebaseStoryGraphCanvasAggregate({
				aggregate,
				graph: otherProjectGraph,
			}),
		).toThrow(StoryGraphCanvasInvariantError);

		const forgedSameVersion = {
			...graph,
			nodes: graph.nodes.map((node, index) =>
				index === 0 ? { ...node, label: "Changed without a version" } : node,
			),
		} as StoryGraph;
		expect(() =>
			rebaseStoryGraphCanvasAggregate({
				aggregate,
				graph: forgedSameVersion,
			}),
		).toThrow(StoryGraphCanvasInvariantError);
	});
});
