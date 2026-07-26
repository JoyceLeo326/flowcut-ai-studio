import { describe, expect, test } from "bun:test";
import { installMockWasm } from "@/test-utils/mock-wasm";

installMockWasm();

const { createDefaultCreativeBrief } = await import("@/ai-edit/brief");
const { createEditPlan } = await import("@/ai-edit/planner");
const { DEFAULT_STUDIO_PRO_SETTINGS } = await import("./catalog");
const { createIntentSpec } = await import("./intent-spec");
const { deriveStoryGraph } = await import("./story-graph-model");
const {
	createProjectCreativeStateSnapshot,
	parseProjectCreativeStateSnapshot,
} = await import("./project-creative-state");
const {
	createProjectVersionRestorePayload,
	parseProjectVersionRestorePayload,
} = await import("./project-version-store");

const PROJECT_ID = "project-creative-state";
const CAPTURED_AT = "2026-07-27T02:00:00.000Z";

function createSnapshot(
	storyGraph: ReturnType<typeof deriveStoryGraph> | null = null,
) {
	const intentSpec = createIntentSpec({
		projectId: PROJECT_ID,
		userIntent: "把三段口播整理成节奏自然的 60 秒竖屏版本",
		source: "editor",
		createdAt: CAPTURED_AT,
	});
	const editPlan = createEditPlan({
		prompt: intentSpec.userIntent,
		mode: "local",
		assetCount: 3,
		unusedAssetCount: 1,
		timelineElementCount: 2,
		videoClipCount: 2,
		durationSeconds: 180,
	});
	return createProjectCreativeStateSnapshot({
		projectId: PROJECT_ID,
		capturedAt: CAPTURED_AT,
		studio: {
			startingIntent: intentSpec.userIntent,
			mode: "local",
			brief: createDefaultCreativeBrief(),
			selectedRecipeId: "talking-head-cleanup",
			settings: DEFAULT_STUDIO_PRO_SETTINGS,
			extraRequest: "",
			isPlanReviewed: true,
			appliedPlanId: null,
			rememberedPlanId: null,
		},
		artifacts: {
			intentSpec,
			editPlan,
			storyGraph,
			agentOrchestration: null,
			transcriptArtifact: null,
		},
	});
}

describe("project creative state snapshot", () => {
	test("strips session-only Story Graph thumbnail URLs before version capture", () => {
		const storyGraph = deriveStoryGraph({
			projectId: PROJECT_ID,
			media: [
				{
					id: "asset-video",
					name: "Interview.mp4",
					type: "video",
					width: 1920,
					height: 1080,
					thumbnailUrl: "blob:runtime-thumbnail",
				},
			],
			scenes: [],
		});
		const snapshot = createSnapshot(storyGraph);
		expect(snapshot.artifacts.storyGraph?.nodes[0]?.assetId).toBe(
			"asset-video",
		);
		expect(snapshot.artifacts.storyGraph?.nodes[0]?.thumbnail).toBeUndefined();

		expect(() =>
			createProjectVersionRestorePayload({
				projectId: PROJECT_ID,
				snapshotId: "snapshot-with-story-graph",
				capturedAt: CAPTURED_AT,
				projectState: {
					projectId: PROJECT_ID,
					currentSceneId: "scene-main",
				},
				timelineState: {
					sceneId: "scene-main",
					scenes: [],
				},
				creativeState: snapshot,
			}),
		).not.toThrow();
	});

	test("round-trips reviewed intent and edit state without pending execution", () => {
		const snapshot = createSnapshot();
		const parsed = parseProjectCreativeStateSnapshot({
			value: structuredClone(snapshot),
		});

		expect(parsed?.projectId).toBe(PROJECT_ID);
		expect(parsed?.studio.isPlanReviewed).toBe(true);
		expect(parsed?.artifacts.intentSpec?.revision).toBe(1);
		expect(parsed?.artifacts.editPlan?.formatVersion).toBe(
			"flowcut.edit-plan/v1",
		);
		expect(parsed?.restorePolicy).toEqual({
			pendingEditDecisionRestored: false,
			creatorDNARestored: false,
			creatorDNAScope: "cross-project-reference",
			requiresFreshExecutionReview: true,
		});
	});

	test("rejects cross-project artifacts and unsafe professional settings", () => {
		const snapshot = createSnapshot();
		const mismatchedIntent = {
			...snapshot.artifacts.intentSpec,
			projectId: "another-project",
			revisions: snapshot.artifacts.intentSpec?.revisions.map((revision) => ({
				...revision,
				projectId: "another-project",
			})),
		};
		expect(
			parseProjectCreativeStateSnapshot({
				value: {
					...snapshot,
					artifacts: {
						...snapshot.artifacts,
						intentSpec: mismatchedIntent,
					},
				},
			}),
		).toBeNull();
		expect(
			parseProjectCreativeStateSnapshot({
				value: {
					...snapshot,
					studio: {
						...snapshot.studio,
						settings: {
							...snapshot.studio.settings,
							cutPaddingMs: 300,
							silenceThresholdMs: 420,
						},
					},
				},
			}),
		).toBeNull();
	});

	test("binds creative state into the immutable restore digest", () => {
		const snapshot = createSnapshot();
		const payload = createProjectVersionRestorePayload({
			projectId: PROJECT_ID,
			snapshotId: "snapshot-creative-state",
			capturedAt: CAPTURED_AT,
			projectState: {
				projectId: PROJECT_ID,
				currentSceneId: "scene-main",
			},
			timelineState: {
				sceneId: "scene-main",
				scenes: [],
			},
			creativeState: snapshot,
		});
		expect(payload.creativeState?.kind).toBe(
			"visioncut.project-creative-state",
		);

		const forged = structuredClone(payload);
		const forgedStudio = forged.creativeState?.studio;
		if (
			typeof forgedStudio === "object" &&
			forgedStudio !== null &&
			!Array.isArray(forgedStudio)
		) {
			Reflect.set(forgedStudio, "startingIntent", "forged");
		}
		expect(parseProjectVersionRestorePayload({ value: forged })).toBeNull();
	});
});
