import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/media/types";
import type { TProject } from "@/project/types";
import type { SceneTracks, VideoElement } from "@/timeline";
import { installMockWasm } from "@/test-utils/mock-wasm";

installMockWasm();

const { mediaTimeFromSeconds } = await import("@/wasm");
const {
	ProjectVersionRestoreError,
	captureProjectVersionRestorePayload,
	restoreProjectFromVersionPayload,
} = await import("./project-version-restore");

const params = {
	transform: {
		position: { x: 0, y: 0 },
		scale: { x: 1, y: 1 },
		rotation: 0,
	},
	opacity: 1,
};

function makeAsset({
	content = "video fixture",
	lastModified = 1_700_000_000_000,
}: {
	content?: string;
	lastModified?: number;
} = {}): MediaAsset {
	const file = new File([content], "clip.mp4", {
		type: "video/mp4",
		lastModified,
	});
	return {
		id: "asset-1",
		name: file.name,
		type: "video",
		file,
		duration: 8,
		width: 1280,
		height: 720,
		fps: 30,
		hasAudio: true,
	};
}

function makeTracks(): SceneTracks {
	const element: VideoElement = {
		id: "clip-1",
		name: "Opening",
		type: "video",
		mediaId: "asset-1",
		startTime: mediaTimeFromSeconds({ seconds: 0 }),
		duration: mediaTimeFromSeconds({ seconds: 8 }),
		trimStart: mediaTimeFromSeconds({ seconds: 0 }),
		trimEnd: mediaTimeFromSeconds({ seconds: 0 }),
		params,
	};
	return {
		main: {
			id: "main",
			name: "Main",
			type: "video",
			muted: false,
			hidden: false,
			elements: [element],
		},
		overlay: [],
		audio: [],
	};
}

function makeProject({
	id = "project-1",
	name = "Versioned film",
}: {
	id?: string;
	name?: string;
} = {}): TProject {
	const createdAt = new Date("2026-07-26T10:00:00.000Z");
	return {
		metadata: {
			id,
			name,
			duration: mediaTimeFromSeconds({ seconds: 8 }),
			createdAt,
			updatedAt: createdAt,
		},
		scenes: [
			{
				id: "scene-1",
				name: "Main scene",
				isMain: true,
				tracks: makeTracks(),
				bookmarks: [
					{
						time: mediaTimeFromSeconds({ seconds: 2 }),
						note: "Hook",
					},
				],
				createdAt,
				updatedAt: createdAt,
			},
		],
		currentSceneId: "scene-1",
		settings: {
			fps: { numerator: 30, denominator: 1 },
			canvasSize: { width: 1920, height: 1080 },
			background: { type: "color", color: "#000000" },
		},
		version: 3,
		timelineViewState: {
			zoomLevel: 1,
			scrollLeft: 0,
			playheadTime: mediaTimeFromSeconds({ seconds: 2 }),
		},
	};
}

describe("project version restore adapter", () => {
	test("captures a frozen structure-only snapshot and restores it", () => {
		const source = makeProject();
		const asset = makeAsset();
		const payload = captureProjectVersionRestorePayload({
			project: source,
			assets: [asset],
			snapshotId: "snapshot-1",
			capturedAt: "2026-07-26T10:01:00.000Z",
		});
		const current = makeProject({ name: "Changed name" });
		current.scenes[0].tracks.main.elements = [];

		const restored = restoreProjectFromVersionPayload({
			payload,
			currentProject: current,
			assets: [asset],
		});

		expect(Object.isFrozen(payload)).toBe(true);
		expect(payload.assets[0]).toMatchObject({
			assetId: "asset-1",
			kind: "video",
			sizeBytes: asset.file.size,
		});
		expect(JSON.stringify(payload)).not.toContain("video fixture");
		expect(restored.metadata.name).toBe("Versioned film");
		expect(restored.scenes[0].tracks.main.elements).toHaveLength(1);
		expect(restored.scenes[0].bookmarks[0].note).toBe("Hook");
		expect(restored.version).toBe(4);
	});

	test("blocks missing, replaced, and cross-project assets", () => {
		const source = makeProject();
		const payload = captureProjectVersionRestorePayload({
			project: source,
			assets: [makeAsset()],
			snapshotId: "snapshot-1",
			capturedAt: "2026-07-26T10:01:00.000Z",
		});

		expect(() =>
			restoreProjectFromVersionPayload({
				payload,
				currentProject: source,
				assets: [],
			}),
		).toThrow(ProjectVersionRestoreError);
		expect(() =>
			restoreProjectFromVersionPayload({
				payload,
				currentProject: source,
				assets: [makeAsset({ content: "replacement" })],
			}),
		).toThrow("已被替换");
		expect(() =>
			restoreProjectFromVersionPayload({
				payload,
				currentProject: makeProject({ id: "project-2" }),
				assets: [makeAsset()],
			}),
		).toThrow("另一个项目");
	});

	test("snapshot data does not change after the editor state mutates", () => {
		const source = makeProject();
		const payload = captureProjectVersionRestorePayload({
			project: source,
			assets: [makeAsset()],
			snapshotId: "snapshot-1",
			capturedAt: "2026-07-26T10:01:00.000Z",
		});

		source.metadata.name = "Mutated later";
		source.scenes[0].tracks.main.elements.length = 0;

		const restored = restoreProjectFromVersionPayload({
			payload,
			currentProject: source,
			assets: [makeAsset()],
		});
		expect(restored.metadata.name).toBe("Versioned film");
		expect(restored.scenes[0].tracks.main.elements).toHaveLength(1);
	});

	test("copies shared plain objects while still rejecting actual cycles", () => {
		const source = makeProject();
		const first = source.scenes[0].tracks.main.elements[0];
		source.scenes[0].tracks.main.elements.push({
			...first,
			id: "clip-2",
			name: "Shared style",
			startTime: mediaTimeFromSeconds({ seconds: 8 }),
		});

		const payload = captureProjectVersionRestorePayload({
			project: source,
			assets: [makeAsset()],
			snapshotId: "snapshot-shared",
			capturedAt: "2026-07-26T10:02:00.000Z",
		});
		expect(JSON.stringify(payload.timelineState)).toContain('"id":"clip-2"');

		const cyclic = makeProject();
		Reflect.set(cyclic.settings, "cycle", cyclic.settings);
		expect(() =>
			captureProjectVersionRestorePayload({
				project: cyclic,
				assets: [makeAsset()],
				snapshotId: "snapshot-cycle",
				capturedAt: "2026-07-26T10:03:00.000Z",
			}),
		).toThrow("cyclic object reference");
	});
});
