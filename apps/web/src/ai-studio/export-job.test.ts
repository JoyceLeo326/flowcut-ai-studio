import { describe, expect, test } from "bun:test";
import { createExportManifest, type ExportManifest } from "./export-manifest";
import {
	createExportJobQueue,
	createResumableExportJobQueue,
	hasDownloadableExportArtifact,
	isRetryableExportJob,
	markInterruptedExportQueue,
	runExportJobQueue,
	type ExportRuntimeSnapshot,
} from "./export-job";
import {
	createExportArtifactBundle,
	ExportJobStore,
	getDownloadableExportArtifacts,
	isExportJobQueue,
	MemoryExportJobStorage,
} from "./export-job-store";

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

	test("accepts a one-pixel canvas rounding difference but still rejects a real reframe", () => {
		const queue = createExportJobQueue({
			manifest: manifest({
				projectCanvasSize: { width: 608, height: 1080 },
				variants: [
					{
						id: "vertical",
						label: "9:16 delivery",
						platform: "douyin",
						aspectRatio: "9:16",
					},
					{
						id: "portrait",
						label: "4:5 delivery",
						platform: "xiaohongshu",
						aspectRatio: "4:5",
					},
				],
			}),
			runtime: runtime({ width: 608, height: 1080 }),
			queueId: "queue-rounded-canvas",
		});

		expect(queue.jobs[0]).toMatchObject({
			status: "queued",
			capability: { state: "supported" },
			output: { width: 1080, height: 1920 },
		});
		expect(queue.jobs[1]).toMatchObject({
			status: "failed",
			capability: { state: "rejected" },
			failure: { code: "REFRAME_NOT_REVIEWED" },
			output: { width: 1080, height: 1350 },
		});
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

	test("marks a persisted queued-only session cancelled instead of leaving it stuck", () => {
		const queue = createExportJobQueue({
			manifest: manifest({
				variants: [
					{
						id: "one",
						label: "One",
						platform: "generic",
						aspectRatio: "16:9",
					},
				],
			}),
			runtime: runtime(),
			queueId: "queue-not-started",
		});

		const restored = markInterruptedExportQueue({
			queue,
			at: "2026-07-27T01:00:00.000Z",
		});

		expect(restored.status).toBe("cancelled");
		expect(restored.jobs[0].status).toBe("cancelled");
		expect(isRetryableExportJob(restored.jobs[0])).toBe(true);
	});

	test("retries only unfinished supported work and reuses verified completed artifacts", async () => {
		const exportManifest = manifest({
			variants: [
				{
					id: "master-a",
					label: "YouTube master",
					platform: "youtube",
					aspectRatio: "16:9",
				},
				{
					id: "master-b",
					label: "Bilibili master",
					platform: "bilibili",
					aspectRatio: "16:9",
				},
			],
		});
		const first = createExportJobQueue({
			manifest: exportManifest,
			runtime: runtime(),
			queueId: "queue-first",
		});
		let callCount = 0;
		const partial = await runExportJobQueue({
			queue: first,
			signal: new AbortController().signal,
			renderer: {
				async render({ job }) {
					callCount += 1;
					return job.variantId === "master-a"
						? { success: true, buffer: new Uint8Array([1, 2, 3]).buffer }
						: { success: false, error: "temporary renderer failure" };
				},
			},
		});

		const retry = createResumableExportJobQueue({
			manifest: exportManifest,
			runtime: runtime(),
			previousQueue: partial,
			createdAt: "2026-07-27T02:00:00.000Z",
			queueId: "queue-retry",
		});

		expect(callCount).toBe(2);
		expect(retry.retryOfQueueId).toBe("queue-first");
		expect(retry.reusedArtifactCount).toBe(1);
		expect(retry.jobs.map((job) => job.status)).toEqual([
			"completed",
			"queued",
		]);
		expect(retry.jobs[0].artifactOrigin).toBe("reused-local-artifact");
		expect(retry.jobs[0].attempt).toBe(1);
		expect(retry.jobs[1].attempt).toBe(2);

		const retryCalls: string[] = [];
		const completed = await runExportJobQueue({
			queue: retry,
			signal: new AbortController().signal,
			renderer: {
				async render({ job }) {
					retryCalls.push(job.variantId);
					return { success: true, buffer: new Uint8Array([4, 5]).buffer };
				},
			},
		});

		expect(retryCalls).toEqual(["master-b"]);
		expect(completed.status).toBe("completed");
		expect(completed.jobs[0].artifact?.byteLength).toBe(3);
		expect(completed.jobs[1].artifactOrigin).toBe("rendered-this-queue");
	});

	test("does not reuse an artifact whose output contract or bytes are invalid", async () => {
		const exportManifest = manifest({
			variants: [
				{
					id: "master",
					label: "Master",
					platform: "generic",
					aspectRatio: "16:9",
				},
			],
		});
		const completed = await runExportJobQueue({
			queue: createExportJobQueue({
				manifest: exportManifest,
				runtime: runtime(),
				queueId: "queue-invalid-artifact",
			}),
			signal: new AbortController().signal,
			renderer: {
				async render() {
					return { success: true, buffer: new Uint8Array([1, 2]).buffer };
				},
			},
		});
		const corrupt = {
			...completed,
			jobs: completed.jobs.map((job) => ({
				...job,
				artifact: job.artifact
					? { ...job.artifact, byteLength: job.artifact.byteLength + 1 }
					: null,
			})),
		};

		expect(hasDownloadableExportArtifact(corrupt.jobs[0])).toBe(false);
		expect(isExportJobQueue(corrupt)).toBe(false);
		const retry = createResumableExportJobQueue({
			manifest: exportManifest,
			runtime: runtime(),
			previousQueue: corrupt,
			queueId: "queue-no-reuse",
		});
		expect(retry.reusedArtifactCount).toBe(0);
		expect(retry.jobs[0].status).toBe("queued");
		expect(retry.jobs[0].attempt).toBe(2);
	});

	test("does not reuse a same-named artifact when the platform output contract changed", async () => {
		const originalManifest = manifest({
			variants: [
				{
					id: "master",
					label: "Master",
					platform: "youtube",
					aspectRatio: "16:9",
				},
			],
		});
		const completed = await runExportJobQueue({
			queue: createExportJobQueue({
				manifest: originalManifest,
				runtime: runtime(),
				queueId: "queue-platform-original",
			}),
			signal: new AbortController().signal,
			renderer: {
				async render() {
					return { success: true, buffer: new Uint8Array([1]).buffer };
				},
			},
		});
		const changedPlatformManifest = manifest({
			variants: [
				{
					id: "master",
					label: "Master",
					platform: "bilibili",
					aspectRatio: "16:9",
				},
			],
		});
		const sameManifestIdQueue = {
			...completed,
			manifestId: changedPlatformManifest.manifestId,
			jobs: completed.jobs.map((job) => ({
				...job,
				output: {
					...job.output,
					fileName:
						changedPlatformManifest.intent.variants[0].plannedFiles.video,
				},
				artifact: job.artifact
					? {
							...job.artifact,
							fileName:
								changedPlatformManifest.intent.variants[0].plannedFiles.video,
						}
					: null,
			})),
		};

		const retry = createResumableExportJobQueue({
			manifest: changedPlatformManifest,
			runtime: runtime(),
			previousQueue: sameManifestIdQueue,
			queueId: "queue-platform-changed",
		});

		expect(retry.reusedArtifactCount).toBe(0);
		expect(retry.jobs[0].status).toBe("queued");
	});

	test("treats an empty renderer buffer as a failed non-downloadable result", async () => {
		const failed = await runExportJobQueue({
			queue: createExportJobQueue({
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
			}),
			signal: new AbortController().signal,
			renderer: {
				async render() {
					return { success: true, buffer: new ArrayBuffer(0) };
				},
			},
		});

		expect(failed.jobs[0].failure?.code).toBe("RENDERER_RETURNED_EMPTY_BUFFER");
		expect(failed.jobs[0].artifact).toBeNull();
		expect(getDownloadableExportArtifacts(failed)).toHaveLength(0);
	});

	test("builds a standards-based local ZIP with stable platform file names", async () => {
		const exportManifest = manifest({
			variants: [
				{
					id: "youtube",
					label: "Landscape master",
					platform: "youtube",
					aspectRatio: "16:9",
				},
				{
					id: "bilibili",
					label: "Bilibili master",
					platform: "bilibili",
					aspectRatio: "16:9",
				},
			],
		});
		const completed = await runExportJobQueue({
			queue: createExportJobQueue({
				manifest: exportManifest,
				runtime: runtime(),
				queueId: "queue-bundle",
			}),
			signal: new AbortController().signal,
			renderer: {
				async render({ job }) {
					return {
						success: true,
						buffer: new Uint8Array(
							job.variantId === "youtube" ? [1, 2, 3] : [4, 5],
						).buffer,
					};
				},
			},
		});

		const bundle = await createExportArtifactBundle(completed);
		const bytes = new Uint8Array(await bundle.blob.arrayBuffer());
		const decoded = new TextDecoder().decode(bytes);

		expect(bundle.fileName).toBe("Launch-Film_visioncut-delivery.zip");
		expect(bundle.mimeType).toBe("application/zip");
		expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(0x04034b50);
		expect(new DataView(bytes.buffer).getUint32(bytes.length - 22, true)).toBe(
			0x06054b50,
		);
		expect(decoded).toContain(completed.jobs[0].output.fileName);
		expect(decoded).toContain(completed.jobs[1].output.fileName);
		expect(getDownloadableExportArtifacts(completed)).toHaveLength(2);
	});

	test("refuses a delivery bundle when persisted artifacts collide by file name", async () => {
		const completed = await runExportJobQueue({
			queue: createExportJobQueue({
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
			}),
			signal: new AbortController().signal,
			renderer: {
				async render({ job }) {
					return {
						success: true,
						buffer: new Uint8Array(job.variantId === "one" ? [1] : [2]).buffer,
					};
				},
			},
		});
		const firstFileName = completed.jobs[0].output.fileName;
		const collision = {
			...completed,
			jobs: completed.jobs.map((job, index) =>
				index === 0
					? job
					: {
							...job,
							output: { ...job.output, fileName: firstFileName },
							artifact: job.artifact
								? { ...job.artifact, fileName: firstFileName }
								: null,
						},
			),
		};

		await expect(createExportArtifactBundle(collision)).rejects.toThrow(
			"存在重复文件名",
		);
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
