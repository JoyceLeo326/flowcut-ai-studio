import { describe, expect, test } from "bun:test";
import {
	IndexedDBProjectVersionStorage,
	MemoryProjectVersionStorage,
	ProjectVersionValidationError,
	appendProjectVersion,
	createProjectVersion,
	createProjectVersionRestorePayload,
	deleteProjectVersions,
	exportProjectVersions,
	listProjectVersions,
	loadProjectVersion,
	loadProjectVersionLedger,
	loadProjectVersionRestorePayload,
	parseProjectVersion,
	parseProjectVersionLedger,
	parseProjectVersionRestorePayload,
	type ProjectVersionReferencePatch,
} from "./project-version-store";

const FIRST_AT = "2026-07-23T08:00:00.000Z";
const SECOND_AT = "2026-07-23T08:05:00.000Z";

function initialReferences({
	projectId,
}: {
	projectId: string;
}): ProjectVersionReferencePatch {
	return {
		intentSpec: {
			kind: "visioncut.intent-spec",
			projectId,
			revision: 1,
			updatedAt: FIRST_AT,
		},
		editPlan: {
			kind: "visioncut.edit-plan",
			projectId,
			planId: "plan_founder_story",
			revision: 1,
			versionId: "edit_plan_version_1",
		},
		storyGraph: {
			kind: "visioncut.story-graph",
			projectId,
			graphId: "story_graph_founder",
			version: 1,
		},
		automationRun: {
			kind: "visioncut.automation-run",
			projectId,
			runId: "run_local_rough_cut",
			status: "review",
			updatedAt: FIRST_AT,
		},
		timelineSnapshot: {
			kind: "visioncut.timeline-snapshot",
			projectId,
			snapshotId: "timeline_snapshot_1",
			version: 1,
		},
	};
}

function localRestorePayload({
	projectId,
	snapshotId = "restore_snapshot_1",
	capturedAt = FIRST_AT,
}: {
	projectId: string;
	snapshotId?: string;
	capturedAt?: string;
}) {
	return createProjectVersionRestorePayload({
		projectId,
		snapshotId,
		capturedAt,
		projectState: {
			id: projectId,
			name: "Founder story",
			activeSceneId: "scene-main",
			canvas: { width: 1920, height: 1080 },
		},
		timelineState: {
			sceneId: "scene-main",
			sceneName: "Main",
			tracks: [
				{
					id: "track-main",
					type: "video",
					name: "Main video",
					elements: [
						{
							id: "clip-1",
							type: "video",
							name: "Opening",
							mediaId: "asset-video-1",
							startTime: 0,
							duration: 4.5,
							trimStart: 0.25,
							trimEnd: 0,
							params: { opacity: 1, volume: 0.9 },
						},
					],
				},
			],
		},
		assets: [
			{
				assetId: "asset-video-2",
				kind: "video",
				fingerprint: "sha256:22222222",
				name: "outro.mp4",
				mimeType: "video/mp4",
				sizeBytes: 2048,
			},
			{
				assetId: "asset-video-1",
				kind: "video",
				fingerprint: "sha256:11111111",
				name: "opening.mp4",
				mimeType: "video/mp4",
				sizeBytes: 1024,
			},
		],
	});
}

function isUnknownRecord(
	value: unknown,
): value is Readonly<Record<string, unknown>> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDeepFrozen(value: unknown): boolean {
	if (value === null || typeof value !== "object") return true;
	if (!Object.isFrozen(value)) return false;
	if (Array.isArray(value)) return value.every((item) => isDeepFrozen(item));
	if (!isUnknownRecord(value)) return false;
	return Object.values(value).every((item) => isDeepFrozen(item));
}

describe("VisionCut local project version ledger", () => {
	test("creates deterministic immutable records and appends a contiguous chain", async () => {
		const projectId = "project-founder-01";
		const firstInput = {
			projectId,
			label: "Initial local plan",
			createdAt: FIRST_AT,
			source: "intent-spec" as const,
			refs: initialReferences({ projectId }),
		};
		const deterministicFirst = createProjectVersion(firstInput);
		const deterministicSecond = createProjectVersion(firstInput);

		expect(deterministicFirst).toEqual(deterministicSecond);
		expect(deterministicFirst.version).toBe(1);
		expect(deterministicFirst.parentVersionId).toBeNull();
		expect(Object.isFrozen(deterministicFirst)).toBe(true);
		expect(Object.isFrozen(deterministicFirst.refs)).toBe(true);
		expect(deterministicFirst.guarantees).toEqual({
			localOnly: true,
			accountRequired: false,
			network: false,
			paidService: false,
			referencesOnly: true,
			binaryPayloadsStored: false,
		});

		const storage = new MemoryProjectVersionStorage();
		const first = await appendProjectVersion({ ...firstInput, storage });
		const firstJson = JSON.stringify(first);
		const second = await appendProjectVersion({
			projectId,
			label: "Approved edit plan",
			createdAt: SECOND_AT,
			source: "edit-plan",
			refs: {
				editPlan: {
					kind: "visioncut.edit-plan",
					projectId,
					planId: "plan_founder_story",
					revision: 2,
					versionId: "edit_plan_version_2",
				},
				automationRun: null,
			},
			storage,
		});
		const versions = await listProjectVersions({ projectId, storage });

		expect(JSON.stringify(first)).toBe(firstJson);
		expect(versions).toHaveLength(2);
		expect(versions.map(({ version }) => version)).toEqual([1, 2]);
		expect(second.parentVersionId).toBe(first.versionId);
		expect(second.refs.intentSpec).toEqual(first.refs.intentSpec);
		expect(second.refs.storyGraph).toEqual(first.refs.storyGraph);
		expect(second.refs.timelineSnapshot).toEqual(first.refs.timelineSnapshot);
		expect(second.refs.automationRun).toBeUndefined();
		expect(second.refs.editPlan?.revision).toBe(2);
		expect(await loadProjectVersion({ projectId, storage })).toEqual(second);
		expect(
			await loadProjectVersion({
				projectId,
				versionId: first.versionId,
				storage,
			}),
		).toEqual(first);
	});

	test("isolates version chains by project and deletes only the requested project", async () => {
		const storage = new MemoryProjectVersionStorage();
		await appendProjectVersion({
			projectId: "project-a",
			label: "Project A",
			createdAt: FIRST_AT,
			source: "user",
			refs: initialReferences({ projectId: "project-a" }),
			storage,
		});
		const projectB = await appendProjectVersion({
			projectId: "project-b",
			label: "Project B",
			createdAt: FIRST_AT,
			source: "user",
			refs: initialReferences({ projectId: "project-b" }),
			storage,
		});

		expect(
			await listProjectVersions({ projectId: "project-a", storage }),
		).toHaveLength(1);
		expect(
			await listProjectVersions({ projectId: "project-b", storage }),
		).toEqual([projectB]);

		await deleteProjectVersions({ projectId: "project-a", storage });
		expect(
			await listProjectVersions({ projectId: "project-a", storage }),
		).toEqual([]);
		expect(
			await loadProjectVersion({ projectId: "project-a", storage }),
		).toBeNull();
		expect(
			await loadProjectVersion({ projectId: "project-b", storage }),
		).toEqual(projectB);
	});

	test("rejects malformed ledgers, cross-project references, and blob URLs", async () => {
		const valid = createProjectVersion({
			projectId: "project-valid",
			label: "Valid checkpoint",
			createdAt: FIRST_AT,
			source: "user",
			refs: initialReferences({ projectId: "project-valid" }),
		});
		const malformed = {
			kind: "visioncut.project-version-ledger",
			schemaVersion: 1,
			projectId: "project-valid",
			versions: [{ ...valid, versionId: "forged_version_id" }],
			guarantees: valid.guarantees,
		};
		const storage = new MemoryProjectVersionStorage({
			entries: [{ projectId: "project-valid", value: malformed }],
		});

		expect(parseProjectVersion({ value: malformed.versions[0] })).toBeNull();
		expect(parseProjectVersionLedger({ value: malformed })).toBeNull();
		expect(
			listProjectVersions({ projectId: "project-valid", storage }),
		).rejects.toBeInstanceOf(ProjectVersionValidationError);
		expect(() =>
			createProjectVersion({
				projectId: "project-valid",
				label: "Cross project",
				createdAt: FIRST_AT,
				source: "story-graph",
				refs: {
					storyGraph: {
						kind: "visioncut.story-graph",
						projectId: "another-project",
						graphId: "graph-1",
						version: 1,
					},
				},
			}),
		).toThrow("different project");
		expect(() =>
			createProjectVersion({
				projectId: "project-valid",
				label: "Runtime URL",
				createdAt: FIRST_AT,
				source: "timeline",
				refs: {
					timelineSnapshot: {
						kind: "visioncut.timeline-snapshot",
						projectId: "project-valid",
						snapshotId: "blob:runtime-object",
						version: 1,
					},
				},
			}),
		).toThrow("not a URL or runtime object reference");
	});

	test("uses the injected in-memory fallback when IndexedDB is unavailable", async () => {
		const fallback = new MemoryProjectVersionStorage();
		const storage = new IndexedDBProjectVersionStorage({
			indexedDBFactory: null,
			fallback,
		});
		const version = await appendProjectVersion({
			projectId: "ssr-project",
			label: "SSR local checkpoint",
			createdAt: FIRST_AT,
			source: "user",
			refs: initialReferences({ projectId: "ssr-project" }),
			storage,
		});

		expect(
			await loadProjectVersion({ projectId: "ssr-project", storage }),
		).toEqual(version);
		expect(
			await loadProjectVersionLedger({ projectId: "ssr-project", storage }),
		).not.toBeNull();
		await deleteProjectVersions({ projectId: "ssr-project", storage });
		expect(
			await listProjectVersions({ projectId: "ssr-project", storage }),
		).toEqual([]);
	});

	test("exports validated reference-only JSON without binary or runtime data", async () => {
		const projectId = "project-export";
		const storage = new MemoryProjectVersionStorage();
		await appendProjectVersion({
			projectId,
			label: "Portable local checkpoint",
			createdAt: FIRST_AT,
			source: "import",
			refs: initialReferences({ projectId }),
			storage,
		});

		const exported = await exportProjectVersions({ projectId, storage });
		const parsed: unknown = JSON.parse(exported);
		const ledger = parseProjectVersionLedger({ value: parsed });

		expect(ledger?.projectId).toBe(projectId);
		expect(ledger?.versions).toHaveLength(1);
		expect(exported).toContain('"referencesOnly": true');
		expect(exported).toContain('"binaryPayloadsStored": false');
		expect(exported).not.toContain('"file"');
		expect(exported).not.toContain('"blob"');
		expect(exported).not.toContain('"editorRuntime"');
	});

	test("persists a verified, deeply immutable restore payload and reloads it exactly", async () => {
		const projectId = "project-restorable";
		const storage = new MemoryProjectVersionStorage();
		const mutableProjectState = {
			id: projectId,
			name: "Launch film",
			activeSceneId: "scene-main",
		};
		const mutableTimelineState = {
			sceneId: "scene-main",
			tracks: [
				{
					id: "track-main",
					type: "video",
					elements: [
						{
							id: "clip-1",
							type: "video",
							mediaId: "asset-video-1",
							startTime: 0,
							duration: 3,
							params: { opacity: 1 },
						},
					],
				},
			],
		};
		const restorePayload = createProjectVersionRestorePayload({
			projectId,
			snapshotId: "snapshot-launch-1",
			capturedAt: FIRST_AT,
			projectState: mutableProjectState,
			timelineState: mutableTimelineState,
			assets: [
				{
					assetId: "asset-video-1",
					kind: "video",
					fingerprint: "sha256:11111111",
					name: "launch.mp4",
				},
			],
		});
		const version = await appendProjectVersion({
			projectId,
			label: "Restorable launch cut",
			createdAt: FIRST_AT,
			source: "timeline",
			refs: initialReferences({ projectId }),
			restorePayload,
			storage,
		});

		mutableProjectState.name = "Changed after capture";
		mutableTimelineState.tracks[0]!.elements[0]!.duration = 99;

		expect(version.guarantees).toEqual({
			localOnly: true,
			accountRequired: false,
			network: false,
			paidService: false,
			referencesOnly: false,
			restorablePayloadsStored: true,
			binaryPayloadsStored: false,
		});
		expect(version.restorePayload?.projectState.name).toBe("Launch film");
		expect(version.restorePayload?.timelineState).toMatchObject({
			tracks: [{ elements: [{ duration: 3 }] }],
		});
		expect(isDeepFrozen(version.restorePayload)).toBe(true);
		expect(
			version.restorePayload?.assets.map(({ assetId }) => assetId),
		).toEqual(["asset-video-1"]);
		expect(
			await loadProjectVersionRestorePayload({ projectId, storage }),
		).toEqual(restorePayload);
		expect(
			(await loadProjectVersionLedger({ projectId, storage }))?.guarantees,
		).toEqual(version.guarantees);
	});

	test("binds payload and version identities to immutable restore content", () => {
		const projectId = "project-integrity";
		const restorePayload = localRestorePayload({ projectId });
		const version = createProjectVersion({
			projectId,
			label: "Integrity checkpoint",
			createdAt: FIRST_AT,
			source: "timeline",
			refs: initialReferences({ projectId }),
			restorePayload,
		});
		const forgedPayload = {
			...structuredClone(restorePayload),
			timelineState: {
				...restorePayload.timelineState,
				tamperedDuration: 300,
			},
		};
		const forgedVersion = {
			...structuredClone(version),
			restorePayload: {
				...structuredClone(restorePayload),
				timelineState: {
					...restorePayload.timelineState,
					tamperedDuration: 300,
				},
			},
		};

		expect(
			parseProjectVersionRestorePayload({ value: forgedPayload }),
		).toBeNull();
		expect(parseProjectVersion({ value: forgedVersion })).toBeNull();

		const changedPayload = createProjectVersionRestorePayload({
			projectId,
			snapshotId: restorePayload.snapshotId,
			capturedAt: restorePayload.capturedAt,
			projectState: restorePayload.projectState,
			timelineState: {
				...restorePayload.timelineState,
				reviewState: "approved",
			},
			assets: restorePayload.assets,
		});
		const changedVersion = createProjectVersion({
			projectId,
			label: "Integrity checkpoint",
			createdAt: FIRST_AT,
			source: "timeline",
			refs: initialReferences({ projectId }),
			restorePayload: changedPayload,
		});
		expect(changedPayload.integrity.digest).not.toBe(
			restorePayload.integrity.digest,
		);
		expect(changedVersion.versionId).not.toBe(version.versionId);
	});

	test("rejects cross-project, unknown-field, binary, and runtime URL restore data", () => {
		const projectId = "project-restore-guard";
		const restorePayload = localRestorePayload({ projectId });

		expect(() =>
			createProjectVersion({
				projectId: "another-project",
				label: "Cross-project restore",
				createdAt: FIRST_AT,
				source: "timeline",
				refs: initialReferences({ projectId: "another-project" }),
				restorePayload,
			}),
		).toThrow("different project");
		expect(
			parseProjectVersionRestorePayload({
				value: { ...restorePayload, editorRuntime: { ready: true } },
			}),
		).toBeNull();
		expect(() =>
			createProjectVersionRestorePayload({
				projectId,
				snapshotId: "runtime-url",
				capturedAt: FIRST_AT,
				projectState: { id: projectId },
				timelineState: {
					sceneId: "scene-main",
					previewUrl: "blob:runtime-preview",
				},
			}),
		).toThrow("runtime or binary URL");
		expect(() =>
			createProjectVersionRestorePayload({
				projectId,
				snapshotId: "binary-state",
				capturedAt: FIRST_AT,
				projectState: { id: projectId },
				timelineState: {
					sceneId: "scene-main",
					bytes: [1, 2, 3],
				},
			}),
		).toThrow("not allowed");
		expect(
			parseProjectVersionRestorePayload({
				value: {
					...restorePayload,
					timelineState: {
						sceneId: "scene-main",
						waveform: new Uint8Array([1, 2, 3]),
					},
				},
			}),
		).toBeNull();
		expect(() =>
			createProjectVersionRestorePayload({
				projectId,
				snapshotId: "missing-asset-manifest",
				capturedAt: FIRST_AT,
				projectState: { id: projectId },
				timelineState: {
					sceneId: "scene-main",
					tracks: [{ mediaId: "asset-not-listed" }],
				},
			}),
		).toThrow("missing referenced asset asset-not-listed");
		expect(() =>
			createProjectVersionRestorePayload({
				projectId,
				snapshotId: "wrong-project-state",
				capturedAt: FIRST_AT,
				projectState: { id: "another-project" },
				timelineState: { sceneId: "scene-main" },
			}),
		).toThrow("same project");
	});

	test("loads legacy ledgers without rewriting ids and lazily appends a restorable version", async () => {
		const projectId = "project-legacy-migration";
		const legacyVersion = createProjectVersion({
			projectId,
			label: "Legacy reference checkpoint",
			createdAt: FIRST_AT,
			source: "user",
			refs: initialReferences({ projectId }),
		});
		const legacyLedger = {
			kind: "visioncut.project-version-ledger",
			schemaVersion: 1,
			projectId,
			versions: [legacyVersion],
			guarantees: {
				localOnly: true,
				accountRequired: false,
				network: false,
				paidService: false,
				referencesOnly: true,
				binaryPayloadsStored: false,
			},
		};
		const storage = new MemoryProjectVersionStorage({
			entries: [{ projectId, value: legacyLedger }],
		});

		expect((await loadProjectVersion({ projectId, storage }))?.versionId).toBe(
			legacyVersion.versionId,
		);
		expect(
			await loadProjectVersionRestorePayload({ projectId, storage }),
		).toBeNull();

		const restorable = await appendProjectVersion({
			projectId,
			label: "Restorable checkpoint",
			createdAt: SECOND_AT,
			source: "timeline",
			refs: {
				timelineSnapshot: {
					kind: "visioncut.timeline-snapshot",
					projectId,
					snapshotId: "timeline_snapshot_2",
					version: 2,
				},
			},
			restorePayload: localRestorePayload({
				projectId,
				snapshotId: "restore_snapshot_2",
				capturedAt: SECOND_AT,
			}),
			storage,
		});
		const migrated = await loadProjectVersionLedger({ projectId, storage });

		expect(migrated?.versions).toHaveLength(2);
		expect(migrated?.versions[0]?.versionId).toBe(legacyVersion.versionId);
		expect(migrated?.versions[0]?.restorePayload).toBeUndefined();
		expect(migrated?.versions[0]?.guarantees.referencesOnly).toBe(true);
		expect(migrated?.versions[1]).toEqual(restorable);
		expect(migrated?.guarantees.referencesOnly).toBe(false);
	});

	test("exports a portable restore snapshot without binary media payloads", async () => {
		const projectId = "project-restore-export";
		const storage = new MemoryProjectVersionStorage();
		await appendProjectVersion({
			projectId,
			label: "Portable restorable checkpoint",
			createdAt: FIRST_AT,
			source: "timeline",
			refs: initialReferences({ projectId }),
			restorePayload: localRestorePayload({ projectId }),
			storage,
		});

		const exported = await exportProjectVersions({ projectId, storage });
		const parsed = parseProjectVersionLedger({ value: JSON.parse(exported) });

		expect(parsed?.versions[0]?.restorePayload?.timelineState.sceneId).toBe(
			"scene-main",
		);
		expect(exported).toContain('"restorablePayloadsStored": true');
		expect(exported).toContain('"integrity"');
		expect(exported).toContain('"fingerprint"');
		expect(exported).not.toContain("blob:");
		expect(exported).not.toContain("data:");
		expect(exported).not.toContain("ArrayBuffer");
		expect(exported).not.toContain('"bytes"');
	});
});
