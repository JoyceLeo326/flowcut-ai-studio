import { beforeEach, describe, expect, mock, test } from "bun:test";
import { installMockWasm } from "@/test-utils/mock-wasm";
import type { MediaAsset } from "@/media/types";
import type { SceneTracks, VideoElement } from "@/timeline/types";

installMockWasm();

let activeEditor: ReturnType<typeof createFakeEditor>;
const savedAssetIds: string[] = [];
const deletedAssetIds: string[] = [];

mock.module("@/core", () => ({
	EditorCore: {
		getInstance: () => activeEditor.editor,
	},
}));

mock.module("@/services/storage/service", () => ({
	storageService: {
		canStoreFile: async () => ({ canStore: true, availableBytes: 1_000_000 }),
		saveMediaAsset: async ({ mediaAsset }: { mediaAsset: MediaAsset }) => {
			savedAssetIds.push(mediaAsset.id);
		},
		deleteMediaAsset: async ({ id }: { id: string }) => {
			deletedAssetIds.push(id);
		},
		isQuotaExceededError: () => false,
	},
}));

const { FreezeFrameCommand } = await import("./freeze-frame");
const { resolveFreezeFrameTarget } = await import("@/timeline/freeze-frame");
const { mediaTimeFromSeconds } = await import("@/wasm");

const t = (seconds: number) => mediaTimeFromSeconds({ seconds });

function sourceVideo(): VideoElement {
	return {
		id: "clip-a",
		name: "Source",
		type: "video",
		mediaId: "source-asset",
		startTime: t(0),
		duration: t(8),
		trimStart: t(0),
		trimEnd: t(0),
		sourceDuration: t(8),
		params: {},
	};
}

function sourceAsset(): MediaAsset {
	return {
		id: "source-asset",
		name: "source.mp4",
		type: "video",
		file: new File(["video"], "source.mp4", {
			type: "video/mp4",
			lastModified: 10,
		}),
		duration: 8,
		width: 1280,
		height: 720,
		fps: 30,
	};
}

function frozenAsset(): MediaAsset & { type: "image" } {
	const file = new File(["png"], "freeze.png", { type: "image/png" });
	return {
		id: "freeze-asset",
		name: "freeze.png",
		type: "image",
		file,
		url: URL.createObjectURL(file),
		width: 1280,
		height: 720,
	};
}

function initialTracks(): SceneTracks {
	return {
		main: {
			id: "main",
			name: "Main",
			type: "video",
			muted: false,
			hidden: false,
			elements: [sourceVideo()],
		},
		overlay: [],
		audio: [],
	};
}

function createFakeEditor() {
	let tracks = initialTracks();
	let assets: MediaAsset[] = [sourceAsset()];
	let projectId = "project-a";
	const editor = {
		project: {
			getActive: () => ({ metadata: { id: projectId } }),
		},
		scenes: {
			getActiveScene: () => ({ tracks }),
		},
		media: {
			getAssets: () => assets,
			setAssets: ({ assets: next }: { assets: MediaAsset[] }) => {
				assets = next;
			},
		},
		timeline: {
			getElementsWithTracks: ({
				elements,
			}: {
				elements: Array<{ trackId: string; elementId: string }>;
			}) =>
				elements.flatMap(({ trackId, elementId }) => {
					const track = tracks.main.id === trackId ? tracks.main : null;
					const element = track?.elements.find(
						(candidate) => candidate.id === elementId,
					);
					return track && element ? [{ track, element }] : [];
				}),
			updateTracks: (next: SceneTracks) => {
				tracks = next;
			},
		},
	};
	return {
		editor,
		getTracks: () => tracks,
		getAssets: () => assets,
		setProjectId: (next: string) => {
			projectId = next;
		},
	};
}

beforeEach(() => {
	activeEditor = createFakeEditor();
	savedAssetIds.length = 0;
	deletedAssetIds.length = 0;
});

describe("FreezeFrameCommand", () => {
	test("prepares once and performs atomic undo/redo with stable ids", async () => {
		const target = resolveFreezeFrameTarget({
			tracks: activeEditor.getTracks(),
			selection: [{ trackId: "main", elementId: "clip-a" }],
			mediaAssets: activeEditor.getAssets(),
			playheadTime: t(4),
		});
		const command = new FreezeFrameCommand({
			projectId: "project-a",
			target,
			asset: frozenAsset(),
			freezeDuration: t(2),
		});

		await command.prepare();
		const firstResult = command.execute();
		const firstRef = command.getFrozenElementRef();
		expect(firstResult?.selection?.selectedElements).toEqual([firstRef!]);
		expect(activeEditor.getTracks().main.elements).toHaveLength(3);
		expect(activeEditor.getAssets().map((asset) => asset.id)).toContain(
			"freeze-asset",
		);
		expect(savedAssetIds).toEqual(["freeze-asset"]);

		command.undo();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(activeEditor.getTracks().main.elements).toHaveLength(1);
		expect(activeEditor.getAssets().map((asset) => asset.id)).not.toContain(
			"freeze-asset",
		);
		expect(deletedAssetIds).toEqual(["freeze-asset"]);

		const redoResult = command.redo();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(command.getFrozenElementRef()).toEqual(firstRef);
		expect(redoResult?.selection?.selectedElements).toEqual([firstRef!]);
		expect(activeEditor.getTracks().main.elements).toHaveLength(3);
		expect(savedAssetIds).toEqual(["freeze-asset", "freeze-asset"]);
	});

	test("rejects stale source state after capture without mutating tracks", async () => {
		const target = resolveFreezeFrameTarget({
			tracks: activeEditor.getTracks(),
			selection: [{ trackId: "main", elementId: "clip-a" }],
			mediaAssets: activeEditor.getAssets(),
			playheadTime: t(4),
		});
		const command = new FreezeFrameCommand({
			projectId: "project-a",
			target,
			asset: frozenAsset(),
		});
		await command.prepare();
		activeEditor.getTracks().main.elements[0].duration = t(7);

		expect(() => command.execute()).toThrow(
			"changed while its frame was being captured",
		);
		expect(activeEditor.getTracks().main.elements).toHaveLength(1);
		expect(activeEditor.getAssets()).toHaveLength(1);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(deletedAssetIds).toEqual(["freeze-asset"]);
	});

	test("rejects a project switch while the frame is being captured", async () => {
		const target = resolveFreezeFrameTarget({
			tracks: activeEditor.getTracks(),
			selection: [{ trackId: "main", elementId: "clip-a" }],
			mediaAssets: activeEditor.getAssets(),
			playheadTime: t(4),
		});
		const command = new FreezeFrameCommand({
			projectId: "project-a",
			target,
			asset: frozenAsset(),
		});
		await command.prepare();
		activeEditor.setProjectId("project-b");

		expect(() => command.execute()).toThrow("active project changed");
		expect(activeEditor.getTracks().main.elements).toHaveLength(1);
		expect(activeEditor.getAssets()).toHaveLength(1);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(deletedAssetIds).toEqual(["freeze-asset"]);
	});
});
