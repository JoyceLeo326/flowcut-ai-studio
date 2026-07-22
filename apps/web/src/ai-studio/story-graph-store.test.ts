import { describe, expect, test } from "bun:test";
import {
	createStoryGraphNode,
	deriveStoryGraph,
	type StoryGraph,
} from "./story-graph-model";
import {
	IndexedDBStoryGraphStorage,
	MemoryStoryGraphStorage,
	StoryGraphStorageValidationError,
	StoryGraphVersionConflictError,
	appendStoryGraphVersion,
	deleteStoryGraphHistory,
	exportStoryGraphHistory,
	listStoryGraphVersions,
	loadStoryGraph,
	loadStoryGraphHistory,
	parseStoryGraphForStorage,
	parseStoryGraphHistory,
} from "./story-graph-store";

function initialGraph(projectId: string): StoryGraph {
	return deriveStoryGraph({
		projectId,
		media: [
			{
				id: `${projectId}-opening`,
				name: "Opening shot.mp4",
				type: "video",
				width: 1920,
				height: 1080,
			},
		],
		scenes: [],
	});
}

function nextGraph({
	graph,
	label = "Director note",
}: {
	graph: StoryGraph;
	label?: string;
}): StoryGraph {
	return createStoryGraphNode({
		graph,
		node: { label },
	});
}

describe("VisionCut project Story Graph persistence", () => {
	test("creates a project history with a complete immutable current version", async () => {
		const projectId = "project-story-create";
		const storage = new MemoryStoryGraphStorage();
		const graph = initialGraph(projectId);
		const stored = await appendStoryGraphVersion({
			projectId,
			graph,
			expectedCurrentVersion: 0,
			storage,
		});
		const history = await loadStoryGraphHistory({ projectId, storage });

		expect(stored).toEqual(graph);
		expect(stored).not.toBe(graph);
		expect(history?.current).toEqual(graph);
		expect(history?.history).toEqual([graph]);
		expect(history?.graphId).toBe(graph.graphId);
		expect(history?.guarantees).toEqual({
			localOnly: true,
			accountRequired: false,
			network: false,
			paidService: false,
			jsonSafe: true,
			binaryPayloadsStored: false,
		});
		expect(Object.isFrozen(history)).toBe(true);
		expect(Object.isFrozen(history?.current)).toBe(true);
		expect(Object.isFrozen(history?.history)).toBe(true);
	});

	test("appends consecutive graph versions without mutating prior history", async () => {
		const projectId = "project-story-append";
		const storage = new MemoryStoryGraphStorage();
		const first = initialGraph(projectId);
		const firstJson = JSON.stringify(first);
		const second = nextGraph({ graph: first });

		await appendStoryGraphVersion({
			projectId,
			graph: first,
			expectedCurrentVersion: 0,
			storage,
		});
		await appendStoryGraphVersion({
			projectId,
			graph: second,
			expectedCurrentVersion: 1,
			storage,
		});
		const versions = await listStoryGraphVersions({ projectId, storage });

		expect(versions.map((graph) => graph.version)).toEqual([1, 2]);
		expect(versions[0]).toEqual(first);
		expect(versions[1]).toEqual(second);
		expect(JSON.stringify(first)).toBe(firstJson);
		expect(await loadStoryGraph({ projectId, storage })).toEqual(second);
		expect(await loadStoryGraph({ projectId, version: 1, storage })).toEqual(
			first,
		);
	});

	test("rejects stale optimistic writes and non-contiguous versions", async () => {
		const projectId = "project-story-conflict";
		const storage = new MemoryStoryGraphStorage();
		const first = initialGraph(projectId);
		const acceptedSecond = nextGraph({
			graph: first,
			label: "Accepted direction",
		});
		const staleSecond = nextGraph({
			graph: first,
			label: "Stale direction",
		});

		await appendStoryGraphVersion({
			projectId,
			graph: first,
			expectedCurrentVersion: 0,
			storage,
		});
		await appendStoryGraphVersion({
			projectId,
			graph: acceptedSecond,
			expectedCurrentVersion: 1,
			storage,
		});

		expect(
			appendStoryGraphVersion({
				projectId,
				graph: staleSecond,
				expectedCurrentVersion: 1,
				storage,
			}),
		).rejects.toBeInstanceOf(StoryGraphVersionConflictError);
		expect(
			appendStoryGraphVersion({
				projectId,
				graph: first,
				expectedCurrentVersion: 2,
				storage,
			}),
		).rejects.toBeInstanceOf(StoryGraphVersionConflictError);
		expect(await listStoryGraphVersions({ projectId, storage })).toHaveLength(
			2,
		);
	});

	test("isolates histories by project and rejects cross-project writes", async () => {
		const storage = new MemoryStoryGraphStorage();
		const projectA = initialGraph("project-story-a");
		const projectB = initialGraph("project-story-b");

		await appendStoryGraphVersion({
			projectId: projectA.projectId,
			graph: projectA,
			expectedCurrentVersion: 0,
			storage,
		});
		await appendStoryGraphVersion({
			projectId: projectB.projectId,
			graph: projectB,
			expectedCurrentVersion: 0,
			storage,
		});

		expect(
			(
				await loadStoryGraph({
					projectId: projectA.projectId,
					storage,
				})
			)?.projectId,
		).toBe(projectA.projectId);
		expect(
			(
				await loadStoryGraph({
					projectId: projectB.projectId,
					storage,
				})
			)?.projectId,
		).toBe(projectB.projectId);
		expect(
			appendStoryGraphVersion({
				projectId: projectA.projectId,
				graph: nextGraph({ graph: projectB }),
				expectedCurrentVersion: 1,
				storage,
			}),
		).rejects.toBeInstanceOf(StoryGraphStorageValidationError);
	});

	test("rejects corrupted history and File or Blob runtime payloads", async () => {
		const projectId = "project-story-corrupt";
		const graph = initialGraph(projectId);
		const malformed = {
			kind: "visioncut.story-graph-history",
			schemaVersion: 1,
			projectId,
			graphId: graph.graphId,
			current: graph,
			history: [{ ...graph, version: 2 }],
			guarantees: {
				localOnly: true,
				accountRequired: false,
				network: false,
				paidService: false,
				jsonSafe: true,
				binaryPayloadsStored: false,
			},
		};
		const storage = new MemoryStoryGraphStorage({
			entries: [{ projectId, value: malformed }],
		});
		const binaryGraph = {
			...graph,
			runtimePayload: new Blob(["not persisted"]),
		};

		expect(parseStoryGraphHistory({ value: malformed })).toBeNull();
		expect(
			loadStoryGraphHistory({ projectId, storage }),
		).rejects.toBeInstanceOf(StoryGraphStorageValidationError);
		expect(parseStoryGraphForStorage({ value: binaryGraph })).toBeNull();
		expect(
			appendStoryGraphVersion({
				projectId,
				graph: binaryGraph,
				expectedCurrentVersion: 0,
				storage: new MemoryStoryGraphStorage(),
			}),
		).rejects.toBeInstanceOf(StoryGraphStorageValidationError);
	});

	test("uses the in-memory fallback when IndexedDB is unavailable", async () => {
		const projectId = "project-story-ssr";
		const fallback = new MemoryStoryGraphStorage();
		const storage = new IndexedDBStoryGraphStorage({
			indexedDBFactory: null,
			fallback,
		});
		const first = initialGraph(projectId);
		const second = nextGraph({ graph: first });

		await appendStoryGraphVersion({
			projectId,
			graph: first,
			expectedCurrentVersion: 0,
			storage,
		});
		await appendStoryGraphVersion({
			projectId,
			graph: second,
			expectedCurrentVersion: 1,
			storage,
		});

		expect(await loadStoryGraph({ projectId, storage })).toEqual(second);
		expect(await listStoryGraphVersions({ projectId, storage })).toHaveLength(
			2,
		);
	});

	test("exports safe JSON and deletes only the requested project history", async () => {
		const projectId = "project-story-export";
		const otherProjectId = "project-story-keep";
		const storage = new MemoryStoryGraphStorage();
		await appendStoryGraphVersion({
			projectId,
			graph: initialGraph(projectId),
			expectedCurrentVersion: 0,
			storage,
		});
		await appendStoryGraphVersion({
			projectId: otherProjectId,
			graph: initialGraph(otherProjectId),
			expectedCurrentVersion: 0,
			storage,
		});

		const exported = await exportStoryGraphHistory({ projectId, storage });
		const parsed = parseStoryGraphHistory({ value: JSON.parse(exported) });

		expect(parsed?.projectId).toBe(projectId);
		expect(parsed?.history).toHaveLength(1);
		expect(exported).toContain('"jsonSafe": true');
		expect(exported).toContain('"binaryPayloadsStored": false');
		expect(exported).not.toContain("runtimePayload");

		await deleteStoryGraphHistory({ projectId, storage });
		expect(await loadStoryGraph({ projectId, storage })).toBeNull();
		expect(
			await loadStoryGraph({ projectId: otherProjectId, storage }),
		).not.toBeNull();
	});
});
