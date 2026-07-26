import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/media/types";
import type { TProject } from "@/project/types";
import { installMockWasm } from "@/test-utils/mock-wasm";
import type { TScene } from "@/timeline";

installMockWasm();

const {
	createChatCutTargetState,
	fingerprintChatCutAsset,
	fingerprintChatCutTimeline,
} = await import("./chatcut-timeline-adapter");
const { mediaTimeFromSeconds, ZERO_MEDIA_TIME } = await import("@/wasm");

const t = (seconds: number) => mediaTimeFromSeconds({ seconds });

function fixture(): {
	project: TProject;
	scene: TScene;
	assets: MediaAsset[];
} {
	const scene: TScene = {
		id: "timeline-main",
		name: "Main",
		isMain: true,
		createdAt: new Date("2026-07-23T00:00:00.000Z"),
		updatedAt: new Date("2026-07-23T00:00:00.000Z"),
		bookmarks: [],
		tracks: {
			main: {
				id: "V1",
				name: "Main video",
				type: "video",
				muted: false,
				hidden: false,
				elements: [
					{
						id: "clip-a",
						name: "A-roll",
						type: "video",
						mediaId: "asset-a",
						startTime: ZERO_MEDIA_TIME,
						duration: t(4),
						trimStart: t(1),
						trimEnd: ZERO_MEDIA_TIME,
						sourceDuration: t(10),
						params: {},
						retime: { rate: 1.5 },
					},
				],
			},
			overlay: [],
			audio: [],
		},
	};
	const project: TProject = {
		metadata: {
			id: "project-a",
			name: "Project A",
			duration: t(4),
			createdAt: new Date("2026-07-23T00:00:00.000Z"),
			updatedAt: new Date("2026-07-23T00:00:00.000Z"),
		},
		scenes: [scene],
		currentSceneId: scene.id,
		settings: {
			fps: { numerator: 30, denominator: 1 },
			canvasSize: { width: 1920, height: 1080 },
			background: { type: "color", color: "#000000" },
		},
		version: 25,
	};
	const file = new File(["video bytes"], "a.mp4", {
		type: "video/mp4",
		lastModified: 123,
	});
	const assets: MediaAsset[] = [
		{
			id: "asset-a",
			name: "a.mp4",
			type: "video",
			file,
			duration: 10,
			width: 1920,
			height: 1080,
			fps: 30,
			hasAudio: true,
		},
	];
	return { project, scene, assets };
}

describe("ChatCut timeline adapter", () => {
	test("creates strict frame-based target state with exact playback ratio", () => {
		const input = fixture();
		const bundle = createChatCutTargetState(input);
		const item = bundle.target.items[0];
		expect(bundle.target.projectId).toBe("project-a");
		expect(bundle.target.projectVersion).toBe(25);
		expect(bundle.target.timelineFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/u);
		expect(item.timelineRange).toEqual({ startFrame: 0, endFrame: 120 });
		expect(item.sourceRange).toEqual({ startFrame: 30, endFrame: 210 });
		expect(item.playbackRate).toEqual({ numerator: 3, denominator: 2 });
		expect(item.itemFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/u);
		expect(bundle.target.assets[0].durationFrames).toBe(300);
	});

	test("fingerprints are deterministic and detect timeline or file identity changes", () => {
		const input = fixture();
		const firstTimeline = fingerprintChatCutTimeline(input);
		expect(fingerprintChatCutTimeline(input)).toBe(firstTimeline);
		const firstAsset = fingerprintChatCutAsset(input.assets[0]);
		input.scene.tracks.main.elements[0] = {
			...input.scene.tracks.main.elements[0],
			duration: t(3),
		};
		expect(fingerprintChatCutTimeline(input)).not.toBe(firstTimeline);
		input.assets[0] = {
			...input.assets[0],
			file: new File(["changed"], "a.mp4", {
				type: "video/mp4",
				lastModified: 999,
			}),
		};
		expect(fingerprintChatCutAsset(input.assets[0])).not.toBe(firstAsset);
	});

	test("advances the logical import revision from immutable receipts", () => {
		const input = fixture();
		const baseline = createChatCutTargetState(input).target;
		const receipt = {
			kind: "visioncut.chatcut-import-receipt" as const,
			schemaVersion: 1 as const,
			receiptId: "receipt-a",
			resultId: "result-a",
			idempotencyKey: "key-a",
			projectId: input.project.metadata.id,
			timelineId: input.scene.id,
			fromVersion: baseline.projectVersion,
			fromVersionId: baseline.versionId,
			toVersion: baseline.projectVersion + 1,
			toVersionId: "version-next",
			appliedAt: "2026-07-23T01:00:00.000Z",
			operationIds: ["op-a"],
			resultingTimelineFingerprint: baseline.timelineFingerprint,
			undoReference: {
				kind: "visioncut.timeline-undo-reference" as const,
				projectId: input.project.metadata.id,
				timelineId: input.scene.id,
				snapshotId: baseline.timelineSnapshotId,
				versionId: baseline.versionId,
				timelineFingerprint: baseline.timelineFingerprint,
			},
		};
		const next = createChatCutTargetState({
			...input,
			appliedImports: [receipt],
		});
		expect(next.target.projectVersion).toBe(26);
		expect(next.target.appliedImports).toEqual([receipt]);
	});
});
