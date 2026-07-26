import { describe, expect, test } from "bun:test";
import {
	IndexedDBTranscriptArtifactStorage,
	MemoryTranscriptArtifactStorage,
	TRANSCRIPT_ARTIFACT_KIND,
	TRANSCRIPT_ARTIFACT_SCHEMA_VERSION,
	TranscriptArtifactConflictError,
	TranscriptArtifactCorruptionError,
	TranscriptArtifactValidationError,
	appendTimelineTranscriptArtifact,
	createTimelineTranscriptArtifact,
	listTimelineTranscriptArtifacts,
	loadLatestTimelineTranscriptArtifact,
	loadTimelineTranscriptArtifactRevision,
	parseTimelineTranscriptArtifact,
	parseTimelineTranscriptHistory,
	type TimelineTranscriptArtifact,
	type TimelineTranscriptArtifactDraft,
	type TimelineTranscriptHistory,
	type TranscriptArtifactStorageAdapter,
} from "./transcript-artifact";

function localDraft({
	projectId = "project-transcript",
	sceneId = "scene-main",
	timelineId = "scene-main",
	captionTrackId = "track-captions",
}: {
	projectId?: string;
	sceneId?: string;
	timelineId?: string;
	captionTrackId?: string;
} = {}): TimelineTranscriptArtifactDraft {
	return {
		projectId,
		sceneId,
		timelineId,
		captionTrackId,
		language: {
			code: "zh",
			basis: "user-selected",
			verified: false,
		},
		provenance: "local-whisper",
		sourceMetadata: {
			kind: "local-whisper",
			runtimePackage: "@huggingface/transformers",
			modelId: "whisper-small",
			modelRepository: "onnx-community/whisper-small",
			audioSource: "active-timeline-mix",
			mediaStored: false,
			apiKeyStored: false,
		},
		fullText: "第一段内容。 第二段内容。",
		segments: [
			{
				text: "第一段内容。",
				startSeconds: 0.125,
				endSeconds: 1.875,
			},
			{
				text: "第二段内容。",
				startSeconds: 2.125,
				endSeconds: 4.5,
			},
		],
	};
}

function importedDraft({
	projectId = "project-transcript",
	sceneId = "scene-main",
	timelineId = "scene-main",
	captionTrackId = "track-imported",
}: {
	projectId?: string;
	sceneId?: string;
	timelineId?: string;
	captionTrackId?: string;
} = {}): TimelineTranscriptArtifactDraft {
	return {
		projectId,
		sceneId,
		timelineId,
		captionTrackId,
		language: {
			code: "und",
			basis: "subtitle-file-not-declared",
			verified: false,
		},
		provenance: "imported-subtitle",
		sourceMetadata: {
			kind: "imported-subtitle",
			fileName: "launch.zh-CN.srt",
			format: "srt",
			mimeType: "application/x-subrip",
			sizeBytes: 1_024,
			lastModified: 1_752_120_000_000,
			fileContentStored: false,
			apiKeyStored: false,
		},
		fullText: "欢迎使用 VisionCut\n由证据驱动剪辑",
		segments: [
			{
				text: "欢迎使用 VisionCut",
				startSeconds: 0,
				endSeconds: 1.2,
			},
			{
				text: "由证据驱动剪辑",
				startSeconds: 1.5,
				endSeconds: 3.75,
			},
		],
	};
}

function createLocalArtifact({
	revision = 1,
	previousArtifactFingerprint = null,
	draft = localDraft(),
}: {
	revision?: number;
	previousArtifactFingerprint?:
		| TimelineTranscriptArtifact["contentFingerprint"]
		| null;
	draft?: TimelineTranscriptArtifactDraft;
} = {}): TimelineTranscriptArtifact {
	return createTimelineTranscriptArtifact({
		draft,
		revision,
		createdAt: `2026-07-27T00:00:0${revision}.000Z`,
		previousArtifactFingerprint,
	});
}

function readonlyStorage({
	value,
}: {
	value: unknown;
}): TranscriptArtifactStorageAdapter {
	return {
		readProject: async () => structuredClone(value),
		writeProject: async () => {
			throw new Error("Unexpected write.");
		},
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordAt({
	value,
	index,
	label,
}: {
	value: unknown;
	index: number;
	label: string;
}): Record<string, unknown> {
	if (!Array.isArray(value) || !isRecord(value[index])) {
		throw new Error(`Expected ${label}.`);
	}
	return value[index];
}

function requireHistory({
	value,
	projectId = "project-transcript",
}: {
	value: unknown;
	projectId?: string;
}): TimelineTranscriptHistory {
	const history = parseTimelineTranscriptHistory({
		value,
		expectedProjectId: projectId,
	});
	if (history === null) {
		throw new Error("Expected a valid transcript history fixture.");
	}
	return history;
}

describe("timeline transcript artifact protocol", () => {
	test("creates a strict, deeply frozen local Whisper evidence artifact", () => {
		const artifact = createLocalArtifact();

		expect(artifact.kind).toBe(TRANSCRIPT_ARTIFACT_KIND);
		expect(artifact.schemaVersion).toBe(TRANSCRIPT_ARTIFACT_SCHEMA_VERSION);
		expect(artifact.provenance).toBe("local-whisper");
		expect(artifact.sourceMetadata).toEqual({
			kind: "local-whisper",
			runtimePackage: "@huggingface/transformers",
			modelId: "whisper-small",
			modelRepository: "onnx-community/whisper-small",
			audioSource: "active-timeline-mix",
			mediaStored: false,
			apiKeyStored: false,
		});
		expect(artifact.segments).toEqual([
			{
				id: "segment_000001",
				index: 0,
				text: "第一段内容。",
				startSeconds: 0.125,
				endSeconds: 1.875,
			},
			{
				id: "segment_000002",
				index: 1,
				text: "第二段内容。",
				startSeconds: 2.125,
				endSeconds: 4.5,
			},
		]);
		expect(artifact.contentFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/u);
		expect(artifact.limitations).toMatchObject({
			timestampGranularity: "segment",
			wordTimestamps: false,
			speakerDiarization: false,
			personIdentification: false,
			emotionInference: false,
			languageVerified: false,
		});
		expect(artifact.dataPolicy).toEqual({
			transcriptOnly: true,
			originalMediaStored: false,
			importedFileStored: false,
			apiKeysStored: false,
		});
		expect(Object.isFrozen(artifact)).toBe(true);
		expect(Object.isFrozen(artifact.segments)).toBe(true);
		expect(Object.isFrozen(artifact.segments[0])).toBe(true);
		expect(Object.isFrozen(artifact.sourceMetadata)).toBe(true);
	});

	test("records imported subtitle file metadata without storing the source file", () => {
		const artifact = createTimelineTranscriptArtifact({
			draft: importedDraft(),
			revision: 1,
			createdAt: "2026-07-27T00:01:00.000Z",
			previousArtifactFingerprint: null,
		});

		expect(artifact.language).toEqual({
			code: "und",
			basis: "subtitle-file-not-declared",
			verified: false,
		});
		expect(artifact.sourceMetadata).toEqual({
			kind: "imported-subtitle",
			fileName: "launch.zh-CN.srt",
			format: "srt",
			mimeType: "application/x-subrip",
			sizeBytes: 1_024,
			lastModified: 1_752_120_000_000,
			fileContentStored: false,
			apiKeyStored: false,
		});
		expect(artifact.fullText).toBe("欢迎使用 VisionCut\n由证据驱动剪辑");
		expect(JSON.stringify(artifact)).not.toContain('"apiKey":');
		expect(JSON.stringify(artifact)).not.toContain("ArrayBuffer");
		expect(JSON.stringify(artifact)).not.toContain("data:");
	});

	test("detects text, timing, id, and undeclared semantic-field corruption", () => {
		const artifact = createLocalArtifact();

		const changedText = structuredClone(artifact);
		Reflect.set(
			recordAt({
				value: Reflect.get(changedText, "segments"),
				index: 0,
				label: "first transcript segment",
			}),
			"text",
			"被篡改",
		);
		expect(parseTimelineTranscriptArtifact({ value: changedText })).toBeNull();

		const changedTime = structuredClone(artifact);
		Reflect.set(
			recordAt({
				value: Reflect.get(changedTime, "segments"),
				index: 0,
				label: "first transcript segment",
			}),
			"endSeconds",
			9,
		);
		expect(parseTimelineTranscriptArtifact({ value: changedTime })).toBeNull();

		const changedId = structuredClone(artifact);
		Reflect.set(changedId, "artifactId", "transcript_fake_r1");
		expect(parseTimelineTranscriptArtifact({ value: changedId })).toBeNull();

		const inventedSpeaker = structuredClone(artifact);
		Reflect.set(
			recordAt({
				value: Reflect.get(inventedSpeaker, "segments"),
				index: 0,
				label: "first transcript segment",
			}),
			"speaker",
			"Speaker 1",
		);
		expect(
			parseTimelineTranscriptArtifact({ value: inventedSpeaker }),
		).toBeNull();

		const inventedEmotion = structuredClone(artifact);
		Reflect.set(inventedEmotion, "emotion", "excited");
		expect(
			parseTimelineTranscriptArtifact({ value: inventedEmotion }),
		).toBeNull();
	});

	test("rejects invalid time ranges, out-of-order segments, and provenance claims", () => {
		expect(() =>
			createLocalArtifact({
				draft: {
					...localDraft(),
					segments: [{ text: "invalid", startSeconds: 2, endSeconds: 2 }],
				},
			}),
		).toThrow(TranscriptArtifactValidationError);

		expect(() =>
			createLocalArtifact({
				draft: {
					...localDraft(),
					segments: [
						{ text: "later", startSeconds: 4, endSeconds: 5 },
						{ text: "earlier", startSeconds: 1, endSeconds: 2 },
					],
				},
			}),
		).toThrow(TranscriptArtifactValidationError);

		expect(() =>
			createLocalArtifact({
				draft: {
					...localDraft(),
					provenance: "imported-subtitle",
				},
			}),
		).toThrow(TranscriptArtifactValidationError);
	});

	test("binds exact segment timing changes into the content fingerprint", () => {
		const first = createLocalArtifact();
		const second = createLocalArtifact({
			draft: {
				...localDraft(),
				segments: [
					{
						text: "第一段内容。",
						startSeconds: 0.126,
						endSeconds: 1.875,
					},
					localDraft().segments[1],
				],
			},
		});

		expect(first.contentFingerprint).not.toBe(second.contentFingerprint);
		expect(first.artifactId).not.toBe(second.artifactId);
	});
});

describe("append-only transcript artifact persistence", () => {
	test("appends contiguous revisions and loads latest and historical evidence", async () => {
		const storage = new MemoryTranscriptArtifactStorage();
		const first = await appendTimelineTranscriptArtifact({
			draft: localDraft(),
			createdAt: "2026-07-27T01:00:00.000Z",
			storage,
		});
		const second = await appendTimelineTranscriptArtifact({
			draft: importedDraft(),
			createdAt: "2026-07-27T01:01:00.000Z",
			storage,
		});

		expect(first.revision).toBe(1);
		expect(first.previousArtifactFingerprint).toBeNull();
		expect(second.revision).toBe(2);
		expect(second.previousArtifactFingerprint).toBe(first.contentFingerprint);

		const history = await listTimelineTranscriptArtifacts({
			projectId: "project-transcript",
			sceneId: "scene-main",
			timelineId: "scene-main",
			storage,
		});
		expect(history.map((artifact) => artifact.revision)).toEqual([1, 2]);
		expect(Object.isFrozen(history)).toBe(true);
		expect(
			(
				await loadLatestTimelineTranscriptArtifact({
					projectId: "project-transcript",
					sceneId: "scene-main",
					timelineId: "scene-main",
					storage,
				})
			)?.artifactId,
		).toBe(second.artifactId);
		expect(
			(
				await loadTimelineTranscriptArtifactRevision({
					projectId: "project-transcript",
					sceneId: "scene-main",
					timelineId: "scene-main",
					revision: 1,
					storage,
				})
			)?.artifactId,
		).toBe(first.artifactId);
	});

	test("maintains independent revision chains for different scene timelines", async () => {
		const storage = new MemoryTranscriptArtifactStorage();
		const sceneOne = await appendTimelineTranscriptArtifact({
			draft: localDraft(),
			createdAt: "2026-07-27T02:00:00.000Z",
			storage,
		});
		const sceneTwo = await appendTimelineTranscriptArtifact({
			draft: localDraft({
				sceneId: "scene-b",
				timelineId: "timeline-b",
				captionTrackId: "track-b",
			}),
			createdAt: "2026-07-27T02:01:00.000Z",
			storage,
		});
		const sceneOneAgain = await appendTimelineTranscriptArtifact({
			draft: importedDraft(),
			createdAt: "2026-07-27T02:02:00.000Z",
			storage,
		});

		expect(sceneOne.revision).toBe(1);
		expect(sceneTwo.revision).toBe(1);
		expect(sceneTwo.previousArtifactFingerprint).toBeNull();
		expect(sceneOneAgain.revision).toBe(2);
		expect(sceneOneAgain.previousArtifactFingerprint).toBe(
			sceneOne.contentFingerprint,
		);
		const stored = requireHistory({
			value: await storage.readProject({
				projectId: "project-transcript",
			}),
		});
		expect(stored.revision).toBe(3);
		expect(stored.artifacts).toHaveLength(3);
	});

	test("isolates projects and rejects a collection returned for another project", async () => {
		const storage = new MemoryTranscriptArtifactStorage();
		await appendTimelineTranscriptArtifact({
			draft: localDraft({ projectId: "project-one" }),
			createdAt: "2026-07-27T03:00:00.000Z",
			storage,
		});
		await appendTimelineTranscriptArtifact({
			draft: localDraft({
				projectId: "project-two",
				captionTrackId: "track-two",
			}),
			createdAt: "2026-07-27T03:01:00.000Z",
			storage,
		});

		expect(
			await listTimelineTranscriptArtifacts({
				projectId: "project-one",
				storage,
			}),
		).toHaveLength(1);
		expect(
			await listTimelineTranscriptArtifacts({
				projectId: "project-two",
				storage,
			}),
		).toHaveLength(1);

		const projectOneValue = await storage.readProject({
			projectId: "project-one",
		});
		await expect(
			listTimelineTranscriptArtifacts({
				projectId: "project-two",
				storage: readonlyStorage({ value: projectOneValue }),
			}),
		).rejects.toBeInstanceOf(TranscriptArtifactCorruptionError);
	});

	test("detects damaged collection content, revision removal, and chain damage", async () => {
		const storage = new MemoryTranscriptArtifactStorage();
		await appendTimelineTranscriptArtifact({
			draft: localDraft(),
			createdAt: "2026-07-27T04:00:00.000Z",
			storage,
		});
		await appendTimelineTranscriptArtifact({
			draft: importedDraft(),
			createdAt: "2026-07-27T04:01:00.000Z",
			storage,
		});
		const stored = requireHistory({
			value: await storage.readProject({
				projectId: "project-transcript",
			}),
		});

		const changedText = structuredClone(stored);
		const changedTextArtifact = recordAt({
			value: Reflect.get(changedText, "artifacts"),
			index: 0,
			label: "first transcript artifact",
		});
		Reflect.set(
			recordAt({
				value: Reflect.get(changedTextArtifact, "segments"),
				index: 0,
				label: "first transcript segment",
			}),
			"text",
			"corrupt",
		);
		await expect(
			listTimelineTranscriptArtifacts({
				projectId: "project-transcript",
				storage: readonlyStorage({ value: changedText }),
			}),
		).rejects.toBeInstanceOf(TranscriptArtifactCorruptionError);

		const removedRevision = structuredClone(stored);
		const removedArtifacts = Reflect.get(removedRevision, "artifacts");
		if (!Array.isArray(removedArtifacts)) {
			throw new Error("Expected transcript artifacts.");
		}
		removedArtifacts.pop();
		await expect(
			listTimelineTranscriptArtifacts({
				projectId: "project-transcript",
				storage: readonlyStorage({ value: removedRevision }),
			}),
		).rejects.toBeInstanceOf(TranscriptArtifactCorruptionError);

		const changedChain = structuredClone(stored);
		Reflect.set(
			recordAt({
				value: Reflect.get(changedChain, "artifacts"),
				index: 1,
				label: "second transcript artifact",
			}),
			"previousArtifactFingerprint",
			null,
		);
		await expect(
			listTimelineTranscriptArtifacts({
				projectId: "project-transcript",
				storage: readonlyStorage({ value: changedChain }),
			}),
		).rejects.toBeInstanceOf(TranscriptArtifactCorruptionError);
	});

	test("enforces compare-and-append storage revisions", async () => {
		const storage = new MemoryTranscriptArtifactStorage();
		await appendTimelineTranscriptArtifact({
			draft: localDraft(),
			createdAt: "2026-07-27T05:00:00.000Z",
			storage,
		});
		const stored = requireHistory({
			value: await storage.readProject({
				projectId: "project-transcript",
			}),
		});

		await expect(
			storage.writeProject({
				projectId: "project-transcript",
				value: stored,
				expectedRevision: 0,
			}),
		).rejects.toBeInstanceOf(TranscriptArtifactConflictError);
	});

	test("uses the SSR memory fallback when IndexedDB is unavailable", async () => {
		const fallback = new MemoryTranscriptArtifactStorage();
		const storage = new IndexedDBTranscriptArtifactStorage({
			indexedDBFactory: null,
			fallback,
		});
		const artifact = await appendTimelineTranscriptArtifact({
			draft: localDraft(),
			createdAt: "2026-07-27T06:00:00.000Z",
			storage,
		});

		expect(
			(
				await loadLatestTimelineTranscriptArtifact({
					projectId: "project-transcript",
					sceneId: "scene-main",
					timelineId: "scene-main",
					storage,
				})
			)?.artifactId,
		).toBe(artifact.artifactId);
		expect(
			await fallback.readProject({ projectId: "project-transcript" }),
		).not.toBeNull();
	});

	test("does not mutate draft inputs while appending", async () => {
		const storage = new MemoryTranscriptArtifactStorage();
		const draft = localDraft();
		const before = structuredClone(draft);

		await appendTimelineTranscriptArtifact({
			draft,
			createdAt: "2026-07-27T07:00:00.000Z",
			storage,
		});

		expect(draft).toEqual(before);
		expect(Object.isFrozen(draft)).toBe(false);
	});
});
