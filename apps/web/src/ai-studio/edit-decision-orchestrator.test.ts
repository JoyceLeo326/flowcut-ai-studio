import { describe, expect, test } from "bun:test";
import type { EditPlan } from "../ai-edit/types";
import {
	createEditDecisionOperationReviewPayload,
	createEditDecisionPlan,
	inspectEditDecisionPlanFreshness,
	orchestrateLocalEditDecision,
	type CreateEditDecisionPlanInput,
	type EditDecisionOperation,
} from "./edit-decision-orchestrator";
import { createIntentSpec } from "./intent-spec";
import {
	createMediaIndex,
	type CreateMediaIndexInput,
	type MediaIndex,
} from "./media-index";
import {
	createRoughCutPlan,
	type RoughCutOptions,
	type RoughCutPlan,
} from "./rough-cut-plan";
import { deriveStoryGraph } from "./story-graph-model";

const CREATED_AT = "2026-07-27T02:00:00.000Z";
const PROJECT_ID = "project-local-rough-cut";

const METADATA_SOURCE = {
	sourceId: "fixture:metadata",
	method: "html-media-element" as const,
};
const FRAME_SOURCE = {
	sourceId: "fixture:frames",
	method: "canvas-2d-frame-sampler" as const,
};
const AUDIO_SOURCE = {
	sourceId: "fixture:audio",
	method: "web-audio-api" as const,
};

function interviewInput(): CreateMediaIndexInput {
	return {
		assetId: "asset-interview",
		metadata: {
			durationSeconds: 12,
			hasVideo: true,
			hasAudio: true,
			videoWidth: 1920,
			videoHeight: 1080,
			nominalFrameRate: 30,
			fileSizeBytes: 12_000_000,
			mimeType: "video/mp4",
			source: METADATA_SOURCE,
		},
		videoFrameSamples: [
			{
				atSeconds: 0,
				differenceFromPrevious: 0,
				meanLuminance: 0.45,
				source: FRAME_SOURCE,
			},
			{
				atSeconds: 3,
				differenceFromPrevious: 0.7,
				meanLuminance: 0.7,
				source: FRAME_SOURCE,
			},
			{
				atSeconds: 7,
				differenceFromPrevious: 0.62,
				meanLuminance: 0.28,
				source: FRAME_SOURCE,
			},
		],
		audioWindowSamples: [
			{
				startSeconds: 0,
				endSeconds: 0.5,
				rms: 0.004,
				peak: 0.01,
				source: AUDIO_SOURCE,
			},
			{
				startSeconds: 0.5,
				endSeconds: 1,
				rms: 0.005,
				peak: 0.014,
				source: AUDIO_SOURCE,
			},
			{
				startSeconds: 1,
				endSeconds: 3,
				rms: 0.08,
				peak: 0.24,
				source: AUDIO_SOURCE,
			},
			{
				startSeconds: 3,
				endSeconds: 5,
				rms: 0.07,
				peak: 0.21,
				source: AUDIO_SOURCE,
			},
			{
				startSeconds: 5,
				endSeconds: 5.5,
				rms: 0.004,
				peak: 0.012,
				source: AUDIO_SOURCE,
			},
			{
				startSeconds: 5.5,
				endSeconds: 6,
				rms: 0.006,
				peak: 0.016,
				source: AUDIO_SOURCE,
			},
			{
				startSeconds: 6,
				endSeconds: 8,
				rms: 0.075,
				peak: 0.22,
				source: AUDIO_SOURCE,
			},
			{
				startSeconds: 8,
				endSeconds: 10,
				rms: 0.065,
				peak: 0.2,
				source: AUDIO_SOURCE,
			},
			{
				startSeconds: 10,
				endSeconds: 11,
				rms: 0.02,
				peak: 0.04,
				source: AUDIO_SOURCE,
			},
			{
				startSeconds: 11,
				endSeconds: 11.5,
				rms: 0.005,
				peak: 0.014,
				source: AUDIO_SOURCE,
			},
			{
				startSeconds: 11.5,
				endSeconds: 12,
				rms: 0.004,
				peak: 0.012,
				source: AUDIO_SOURCE,
			},
		],
	};
}

function visualInput(): CreateMediaIndexInput {
	return {
		assetId: "asset-visual",
		metadata: {
			durationSeconds: 8,
			hasVideo: true,
			hasAudio: false,
			videoWidth: 3840,
			videoHeight: 2160,
			nominalFrameRate: 30,
			fileSizeBytes: 20_000_000,
			mimeType: "video/mp4",
			source: METADATA_SOURCE,
		},
		videoFrameSamples: [
			{
				atSeconds: 0,
				differenceFromPrevious: 0,
				meanLuminance: 0.55,
				source: FRAME_SOURCE,
			},
			{
				atSeconds: 2,
				differenceFromPrevious: 0.78,
				meanLuminance: 0.25,
				source: FRAME_SOURCE,
			},
			{
				atSeconds: 5,
				differenceFromPrevious: 0.72,
				meanLuminance: 0.68,
				source: FRAME_SOURCE,
			},
			{
				atSeconds: 7,
				differenceFromPrevious: 0.04,
				meanLuminance: 0.66,
				source: FRAME_SOURCE,
			},
		],
		audioWindowSamples: [],
	};
}

function metadataOnlyInput(): CreateMediaIndexInput {
	return {
		assetId: "asset-weak",
		metadata: {
			durationSeconds: 4,
			hasVideo: true,
			hasAudio: true,
			videoWidth: 1280,
			videoHeight: 720,
			mimeType: "video/mp4",
			source: METADATA_SOURCE,
		},
		videoFrameSamples: [],
		audioWindowSamples: [],
	};
}

function fixtureEditPlan(): EditPlan {
	return {
		id: "edit-plan-fixture",
		formatVersion: "flowcut.edit-plan/v1",
		prompt:
			"Create a concise founder story with interview as the narrative and product visuals as supporting material.",
		mode: "local",
		createdAt: CREATED_AT,
		source: {
			assetCount: 2,
			unusedAssetCount: 2,
			timelineElementCount: 0,
			videoClipCount: 0,
			durationSeconds: 0,
		},
		target: {
			platform: "youtube",
			label: "YouTube",
			aspectRatio: "16:9",
			targetDurationSeconds: 30,
			style: "restrained documentary",
		},
		creativeDirection: {
			hook: "Open on the founder turning point.",
			narrative: "Problem, decision, result.",
			captionStyle: "Concise",
			motionStyle: "Restrained",
			audioStrategy: "Preserve natural speech",
			colorMood: "Neutral",
			outputVariants: [
				{
					label: "Main",
					aspectRatio: "16:9",
					targetDurationSeconds: 30,
				},
			],
		},
		summary: "Reviewable local first cut.",
		reviewChecklist: ["Review every proposed cut."],
		riskNotes: ["No transcript is available."],
		steps: [
			{
				id: "arrange",
				kind: "arrange-media",
				title: "Arrange media",
				description: "Prepare a review order.",
				executor: "local",
				availability: "ready",
				enabled: true,
			},
		],
	};
}

function roughCutPlan({
	index,
	fingerprint,
	options,
}: {
	index: MediaIndex;
	fingerprint: string;
	options?: Partial<RoughCutOptions>;
}): RoughCutPlan {
	return createRoughCutPlan({
		clip: {
			projectId: PROJECT_ID,
			sceneId: "scene-main",
			trackId: "track-main",
			elementId: "element-interview",
			assetId: index.assetId,
			timelineStartSeconds: 0,
			sourceStartSeconds: 0,
			durationSeconds: index.summary.durationSeconds,
			playbackRate: 1,
		},
		evidence: index.audioActivityCandidates
			.filter((candidate) => candidate.candidateType === "silence")
			.map((candidate) => ({
				evidenceId: candidate.findingId,
				assetId: index.assetId,
				kind: "low-audio-energy" as const,
				startSeconds: candidate.timeRange.startSeconds,
				endSeconds: candidate.timeRange.endSeconds,
				confidence: candidate.confidence.score,
				method: index.algorithm.version,
			})),
		evidenceArtifact: {
			mediaIndexId: index.mediaIndexId,
			assetFingerprint: fingerprint,
			algorithmVersion: index.algorithm.version,
		},
		options,
		createdAt: CREATED_AT,
	});
}

function fixedFixture(): CreateEditDecisionPlanInput {
	const interview = createMediaIndex(interviewInput());
	const visual = createMediaIndex(visualInput());
	const interviewFingerprint = "visioncut-asset-v1-interview";
	const storyGraph = deriveStoryGraph({
		projectId: PROJECT_ID,
		media: [
			{
				id: "asset-interview",
				name: "Founder interview",
				type: "video",
				duration: 12,
			},
			{
				id: "asset-visual",
				name: "Product visuals",
				type: "video",
				duration: 8,
			},
		],
		scenes: [
			{
				id: "scene-main",
				name: "Main",
				isMain: true,
				tracks: {
					main: {
						id: "track-main",
						type: "video",
						elements: [
							{
								id: "element-visual",
								name: "Product visuals",
								type: "video",
								mediaId: "asset-visual",
								startTime: 0,
								duration: 8,
							},
							{
								id: "element-interview",
								name: "Founder interview",
								type: "video",
								mediaId: "asset-interview",
								startTime: 8,
								duration: 12,
							},
						],
					},
					overlay: [],
				},
			},
		],
	});
	return {
		intentSpec: createIntentSpec({
			projectId: PROJECT_ID,
			userIntent:
				"Use the founder interview as the main story and product shots as supporting visuals.",
			target: {
				platform: "YouTube",
				aspectRatio: "16:9",
				durationSeconds: 30,
				style: "restrained documentary",
			},
			source: "home",
			createdAt: CREATED_AT,
		}),
		editPlan: fixtureEditPlan(),
		assets: [
			{
				assetId: "asset-visual",
				inputFingerprint: "visioncut-asset-v1-visual",
				mediaIndex: visual,
			},
			{
				assetId: "asset-interview",
				inputFingerprint: interviewFingerprint,
				mediaIndex: interview,
				roughCutPlan: roughCutPlan({
					index: interview,
					fingerprint: interviewFingerprint,
				}),
			},
		],
		storyGraph,
		createdAt: CREATED_AT,
	};
}

function expectTraceable(operation: EditDecisionOperation): void {
	expect(operation.assetId.length).toBeGreaterThan(0);
	expect(operation.inputFingerprint.length).toBeGreaterThan(0);
	expect(operation.mediaIndexId.length).toBeGreaterThan(0);
	expect(operation.sourceRange.unit).toBe("seconds");
	expect(operation.sourceRange.startSeconds).toBeGreaterThanOrEqual(0);
	expect(operation.sourceRange.endSeconds).toBeGreaterThanOrEqual(
		operation.sourceRange.startSeconds,
	);
	expect(Array.isArray(operation.evidenceIds)).toBe(true);
	expect(operation.reason.length).toBeGreaterThan(0);
	expect(operation.availabilityReason.length).toBeGreaterThan(0);
	expect(operation.requiresExplicitReview).toBe(true);
}

describe("project-local edit decision orchestrator", () => {
	test("turns intent and multiple MediaIndexes into a traceable review plan", () => {
		const result = orchestrateLocalEditDecision(fixedFixture());
		const kinds = new Set(
			result.plan.operations.map((operation) => operation.kind),
		);

		expect(result.plan.projectId).toBe(PROJECT_ID);
		expect(result.plan.inputs.assets).toHaveLength(2);
		expect(result.plan.suggestedAssetOrder).toEqual([
			"asset-interview",
			"asset-visual",
		]);
		expect(result.plan.primaryCandidateAssetId).toBe("asset-interview");
		expect(kinds).toEqual(new Set(["remove", "reorder", "primary", "b-roll"]));
		expect(
			result.plan.operations.some(
				(operation) =>
					operation.kind === "reorder" &&
					operation.assetId === "asset-interview" &&
					operation.fromIndex === 1 &&
					operation.proposedIndex === 0,
			),
		).toBe(true);
		expect(
			result.plan.operations.some(
				(operation) =>
					operation.kind === "remove" &&
					operation.assetId === "asset-interview" &&
					operation.sourceRange.startSeconds > 0 &&
					operation.sourceRange.endSeconds < 12,
			),
		).toBe(true);
		expect(
			result.plan.operations.some(
				(operation) =>
					operation.kind === "b-roll" &&
					operation.assetId === "asset-visual" &&
					operation.availability === "suggestion",
			),
		).toBe(true);
		for (const operation of result.plan.operations) {
			expectTraceable(operation);
		}
		expect(result.review.items).toHaveLength(result.plan.operations.length);
		expect(result.review.freshness.state).toBe("current");
		expect(result.review.mutatesProject).toBe(false);
		expect(result.plan.guarantees.createsCommand).toBe(false);
		expect(result.plan.guarantees.semanticClaims).toBe(false);
	});

	test("uses a current rough-cut plan as the candidate gate", () => {
		const fixture = fixedFixture();
		const interviewAsset = fixture.assets.find(
			(asset) => asset.assetId === "asset-interview",
		);
		if (!interviewAsset) throw new Error("Interview fixture is missing.");
		expect(
			interviewAsset.mediaIndex.audioActivityCandidates.some(
				(candidate) => candidate.candidateType === "silence",
			),
		).toBe(true);

		const result = orchestrateLocalEditDecision({
			...fixture,
			assets: fixture.assets.map((asset) =>
				asset.assetId === "asset-interview"
					? {
							...asset,
							roughCutPlan: roughCutPlan({
								index: asset.mediaIndex,
								fingerprint: asset.inputFingerprint,
								options: {
									minimumEvidenceSeconds: 10,
								},
							}),
						}
					: asset,
			),
		});

		expect(
			result.plan.operations.filter(
				(operation) =>
					operation.assetId === "asset-interview" &&
					(operation.kind === "trim" || operation.kind === "remove"),
			),
		).toEqual([]);
	});

	test("keeps metadata-only and energy-only evidence non-executable", () => {
		const fixture = fixedFixture();
		const weakIndex = createMediaIndex(metadataOnlyInput());
		const plan = createEditDecisionPlan({
			...fixture,
			editPlan: {
				...fixture.editPlan,
				source: {
					...fixture.editPlan.source,
					assetCount: 3,
				},
			},
			assets: [
				...fixture.assets,
				{
					assetId: "asset-weak",
					inputFingerprint: "visioncut-asset-v1-weak",
					mediaIndex: weakIndex,
				},
			],
		});
		const weakOperations = plan.operations.filter(
			(operation) => operation.assetId === "asset-weak",
		);

		expect(
			plan.operations.every(
				(operation) => operation.availability !== "executable",
			),
		).toBe(true);
		expect(
			weakOperations.some(
				(operation) =>
					operation.kind === "primary" &&
					operation.availability === "blocked" &&
					operation.evidenceIds.length === 0,
			),
		).toBe(true);
		expect(
			weakOperations.some(
				(operation) =>
					operation.kind === "b-roll" && operation.availability === "blocked",
			),
		).toBe(true);
		const review = createEditDecisionOperationReviewPayload({ plan });
		expect(review.items.every((item) => item.executionEligible === false)).toBe(
			true,
		);
	});

	test("marks the plan stale when an input fingerprint changes", () => {
		const plan = createEditDecisionPlan(fixedFixture());
		const currentAssets = plan.inputs.assets.map((asset) => ({
			assetId: asset.assetId,
			inputFingerprint:
				asset.assetId === "asset-interview"
					? "visioncut-asset-v1-interview-replaced"
					: asset.inputFingerprint,
			mediaIndexId: asset.mediaIndexId,
		}));
		const freshness = inspectEditDecisionPlanFreshness({
			plan,
			currentAssets,
		});
		const review = createEditDecisionOperationReviewPayload({
			plan,
			currentAssets,
		});

		expect(freshness.state).toBe("stale");
		expect(freshness.staleAssetIds).toEqual(["asset-interview"]);
		expect(freshness.reasons).toContainEqual({
			code: "fingerprint-changed",
			assetId: "asset-interview",
			expected: "visioncut-asset-v1-interview",
			actual: "visioncut-asset-v1-interview-replaced",
		});
		expect(review.freshness.state).toBe("stale");
		expect(review.items.every((item) => item.executionEligible === false)).toBe(
			true,
		);
	});

	test("is deterministic and deeply freezes plan and review output", () => {
		const firstInput = fixedFixture();
		const mutableEditTarget = firstInput.editPlan.target;
		const first = orchestrateLocalEditDecision(firstInput);
		const second = orchestrateLocalEditDecision(fixedFixture());

		expect(first).toEqual(second);
		expect(first.plan.planId).toBe(second.plan.planId);
		expect(Object.isFrozen(mutableEditTarget)).toBe(false);
		expect(first.plan.editPlan.target).not.toBe(mutableEditTarget);
		expect(Object.isFrozen(first)).toBe(true);
		expect(Object.isFrozen(first.plan)).toBe(true);
		expect(Object.isFrozen(first.plan.inputs)).toBe(true);
		expect(Object.isFrozen(first.plan.inputs.assets)).toBe(true);
		expect(Object.isFrozen(first.plan.inputs.assets[0])).toBe(true);
		expect(Object.isFrozen(first.plan.operations)).toBe(true);
		expect(Object.isFrozen(first.plan.operations[0])).toBe(true);
		expect(Object.isFrozen(first.plan.operations[0].sourceRange)).toBe(true);
		expect(Object.isFrozen(first.plan.operations[0].evidenceIds)).toBe(true);
		expect(Object.isFrozen(first.review)).toBe(true);
		expect(Object.isFrozen(first.review.items)).toBe(true);
		expect(Object.isFrozen(first.review.items[0])).toBe(true);
		expect(Object.isFrozen(first.review.freshness)).toBe(true);
	});
});
