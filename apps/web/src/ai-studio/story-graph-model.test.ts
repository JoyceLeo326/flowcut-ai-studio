import { describe, expect, test } from "bun:test";
import {
	StoryGraphInvariantError,
	assertStoryGraphInvariants,
	createStoryGraphNode,
	deleteStoryGraphNode,
	deriveStoryGraph,
	duplicateStoryGraphNode,
	mergeStoryGraphNodes,
	reorderStoryGraphNode,
	serializeStoryGraph,
	type StoryGraph,
	type StoryGraphProjectSnapshot,
} from "./story-graph-model";

function projectSnapshot(): StoryGraphProjectSnapshot {
	return {
		projectId: "project-interview-01",
		media: [
			{
				id: "media-b",
				name: "Wide interview.mp4",
				type: "video",
				width: 1920,
				height: 1080,
				thumbnailUrl: "blob:wide-interview",
			},
			{
				id: "media-a",
				name: "Opening close-up.mp4",
				type: "video",
				width: 1080,
				height: 1920,
				thumbnailUrl: "blob:opening-close-up",
			},
			{
				id: "music-1",
				name: "Room tone.wav",
				type: "audio",
			},
		],
		scenes: [
			{
				id: "scene-main",
				name: "Main scene",
				isMain: true,
				tracks: {
					main: {
						id: "track-main",
						name: "Main",
						type: "video",
						elements: [
							{
								id: "element-b",
								name: "Interview answer",
								type: "video",
								mediaId: "media-b",
								startTime: 4,
								duration: 6,
							},
							{
								id: "element-a",
								name: "Opening close-up",
								type: "video",
								mediaId: "media-a",
								startTime: 0,
								duration: 4,
							},
						],
						muted: false,
						hidden: false,
					},
					overlay: [
						{
							id: "track-title",
							name: "Titles",
							type: "text",
							elements: [
								{
									id: "title-1",
									name: "Speaker name",
									type: "text",
									startTime: 0,
									duration: 3,
								},
							],
						},
					],
					audio: [
						{
							id: "track-audio",
							name: "Audio",
							type: "audio",
							elements: [
								{
									id: "audio-1",
									name: "Room tone",
									type: "audio",
									mediaId: "music-1",
									startTime: 0,
									duration: 10,
								},
							],
						},
					],
				},
			},
		],
	};
}

function derivedGraph(): StoryGraph {
	return deriveStoryGraph(projectSnapshot());
}

describe("VisionCut Story Graph domain model", () => {
	test("derives ordered scene nodes from real visual timeline and media evidence", () => {
		const graph = derivedGraph();

		expect(graph.nodes).toHaveLength(2);
		expect(graph.nodes.map((node) => node.label)).toEqual([
			"Opening close-up",
			"Interview answer",
		]);
		expect(graph.nodes[0]).toMatchObject({
			assetId: "media-a",
			mediaId: "media-a",
			timelineStart: 0,
			timelineEnd: 4,
			evidenceState: "timeline-and-media",
			thumbnail: {
				url: "blob:opening-close-up",
				sourceAssetId: "media-a",
				width: 1080,
				height: 1920,
			},
			provenance: {
				sceneIds: ["scene-main"],
				trackIds: ["track-main"],
				timelineElementIds: ["element-a"],
				mediaIds: ["media-a"],
				sourceNodeIds: [],
			},
		});
		expect(graph.nodes[0].id).toStartWith("story_node_");
		expect(graph.derivation.contentAnalysisPerformed).toBe(false);
		expect(graph.requirements).toEqual({
			network: false,
			paidService: false,
			apiKey: false,
		});
		expect(() => assertStoryGraphInvariants({ graph })).not.toThrow();
	});

	test("is deterministic and never emits unsupported sentiment or score claims", () => {
		const first = derivedGraph();
		const second = deriveStoryGraph(projectSnapshot());
		const serialized = serializeStoryGraph({ graph: first });

		expect(second).toEqual(first);
		expect(serializeStoryGraph({ graph: second })).toBe(serialized);
		expect(serialized).not.toContain("sentiment");
		expect(serialized).not.toContain("retentionScore");
		expect(serialized).not.toContain("qualityScore");
		expect(serialized).not.toContain('"score"');
	});

	test("falls back to deterministic media-only nodes when the timeline is empty", () => {
		const snapshot = projectSnapshot();
		const graph = deriveStoryGraph({
			...snapshot,
			scenes: [],
		});

		expect(graph.nodes.map((node) => node.assetId)).toEqual([
			"media-a",
			"media-b",
		]);
		expect(
			graph.nodes.every(
				(node) =>
					node.evidenceState === "media-only" &&
					node.timelineStart === null &&
					node.timelineEnd === null &&
					node.mediaId === undefined,
			),
		).toBe(true);
	});

	test("marks unresolved media references as timeline-only evidence", () => {
		const snapshot = projectSnapshot();
		const graph = deriveStoryGraph({
			...snapshot,
			media: snapshot.media.filter((asset) => asset.id !== "media-b"),
		});
		const unresolved = graph.nodes.find((node) => node.mediaId === "media-b");

		expect(unresolved).toMatchObject({
			mediaId: "media-b",
			timelineStart: 4,
			timelineEnd: 10,
			label: "Interview answer",
			evidenceState: "timeline-only",
		});
		expect(unresolved?.assetId).toBeUndefined();
		expect(unresolved?.thumbnail).toBeUndefined();
	});

	test("creates manual nodes immutably and increments the graph version", () => {
		const original = derivedGraph();
		const originalJson = serializeStoryGraph({ graph: original });
		const next = createStoryGraphNode({
			graph: original,
			index: 1,
			node: {
				label: "  Director note  ",
			},
		});

		expect(next.version).toBe(original.version + 1);
		expect(next.nodes).toHaveLength(original.nodes.length + 1);
		expect(next.nodes[1]).toMatchObject({
			label: "Director note",
			evidenceState: "manual",
			timelineStart: null,
			timelineEnd: null,
		});
		expect(serializeStoryGraph({ graph: original })).toBe(originalJson);
		expect(next.nodes).not.toBe(original.nodes);
	});

	test("deletes and reorders nodes without mutating earlier versions", () => {
		const original = derivedGraph();
		const reordered = reorderStoryGraphNode({
			graph: original,
			nodeId: original.nodes[1].id,
			toIndex: 0,
		});
		const deleted = deleteStoryGraphNode({
			graph: reordered,
			nodeId: reordered.nodes[1].id,
		});

		expect(reordered.version).toBe(2);
		expect(reordered.nodes.map((node) => node.label)).toEqual([
			"Interview answer",
			"Opening close-up",
		]);
		expect(deleted.version).toBe(3);
		expect(deleted.nodes.map((node) => node.label)).toEqual([
			"Interview answer",
		]);
		expect(original.nodes.map((node) => node.label)).toEqual([
			"Opening close-up",
			"Interview answer",
		]);
		expect(
			reorderStoryGraphNode({
				graph: original,
				nodeId: original.nodes[0].id,
				toIndex: 0,
			}),
		).toBe(original);
	});

	test("duplicates a node as an explicit manual branch with retained provenance", () => {
		const original = derivedGraph();
		const next = duplicateStoryGraphNode({
			graph: original,
			nodeId: original.nodes[0].id,
		});
		const duplicate = next.nodes[1];

		expect(next.version).toBe(2);
		expect(duplicate.id).not.toBe(original.nodes[0].id);
		expect(duplicate.label).toBe(original.nodes[0].label);
		expect(duplicate.evidenceState).toBe("manual");
		expect(duplicate.provenance.sourceNodeIds).toEqual([original.nodes[0].id]);
		expect(duplicate.provenance.timelineElementIds).toEqual(["element-a"]);
		expect(duplicate.thumbnail).toEqual(original.nodes[0].thumbnail);
		expect(duplicate.thumbnail).not.toBe(original.nodes[0].thumbnail);
	});

	test("merges nodes into one evidence-traceable span at their earliest position", () => {
		const original = derivedGraph();
		const merged = mergeStoryGraphNodes({
			graph: original,
			nodeIds: [original.nodes[1].id, original.nodes[0].id],
			label: "Complete interview beat",
		});
		const node = merged.nodes[0];

		expect(merged.version).toBe(2);
		expect(merged.nodes).toHaveLength(1);
		expect(node).toMatchObject({
			label: "Complete interview beat",
			evidenceState: "merged",
			timelineStart: 0,
			timelineEnd: 10,
		});
		expect(node.assetId).toBeUndefined();
		expect(node.mediaId).toBeUndefined();
		expect(node.provenance.sourceNodeIds).toEqual(
			original.nodes.map((item) => item.id),
		);
		expect(node.provenance.timelineElementIds).toEqual([
			"element-a",
			"element-b",
		]);
		expect(node.thumbnail).toBeUndefined();
	});

	test("serializes a canonical JSON shape with explicit null optional values", () => {
		const graph = createStoryGraphNode({
			graph: derivedGraph(),
			node: { label: "Unplaced idea" },
		});
		const first = serializeStoryGraph({ graph });
		const second = serializeStoryGraph({ graph });
		const parsed = JSON.parse(first);

		expect(second).toBe(first);
		expect(parsed.kind).toBe("visioncut.story-graph");
		expect(parsed.nodes[2]).toMatchObject({
			assetId: null,
			mediaId: null,
			timelineStart: null,
			timelineEnd: null,
			thumbnail: null,
		});
	});

	test("rejects duplicate ids, invalid ranges, unknown nodes, and invalid merges", () => {
		const graph = derivedGraph();
		const duplicateIds: StoryGraph = {
			...graph,
			nodes: [graph.nodes[0], { ...graph.nodes[1], id: graph.nodes[0].id }],
		};
		const invalidRange: StoryGraph = {
			...graph,
			nodes: [
				{
					...graph.nodes[0],
					timelineStart: 4,
					timelineEnd: 4,
				},
				graph.nodes[1],
			],
		};

		expect(() => assertStoryGraphInvariants({ graph: duplicateIds })).toThrow(
			StoryGraphInvariantError,
		);
		expect(() => assertStoryGraphInvariants({ graph: invalidRange })).toThrow(
			StoryGraphInvariantError,
		);
		expect(() =>
			deleteStoryGraphNode({ graph, nodeId: "missing-node" }),
		).toThrow(StoryGraphInvariantError);
		expect(() =>
			mergeStoryGraphNodes({
				graph,
				nodeIds: [graph.nodes[0].id, graph.nodes[0].id],
				label: "Invalid merge",
			}),
		).toThrow(StoryGraphInvariantError);
	});
});
