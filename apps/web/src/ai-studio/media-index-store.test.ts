import { describe, expect, test } from "bun:test";
import { createMediaIndex } from "./media-index";
import {
	deleteProjectMediaIndexes,
	loadCurrentMediaIndex,
	loadMediaIndexHistory,
	MediaIndexStorageConflictError,
	MemoryMediaIndexStorage,
	saveMediaIndex,
	serializeMediaIndexHistory,
} from "./media-index-store";

function makeIndex({
	assetId = "asset-1",
	difference = 0.1,
}: {
	assetId?: string;
	difference?: number;
} = {}) {
	return createMediaIndex({
		assetId,
		metadata: {
			durationSeconds: 4,
			hasVideo: true,
			hasAudio: true,
			videoWidth: 1920,
			videoHeight: 1080,
			source: { sourceId: "capture-1", method: "html-media-element" },
		},
		videoFrameSamples: [
			{
				atSeconds: 0,
				differenceFromPrevious: 0,
				meanLuminance: 0.4,
				source: {
					sourceId: "capture-1:video",
					method: "canvas-2d-frame-sampler",
				},
			},
			{
				atSeconds: 2,
				differenceFromPrevious: difference,
				meanLuminance: 0.6,
				source: {
					sourceId: "capture-1:video",
					method: "canvas-2d-frame-sampler",
				},
			},
		],
		audioWindowSamples: [
			{
				startSeconds: 0,
				endSeconds: 0.25,
				rms: 0.02,
				peak: 0.04,
				source: {
					sourceId: "capture-1:audio",
					method: "web-audio-api",
				},
			},
		],
	});
}

describe("MediaIndex local history storage", () => {
	test("persists a project and asset scoped current index", async () => {
		const storage = new MemoryMediaIndexStorage();
		const index = makeIndex();
		const history = await saveMediaIndex({
			projectId: "project-1",
			assetFingerprint: "video.mp4:1000:123",
			createdAt: "2026-07-23T00:00:00.000Z",
			index,
			storage,
		});
		expect(history.records).toHaveLength(1);
		expect(
			(
				await loadCurrentMediaIndex({
					projectId: "project-1",
					assetId: "asset-1",
					storage,
				})
			)?.mediaIndexId,
		).toBe(index.mediaIndexId);
		expect(serializeMediaIndexHistory({ history })).not.toContain("Blob");
	});

	test("is idempotent for the same deterministic analysis and fingerprint", async () => {
		const storage = new MemoryMediaIndexStorage();
		const input = {
			projectId: "project-1",
			assetFingerprint: "same-file",
			createdAt: "2026-07-23T00:00:00.000Z",
			index: makeIndex(),
			storage,
		};
		await saveMediaIndex(input);
		const history = await saveMediaIndex({
			...input,
			createdAt: "2026-07-23T00:01:00.000Z",
		});
		expect(history.records).toHaveLength(1);
	});

	test("keeps immutable analysis history when evidence changes", async () => {
		const storage = new MemoryMediaIndexStorage();
		await saveMediaIndex({
			projectId: "project-1",
			assetFingerprint: "same-file",
			createdAt: "2026-07-23T00:00:00.000Z",
			index: makeIndex(),
			storage,
		});
		const history = await saveMediaIndex({
			projectId: "project-1",
			assetFingerprint: "same-file",
			createdAt: "2026-07-23T00:01:00.000Z",
			index: makeIndex({ difference: 0.8 }),
			storage,
		});
		expect(history.records).toHaveLength(2);
		expect(history.records[0].index.mediaIndexId).not.toBe(
			history.records[1].index.mediaIndexId,
		);
	});

	test("rejects stale concurrent writes", async () => {
		const storage = new MemoryMediaIndexStorage();
		const first = await saveMediaIndex({
			projectId: "project-1",
			assetFingerprint: "same-file",
			createdAt: "2026-07-23T00:00:00.000Z",
			index: makeIndex(),
			storage,
		});
		await expect(
			storage.write({
				projectId: "project-1",
				assetId: "asset-1",
				value: first,
				expectedCurrentMediaIndexId: "stale-id",
			}),
		).rejects.toBeInstanceOf(MediaIndexStorageConflictError);
	});

	test("deletes every asset index for one project only", async () => {
		const storage = new MemoryMediaIndexStorage();
		for (const [projectId, assetId] of [
			["project-1", "asset-1"],
			["project-1", "asset-2"],
			["project-2", "asset-1"],
		] as const) {
			await saveMediaIndex({
				projectId,
				assetFingerprint: `${projectId}:${assetId}`,
				createdAt: "2026-07-23T00:00:00.000Z",
				index: makeIndex({ assetId }),
				storage,
			});
		}
		await deleteProjectMediaIndexes({ projectId: "project-1", storage });
		expect(
			await loadMediaIndexHistory({
				projectId: "project-1",
				assetId: "asset-1",
				storage,
			}),
		).toBeNull();
		expect(
			await loadMediaIndexHistory({
				projectId: "project-2",
				assetId: "asset-1",
				storage,
			}),
		).not.toBeNull();
	});
});
