export const STORY_GRAPH_SCHEMA_VERSION = 1;

export type StoryGraphEvidenceState =
	| "timeline-and-media"
	| "timeline-only"
	| "media-only"
	| "manual"
	| "merged";

export type StoryGraphMediaType = "video" | "image" | "audio";

export interface StoryGraphMediaSnapshot {
	readonly id: string;
	readonly name: string;
	readonly type: StoryGraphMediaType;
	readonly duration?: number;
	readonly width?: number;
	readonly height?: number;
	readonly thumbnailUrl?: string;
}

export interface StoryGraphTimelineElementSnapshot {
	readonly id: string;
	readonly name: string;
	readonly type: string;
	readonly mediaId?: string;
	readonly startTime: number;
	readonly duration: number;
}

export interface StoryGraphTimelineTrackSnapshot {
	readonly id: string;
	readonly name?: string;
	readonly type: string;
	readonly elements: readonly StoryGraphTimelineElementSnapshot[];
}

export interface StoryGraphSceneTracksSnapshot {
	readonly main: StoryGraphTimelineTrackSnapshot;
	readonly overlay: readonly StoryGraphTimelineTrackSnapshot[];
	readonly audio?: readonly StoryGraphTimelineTrackSnapshot[];
}

export interface StoryGraphSceneSnapshot {
	readonly id: string;
	readonly name: string;
	readonly isMain?: boolean;
	readonly tracks: StoryGraphSceneTracksSnapshot;
}

export interface StoryGraphProjectSnapshot {
	readonly projectId: string;
	readonly media: readonly StoryGraphMediaSnapshot[];
	readonly scenes: readonly StoryGraphSceneSnapshot[];
}

export interface StoryGraphThumbnailMetadata {
	readonly url: string;
	readonly sourceAssetId: string;
	readonly width?: number;
	readonly height?: number;
}

export interface StoryGraphNodeProvenance {
	readonly sceneIds: readonly string[];
	readonly trackIds: readonly string[];
	readonly timelineElementIds: readonly string[];
	readonly mediaIds: readonly string[];
	readonly sourceNodeIds: readonly string[];
}

export interface StoryGraphNode {
	readonly id: string;
	readonly assetId?: string;
	readonly mediaId?: string;
	readonly timelineStart: number | null;
	readonly timelineEnd: number | null;
	readonly label: string;
	readonly evidenceState: StoryGraphEvidenceState;
	readonly thumbnail?: StoryGraphThumbnailMetadata;
	readonly provenance: StoryGraphNodeProvenance;
}

export interface StoryGraph {
	readonly kind: "visioncut.story-graph";
	readonly schemaVersion: typeof STORY_GRAPH_SCHEMA_VERSION;
	readonly graphId: string;
	readonly projectId: string;
	readonly version: number;
	readonly derivation: {
		readonly deterministic: true;
		readonly contentAnalysisPerformed: false;
		readonly notice: string;
	};
	readonly requirements: {
		readonly network: false;
		readonly paidService: false;
		readonly apiKey: false;
	};
	readonly nodes: readonly StoryGraphNode[];
}

export interface CreateStoryGraphNodeInput {
	readonly label: string;
	readonly assetId?: string;
	readonly mediaId?: string;
	readonly timelineStart?: number | null;
	readonly timelineEnd?: number | null;
	readonly thumbnail?: StoryGraphThumbnailMetadata;
}

export class StoryGraphInvariantError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "StoryGraphInvariantError";
	}
}

interface TimelineCandidate {
	readonly sceneId: string;
	readonly sceneIndex: number;
	readonly trackId: string;
	readonly trackIndex: number;
	readonly element: StoryGraphTimelineElementSnapshot;
}

const EVIDENCE_STATES: readonly StoryGraphEvidenceState[] = [
	"timeline-and-media",
	"timeline-only",
	"media-only",
	"manual",
	"merged",
];

function normalizeRequiredText({
	value,
	label,
}: {
	value: string;
	label: string;
}): string {
	const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
	if (!normalized) {
		throw new StoryGraphInvariantError(`${label} cannot be empty.`);
	}
	return normalized;
}

function normalizeOptionalText({
	value,
	label,
}: {
	value: string | undefined;
	label: string;
}): string | undefined {
	if (value === undefined) return undefined;
	return normalizeRequiredText({ value, label });
}

function hashWithSeed({
	value,
	seed,
}: {
	value: string;
	seed: number;
}): string {
	let hash = seed >>> 0;
	for (const character of value) {
		hash ^= character.codePointAt(0) ?? 0;
		hash = Math.imul(hash, 16_777_619);
	}
	return (hash >>> 0).toString(36).padStart(7, "0");
}

function stableDigest({ value }: { value: string }): string {
	return `${hashWithSeed({ value, seed: 2_166_136_261 })}${hashWithSeed({
		value,
		seed: 3_332_816_977,
	})}`;
}

function deterministicId({
	prefix,
	parts,
}: {
	prefix: string;
	parts: readonly string[];
}): string {
	return `${prefix}_${stableDigest({ value: parts.join("\u001f") })}`;
}

function graphIdFor({ projectId }: { projectId: string }): string {
	return deterministicId({
		prefix: "story_graph",
		parts: [String(STORY_GRAPH_SCHEMA_VERSION), projectId],
	});
}

function isFiniteNonNegative(value: number): boolean {
	return Number.isFinite(value) && value >= 0;
}

function isFinitePositive(value: number): boolean {
	return Number.isFinite(value) && value > 0;
}

function normalizeTimelineRange({
	start,
	end,
}: {
	start: number | null | undefined;
	end: number | null | undefined;
}): { start: number | null; end: number | null } {
	const normalizedStart = start ?? null;
	const normalizedEnd = end ?? null;
	if (normalizedStart === null && normalizedEnd === null) {
		return { start: null, end: null };
	}
	if (normalizedStart === null || normalizedEnd === null) {
		throw new StoryGraphInvariantError(
			"Timeline start and end must either both exist or both be null.",
		);
	}
	if (
		!isFiniteNonNegative(normalizedStart) ||
		!isFinitePositive(normalizedEnd) ||
		normalizedEnd <= normalizedStart
	) {
		throw new StoryGraphInvariantError(
			"Timeline ranges must be finite, non-negative, and have positive duration.",
		);
	}
	return { start: normalizedStart, end: normalizedEnd };
}

function normalizeThumbnail({
	thumbnail,
}: {
	thumbnail: StoryGraphThumbnailMetadata | undefined;
}): StoryGraphThumbnailMetadata | undefined {
	if (!thumbnail) return undefined;
	const normalized: StoryGraphThumbnailMetadata = {
		url: normalizeRequiredText({
			value: thumbnail.url,
			label: "Thumbnail URL",
		}),
		sourceAssetId: normalizeRequiredText({
			value: thumbnail.sourceAssetId,
			label: "Thumbnail source asset id",
		}),
		...(thumbnail.width === undefined ? {} : { width: thumbnail.width }),
		...(thumbnail.height === undefined ? {} : { height: thumbnail.height }),
	};
	if (
		(normalized.width !== undefined && !isFinitePositive(normalized.width)) ||
		(normalized.height !== undefined && !isFinitePositive(normalized.height))
	) {
		throw new StoryGraphInvariantError(
			"Thumbnail dimensions must be finite positive numbers.",
		);
	}
	return normalized;
}

function thumbnailFromMedia({
	media,
}: {
	media: StoryGraphMediaSnapshot | undefined;
}): StoryGraphThumbnailMetadata | undefined {
	if (!media?.thumbnailUrl) return undefined;
	return normalizeThumbnail({
		thumbnail: {
			url: media.thumbnailUrl,
			sourceAssetId: media.id,
			...(media.width === undefined ? {} : { width: media.width }),
			...(media.height === undefined ? {} : { height: media.height }),
		},
	});
}

function labelFromEvidence({
	element,
	media,
}: {
	element: StoryGraphTimelineElementSnapshot | undefined;
	media: StoryGraphMediaSnapshot | undefined;
}): string {
	const elementLabel = element?.name
		.normalize("NFKC")
		.trim()
		.replace(/\s+/gu, " ");
	if (elementLabel) return elementLabel;
	const mediaLabel = media?.name.normalize("NFKC").trim().replace(/\s+/gu, " ");
	if (mediaLabel) return mediaLabel;
	const evidenceId = element?.id ?? media?.id;
	if (!evidenceId) {
		throw new StoryGraphInvariantError(
			"A node label requires source evidence.",
		);
	}
	return `Untitled clip ${evidenceId}`;
}

function uniqueValues({ values }: { values: readonly string[] }): string[] {
	return [...new Set(values)];
}

function visualTracks({
	scene,
}: {
	scene: StoryGraphSceneSnapshot;
}): readonly StoryGraphTimelineTrackSnapshot[] {
	return [scene.tracks.main, ...scene.tracks.overlay];
}

function collectTimelineCandidates({
	scenes,
}: {
	scenes: readonly StoryGraphSceneSnapshot[];
}): TimelineCandidate[] {
	const candidates: TimelineCandidate[] = [];
	for (const [sceneIndex, scene] of scenes.entries()) {
		for (const [trackIndex, track] of visualTracks({ scene }).entries()) {
			for (const element of track.elements) {
				if (element.type !== "video" && element.type !== "image") continue;
				normalizeRequiredText({
					value: element.id,
					label: "Timeline element id",
				});
				normalizeTimelineRange({
					start: element.startTime,
					end: element.startTime + element.duration,
				});
				candidates.push({
					sceneId: normalizeRequiredText({
						value: scene.id,
						label: "Scene id",
					}),
					sceneIndex,
					trackId: normalizeRequiredText({
						value: track.id,
						label: "Track id",
					}),
					trackIndex,
					element,
				});
			}
		}
	}
	return candidates.sort((left, right) => {
		if (left.sceneIndex !== right.sceneIndex) {
			return left.sceneIndex - right.sceneIndex;
		}
		if (left.element.startTime !== right.element.startTime) {
			return left.element.startTime - right.element.startTime;
		}
		if (left.trackIndex !== right.trackIndex) {
			return left.trackIndex - right.trackIndex;
		}
		return left.element.id.localeCompare(right.element.id);
	});
}

function mediaLookup({
	media,
}: {
	media: readonly StoryGraphMediaSnapshot[];
}): ReadonlyMap<string, StoryGraphMediaSnapshot> {
	const lookup = new Map<string, StoryGraphMediaSnapshot>();
	for (const asset of media) {
		const assetId = normalizeRequiredText({
			value: asset.id,
			label: "Media id",
		});
		if (lookup.has(assetId)) {
			throw new StoryGraphInvariantError(`Duplicate media id: ${assetId}`);
		}
		lookup.set(assetId, asset);
	}
	return lookup;
}

function timelineNode({
	projectId,
	candidate,
	media,
}: {
	projectId: string;
	candidate: TimelineCandidate;
	media: StoryGraphMediaSnapshot | undefined;
}): StoryGraphNode {
	const mediaId = normalizeOptionalText({
		value: candidate.element.mediaId,
		label: "Timeline media id",
	});
	const range = normalizeTimelineRange({
		start: candidate.element.startTime,
		end: candidate.element.startTime + candidate.element.duration,
	});
	return {
		id: deterministicId({
			prefix: "story_node",
			parts: [
				projectId,
				candidate.sceneId,
				candidate.trackId,
				candidate.element.id,
			],
		}),
		...(media === undefined ? {} : { assetId: media.id }),
		...(mediaId === undefined ? {} : { mediaId }),
		timelineStart: range.start,
		timelineEnd: range.end,
		label: labelFromEvidence({ element: candidate.element, media }),
		evidenceState: media === undefined ? "timeline-only" : "timeline-and-media",
		...(thumbnailFromMedia({ media }) === undefined
			? {}
			: { thumbnail: thumbnailFromMedia({ media }) }),
		provenance: {
			sceneIds: [candidate.sceneId],
			trackIds: [candidate.trackId],
			timelineElementIds: [candidate.element.id],
			mediaIds: mediaId === undefined ? [] : [mediaId],
			sourceNodeIds: [],
		},
	};
}

function mediaOnlyNode({
	projectId,
	media,
}: {
	projectId: string;
	media: StoryGraphMediaSnapshot;
}): StoryGraphNode {
	return {
		id: deterministicId({
			prefix: "story_node",
			parts: [projectId, "media-only", media.id],
		}),
		assetId: media.id,
		timelineStart: null,
		timelineEnd: null,
		label: labelFromEvidence({ element: undefined, media }),
		evidenceState: "media-only",
		...(thumbnailFromMedia({ media }) === undefined
			? {}
			: { thumbnail: thumbnailFromMedia({ media }) }),
		provenance: {
			sceneIds: [],
			trackIds: [],
			timelineElementIds: [],
			mediaIds: [media.id],
			sourceNodeIds: [],
		},
	};
}

export function deriveStoryGraph({
	projectId,
	media,
	scenes,
}: StoryGraphProjectSnapshot): StoryGraph {
	const normalizedProjectId = normalizeRequiredText({
		value: projectId,
		label: "Project id",
	});
	const mediaById = mediaLookup({ media });
	const candidates = collectTimelineCandidates({ scenes });
	const nodes =
		candidates.length > 0
			? candidates.map((candidate) =>
					timelineNode({
						projectId: normalizedProjectId,
						candidate,
						media:
							candidate.element.mediaId === undefined
								? undefined
								: mediaById.get(candidate.element.mediaId),
					}),
				)
			: [...mediaById.values()]
					.filter((asset) => asset.type === "video" || asset.type === "image")
					.sort((left, right) => left.id.localeCompare(right.id))
					.map((asset) =>
						mediaOnlyNode({ projectId: normalizedProjectId, media: asset }),
					);
	const graph: StoryGraph = {
		kind: "visioncut.story-graph",
		schemaVersion: STORY_GRAPH_SCHEMA_VERSION,
		graphId: graphIdFor({ projectId: normalizedProjectId }),
		projectId: normalizedProjectId,
		version: 1,
		derivation: {
			deterministic: true,
			contentAnalysisPerformed: false,
			notice:
				"Nodes use only project media and timeline evidence. No inferred content analysis has been produced.",
		},
		requirements: {
			network: false,
			paidService: false,
			apiKey: false,
		},
		nodes,
	};
	assertStoryGraphInvariants({ graph });
	return graph;
}

function nextGraph({
	graph,
	nodes,
}: {
	graph: StoryGraph;
	nodes: readonly StoryGraphNode[];
}): StoryGraph {
	const next: StoryGraph = {
		...graph,
		version: graph.version + 1,
		nodes,
	};
	assertStoryGraphInvariants({ graph: next });
	return next;
}

function operationNodeId({
	graph,
	operation,
	parts,
}: {
	graph: StoryGraph;
	operation: string;
	parts: readonly string[];
}): string {
	return deterministicId({
		prefix: "story_node",
		parts: [graph.graphId, operation, String(graph.version + 1), ...parts],
	});
}

function insertionIndex({
	index,
	length,
}: {
	index: number | undefined;
	length: number;
}): number {
	const resolved = index ?? length;
	if (!Number.isInteger(resolved) || resolved < 0 || resolved > length) {
		throw new StoryGraphInvariantError(
			`Insertion index ${resolved} is outside 0..${length}.`,
		);
	}
	return resolved;
}

function insertNode({
	nodes,
	node,
	index,
}: {
	nodes: readonly StoryGraphNode[];
	node: StoryGraphNode;
	index: number;
}): StoryGraphNode[] {
	return [...nodes.slice(0, index), node, ...nodes.slice(index)];
}

export function createStoryGraphNode({
	graph,
	node,
	index,
}: {
	graph: StoryGraph;
	node: CreateStoryGraphNodeInput;
	index?: number;
}): StoryGraph {
	assertStoryGraphInvariants({ graph });
	const label = normalizeRequiredText({
		value: node.label,
		label: "Node label",
	});
	const assetId = normalizeOptionalText({
		value: node.assetId,
		label: "Asset id",
	});
	const mediaId = normalizeOptionalText({
		value: node.mediaId,
		label: "Media id",
	});
	const range = normalizeTimelineRange({
		start: node.timelineStart,
		end: node.timelineEnd,
	});
	const thumbnail = normalizeThumbnail({ thumbnail: node.thumbnail });
	const created: StoryGraphNode = {
		id: operationNodeId({
			graph,
			operation: "create",
			parts: [
				label,
				assetId ?? "",
				mediaId ?? "",
				String(range.start),
				String(range.end),
				String(graph.nodes.length),
			],
		}),
		...(assetId === undefined ? {} : { assetId }),
		...(mediaId === undefined ? {} : { mediaId }),
		timelineStart: range.start,
		timelineEnd: range.end,
		label,
		evidenceState: "manual",
		...(thumbnail === undefined ? {} : { thumbnail }),
		provenance: {
			sceneIds: [],
			trackIds: [],
			timelineElementIds: [],
			mediaIds: mediaId === undefined ? [] : [mediaId],
			sourceNodeIds: [],
		},
	};
	const resolvedIndex = insertionIndex({ index, length: graph.nodes.length });
	return nextGraph({
		graph,
		nodes: insertNode({
			nodes: graph.nodes,
			node: created,
			index: resolvedIndex,
		}),
	});
}

function nodeIndex({
	graph,
	nodeId,
}: {
	graph: StoryGraph;
	nodeId: string;
}): number {
	const normalizedId = normalizeRequiredText({
		value: nodeId,
		label: "Node id",
	});
	const index = graph.nodes.findIndex((node) => node.id === normalizedId);
	if (index < 0) {
		throw new StoryGraphInvariantError(`Unknown story node: ${normalizedId}`);
	}
	return index;
}

export function deleteStoryGraphNode({
	graph,
	nodeId,
}: {
	graph: StoryGraph;
	nodeId: string;
}): StoryGraph {
	assertStoryGraphInvariants({ graph });
	const index = nodeIndex({ graph, nodeId });
	return nextGraph({
		graph,
		nodes: [...graph.nodes.slice(0, index), ...graph.nodes.slice(index + 1)],
	});
}

export function reorderStoryGraphNode({
	graph,
	nodeId,
	toIndex,
}: {
	graph: StoryGraph;
	nodeId: string;
	toIndex: number;
}): StoryGraph {
	assertStoryGraphInvariants({ graph });
	const fromIndex = nodeIndex({ graph, nodeId });
	if (
		!Number.isInteger(toIndex) ||
		toIndex < 0 ||
		toIndex >= graph.nodes.length
	) {
		throw new StoryGraphInvariantError(
			`Reorder index ${toIndex} is outside the graph.`,
		);
	}
	if (fromIndex === toIndex) return graph;
	const remaining = [
		...graph.nodes.slice(0, fromIndex),
		...graph.nodes.slice(fromIndex + 1),
	];
	return nextGraph({
		graph,
		nodes: insertNode({
			nodes: remaining,
			node: graph.nodes[fromIndex],
			index: toIndex,
		}),
	});
}

export function duplicateStoryGraphNode({
	graph,
	nodeId,
	toIndex,
}: {
	graph: StoryGraph;
	nodeId: string;
	toIndex?: number;
}): StoryGraph {
	assertStoryGraphInvariants({ graph });
	const sourceIndex = nodeIndex({ graph, nodeId });
	const source = graph.nodes[sourceIndex];
	const duplicate: StoryGraphNode = {
		...source,
		id: operationNodeId({
			graph,
			operation: "duplicate",
			parts: [source.id, String(toIndex ?? sourceIndex + 1)],
		}),
		evidenceState: "manual",
		...(source.thumbnail === undefined
			? { thumbnail: undefined }
			: { thumbnail: { ...source.thumbnail } }),
		provenance: {
			sceneIds: [...source.provenance.sceneIds],
			trackIds: [...source.provenance.trackIds],
			timelineElementIds: [...source.provenance.timelineElementIds],
			mediaIds: [...source.provenance.mediaIds],
			sourceNodeIds: [source.id],
		},
	};
	const resolvedIndex = insertionIndex({
		index: toIndex ?? sourceIndex + 1,
		length: graph.nodes.length,
	});
	return nextGraph({
		graph,
		nodes: insertNode({
			nodes: graph.nodes,
			node: duplicate,
			index: resolvedIndex,
		}),
	});
}

function sharedValue({
	values,
}: {
	values: readonly (string | undefined)[];
}): string | undefined {
	const first = values[0];
	if (first === undefined) return undefined;
	return values.every((value) => value === first) ? first : undefined;
}

function mergedRange({ nodes }: { nodes: readonly StoryGraphNode[] }): {
	start: number | null;
	end: number | null;
} {
	let start = Number.POSITIVE_INFINITY;
	let end = Number.NEGATIVE_INFINITY;
	for (const node of nodes) {
		if (node.timelineStart === null || node.timelineEnd === null) {
			return { start: null, end: null };
		}
		start = Math.min(start, node.timelineStart);
		end = Math.max(end, node.timelineEnd);
	}
	return normalizeTimelineRange({ start, end });
}

export function mergeStoryGraphNodes({
	graph,
	nodeIds,
	label,
}: {
	graph: StoryGraph;
	nodeIds: readonly string[];
	label: string;
}): StoryGraph {
	assertStoryGraphInvariants({ graph });
	const requestedIds = uniqueValues({
		values: nodeIds.map((nodeId) =>
			normalizeRequiredText({ value: nodeId, label: "Node id" }),
		),
	});
	if (requestedIds.length < 2) {
		throw new StoryGraphInvariantError(
			"Merge requires at least two unique nodes.",
		);
	}
	const requestedSet = new Set(requestedIds);
	const selected = graph.nodes.filter((node) => requestedSet.has(node.id));
	if (selected.length !== requestedIds.length) {
		const missingId = requestedIds.find(
			(requestedId) => !selected.some((node) => node.id === requestedId),
		);
		throw new StoryGraphInvariantError(
			`Unknown story node: ${missingId ?? "unknown"}`,
		);
	}
	const firstIndex = Math.min(
		...selected.map((selectedNode) =>
			graph.nodes.findIndex((node) => node.id === selectedNode.id),
		),
	);
	const normalizedLabel = normalizeRequiredText({
		value: label,
		label: "Node label",
	});
	const assetId = sharedValue({ values: selected.map((node) => node.assetId) });
	const mediaId = sharedValue({ values: selected.map((node) => node.mediaId) });
	const range = mergedRange({ nodes: selected });
	const sharedThumbnail =
		assetId === undefined
			? undefined
			: selected.find((node) => node.thumbnail?.sourceAssetId === assetId)
					?.thumbnail;
	const merged: StoryGraphNode = {
		id: operationNodeId({
			graph,
			operation: "merge",
			parts: [normalizedLabel, ...selected.map((node) => node.id)],
		}),
		...(assetId === undefined ? {} : { assetId }),
		...(mediaId === undefined ? {} : { mediaId }),
		timelineStart: range.start,
		timelineEnd: range.end,
		label: normalizedLabel,
		evidenceState: "merged",
		...(sharedThumbnail === undefined
			? {}
			: { thumbnail: { ...sharedThumbnail } }),
		provenance: {
			sceneIds: uniqueValues({
				values: selected.flatMap((node) => node.provenance.sceneIds),
			}),
			trackIds: uniqueValues({
				values: selected.flatMap((node) => node.provenance.trackIds),
			}),
			timelineElementIds: uniqueValues({
				values: selected.flatMap((node) => node.provenance.timelineElementIds),
			}),
			mediaIds: uniqueValues({
				values: selected.flatMap((node) => node.provenance.mediaIds),
			}),
			sourceNodeIds: selected.map((node) => node.id),
		},
	};
	const remaining = graph.nodes.filter((node) => !requestedSet.has(node.id));
	return nextGraph({
		graph,
		nodes: insertNode({ nodes: remaining, node: merged, index: firstIndex }),
	});
}

function assertNormalizedValues({
	values,
	label,
}: {
	values: readonly string[];
	label: string;
}): void {
	const normalized = values.map((value) =>
		normalizeRequiredText({ value, label }),
	);
	if (new Set(normalized).size !== normalized.length) {
		throw new StoryGraphInvariantError(`${label} values must be unique.`);
	}
	if (normalized.some((value, index) => value !== values[index])) {
		throw new StoryGraphInvariantError(`${label} values must be normalized.`);
	}
}

function assertNodeInvariants({ node }: { node: StoryGraphNode }): void {
	if (normalizeRequiredText({ value: node.id, label: "Node id" }) !== node.id) {
		throw new StoryGraphInvariantError("Node ids must be normalized.");
	}
	if (
		normalizeRequiredText({ value: node.label, label: "Node label" }) !==
		node.label
	) {
		throw new StoryGraphInvariantError("Node labels must be normalized.");
	}
	normalizeOptionalText({ value: node.assetId, label: "Asset id" });
	normalizeOptionalText({ value: node.mediaId, label: "Media id" });
	normalizeTimelineRange({ start: node.timelineStart, end: node.timelineEnd });
	if (!EVIDENCE_STATES.includes(node.evidenceState)) {
		throw new StoryGraphInvariantError(
			`Unsupported evidence state: ${node.evidenceState}`,
		);
	}
	assertNormalizedValues({
		values: node.provenance.sceneIds,
		label: "Scene id",
	});
	assertNormalizedValues({
		values: node.provenance.trackIds,
		label: "Track id",
	});
	assertNormalizedValues({
		values: node.provenance.timelineElementIds,
		label: "Timeline element id",
	});
	assertNormalizedValues({
		values: node.provenance.mediaIds,
		label: "Media id",
	});
	assertNormalizedValues({
		values: node.provenance.sourceNodeIds,
		label: "Source node id",
	});
	const hasTimelineRange = node.timelineStart !== null;
	if (
		node.evidenceState === "timeline-and-media" &&
		(!hasTimelineRange ||
			node.assetId === undefined ||
			node.mediaId === undefined ||
			node.provenance.timelineElementIds.length === 0 ||
			node.provenance.mediaIds.length === 0)
	) {
		throw new StoryGraphInvariantError(
			"Timeline-and-media nodes require matching timeline and media evidence.",
		);
	}
	if (
		node.evidenceState === "timeline-only" &&
		(!hasTimelineRange || node.provenance.timelineElementIds.length === 0)
	) {
		throw new StoryGraphInvariantError(
			"Timeline-only nodes require timeline evidence.",
		);
	}
	if (
		node.evidenceState === "media-only" &&
		(node.assetId === undefined ||
			hasTimelineRange ||
			node.provenance.mediaIds.length === 0)
	) {
		throw new StoryGraphInvariantError(
			"Media-only nodes require media evidence and no timeline range.",
		);
	}
	if (
		node.evidenceState === "merged" &&
		node.provenance.sourceNodeIds.length < 2
	) {
		throw new StoryGraphInvariantError(
			"Merged nodes require at least two source nodes.",
		);
	}
	const thumbnail = normalizeThumbnail({ thumbnail: node.thumbnail });
	if (thumbnail && node.assetId !== thumbnail.sourceAssetId) {
		throw new StoryGraphInvariantError(
			"Thumbnail source must match the node asset id.",
		);
	}
}

export function assertStoryGraphInvariants({
	graph,
}: {
	graph: StoryGraph;
}): void {
	if (
		graph.kind !== "visioncut.story-graph" ||
		graph.schemaVersion !== STORY_GRAPH_SCHEMA_VERSION
	) {
		throw new StoryGraphInvariantError("Unsupported Story Graph schema.");
	}
	const projectId = normalizeRequiredText({
		value: graph.projectId,
		label: "Project id",
	});
	if (projectId !== graph.projectId) {
		throw new StoryGraphInvariantError("Project id must be normalized.");
	}
	if (graph.graphId !== graphIdFor({ projectId })) {
		throw new StoryGraphInvariantError("Graph id does not match the project.");
	}
	if (!Number.isInteger(graph.version) || graph.version < 1) {
		throw new StoryGraphInvariantError(
			"Graph version must be a positive integer.",
		);
	}
	if (
		graph.derivation.deterministic !== true ||
		graph.derivation.contentAnalysisPerformed !== false ||
		graph.requirements.network !== false ||
		graph.requirements.paidService !== false ||
		graph.requirements.apiKey !== false
	) {
		throw new StoryGraphInvariantError(
			"Story Graph must remain deterministic, local, free, and evidence-only.",
		);
	}
	normalizeRequiredText({
		value: graph.derivation.notice,
		label: "Derivation notice",
	});
	const ids = new Set<string>();
	for (const node of graph.nodes) {
		assertNodeInvariants({ node });
		if (ids.has(node.id)) {
			throw new StoryGraphInvariantError(`Duplicate story node id: ${node.id}`);
		}
		ids.add(node.id);
	}
}

export function serializeStoryGraph({ graph }: { graph: StoryGraph }): string {
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
							url: node.thumbnail.url,
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
