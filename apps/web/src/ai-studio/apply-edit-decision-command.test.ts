import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { MediaAsset } from "@/media/types";
import { installMockWasm } from "@/test-utils/mock-wasm";
import type { SceneTracks } from "@/timeline";
import type {
	EditDecisionCurrentAssetState,
	EditDecisionPlan,
	EditDecisionRemoveOperation,
} from "./edit-decision-orchestrator";

let activeEditor: ReturnType<typeof createFakeEditor>;

installMockWasm();

mock.module("@/core", () => ({
	EditorCore: {
		getInstance: () => activeEditor.editor,
	},
}));

const { ApplyEditDecisionCommand } =
	await import("./apply-edit-decision-command");
const { createLocalAssetFingerprintForMediaAsset } =
	await import("./media-index-adapter");
const { mediaTimeFromSeconds } = await import("@/wasm");

const t = (seconds: number) => mediaTimeFromSeconds({ seconds });

function sceneTracks(): SceneTracks {
	return {
		main: {
			id: "main",
			name: "Main",
			type: "video",
			muted: false,
			hidden: false,
			elements: [
				{
					id: "clip-a",
					name: "A",
					type: "video",
					mediaId: "asset-a",
					startTime: t(0),
					duration: t(10),
					trimStart: t(0),
					trimEnd: t(0),
					sourceDuration: t(10),
					params: {},
				},
			],
		},
		overlay: [],
		audio: [],
	};
}

function mediaAsset(): MediaAsset {
	const file = new File(["video-bytes"], "a.mp4", {
		type: "video/mp4",
		lastModified: 101,
	});
	return {
		id: "asset-a",
		name: "a.mp4",
		type: "video",
		file,
		duration: 10,
		width: 1920,
		height: 1080,
		fps: 30,
		hasAudio: true,
	};
}

function createFakeEditor() {
	let tracks = sceneTracks();
	let sceneId = "scene-1";
	let projectId = "project-1";
	let assets = [mediaAsset()];
	let updateCount = 0;
	const editor = {
		project: {
			getActive: () => ({
				metadata: { id: projectId },
			}),
		},
		scenes: {
			getActiveScene: () => ({
				id: sceneId,
				tracks,
				bookmarks: [],
			}),
		},
		media: {
			getAssets: () => assets,
		},
		timeline: {
			updateTracks: (nextTracks: SceneTracks) => {
				tracks = nextTracks;
				updateCount += 1;
			},
		},
	};
	return {
		editor,
		getTracks: () => tracks,
		getUpdateCount: () => updateCount,
		setSceneId: (next: string) => {
			sceneId = next;
		},
		setProjectId: (next: string) => {
			projectId = next;
		},
		setAssets: (next: MediaAsset[]) => {
			assets = next;
		},
	};
}

function fixture({
	range = { startSeconds: 2, endSeconds: 3 },
}: {
	range?: { startSeconds: number; endSeconds: number };
} = {}): {
	plan: EditDecisionPlan;
	state: EditDecisionCurrentAssetState;
	operation: EditDecisionRemoveOperation;
} {
	const asset = activeEditor.editor.media.getAssets()[0];
	const inputFingerprint = createLocalAssetFingerprintForMediaAsset({ asset });
	const operation: EditDecisionRemoveOperation = {
		operationId: "remove-a",
		kind: "remove",
		assetId: "asset-a",
		sourceRange: {
			unit: "seconds",
			...range,
		},
		inputFingerprint,
		mediaIndexId: "index-a",
		evidenceIds: ["energy-window-a"],
		reason: "Measured low-energy interval; no semantic claim.",
		availability: "suggestion",
		availabilityReason: "Human review is required.",
		requiresExplicitReview: true,
	};
	const plan: EditDecisionPlan = {
		kind: "visioncut.edit-decision-plan",
		schemaVersion: 1,
		planId: "plan-1",
		projectId: "project-1",
		createdAt: "2026-07-27T00:00:00.000Z",
		intent: {
			revision: 1,
			userIntent: "Remove the reviewed pause.",
		},
		editPlan: {
			planId: "edit-plan-1",
			formatVersion: "flowcut.edit-plan/v1",
			mode: "local",
			prompt: "Remove the reviewed pause.",
			target: {
				platform: "generic",
				label: "General",
				aspectRatio: "16:9",
				style: "documentary",
			},
		},
		storyGraph: null,
		inputs: {
			assets: [
				{
					assetId: "asset-a",
					inputFingerprint,
					mediaIndexId: "index-a",
					mediaIndexAlgorithmVersion: "test/1",
					durationSeconds: 10,
					sourceOrder: 0,
					storyGraphNodeIds: [],
				},
			],
		},
		suggestedAssetOrder: ["asset-a"],
		primaryCandidateAssetId: "asset-a",
		operations: [operation],
		limitations: ["No semantic claim."],
		guarantees: {
			localOnly: true,
			deterministic: true,
			network: false,
			paidService: false,
			mutatesProject: false,
			createsCommand: false,
			requiresExplicitReview: true,
			semanticClaims: false,
		},
	};
	return {
		plan,
		operation,
		state: {
			assetId: "asset-a",
			inputFingerprint,
			mediaIndexId: "index-a",
		},
	};
}

beforeEach(() => {
	activeEditor = createFakeEditor();
});

describe("ApplyEditDecisionCommand", () => {
	test("updates once, restores the complete old tracks, and reuses stable ids on redo", () => {
		const { plan, operation, state } = fixture();
		const originalTracks = activeEditor.getTracks();
		const command = new ApplyEditDecisionCommand({
			sceneId: "scene-1",
			plan,
			approvedOperationIds: [operation.operationId],
			currentAssets: [state],
		});

		const firstResult = command.execute();
		const firstTracks = activeEditor.getTracks();
		const firstIds = firstTracks.main.elements.map((element) => element.id);
		expect(command.handlesRipple).toBe(true);
		expect(command.sceneId).toBe("scene-1");
		expect(activeEditor.getUpdateCount()).toBe(1);
		expect(
			firstTracks.main.elements.map((element) => element.duration),
		).toEqual([t(2), t(7)]);
		expect(firstResult?.selection?.selectedElements).toEqual(
			firstIds.map((elementId) => ({ trackId: "main", elementId })),
		);

		command.undo();
		expect(activeEditor.getUpdateCount()).toBe(2);
		expect(activeEditor.getTracks()).toBe(originalTracks);

		command.redo();
		expect(activeEditor.getUpdateCount()).toBe(3);
		expect(
			activeEditor.getTracks().main.elements.map((element) => element.id),
		).toEqual(firstIds);
	});

	test("does not update any track when one approved operation is invalid", () => {
		const { plan, operation, state } = fixture({
			range: { startSeconds: 9, endSeconds: 11 },
		});
		const originalTracks = activeEditor.getTracks();
		const command = new ApplyEditDecisionCommand({
			sceneId: "scene-1",
			plan,
			approvedOperationIds: [operation.operationId],
			currentAssets: [state],
		});

		expect(() => command.execute()).toThrow();
		expect(activeEditor.getUpdateCount()).toBe(0);
		expect(activeEditor.getTracks()).toBe(originalTracks);
	});

	test("revalidates project, scene, material presence, and fingerprint before commit", () => {
		const { plan, operation, state } = fixture();
		const createCommand = () =>
			new ApplyEditDecisionCommand({
				sceneId: "scene-1",
				plan,
				approvedOperationIds: [operation.operationId],
				currentAssets: [state],
			});

		activeEditor.setProjectId("project-2");
		expect(() => createCommand().execute()).toThrow(
			"Active project no longer matches",
		);
		expect(activeEditor.getUpdateCount()).toBe(0);

		activeEditor.setProjectId("project-1");
		activeEditor.setSceneId("scene-2");
		expect(() => createCommand().execute()).toThrow(
			"Active scene no longer matches",
		);
		expect(activeEditor.getUpdateCount()).toBe(0);

		activeEditor.setSceneId("scene-1");
		activeEditor.setAssets([]);
		expect(() => createCommand().execute()).toThrow(
			"Approved material asset-a is no longer available",
		);
		expect(activeEditor.getUpdateCount()).toBe(0);

		activeEditor.setAssets([
			{
				...mediaAsset(),
				file: new File(["changed-video"], "a.mp4", {
					type: "video/mp4",
					lastModified: 202,
				}),
			},
		]);
		expect(() => createCommand().execute()).toThrow(
			"Approved material asset-a changed after review",
		);
		expect(activeEditor.getUpdateCount()).toBe(0);
	});
});
