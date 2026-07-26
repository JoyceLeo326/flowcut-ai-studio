import { describe, expect, test } from "bun:test";
import { createExportManifest, type ExportManifest } from "./export-manifest";
import {
	createExportJobQueue,
	markInterruptedExportQueue,
	runExportJobQueue,
	type ExportRuntimeSnapshot,
} from "./export-job";
import { ExportJobStore, MemoryExportJobStorage } from "./export-job-store";

function manifest({
	projectCanvasSize = { width: 1920, height: 1080 },
	variants = [
		{
			id: "master",
			label: "横版母版",
			platform: "generic" as const,
			aspectRatio: "16:9" as const,
			audio: {
				mode: "include" as const,
				required: false,
				targetLoudnessLufs: -14,
			},
		},
		{
			id: "vertical",
			label: "竖版",
			platform: "douyin" as const,
			aspectRatio: "9:16" as const,
			audio: { mode: "include" as const, required: true },
		},
	],
}: {
	projectCanvasSize?: { readonly width: number; readonly height: number };
	variants?: Parameters<typeof createExportManifest>[0]["variants"];
} = {}): ExportManifest {
	return createExportManifest({
		project: {
			id: "project-1",
			name: "Launch Film",
			version: 3,
			durationSeconds: 12,
			canvasSize: projectCanvasSize,
			fps: 30,
		},
		media: [
			{
				id: "video-1",
				name: "source.mp4",
				type: "video",
				durationSeconds: 12,
				width: 1920,
				height: 1080,
				hasAudio: true,
			},
		],
		timeline: {
			sceneId: "scene-1",
			sceneName: "Main",
			tracks: [
				{
					id: "main",
					name: "Main",
					type: "video",
					elements: [
						{
							id: "clip-1",
							name: "Source",
							type: "video",
							mediaId: "video-1",
							startTimeSeconds: 0,
							durationSeconds: 12,
							sourceAudioEnabled: true,
						},
					],
				},
			],
		},
		variants,
	});
}

function runtime(
	canvasSize: ExportRuntimeSnapshot["canvasSize"] = {
		width: 1920,
		height: 1080,
	},
): ExportRuntimeSnapshot {
	return {
		projectId: "project-1",
		projectVersion: 3,
		sceneId: "scene-1",
		canvasSize,
		durationSeconds: 12,
	};
}

describe("local export job queue", () => {
	test("queues exact-canvas work and rejects unreviewed reframes before renderer execution", () => {
		const queue = createExportJobQueue({
			manifest: manifest(),
			runtime: runtime(),
			createdAt: "2026-07-27T00:00:00.000Z",
			queueId: "queue-1",
		});

		expect(queue.jobs.map((job) => job.status)).toEqual(["queued", "failed"]);
		expect(queue.jobs[0].capability.state).toBe("supported");
		expect(queue.jobs[1].capability).toMatchObject({
			state: "rejected",
			rejectionReasons: [expect.stringContaining("1080×1920")],
		});
		expect(queue.jobs[1].failure?.code).toBe("REFRAME_NOT_REVIEWED");
		expect(queue.guarantees).toEqual({
			localRendererOnly: true,
			automaticUpload: false,
			timelineMutation: false,
			loudnessMeasurementClaimed: false,
		});
	});

	test("supports a temporary resolution scale when the source and output aspect ratio match", () => {
		const queue = createExportJobQueue({
			manifest: manifest({
				projectCanvasSize: { width: 1280, height: 720 },
				variants: [
					{
						id: "master",
						label: "1080p master",
						platform: "generic",
						aspectRatio: "16:9",
					},
				],
			}),
			runtime: runtime({ width: 1280, height: 720 }),
			queueId: "queue-scale",
		});

		expect(queue.jobs[0]).toMatchObject({
			status: "queued",
			capability: { state: "supported" },
			output: { width: 1920, height: 1080 },
		});
		expect(queue.guarantees.timelineMutation).toBe(false);
	});

	test("renders supported variants sequentially and records only measured bytes and elapsed time", async () => {
		const queue = createExportJobQueue({
			manifest: manifest({
				variants: [
					{
						id: "master-a",
						label: "母版 A",
						platform: "generic",
						aspectRatio: "16:9",
						container: "mp4",
						audio: {
							mode: "include",
							required: false,
							targetLoudnessLufs: -14,
						},
					},
					{
						id: "master-b",
						label: "母版 B",
						platform: "generic",
						aspectRatio: "16:9",
						container: "webm",
						audio: { mode: "mute" },
					},
				],
			}),
			runtime: runtime(),
			createdAt: "2026-07-27T00:00:00.000Z",
			queueId: "queue-2",
		});
		const calls: string[] = [];
		const snapshots: string[][] = [];
		let elapsed = 100;

		const completed = await runExportJobQueue({
			queue,
			signal: new AbortController().signal,
			now: () => "2026-07-27T00:00:01.000Z",
			elapsedNow: () => {
				elapsed += 25;
				return elapsed;
			},
			onChange: (next) => snapshots.push(next.jobs.map((job) => job.status)),
			renderer: {
				async render({ job, onProgress }) {
					calls.push(job.variantId);
					onProgress(0.4);
					onProgress(1);
					return {
						success: true,
						buffer: new Uint8Array(
							job.variantId === "master-a" ? [1, 2, 3] : [4, 5],
						).buffer,
					};
				},
			},
		});

		expect(calls).toEqual(["master-a", "master-b"]);
		expect(completed.status).toBe("completed");
		expect(completed.progress).toBe(1);
		expect(completed.jobs[0].artifact).toMatchObject({
			mimeType: "video/mp4",
			byteLength: 3,
		});
		expect(completed.jobs[0].artifact?.fileName.endsWith(".mp4")).toBe(true);
		expect(completed.jobs[1].artifact).toMatchObject({
			mimeType: "video/webm",
			byteLength: 2,
		});
		expect(completed.jobs[1].artifact?.fileName.endsWith(".webm")).toBe(true);
		expect(completed.jobs[0].measurements).toMatchObject({
			encodedByteLength: 3,
			renderElapsedMs: 25,
			loudness: {
				state: "not-measured",
				measuredIntegratedLufs: null,
				targetIntegratedLufs: -14,
			},
			encodedDuration: {
				state: "not-probed",
				measuredSeconds: null,
			},
		});
		expect(
			snapshots.some(
				(statuses) => statuses[0] === "rendering" && statuses[1] === "queued",
			),
		).toBe(true);
	});

	test("cancels the active renderer and every remaining queued variant", async () => {
		const queue = createExportJobQueue({
			manifest: manifest({
				variants: [
					{
						id: "one",
						label: "One",
						platform: "generic",
						aspectRatio: "16:9",
					},
					{
						id: "two",
						label: "Two",
						platform: "generic",
						aspectRatio: "16:9",
					},
				],
			}),
			runtime: runtime(),
			queueId: "queue-cancel",
		});
		const controller = new AbortController();

		const cancelled = await runExportJobQueue({
			queue,
			signal: controller.signal,
			renderer: {
				async render() {
					controller.abort();
					return { success: false, cancelled: true };
				},
			},
		});

		expect(cancelled.status).toBe("cancelled");
		expect(cancelled.jobs.map((job) => job.status)).toEqual([
			"cancelled",
			"cancelled",
		]);
	});

	test("marks an interrupted render failed and cancels work that never started", () => {
		const queue = createExportJobQueue({
			manifest: manifest({
				variants: [
					{
						id: "one",
						label: "One",
						platform: "generic",
						aspectRatio: "16:9",
					},
					{
						id: "two",
						label: "Two",
						platform: "generic",
						aspectRatio: "16:9",
					},
				],
			}),
			runtime: runtime(),
			queueId: "queue-interrupted",
		});
		const interruptedInput = {
			...queue,
			status: "rendering" as const,
			jobs: queue.jobs.map((job, index) =>
				index === 0
					? { ...job, status: "rendering" as const, progress: 0.5 }
					: job,
			),
		};

		const interrupted = markInterruptedExportQueue({
			queue: interruptedInput,
			at: "2026-07-27T01:00:00.000Z",
		});

		expect(interrupted.status).toBe("failed");
		expect(interrupted.jobs[0].failure?.code).toBe("RENDER_INTERRUPTED");
		expect(interrupted.jobs.map((job) => job.status)).toEqual([
			"failed",
			"cancelled",
		]);
	});

	test("persists completed Blob artifacts for later download", async () => {
		const storage = new MemoryExportJobStorage();
		const firstStore = new ExportJobStore(storage);
		const queue = createExportJobQueue({
			manifest: manifest({
				variants: [
					{
						id: "master",
						label: "Master",
						platform: "generic",
						aspectRatio: "16:9",
					},
				],
			}),
			runtime: runtime(),
			queueId: "queue-persist",
		});
		const completed = await runExportJobQueue({
			queue,
			signal: new AbortController().signal,
			renderer: {
				async render() {
					return {
						success: true,
						buffer: new Uint8Array([9, 8, 7, 6]).buffer,
					};
				},
			},
		});

		firstStore.setProject(completed);
		await firstStore.flush();
		const restored = await new ExportJobStore(storage).loadProject("project-1");

		expect(restored?.jobs[0].artifact?.blob).toBeInstanceOf(Blob);
		expect(restored?.jobs[0].artifact?.blob.size).toBe(4);
		expect(
			Array.from(
				new Uint8Array(
					await (restored?.jobs[0].artifact?.blob ?? new Blob()).arrayBuffer(),
				),
			),
		).toEqual([9, 8, 7, 6]);
	});
});
