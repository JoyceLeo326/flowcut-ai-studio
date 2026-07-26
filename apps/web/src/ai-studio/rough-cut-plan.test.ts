import { describe, expect, test } from "bun:test";
import {
	createRoughCutPlan,
	deserializeRoughCutPlan,
	getApprovedRoughCutOperations,
	reviewAllRoughCutOperations,
	reviewRoughCutOperation,
	serializeRoughCutPlan,
	type RoughCutEvidenceInterval,
	type RoughCutTimelineClip,
} from "./rough-cut-plan";

const clip: RoughCutTimelineClip = {
	projectId: "project-1",
	sceneId: "scene-1",
	trackId: "main-track",
	elementId: "element-1",
	assetId: "asset-1",
	timelineStartSeconds: 5,
	sourceStartSeconds: 2,
	durationSeconds: 10,
	playbackRate: 1,
};

const evidence: RoughCutEvidenceInterval[] = [
	{
		evidenceId: "energy-1",
		assetId: "asset-1",
		kind: "low-audio-energy",
		startSeconds: 3,
		endSeconds: 4,
		confidence: 0.9,
		method: "local-rms-v1",
	},
	{
		evidenceId: "energy-2",
		assetId: "asset-1",
		kind: "low-audio-energy",
		startSeconds: 7,
		endSeconds: 8.2,
		confidence: 0.8,
		method: "local-rms-v1",
	},
];

const evidenceArtifact = {
	mediaIndexId: "media-index-1",
	assetFingerprint: "visioncut-asset-v1-test",
	algorithmVersion: "visioncut.media-index.local-signals/1.0.0",
} as const;

describe("VisionCut evidence-based rough-cut plan", () => {
	test("maps source evidence to the visible timeline without semantic claims", () => {
		const plan = createRoughCutPlan({
			clip,
			evidence,
			evidenceArtifact,
			createdAt: "2026-07-23T00:00:00.000Z",
		});
		expect(plan.operations).toHaveLength(2);
		expect(plan.operations[0].sourceRange).toEqual({
			startSeconds: 3.08,
			endSeconds: 3.92,
		});
		expect(plan.operations[0].timelineRange).toEqual({
			startSeconds: 6.08,
			endSeconds: 6.92,
		});
		expect(plan.guarantees.transcriptUsed).toBe(false);
		expect(plan.guarantees.semanticClaims).toBe(false);
		expect(Object.isFrozen(plan)).toBe(true);
	});

	test("ignores other assets and evidence below the configured duration", () => {
		const plan = createRoughCutPlan({
			clip,
			evidence: [
				{ ...evidence[0], assetId: "asset-2" },
				{ ...evidence[1], startSeconds: 7, endSeconds: 7.2 },
			],
			evidenceArtifact,
			createdAt: "2026-07-23T00:00:00.000Z",
		});
		expect(plan.operations).toHaveLength(0);
	});

	test("does not remove clip edges or tiny islands between removals", () => {
		const plan = createRoughCutPlan({
			clip: { ...clip, sourceStartSeconds: 0 },
			evidence: [
				{ ...evidence[0], startSeconds: 0, endSeconds: 1 },
				{
					...evidence[0],
					evidenceId: "middle-1",
					startSeconds: 2,
					endSeconds: 3,
				},
				{
					...evidence[0],
					evidenceId: "middle-2",
					startSeconds: 3,
					endSeconds: 4,
				},
				{
					...evidence[0],
					evidenceId: "end",
					startSeconds: 9.5,
					endSeconds: 10,
				},
			],
			evidenceArtifact,
			createdAt: "2026-07-23T00:00:00.000Z",
		});
		expect(plan.operations.map((operation) => operation.evidenceIds)).toEqual([
			["middle-1"],
		]);
	});

	test("merges overlapping evidence without deleting unsupported gaps", () => {
		const plan = createRoughCutPlan({
			clip,
			evidence: [
				evidence[0],
				{
					...evidence[0],
					evidenceId: "energy-overlap",
					startSeconds: 3.5,
					endSeconds: 4.5,
					confidence: 0.7,
				},
			],
			evidenceArtifact,
			createdAt: "2026-07-23T00:00:00.000Z",
		});
		expect(plan.operations).toHaveLength(1);
		expect(plan.operations[0].evidenceIds).toEqual([
			"energy-1",
			"energy-overlap",
		]);
		expect(plan.operations[0].confidence).toBe(0.7);
	});

	test("requires explicit immutable review before exposing approved operations", () => {
		const initial = createRoughCutPlan({
			clip,
			evidence,
			evidenceArtifact,
			createdAt: "2026-07-23T00:00:00.000Z",
		});
		expect(getApprovedRoughCutOperations(initial)).toHaveLength(0);
		const approved = reviewRoughCutOperation({
			plan: initial,
			operationId: initial.operations[0].operationId,
			status: "approved",
			updatedAt: "2026-07-23T00:00:01.000Z",
		});
		expect(initial.operations[0].status).toBe("proposed");
		expect(getApprovedRoughCutOperations(approved)).toHaveLength(1);
		expect(approved.revision).toBe(2);
	});

	test("supports review-all and safe JSON round trips", () => {
		const initial = createRoughCutPlan({
			clip,
			evidence,
			evidenceArtifact,
			createdAt: "2026-07-23T00:00:00.000Z",
		});
		const rejected = reviewAllRoughCutOperations({
			plan: initial,
			status: "rejected",
			updatedAt: "2026-07-23T00:00:01.000Z",
		});
		const restored = deserializeRoughCutPlan(serializeRoughCutPlan(rejected));
		expect(restored).toEqual(rejected);
		expect(
			restored.operations.every((operation) => operation.status === "rejected"),
		).toBe(true);
		expect(Object.isFrozen(restored.operations)).toBe(true);
	});

	test("rejects retimed clips, unsafe padding and malformed stored plans", () => {
		const validPlan = createRoughCutPlan({
			clip,
			evidence,
			evidenceArtifact,
			createdAt: "2026-07-23T00:00:00.000Z",
		});
		expect(() =>
			deserializeRoughCutPlan(
				JSON.stringify({
					...validPlan,
					baseline: { ...validPlan.baseline, playbackRate: 2 },
				}),
			),
		).toThrow("unretimed");
		expect(() =>
			createRoughCutPlan({
				clip,
				evidence,
				evidenceArtifact,
				options: { minimumEvidenceSeconds: 0.4, cutPaddingSeconds: 0.2 },
				createdAt: "2026-07-23T00:00:00.000Z",
			}),
		).toThrow("padding");
		const plan = createRoughCutPlan({
			clip,
			evidence,
			evidenceArtifact,
			createdAt: "2026-07-23T00:00:00.000Z",
		});
		const tampered = JSON.parse(serializeRoughCutPlan(plan));
		tampered.operations[0].timelineRange.startSeconds += 1;
		expect(() => deserializeRoughCutPlan(JSON.stringify(tampered))).toThrow(
			"timeline mapping",
		);
	});
});
