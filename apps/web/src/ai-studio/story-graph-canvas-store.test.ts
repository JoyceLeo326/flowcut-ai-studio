import { describe, expect, test } from "bun:test";
import {
	createStoryGraphNode,
	deriveStoryGraph,
	type StoryGraph,
} from "./story-graph-model";
import {
	createStoryGraphCanvasAggregate,
	createStoryGraphCanvasDraftNode,
	deriveStoryGraphCanvas,
	moveStoryGraphCanvasNode,
	type StoryGraphCanvasDocument,
} from "./story-graph-canvas-model";
import {
	createStoryGraphCanvasStorageKey,
	deleteStoryGraphCanvasDocument,
	IndexedDBStoryGraphCanvasStorage,
	loadStoryGraphCanvasDocument,
	loadStoryGraphCanvasAggregate,
	MemoryStoryGraphCanvasStorage,
	parseStoryGraphCanvasDocument,
	saveStoryGraphCanvasDocument,
	saveStoryGraphCanvasAggregate,
	StoryGraphCanvasRevisionConflictError,
	StoryGraphCanvasStorageValidationError,
	type StoryGraphCanvasStorageIdentity,
} from "./story-graph-canvas-store";

function timelineGraph(projectId = "canvas-store-project"): StoryGraph {
	return deriveStoryGraph({
		projectId,
		media: [
			{
				id: `${projectId}-media`,
				name: "Evidence.mp4",
				type: "video",
				duration: 6,
			},
		],
		scenes: [
			{
				id: `${projectId}-scene`,
				name: "Main",
				tracks: {
					main: {
						id: `${projectId}-track`,
						type: "video",
						elements: [
							{
								id: `${projectId}-element`,
								name: "Evidence",
								type: "video",
								mediaId: `${projectId}-media`,
								startTime: 1,
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

function identityFor({
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

describe("VisionCut Creative Canvas persistence", () => {
	test("stores and loads an immutable document under its exact graph version", async () => {
		const storage = new MemoryStoryGraphCanvasStorage();
		let document = deriveStoryGraphCanvas({ graph: timelineGraph() });
		document = createStoryGraphCanvasDraftNode({
			document,
			type: "emotion",
			label: "Reflective draft",
			position: { x: 320, y: 440 },
		});

		const stored = await saveStoryGraphCanvasDocument({ document, storage });
		const loaded = await loadStoryGraphCanvasDocument({
			identity: identityFor({ document }),
			storage,
		});

		expect(stored).toEqual(document);
		expect(stored).not.toBe(document);
		expect(loaded).toEqual(document);
		expect(Object.isFrozen(loaded)).toBe(true);
		expect(Object.isFrozen(loaded?.nodes)).toBe(true);
		expect(Object.isFrozen(loaded?.nodes.at(-1)?.provenance)).toBe(true);
	});

	test("isolates layouts by project, graph id, and graph version", async () => {
		const storage = new MemoryStoryGraphCanvasStorage();
		const firstGraph = timelineGraph();
		const secondGraph = createStoryGraphNode({
			graph: firstGraph,
			node: { label: "Manual note does not become a semantic node" },
		});
		let first = deriveStoryGraphCanvas({ graph: firstGraph });
		const second = deriveStoryGraphCanvas({ graph: secondGraph });
		const other = deriveStoryGraphCanvas({
			graph: timelineGraph("canvas-store-other"),
		});
		first = moveStoryGraphCanvasNode({
			document: first,
			nodeId: first.nodes[0].id,
			position: { x: 700, y: 360 },
		});

		await saveStoryGraphCanvasDocument({ document: first, storage });
		await saveStoryGraphCanvasDocument({ document: second, storage });
		await saveStoryGraphCanvasDocument({ document: other, storage });

		expect(
			(
				await loadStoryGraphCanvasDocument({
					identity: identityFor({ document: first }),
					storage,
				})
			)?.nodes[0].position,
		).toEqual({ x: 700, y: 360 });
		expect(
			(
				await loadStoryGraphCanvasDocument({
					identity: identityFor({ document: second }),
					storage,
				})
			)?.graphVersion,
		).toBe(2);
		expect(
			(
				await loadStoryGraphCanvasDocument({
					identity: identityFor({ document: other }),
					storage,
				})
			)?.projectId,
		).toBe("canvas-store-other");
	});

	test("replaces the latest layout for the same exact version", async () => {
		const storage = new MemoryStoryGraphCanvasStorage();
		const initial = deriveStoryGraphCanvas({ graph: timelineGraph() });
		const moved = moveStoryGraphCanvasNode({
			document: initial,
			nodeId: initial.nodes[0].id,
			position: { x: 512, y: 144 },
		});

		await saveStoryGraphCanvasDocument({ document: initial, storage });
		await saveStoryGraphCanvasDocument({ document: moved, storage });

		const loaded = await loadStoryGraphCanvasDocument({
			identity: identityFor({ document: moved }),
			storage,
		});
		expect(loaded?.revision).toBe(moved.revision);
		expect(loaded?.nodes[0].position).toEqual({ x: 512, y: 144 });
	});

	test("uses the memory adapter when IndexedDB is unavailable", async () => {
		const fallback = new MemoryStoryGraphCanvasStorage();
		const storage = new IndexedDBStoryGraphCanvasStorage({
			indexedDBFactory: null,
			fallback,
		});
		const document = deriveStoryGraphCanvas({ graph: timelineGraph() });

		await saveStoryGraphCanvasDocument({ document, storage });
		expect(
			await loadStoryGraphCanvasDocument({
				identity: identityFor({ document }),
				storage,
			}),
		).toEqual(document);
	});

	test("rejects malformed, binary, and cross-key documents", async () => {
		const document = deriveStoryGraphCanvas({ graph: timelineGraph() });
		const identity = identityFor({ document });
		const malformed: StoryGraphCanvasDocument = {
			...document,
			nodes: [
				{
					...document.nodes[0],
					type: "character",
				},
			],
			edges: [],
		};
		const binary = {
			...document,
			runtimePayload: new Blob(["not portable"]),
		};
		const storage = new MemoryStoryGraphCanvasStorage({
			entries: [{ identity, value: { ...document, projectId: "other" } }],
		});

		expect(parseStoryGraphCanvasDocument({ value: malformed })).toBeNull();
		expect(parseStoryGraphCanvasDocument({ value: binary })).toBeNull();
		expect(
			loadStoryGraphCanvasDocument({ identity, storage }),
		).rejects.toBeInstanceOf(StoryGraphCanvasStorageValidationError);
		expect(
			saveStoryGraphCanvasDocument({
				document: malformed,
				storage: new MemoryStoryGraphCanvasStorage(),
			}),
		).rejects.toBeInstanceOf(StoryGraphCanvasStorageValidationError);
	});

	test("deletes only the requested project, graph, and version key", async () => {
		const storage = new MemoryStoryGraphCanvasStorage();
		const firstGraph = timelineGraph();
		const secondGraph = createStoryGraphNode({
			graph: firstGraph,
			node: { label: "Version two" },
		});
		const first = deriveStoryGraphCanvas({ graph: firstGraph });
		const second = deriveStoryGraphCanvas({ graph: secondGraph });
		await saveStoryGraphCanvasDocument({ document: first, storage });
		await saveStoryGraphCanvasDocument({ document: second, storage });

		await deleteStoryGraphCanvasDocument({
			identity: identityFor({ document: first }),
			storage,
		});

		expect(
			await loadStoryGraphCanvasDocument({
				identity: identityFor({ document: first }),
				storage,
			}),
		).toBeNull();
		expect(
			await loadStoryGraphCanvasDocument({
				identity: identityFor({ document: second }),
				storage,
			}),
		).not.toBeNull();
		expect(
			createStoryGraphCanvasStorageKey({
				identity: identityFor({ document: first }),
			}),
		).not.toBe(
			createStoryGraphCanvasStorageKey({
				identity: identityFor({ document: second }),
			}),
		);
	});

	test("restores the same aggregate after refresh and keeps draft layout changes", async () => {
		const storage = new MemoryStoryGraphCanvasStorage();
		const graph = timelineGraph();
		let canvas = deriveStoryGraphCanvas({ graph });
		canvas = createStoryGraphCanvasDraftNode({
			document: canvas,
			type: "character",
			label: "Interview subject",
			position: { x: 300, y: 64 },
			sourceNodeIds: [canvas.nodes[0].id],
		});
		const draft = canvas.nodes.at(-1);
		expect(draft).toBeDefined();
		if (!draft) return;
		const firstAggregate = createStoryGraphCanvasAggregate({ graph, canvas });
		await saveStoryGraphCanvasAggregate({
			aggregate: firstAggregate,
			expectedRevision: null,
			storage,
		});

		const restored = await loadStoryGraphCanvasAggregate({ graph, storage });
		expect(restored).not.toBeNull();
		expect(restored?.canvas.nodes.at(-1)?.label).toBe("Interview subject");
		expect(restored?.canvas.nodes.at(-1)?.position).toEqual({ x: 300, y: 64 });
		if (!restored) return;

		const movedCanvas = moveStoryGraphCanvasNode({
			document: restored.canvas,
			nodeId: draft.id,
			position: { x: 640, y: 96 },
		});
		const movedAggregate = createStoryGraphCanvasAggregate({
			graph,
			canvas: movedCanvas,
		});
		await saveStoryGraphCanvasAggregate({
			aggregate: movedAggregate,
			expectedRevision: restored.revision,
			storage,
		});

		const refreshedAgain = await loadStoryGraphCanvasAggregate({
			graph,
			storage,
		});
		expect(refreshedAgain?.revision).toBe(movedAggregate.revision);
		expect(
			refreshedAgain?.canvas.nodes.find((node) => node.id === draft.id)
				?.position,
		).toEqual({ x: 640, y: 96 });
		expect(Object.isFrozen(refreshedAgain?.storyGraph)).toBe(true);
		expect(Object.isFrozen(refreshedAgain?.canvas)).toBe(true);
	});

	test("prevents stale sessions from overwriting a newer aggregate revision", async () => {
		const storage = new MemoryStoryGraphCanvasStorage();
		const graph = timelineGraph();
		const initial = createStoryGraphCanvasAggregate({ graph });
		await saveStoryGraphCanvasAggregate({
			aggregate: initial,
			expectedRevision: null,
			storage,
		});
		const firstSession = await loadStoryGraphCanvasAggregate({
			graph,
			storage,
		});
		const secondSession = await loadStoryGraphCanvasAggregate({
			graph,
			storage,
		});
		expect(firstSession).not.toBeNull();
		expect(secondSession).not.toBeNull();
		if (!firstSession || !secondSession) return;

		const firstUpdate = createStoryGraphCanvasAggregate({
			graph,
			canvas: moveStoryGraphCanvasNode({
				document: firstSession.canvas,
				nodeId: firstSession.canvas.nodes[0].id,
				position: { x: 520, y: 180 },
			}),
		});
		const staleUpdate = createStoryGraphCanvasAggregate({
			graph,
			canvas: moveStoryGraphCanvasNode({
				document: secondSession.canvas,
				nodeId: secondSession.canvas.nodes[0].id,
				position: { x: 120, y: 620 },
			}),
		});
		await saveStoryGraphCanvasAggregate({
			aggregate: firstUpdate,
			expectedRevision: firstSession.revision,
			storage,
		});

		expect(
			saveStoryGraphCanvasAggregate({
				aggregate: staleUpdate,
				expectedRevision: secondSession.revision,
				storage,
			}),
		).rejects.toBeInstanceOf(StoryGraphCanvasRevisionConflictError);
		expect(
			(await loadStoryGraphCanvasAggregate({ graph, storage }))?.canvas.nodes[0]
				.position,
		).toEqual({ x: 520, y: 180 });
	});

	test("keeps aggregate storage project-scoped and migrates legacy layouts safely", async () => {
		const storage = new MemoryStoryGraphCanvasStorage();
		const graph = timelineGraph();
		const otherGraph = timelineGraph("canvas-store-other-project");
		let legacy = deriveStoryGraphCanvas({ graph });
		legacy = createStoryGraphCanvasDraftNode({
			document: legacy,
			type: "audio",
			label: "Legacy sound direction",
			position: { x: 480, y: 620 },
		});
		await saveStoryGraphCanvasDocument({ document: legacy, storage });

		const migrated = await loadStoryGraphCanvasAggregate({ graph, storage });
		expect(migrated?.canvas).toEqual(legacy);
		expect(migrated?.storyGraph.projectId).toBe(graph.projectId);
		expect(
			await loadStoryGraphCanvasAggregate({
				graph: otherGraph,
				storage,
			}),
		).toBeNull();

		const maliciousStorage = new MemoryStoryGraphCanvasStorage({
			entries: [
				{
					identity: {
						projectId: otherGraph.projectId,
						graphId: otherGraph.graphId,
						graphVersion: otherGraph.version,
					},
					value: createStoryGraphCanvasAggregate({ graph }),
				},
			],
		});
		expect(
			loadStoryGraphCanvasAggregate({
				graph: otherGraph,
				storage: maliciousStorage,
			}),
		).rejects.toBeInstanceOf(StoryGraphCanvasStorageValidationError);
	});
});
