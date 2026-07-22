import { describe, expect, test } from "bun:test";
import {
	IndexedDBProjectVersionStorage,
	MemoryProjectVersionStorage,
	ProjectVersionValidationError,
	appendProjectVersion,
	createProjectVersion,
	deleteProjectVersions,
	exportProjectVersions,
	listProjectVersions,
	loadProjectVersion,
	loadProjectVersionLedger,
	parseProjectVersion,
	parseProjectVersionLedger,
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
});
