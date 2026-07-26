import {
	assertStoryGraphInvariants,
	type StoryGraph,
	type StoryGraphEvidenceState,
	type StoryGraphNode,
	type StoryGraphThumbnailMetadata,
} from "./story-graph-model";

export const STORY_GRAPH_CANVAS_SCHEMA_VERSION = 1 as const;
export const STORY_GRAPH_CANVAS_KIND = "visioncut.story-graph-canvas" as const;
export const STORY_GRAPH_CANVAS_AGGREGATE_SCHEMA_VERSION = 1 as const;
export const STORY_GRAPH_CANVAS_AGGREGATE_KIND =
	"visioncut.story-graph-canvas-aggregate" as const;
export const STORY_GRAPH_CANVAS_MIN_ZOOM = 0.2;
export const STORY_GRAPH_CANVAS_TOUCH_MIN_ZOOM = 0.55;
export const STORY_GRAPH_CANVAS_MAX_ZOOM = 2.5;

export type StoryGraphCanvasNodeType =
	| "scene"
	| "character"
	| "emotion"
	| "audio";

export interface StoryGraphCanvasPoint {
	readonly x: number;
	readonly y: number;
}

export interface StoryGraphCanvasViewport {
	readonly x: number;
	readonly y: number;
	readonly zoom: number;
}

export interface StoryGraphCanvasTimelineRange {
	readonly start: number;
	readonly end: number;
}

export interface StoryGraphCanvasTimelineProvenance {
	readonly kind: "timeline-derived";
	readonly storyNodeId: string;
	readonly evidenceState: StoryGraphEvidenceState;
	readonly sceneIds: readonly string[];
	readonly trackIds: readonly string[];
	readonly timelineElementIds: readonly string[];
	readonly mediaIds: readonly string[];
	readonly semanticAnalysisPerformed: false;
	readonly notice: string;
}

export interface StoryGraphCanvasDraftProvenance {
	readonly kind: "user-draft";
	readonly createdBy: "user";
	readonly sourceNodeIds: readonly string[];
	readonly semanticAnalysisPerformed: false;
	readonly notice: string;
}

export type StoryGraphCanvasNodeProvenance =
	| StoryGraphCanvasTimelineProvenance
	| StoryGraphCanvasDraftProvenance;

export interface StoryGraphCanvasNode {
	readonly id: string;
	readonly type: StoryGraphCanvasNodeType;
	readonly label: string;
	readonly position: StoryGraphCanvasPoint;
	readonly timeline: StoryGraphCanvasTimelineRange | null;
	readonly thumbnail?: StoryGraphThumbnailMetadata;
	readonly provenance: StoryGraphCanvasNodeProvenance;
}

export interface StoryGraphCanvasTimelineEdgeProvenance {
	readonly kind: "timeline-order";
	readonly semanticAnalysisPerformed: false;
	readonly notice: string;
}

export interface StoryGraphCanvasDraftEdgeProvenance {
	readonly kind: "user-draft";
	readonly createdBy: "user";
	readonly semanticAnalysisPerformed: false;
	readonly notice: string;
}

export type StoryGraphCanvasEdgeProvenance =
	| StoryGraphCanvasTimelineEdgeProvenance
	| StoryGraphCanvasDraftEdgeProvenance;

export interface StoryGraphCanvasEdge {
	readonly id: string;
	readonly sourceNodeId: string;
	readonly targetNodeId: string;
	readonly relation: "sequence" | "related";
	readonly label: string;
	readonly provenance: StoryGraphCanvasEdgeProvenance;
}

export interface StoryGraphCanvasDocument {
	readonly kind: typeof STORY_GRAPH_CANVAS_KIND;
	readonly schemaVersion: typeof STORY_GRAPH_CANVAS_SCHEMA_VERSION;
	readonly canvasId: string;
	readonly projectId: string;
	readonly graphId: string;
	readonly graphVersion: number;
	readonly revision: number;
	readonly viewport: StoryGraphCanvasViewport;
	readonly nodes: readonly StoryGraphCanvasNode[];
	readonly edges: readonly StoryGraphCanvasEdge[];
	readonly guarantees: {
		readonly localOnly: true;
		readonly semanticInferencePerformed: false;
		readonly derivedSceneNodesRequireTimelineEvidence: true;
		readonly semanticNodesRequireUserDraftProvenance: true;
	};
}

export interface StoryGraphCanvasAggregate {
	readonly kind: typeof STORY_GRAPH_CANVAS_AGGREGATE_KIND;
	readonly schemaVersion: typeof STORY_GRAPH_CANVAS_AGGREGATE_SCHEMA_VERSION;
	readonly aggregateId: string;
	readonly projectId: string;
	readonly graphId: string;
	readonly graphVersion: number;
	readonly revision: number;
	readonly storyGraph: StoryGraph;
	readonly canvas: StoryGraphCanvasDocument;
	readonly guarantees: {
		readonly canvasIsVersionedSubdocument: true;
		readonly timelineProvenanceVerified: true;
		readonly semanticInferencePerformed: false;
	};
}

export interface StoryGraphCanvasNodeSize {
	readonly width: number;
	readonly height: number;
}

export interface StoryGraphCanvasEdgeGeometry {
	readonly start: StoryGraphCanvasPoint;
	readonly control: StoryGraphCanvasPoint;
	readonly end: StoryGraphCanvasPoint;
	readonly label: StoryGraphCanvasPoint;
	readonly path: string;
}

export class StoryGraphCanvasInvariantError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "StoryGraphCanvasInvariantError";
	}
}

const NODE_TYPES: readonly StoryGraphCanvasNodeType[] = [
	"scene",
	"character",
	"emotion",
	"audio",
];

const CANVAS_GUARANTEES = Object.freeze({
	localOnly: true,
	semanticInferencePerformed: false,
	derivedSceneNodesRequireTimelineEvidence: true,
	semanticNodesRequireUserDraftProvenance: true,
} as const);

const AGGREGATE_GUARANTEES = Object.freeze({
	canvasIsVersionedSubdocument: true,
	timelineProvenanceVerified: true,
	semanticInferencePerformed: false,
} as const);

const TIMELINE_PROVENANCE_NOTICE =
	"Derived only from Story Graph timeline provenance. No character, emotion, audio, or narrative semantics were inferred.";
const DRAFT_PROVENANCE_NOTICE =
	"User-created draft. It is not a media-analysis result and carries no inferred semantic evidence.";
const TIMELINE_EDGE_NOTICE =
	"Derived only from the order of timeline-backed Story Graph nodes.";
const DRAFT_EDGE_NOTICE =
	"User-created relationship draft. It is not an inferred media relationship.";

function aggregateIdFor({
	graphId,
	graphVersion,
}: {
	graphId: string;
	graphVersion: number;
}): string {
	return `${graphId}:canvas-aggregate:v${graphVersion}`;
}

function storyGraphVersionSnapshot({ graph }: { graph: StoryGraph }): string {
	assertStoryGraphInvariants({ graph });
	return JSON.stringify({
		kind: graph.kind,
		schemaVersion: graph.schemaVersion,
		graphId: graph.graphId,
		projectId: graph.projectId,
		version: graph.version,
		derivation: {
			deterministic: graph.derivation.deterministic,
			contentAnalysisPerformed: graph.derivation.contentAnalysisPerformed,
			notice: graph.derivation.notice,
		},
		requirements: {
			network: graph.requirements.network,
			paidService: graph.requirements.paidService,
			apiKey: graph.requirements.apiKey,
		},
		nodes: graph.nodes.map((node) => ({
			id: node.id,
			assetId: node.assetId ?? null,
			mediaId: node.mediaId ?? null,
			timelineStart: node.timelineStart,
			timelineEnd: node.timelineEnd,
			label: node.label,
			evidenceState: node.evidenceState,
			thumbnail:
				node.thumbnail === undefined
					? null
					: {
							sourceAssetId: node.thumbnail.sourceAssetId,
							width: node.thumbnail.width ?? null,
							height: node.thumbnail.height ?? null,
						},
			provenance: {
				sceneIds: [...node.provenance.sceneIds],
				trackIds: [...node.provenance.trackIds],
				timelineElementIds: [...node.provenance.timelineElementIds],
				mediaIds: [...node.provenance.mediaIds],
				sourceNodeIds: [...node.provenance.sourceNodeIds],
			},
		})),
	});
}

function timelineNodeBindingSnapshot({
	node,
	includeThumbnailUrl,
}: {
	node: StoryGraphCanvasNode;
	includeThumbnailUrl: boolean;
}): string {
	if (node.provenance.kind !== "timeline-derived") {
		throw new StoryGraphCanvasInvariantError(
			"Only timeline-derived nodes can be verified against the Story Graph.",
		);
	}
	return JSON.stringify({
		id: node.id,
		type: node.type,
		label: node.label,
		timeline: node.timeline,
		thumbnail:
			node.thumbnail === undefined
				? null
				: {
						...(includeThumbnailUrl ? { url: node.thumbnail.url } : {}),
						sourceAssetId: node.thumbnail.sourceAssetId,
						width: node.thumbnail.width ?? null,
						height: node.thumbnail.height ?? null,
					},
		provenance: {
			kind: node.provenance.kind,
			storyNodeId: node.provenance.storyNodeId,
			evidenceState: node.provenance.evidenceState,
			sceneIds: [...node.provenance.sceneIds],
			trackIds: [...node.provenance.trackIds],
			timelineElementIds: [...node.provenance.timelineElementIds],
			mediaIds: [...node.provenance.mediaIds],
			semanticAnalysisPerformed: node.provenance.semanticAnalysisPerformed,
			notice: node.provenance.notice,
		},
	});
}

function timelineEdgeBindingSnapshot({
	edge,
}: {
	edge: StoryGraphCanvasEdge;
}): string {
	if (edge.provenance.kind !== "timeline-order") {
		throw new StoryGraphCanvasInvariantError(
			"Only timeline-order edges can be verified against the Story Graph.",
		);
	}
	return JSON.stringify({
		id: edge.id,
		sourceNodeId: edge.sourceNodeId,
		targetNodeId: edge.targetNodeId,
		relation: edge.relation,
		label: edge.label,
		provenance: {
			kind: edge.provenance.kind,
			semanticAnalysisPerformed: edge.provenance.semanticAnalysisPerformed,
			notice: edge.provenance.notice,
		},
	});
}

function normalizeText({
	value,
	label,
}: {
	value: string;
	label: string;
}): string {
	if (typeof value !== "string") {
		throw new StoryGraphCanvasInvariantError(`${label} must be a string.`);
	}
	const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
	if (!normalized) {
		throw new StoryGraphCanvasInvariantError(`${label} cannot be empty.`);
	}
	return normalized;
}

function assertFinitePoint({
	point,
	label,
}: {
	point: StoryGraphCanvasPoint;
	label: string;
}): void {
	if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
		throw new StoryGraphCanvasInvariantError(
			`${label} must contain finite coordinates.`,
		);
	}
}

function isPositiveInteger(value: number): boolean {
	return Number.isInteger(value) && value > 0;
}

function hasTimelineEvidence({ node }: { node: StoryGraphNode }): boolean {
	return (
		node.timelineStart !== null &&
		node.timelineEnd !== null &&
		node.timelineEnd > node.timelineStart &&
		node.provenance.timelineElementIds.length > 0
	);
}

function derivedSceneNode({
	node,
	index,
}: {
	node: StoryGraphNode;
	index: number;
}): StoryGraphCanvasNode {
	if (
		!hasTimelineEvidence({ node }) ||
		node.timelineStart === null ||
		node.timelineEnd === null
	) {
		throw new StoryGraphCanvasInvariantError(
			"A derived scene node requires timeline provenance.",
		);
	}
	return {
		id: `canvas_scene:${node.id}`,
		type: "scene",
		label: node.label,
		position: {
			x: 80 + index * 272,
			y: 224,
		},
		timeline: {
			start: node.timelineStart,
			end: node.timelineEnd,
		},
		...(node.thumbnail === undefined
			? {}
			: { thumbnail: { ...node.thumbnail } }),
		provenance: {
			kind: "timeline-derived",
			storyNodeId: node.id,
			evidenceState: node.evidenceState,
			sceneIds: [...node.provenance.sceneIds],
			trackIds: [...node.provenance.trackIds],
			timelineElementIds: [...node.provenance.timelineElementIds],
			mediaIds: [...node.provenance.mediaIds],
			semanticAnalysisPerformed: false,
			notice: TIMELINE_PROVENANCE_NOTICE,
		},
	};
}

function sequenceEdge({
	source,
	target,
}: {
	source: StoryGraphCanvasNode;
	target: StoryGraphCanvasNode;
}): StoryGraphCanvasEdge {
	return {
		id: `canvas_edge:sequence:${source.id}:${target.id}`,
		sourceNodeId: source.id,
		targetNodeId: target.id,
		relation: "sequence",
		label: "Sequence",
		provenance: {
			kind: "timeline-order",
			semanticAnalysisPerformed: false,
			notice: TIMELINE_EDGE_NOTICE,
		},
	};
}

function nextDocument({
	document,
	nodes = document.nodes,
	edges = document.edges,
	viewport = document.viewport,
}: {
	document: StoryGraphCanvasDocument;
	nodes?: readonly StoryGraphCanvasNode[];
	edges?: readonly StoryGraphCanvasEdge[];
	viewport?: StoryGraphCanvasViewport;
}): StoryGraphCanvasDocument {
	const next: StoryGraphCanvasDocument = {
		...document,
		revision: document.revision + 1,
		viewport,
		nodes,
		edges,
	};
	assertStoryGraphCanvasInvariants({ document: next });
	return next;
}

function nodeById({
	document,
	nodeId,
}: {
	document: StoryGraphCanvasDocument;
	nodeId: string;
}): StoryGraphCanvasNode {
	const normalizedId = normalizeText({ value: nodeId, label: "Node id" });
	const node = document.nodes.find(
		(candidate) => candidate.id === normalizedId,
	);
	if (!node) {
		throw new StoryGraphCanvasInvariantError(
			`Unknown canvas node: ${normalizedId}.`,
		);
	}
	return node;
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

function normalizeViewport({
	viewport,
}: {
	viewport: StoryGraphCanvasViewport;
}): StoryGraphCanvasViewport {
	assertFinitePoint({ point: viewport, label: "Viewport" });
	if (!Number.isFinite(viewport.zoom) || viewport.zoom <= 0) {
		throw new StoryGraphCanvasInvariantError(
			"Viewport zoom must be a finite positive number.",
		);
	}
	return {
		x: viewport.x,
		y: viewport.y,
		zoom: clamp({
			value: viewport.zoom,
			min: STORY_GRAPH_CANVAS_MIN_ZOOM,
			max: STORY_GRAPH_CANVAS_MAX_ZOOM,
		}),
	};
}

function hasUniqueIds({
	values,
}: {
	values: readonly { readonly id: string }[];
}): boolean {
	return new Set(values.map((value) => value.id)).size === values.length;
}

function assertTimelineRange({
	range,
}: {
	range: StoryGraphCanvasTimelineRange;
}): void {
	if (
		!Number.isFinite(range.start) ||
		!Number.isFinite(range.end) ||
		range.start < 0 ||
		range.end <= range.start
	) {
		throw new StoryGraphCanvasInvariantError(
			"Canvas timeline ranges must be finite, non-negative, and positive.",
		);
	}
}

function assertNodeProvenance({ node }: { node: StoryGraphCanvasNode }): void {
	if (node.provenance.semanticAnalysisPerformed !== false) {
		throw new StoryGraphCanvasInvariantError(
			"Canvas nodes cannot claim unperformed semantic analysis.",
		);
	}
	if (node.provenance.kind === "timeline-derived") {
		if (
			node.type !== "scene" ||
			node.timeline === null ||
			node.provenance.timelineElementIds.length === 0 ||
			node.provenance.notice !== TIMELINE_PROVENANCE_NOTICE
		) {
			throw new StoryGraphCanvasInvariantError(
				"Timeline-derived nodes must be scenes with explicit timeline evidence.",
			);
		}
		normalizeText({
			value: node.provenance.storyNodeId,
			label: "Story node id",
		});
		assertTimelineRange({ range: node.timeline });
		return;
	}
	if (
		node.provenance.createdBy !== "user" ||
		node.timeline !== null ||
		node.provenance.notice !== DRAFT_PROVENANCE_NOTICE
	) {
		throw new StoryGraphCanvasInvariantError(
			"Draft nodes must be explicit user drafts without inferred timeline evidence.",
		);
	}
}

function assertEdgeProvenance({
	edge,
	nodesById,
}: {
	edge: StoryGraphCanvasEdge;
	nodesById: ReadonlyMap<string, StoryGraphCanvasNode>;
}): void {
	const source = nodesById.get(edge.sourceNodeId);
	const target = nodesById.get(edge.targetNodeId);
	if (!source || !target) {
		throw new StoryGraphCanvasInvariantError(
			"Canvas edges must reference existing nodes.",
		);
	}
	if (source.id === target.id) {
		throw new StoryGraphCanvasInvariantError(
			"Canvas edges cannot connect a node to itself.",
		);
	}
	if (edge.provenance.semanticAnalysisPerformed !== false) {
		throw new StoryGraphCanvasInvariantError(
			"Canvas edges cannot claim unperformed semantic analysis.",
		);
	}
	if (edge.provenance.kind === "timeline-order") {
		if (
			edge.relation !== "sequence" ||
			source.provenance.kind !== "timeline-derived" ||
			target.provenance.kind !== "timeline-derived" ||
			edge.provenance.notice !== TIMELINE_EDGE_NOTICE
		) {
			throw new StoryGraphCanvasInvariantError(
				"Timeline-order edges must connect timeline-derived scene nodes.",
			);
		}
		return;
	}
	if (
		edge.relation !== "related" ||
		edge.provenance.createdBy !== "user" ||
		edge.provenance.notice !== DRAFT_EDGE_NOTICE
	) {
		throw new StoryGraphCanvasInvariantError(
			"Manual relationships must be explicit user drafts.",
		);
	}
}

export function deriveStoryGraphCanvas({
	graph,
}: {
	graph: StoryGraph;
}): StoryGraphCanvasDocument {
	assertStoryGraphInvariants({ graph });
	const nodes = graph.nodes
		.filter((node) => hasTimelineEvidence({ node }))
		.map((node, index) => derivedSceneNode({ node, index }));
	const edges = nodes.slice(1).map((node, index) =>
		sequenceEdge({
			source: nodes[index],
			target: node,
		}),
	);
	const document: StoryGraphCanvasDocument = {
		kind: STORY_GRAPH_CANVAS_KIND,
		schemaVersion: STORY_GRAPH_CANVAS_SCHEMA_VERSION,
		canvasId: `${graph.graphId}:canvas:v${graph.version}`,
		projectId: graph.projectId,
		graphId: graph.graphId,
		graphVersion: graph.version,
		revision: 1,
		viewport: {
			x: 36,
			y: 36,
			zoom: 1,
		},
		nodes,
		edges,
		guarantees: CANVAS_GUARANTEES,
	};
	assertStoryGraphCanvasInvariants({ document });
	return document;
}

function assertCanvasBoundToStoryGraph({
	graph,
	document,
	allowThumbnailUrlRefresh,
}: {
	graph: StoryGraph;
	document: StoryGraphCanvasDocument;
	allowThumbnailUrlRefresh: boolean;
}): void {
	assertStoryGraphInvariants({ graph });
	assertStoryGraphCanvasInvariants({ document });
	if (
		document.projectId !== graph.projectId ||
		document.graphId !== graph.graphId ||
		document.graphVersion !== graph.version
	) {
		throw new StoryGraphCanvasInvariantError(
			"Canvas identity must match its exact Story Graph version.",
		);
	}

	const expected = deriveStoryGraphCanvas({ graph });
	const expectedNodes = new Map(
		expected.nodes.map((node) => [node.id, node] as const),
	);
	const actualTimelineNodes = document.nodes.filter(
		(node) => node.provenance.kind === "timeline-derived",
	);
	if (actualTimelineNodes.length !== expected.nodes.length) {
		throw new StoryGraphCanvasInvariantError(
			"Canvas must contain every timeline-derived node from its Story Graph.",
		);
	}
	for (const node of actualTimelineNodes) {
		const expectedNode = expectedNodes.get(node.id);
		if (
			expectedNode === undefined ||
			timelineNodeBindingSnapshot({
				node,
				includeThumbnailUrl: !allowThumbnailUrlRefresh,
			}) !==
				timelineNodeBindingSnapshot({
					node: expectedNode,
					includeThumbnailUrl: !allowThumbnailUrlRefresh,
				})
		) {
			throw new StoryGraphCanvasInvariantError(
				"Timeline-derived node provenance does not match the canonical Story Graph.",
			);
		}
	}

	const expectedEdges = new Map(
		expected.edges.map((edge) => [edge.id, edge] as const),
	);
	const actualTimelineEdges = document.edges.filter(
		(edge) => edge.provenance.kind === "timeline-order",
	);
	if (actualTimelineEdges.length !== expected.edges.length) {
		throw new StoryGraphCanvasInvariantError(
			"Canvas timeline-order edges must match the canonical Story Graph.",
		);
	}
	for (const edge of actualTimelineEdges) {
		const expectedEdge = expectedEdges.get(edge.id);
		if (
			expectedEdge === undefined ||
			timelineEdgeBindingSnapshot({ edge }) !==
				timelineEdgeBindingSnapshot({ edge: expectedEdge })
		) {
			throw new StoryGraphCanvasInvariantError(
				"Timeline-order edge provenance does not match the canonical Story Graph.",
			);
		}
	}

	const nodeIds = new Set(document.nodes.map((node) => node.id));
	for (const node of document.nodes) {
		if (node.provenance.kind !== "user-draft") continue;
		if (
			node.provenance.sourceNodeIds.some(
				(sourceNodeId) => !nodeIds.has(sourceNodeId),
			)
		) {
			throw new StoryGraphCanvasInvariantError(
				"Draft provenance can reference only nodes in the same aggregate.",
			);
		}
	}
}

export function reconcileStoryGraphCanvasDocument({
	graph,
	document,
}: {
	graph: StoryGraph;
	document: StoryGraphCanvasDocument;
}): StoryGraphCanvasDocument {
	assertCanvasBoundToStoryGraph({
		graph,
		document,
		allowThumbnailUrlRefresh: true,
	});
	const canonical = deriveStoryGraphCanvas({ graph });
	const canonicalNodes = new Map(
		canonical.nodes.map((node) => [node.id, node] as const),
	);
	const canonicalEdges = new Map(
		canonical.edges.map((edge) => [edge.id, edge] as const),
	);
	const reconciled: StoryGraphCanvasDocument = {
		...document,
		nodes: document.nodes.map((node) => {
			if (node.provenance.kind !== "timeline-derived") return node;
			const canonicalNode = canonicalNodes.get(node.id);
			if (canonicalNode === undefined) {
				throw new StoryGraphCanvasInvariantError(
					"Canonical timeline node disappeared during reconciliation.",
				);
			}
			return {
				...canonicalNode,
				position: { ...node.position },
			};
		}),
		edges: document.edges.map((edge) => {
			if (edge.provenance.kind !== "timeline-order") return edge;
			const canonicalEdge = canonicalEdges.get(edge.id);
			if (canonicalEdge === undefined) {
				throw new StoryGraphCanvasInvariantError(
					"Canonical timeline edge disappeared during reconciliation.",
				);
			}
			return canonicalEdge;
		}),
	};
	assertCanvasBoundToStoryGraph({
		graph,
		document: reconciled,
		allowThumbnailUrlRefresh: false,
	});
	return reconciled;
}

export function createStoryGraphCanvasAggregate({
	graph,
	canvas = deriveStoryGraphCanvas({ graph }),
}: {
	graph: StoryGraph;
	canvas?: StoryGraphCanvasDocument;
}): StoryGraphCanvasAggregate {
	const reconciledCanvas = reconcileStoryGraphCanvasDocument({
		graph,
		document: canvas,
	});
	const aggregate: StoryGraphCanvasAggregate = {
		kind: STORY_GRAPH_CANVAS_AGGREGATE_KIND,
		schemaVersion: STORY_GRAPH_CANVAS_AGGREGATE_SCHEMA_VERSION,
		aggregateId: aggregateIdFor({
			graphId: graph.graphId,
			graphVersion: graph.version,
		}),
		projectId: graph.projectId,
		graphId: graph.graphId,
		graphVersion: graph.version,
		revision: reconciledCanvas.revision,
		storyGraph: graph,
		canvas: reconciledCanvas,
		guarantees: AGGREGATE_GUARANTEES,
	};
	assertStoryGraphCanvasAggregateInvariants({ aggregate });
	return aggregate;
}

export function rebaseStoryGraphCanvasAggregate({
	aggregate,
	graph,
}: {
	aggregate: StoryGraphCanvasAggregate;
	graph: StoryGraph;
}): StoryGraphCanvasAggregate {
	assertStoryGraphCanvasAggregateInvariants({ aggregate });
	assertStoryGraphInvariants({ graph });
	if (
		aggregate.projectId !== graph.projectId ||
		aggregate.graphId !== graph.graphId ||
		aggregate.graphVersion !== graph.version ||
		storyGraphVersionSnapshot({ graph: aggregate.storyGraph }) !==
			storyGraphVersionSnapshot({ graph })
	) {
		throw new StoryGraphCanvasInvariantError(
			"Cannot rebase a Canvas aggregate onto a different Story Graph snapshot.",
		);
	}
	return createStoryGraphCanvasAggregate({
		graph,
		canvas: aggregate.canvas,
	});
}

export function createStoryGraphCanvasDraftNode({
	document,
	type,
	label,
	position,
	sourceNodeIds = [],
}: {
	document: StoryGraphCanvasDocument;
	type: StoryGraphCanvasNodeType;
	label: string;
	position: StoryGraphCanvasPoint;
	sourceNodeIds?: readonly string[];
}): StoryGraphCanvasDocument {
	assertStoryGraphCanvasInvariants({ document });
	if (!NODE_TYPES.includes(type)) {
		throw new StoryGraphCanvasInvariantError(`Unknown node type: ${type}.`);
	}
	const normalizedLabel = normalizeText({ value: label, label: "Node label" });
	assertFinitePoint({ point: position, label: "Node position" });
	for (const sourceNodeId of sourceNodeIds) {
		nodeById({ document, nodeId: sourceNodeId });
	}
	const ordinal =
		document.nodes.filter((node) => node.provenance.kind === "user-draft")
			.length + 1;
	const node: StoryGraphCanvasNode = {
		id: `canvas_draft:${type}:${document.revision + 1}:${ordinal}`,
		type,
		label: normalizedLabel,
		position: { ...position },
		timeline: null,
		provenance: {
			kind: "user-draft",
			createdBy: "user",
			sourceNodeIds: [...new Set(sourceNodeIds)],
			semanticAnalysisPerformed: false,
			notice: DRAFT_PROVENANCE_NOTICE,
		},
	};
	return nextDocument({
		document,
		nodes: [...document.nodes, node],
	});
}

export function moveStoryGraphCanvasNode({
	document,
	nodeId,
	position,
}: {
	document: StoryGraphCanvasDocument;
	nodeId: string;
	position: StoryGraphCanvasPoint;
}): StoryGraphCanvasDocument {
	assertStoryGraphCanvasInvariants({ document });
	const target = nodeById({ document, nodeId });
	assertFinitePoint({ point: position, label: "Node position" });
	return nextDocument({
		document,
		nodes: document.nodes.map((node) =>
			node.id === target.id ? { ...node, position: { ...position } } : node,
		),
	});
}

export function renameStoryGraphCanvasDraftNode({
	document,
	nodeId,
	label,
}: {
	document: StoryGraphCanvasDocument;
	nodeId: string;
	label: string;
}): StoryGraphCanvasDocument {
	assertStoryGraphCanvasInvariants({ document });
	const target = nodeById({ document, nodeId });
	if (target.provenance.kind !== "user-draft") {
		throw new StoryGraphCanvasInvariantError(
			"Timeline-derived scene labels remain owned by the Story Graph.",
		);
	}
	const normalizedLabel = normalizeText({ value: label, label: "Node label" });
	return nextDocument({
		document,
		nodes: document.nodes.map((node) =>
			node.id === target.id ? { ...node, label: normalizedLabel } : node,
		),
	});
}

export function deleteStoryGraphCanvasDraftNode({
	document,
	nodeId,
}: {
	document: StoryGraphCanvasDocument;
	nodeId: string;
}): StoryGraphCanvasDocument {
	assertStoryGraphCanvasInvariants({ document });
	const target = nodeById({ document, nodeId });
	if (target.provenance.kind !== "user-draft") {
		throw new StoryGraphCanvasInvariantError(
			"Timeline-derived scene nodes cannot be deleted from the canvas.",
		);
	}
	return nextDocument({
		document,
		nodes: document.nodes
			.filter((node) => node.id !== target.id)
			.map((node) =>
				node.provenance.kind === "user-draft" &&
				node.provenance.sourceNodeIds.includes(target.id)
					? {
							...node,
							provenance: {
								...node.provenance,
								sourceNodeIds: node.provenance.sourceNodeIds.filter(
									(sourceNodeId) => sourceNodeId !== target.id,
								),
							},
						}
					: node,
			),
		edges: document.edges.filter(
			(edge) =>
				edge.sourceNodeId !== target.id && edge.targetNodeId !== target.id,
		),
	});
}

export function connectStoryGraphCanvasNodes({
	document,
	sourceNodeId,
	targetNodeId,
	label = "Related",
}: {
	document: StoryGraphCanvasDocument;
	sourceNodeId: string;
	targetNodeId: string;
	label?: string;
}): StoryGraphCanvasDocument {
	assertStoryGraphCanvasInvariants({ document });
	const source = nodeById({ document, nodeId: sourceNodeId });
	const target = nodeById({ document, nodeId: targetNodeId });
	if (source.id === target.id) {
		throw new StoryGraphCanvasInvariantError(
			"A draft relationship requires two different nodes.",
		);
	}
	if (
		document.edges.some(
			(edge) =>
				edge.sourceNodeId === source.id && edge.targetNodeId === target.id,
		)
	) {
		throw new StoryGraphCanvasInvariantError(
			"That directed relationship already exists.",
		);
	}
	const edge: StoryGraphCanvasEdge = {
		id: `canvas_edge:related:${source.id}:${target.id}:${document.revision + 1}`,
		sourceNodeId: source.id,
		targetNodeId: target.id,
		relation: "related",
		label: normalizeText({ value: label, label: "Relationship label" }),
		provenance: {
			kind: "user-draft",
			createdBy: "user",
			semanticAnalysisPerformed: false,
			notice: DRAFT_EDGE_NOTICE,
		},
	};
	return nextDocument({
		document,
		edges: [...document.edges, edge],
	});
}

export function setStoryGraphCanvasViewport({
	document,
	viewport,
}: {
	document: StoryGraphCanvasDocument;
	viewport: StoryGraphCanvasViewport;
}): StoryGraphCanvasDocument {
	assertStoryGraphCanvasInvariants({ document });
	return nextDocument({
		document,
		viewport: normalizeViewport({ viewport }),
	});
}

export function getStoryGraphCanvasNodeSize({
	type,
}: {
	type: StoryGraphCanvasNodeType;
}): StoryGraphCanvasNodeSize {
	switch (type) {
		case "scene":
			return { width: 216, height: 96 };
		case "character":
		case "emotion":
		case "audio":
			return { width: 184, height: 80 };
	}
}

function nodeCenter({
	node,
}: {
	node: StoryGraphCanvasNode;
}): StoryGraphCanvasPoint {
	const size = getStoryGraphCanvasNodeSize({ type: node.type });
	return {
		x: node.position.x + size.width / 2,
		y: node.position.y + size.height / 2,
	};
}

function rectangleBoundaryPoint({
	node,
	toward,
}: {
	node: StoryGraphCanvasNode;
	toward: StoryGraphCanvasPoint;
}): StoryGraphCanvasPoint {
	const center = nodeCenter({ node });
	const size = getStoryGraphCanvasNodeSize({ type: node.type });
	const deltaX = toward.x - center.x;
	const deltaY = toward.y - center.y;
	if (deltaX === 0 && deltaY === 0) return center;
	const scale =
		1 /
		Math.max(
			Math.abs(deltaX) / (size.width / 2),
			Math.abs(deltaY) / (size.height / 2),
		);
	return {
		x: center.x + deltaX * scale,
		y: center.y + deltaY * scale,
	};
}

function roundedCoordinate(value: number): number {
	return Math.round(value * 100) / 100;
}

export function getStoryGraphCanvasEdgeGeometry({
	edge,
	nodes,
}: {
	edge: StoryGraphCanvasEdge;
	nodes: readonly StoryGraphCanvasNode[];
}): StoryGraphCanvasEdgeGeometry {
	const source = nodes.find((node) => node.id === edge.sourceNodeId);
	const target = nodes.find((node) => node.id === edge.targetNodeId);
	if (!source || !target) {
		throw new StoryGraphCanvasInvariantError(
			"Cannot calculate geometry for an edge with missing nodes.",
		);
	}
	const sourceCenter = nodeCenter({ node: source });
	const targetCenter = nodeCenter({ node: target });
	const start = rectangleBoundaryPoint({ node: source, toward: targetCenter });
	const end = rectangleBoundaryPoint({ node: target, toward: sourceCenter });
	const midpoint = {
		x: (start.x + end.x) / 2,
		y: (start.y + end.y) / 2,
	};
	const distance = Math.hypot(end.x - start.x, end.y - start.y);
	const bend = Math.min(36, Math.max(12, distance * 0.08));
	const control = {
		x: midpoint.x,
		y: midpoint.y - bend,
	};
	const roundedStart = {
		x: roundedCoordinate(start.x),
		y: roundedCoordinate(start.y),
	};
	const roundedControl = {
		x: roundedCoordinate(control.x),
		y: roundedCoordinate(control.y),
	};
	const roundedEnd = {
		x: roundedCoordinate(end.x),
		y: roundedCoordinate(end.y),
	};
	return {
		start: roundedStart,
		control: roundedControl,
		end: roundedEnd,
		label: {
			x: roundedControl.x,
			y: roundedControl.y - 8,
		},
		path: `M ${roundedStart.x} ${roundedStart.y} Q ${roundedControl.x} ${roundedControl.y} ${roundedEnd.x} ${roundedEnd.y}`,
	};
}

export function fitStoryGraphCanvasViewport({
	document,
	width,
	height,
	padding = 56,
	minZoom = STORY_GRAPH_CANVAS_MIN_ZOOM,
}: {
	document: StoryGraphCanvasDocument;
	width: number;
	height: number;
	padding?: number;
	minZoom?: number;
}): StoryGraphCanvasDocument {
	assertStoryGraphCanvasInvariants({ document });
	if (
		!Number.isFinite(width) ||
		!Number.isFinite(height) ||
		!Number.isFinite(padding) ||
		!Number.isFinite(minZoom) ||
		width <= 0 ||
		height <= 0 ||
		padding < 0
	) {
		throw new StoryGraphCanvasInvariantError(
			"Fit dimensions and padding must be finite and valid.",
		);
	}
	const resolvedMinZoom = clamp({
		value: minZoom,
		min: STORY_GRAPH_CANVAS_MIN_ZOOM,
		max: STORY_GRAPH_CANVAS_MAX_ZOOM,
	});
	if (document.nodes.length === 0) {
		return setStoryGraphCanvasViewport({
			document,
			viewport: { x: padding, y: padding, zoom: 1 },
		});
	}
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const node of document.nodes) {
		const size = getStoryGraphCanvasNodeSize({ type: node.type });
		minX = Math.min(minX, node.position.x);
		minY = Math.min(minY, node.position.y);
		maxX = Math.max(maxX, node.position.x + size.width);
		maxY = Math.max(maxY, node.position.y + size.height);
	}
	const contentWidth = Math.max(1, maxX - minX);
	const contentHeight = Math.max(1, maxY - minY);
	const zoom = clamp({
		value: Math.min(
			Math.max(1, width - padding * 2) / contentWidth,
			Math.max(1, height - padding * 2) / contentHeight,
		),
		min: resolvedMinZoom,
		max: STORY_GRAPH_CANVAS_MAX_ZOOM,
	});
	const scaledContentWidth = contentWidth * zoom;
	const scaledContentHeight = contentHeight * zoom;
	const x =
		scaledContentWidth + padding * 2 <= width
			? (width - scaledContentWidth) / 2 - minX * zoom
			: padding - minX * zoom;
	const y =
		scaledContentHeight + padding * 2 <= height
			? (height - scaledContentHeight) / 2 - minY * zoom
			: padding - minY * zoom;
	return setStoryGraphCanvasViewport({
		document,
		viewport: {
			x,
			y,
			zoom,
		},
	});
}

export function assertStoryGraphCanvasInvariants({
	document,
}: {
	document: StoryGraphCanvasDocument;
}): void {
	if (
		document.kind !== STORY_GRAPH_CANVAS_KIND ||
		document.schemaVersion !== STORY_GRAPH_CANVAS_SCHEMA_VERSION
	) {
		throw new StoryGraphCanvasInvariantError(
			"Unsupported Story Graph canvas schema.",
		);
	}
	normalizeText({ value: document.canvasId, label: "Canvas id" });
	normalizeText({ value: document.projectId, label: "Project id" });
	normalizeText({ value: document.graphId, label: "Graph id" });
	if (!isPositiveInteger(document.graphVersion)) {
		throw new StoryGraphCanvasInvariantError(
			"Graph version must be a positive integer.",
		);
	}
	if (!isPositiveInteger(document.revision)) {
		throw new StoryGraphCanvasInvariantError(
			"Canvas revision must be a positive integer.",
		);
	}
	if (
		document.canvasId !== `${document.graphId}:canvas:v${document.graphVersion}`
	) {
		throw new StoryGraphCanvasInvariantError(
			"Canvas id must match the exact Story Graph version.",
		);
	}
	normalizeViewport({ viewport: document.viewport });
	if (
		document.guarantees.localOnly !== true ||
		document.guarantees.semanticInferencePerformed !== false ||
		document.guarantees.derivedSceneNodesRequireTimelineEvidence !== true ||
		document.guarantees.semanticNodesRequireUserDraftProvenance !== true
	) {
		throw new StoryGraphCanvasInvariantError(
			"Canvas evidence guarantees are missing.",
		);
	}
	if (!hasUniqueIds({ values: document.nodes })) {
		throw new StoryGraphCanvasInvariantError("Canvas node ids must be unique.");
	}
	for (const node of document.nodes) {
		normalizeText({ value: node.id, label: "Node id" });
		normalizeText({ value: node.label, label: "Node label" });
		if (!NODE_TYPES.includes(node.type)) {
			throw new StoryGraphCanvasInvariantError(
				`Unsupported canvas node type: ${node.type}.`,
			);
		}
		assertFinitePoint({ point: node.position, label: "Node position" });
		if (node.timeline !== null) assertTimelineRange({ range: node.timeline });
		assertNodeProvenance({ node });
	}
	if (!hasUniqueIds({ values: document.edges })) {
		throw new StoryGraphCanvasInvariantError("Canvas edge ids must be unique.");
	}
	const nodesById = new Map(document.nodes.map((node) => [node.id, node]));
	const edgePairs = new Set<string>();
	for (const edge of document.edges) {
		normalizeText({ value: edge.id, label: "Edge id" });
		normalizeText({ value: edge.label, label: "Edge label" });
		const pair = `${edge.sourceNodeId}\u001f${edge.targetNodeId}`;
		if (edgePairs.has(pair)) {
			throw new StoryGraphCanvasInvariantError(
				"Canvas cannot contain duplicate directed relationships.",
			);
		}
		edgePairs.add(pair);
		assertEdgeProvenance({ edge, nodesById });
	}
}

export function assertStoryGraphCanvasAggregateInvariants({
	aggregate,
}: {
	aggregate: StoryGraphCanvasAggregate;
}): void {
	if (
		aggregate.kind !== STORY_GRAPH_CANVAS_AGGREGATE_KIND ||
		aggregate.schemaVersion !== STORY_GRAPH_CANVAS_AGGREGATE_SCHEMA_VERSION
	) {
		throw new StoryGraphCanvasInvariantError(
			"Unsupported Story Graph Canvas aggregate schema.",
		);
	}
	assertStoryGraphInvariants({ graph: aggregate.storyGraph });
	assertStoryGraphCanvasInvariants({ document: aggregate.canvas });
	if (
		aggregate.projectId !== aggregate.storyGraph.projectId ||
		aggregate.projectId !== aggregate.canvas.projectId ||
		aggregate.graphId !== aggregate.storyGraph.graphId ||
		aggregate.graphId !== aggregate.canvas.graphId ||
		aggregate.graphVersion !== aggregate.storyGraph.version ||
		aggregate.graphVersion !== aggregate.canvas.graphVersion
	) {
		throw new StoryGraphCanvasInvariantError(
			"Aggregate, Story Graph, and Canvas identities must match.",
		);
	}
	if (
		aggregate.aggregateId !==
		aggregateIdFor({
			graphId: aggregate.graphId,
			graphVersion: aggregate.graphVersion,
		})
	) {
		throw new StoryGraphCanvasInvariantError(
			"Canvas aggregate id must match the exact Story Graph version.",
		);
	}
	if (aggregate.revision !== aggregate.canvas.revision) {
		throw new StoryGraphCanvasInvariantError(
			"Aggregate revision must equal its Canvas subdocument revision.",
		);
	}
	if (
		aggregate.guarantees.canvasIsVersionedSubdocument !== true ||
		aggregate.guarantees.timelineProvenanceVerified !== true ||
		aggregate.guarantees.semanticInferencePerformed !== false
	) {
		throw new StoryGraphCanvasInvariantError(
			"Canvas aggregate guarantees are missing.",
		);
	}
	assertCanvasBoundToStoryGraph({
		graph: aggregate.storyGraph,
		document: aggregate.canvas,
		allowThumbnailUrlRefresh: false,
	});
}
