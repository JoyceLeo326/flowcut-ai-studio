import { describe, expect, test } from "bun:test";

import { DEFAULT_STUDIO_PRO_SETTINGS, type StudioProSettings } from "./catalog";
import { MEDIA_INDEX_THRESHOLDS } from "./media-index";
import {
	assertStudioExecutionPolicyIntegrity,
	createStudioExecutionPolicy,
	inspectStudioExecutionPolicyStaleness,
	isStudioExecutionPolicyStale,
	STUDIO_EXECUTION_POLICY_KIND,
	STUDIO_EXECUTION_POLICY_SCHEMA_VERSION,
	STUDIO_EXECUTION_POLICY_VERSION,
	type StudioExecutionEvidence,
	type StudioExecutionEvidenceKind,
	type StudioExecutionPolicy,
} from "./studio-execution-policy";

const ALL_EVIDENCE_KINDS = [
	"audio-energy-intervals",
	"video-frame-differences",
	"transcript-word-timings",
	"filler-token-classification",
	"person-tracks",
	"semantic-scene-labels",
	"b-roll-candidates",
	"integrated-loudness-measurement",
	"approved-base-plan",
] as const satisfies readonly StudioExecutionEvidenceKind[];

function allEvidence(): StudioExecutionEvidence[] {
	return ALL_EVIDENCE_KINDS.map((kind, index) => ({
		kind,
		artifactId: `artifact-${String(index + 1).padStart(2, "0")}`,
		fingerprint: `fingerprint-${kind}`,
	}));
}

function settings(
	overrides: Partial<StudioProSettings> = {},
): StudioProSettings {
	return {
		...DEFAULT_STUDIO_PRO_SETTINGS,
		...overrides,
	};
}

function jsonClone<T>(value: T): T {
	return structuredClone(value);
}

describe("studio execution policy", () => {
	test("maps professional settings to evidence-bound execution policy", () => {
		const policy = createStudioExecutionPolicy({
			settings: settings({
				silenceThresholdMs: 420.5,
				cutPaddingMs: 100.25,
				sceneSensitivity: 50,
				targetLufs: -14,
				outputCount: 3,
				fillerHandling: "review",
			}),
			evidence: allEvidence(),
		});

		expect(policy.kind).toBe(STUDIO_EXECUTION_POLICY_KIND);
		expect(policy.schemaVersion).toBe(STUDIO_EXECUTION_POLICY_SCHEMA_VERSION);
		expect(policy.policyVersion).toBe(STUDIO_EXECUTION_POLICY_VERSION);
		expect(policy.roughCut.options).toEqual({
			minimumEvidenceSeconds: 0.4205,
			cutPaddingSeconds: 0.10025,
			minimumKeptSegmentSeconds: 0.2,
		});
		expect(policy.roughCut.options.cutPaddingSeconds * 2).toBeLessThan(
			policy.roughCut.options.minimumEvidenceSeconds,
		);
		expect(policy.fields.silenceThresholdMs.status).toBe("automatic");
		expect(policy.fields.cutPaddingMs.status).toBe("automatic");
		expect(policy.roughCut.operationsRequireExplicitApproval).toBe(true);

		expect(policy.sceneDetection.thresholds).toEqual({
			sensitivityPercent: 50,
			minimumFrameDifference:
				MEDIA_INDEX_THRESHOLDS.scene.minimumFrameDifference,
			combinedFrameDifference:
				MEDIA_INDEX_THRESHOLDS.scene.combinedFrameDifference,
			minimumLuminanceDelta: MEDIA_INDEX_THRESHOLDS.scene.minimumLuminanceDelta,
			minimumSeparationSeconds:
				MEDIA_INDEX_THRESHOLDS.scene.minimumSeparationSeconds,
		});
		expect(policy.sceneDetection.status).toBe("automatic");
		expect(policy.sceneDetection.producesCandidatesOnly).toBe(true);
		expect(policy.sceneDetection.makesSemanticClaims).toBe(false);

		expect(policy.reviewOnly.broll.status).toBe("review");
		expect(policy.reviewOnly.captions.status).toBe("review");
		expect(policy.reviewOnly.punchIn.status).toBe("review");
		expect(policy.reviewOnly.broll.eligibleStatus).toBe("review");
		expect(policy.reviewOnly.captions.eligibleStatus).toBe("review");
		expect(policy.reviewOnly.punchIn.eligibleStatus).toBe("review");
		expect(policy.reviewOnly.broll.requiresExplicitApproval).toBe(true);
		expect(policy.reviewOnly.captions.requiresExplicitApproval).toBe(true);
		expect(policy.reviewOnly.punchIn.requiresExplicitApproval).toBe(true);

		expect(policy.delivery).toEqual({
			targetIntegratedLufs: -14,
			unit: "LUFS",
			requirement: "required",
			status: "automatic",
			requiredEvidence: ["integrated-loudness-measurement"],
		});
		expect(policy.variants).toEqual({
			count: 3,
			variantIds: ["variant-01", "variant-02", "variant-03"],
			status: "automatic",
			source: "approved-base-plan",
		});
		expect(policy.filler.status).toBe("review");
		expect(policy.filler.automaticRemoval).toBe(false);
		expect(policy.guarantees.settingsAreNotEvidence).toBe(true);
		expect(policy.guarantees.semanticOperationsNeedSemanticEvidence).toBe(true);
		assertStudioExecutionPolicyIntegrity(policy);
	});

	test("blocks semantic settings without transcript, person, or semantic evidence", () => {
		const localNumericEvidence: StudioExecutionEvidence[] = [
			{
				kind: "audio-energy-intervals",
				artifactId: "audio-index",
				fingerprint: "audio-v1",
			},
			{
				kind: "video-frame-differences",
				artifactId: "frame-index",
				fingerprint: "frames-v1",
			},
			{
				kind: "integrated-loudness-measurement",
				artifactId: "loudness",
				fingerprint: "loudness-v1",
			},
			{
				kind: "approved-base-plan",
				artifactId: "base-plan",
				fingerprint: "base-v1",
			},
		];
		const policy = createStudioExecutionPolicy({
			settings: settings({ fillerHandling: "remove" }),
			evidence: localNumericEvidence,
		});

		expect(policy.fields.silenceThresholdMs.status).toBe("automatic");
		expect(policy.fields.sceneSensitivity.status).toBe("automatic");
		expect(policy.fields.targetLufs.status).toBe("automatic");
		expect(policy.fields.outputCount.status).toBe("automatic");
		expect(policy.fields.brollDensity.status).toBe("blocked");
		expect(policy.fields.captionDensity.status).toBe("blocked");
		expect(policy.fields.punchInIntensity.status).toBe("blocked");
		expect(policy.fields.fillerHandling.status).toBe("blocked");
		expect(policy.fields.brollDensity.missingEvidence).toEqual([
			"semantic-scene-labels",
			"b-roll-candidates",
		]);
		expect(policy.fields.captionDensity.missingEvidence).toEqual([
			"transcript-word-timings",
		]);
		expect(policy.fields.punchInIntensity.missingEvidence).toEqual([
			"person-tracks",
		]);
		expect(policy.fields.fillerHandling.missingEvidence).toEqual([
			"transcript-word-timings",
			"filler-token-classification",
		]);
		expect(
			[
				policy.fields.brollDensity,
				policy.fields.captionDensity,
				policy.fields.punchInIntensity,
				policy.fields.fillerHandling,
			].some((field) => field.status === "automatic"),
		).toBe(false);
	});

	test("never turns filler removal into an automatic destructive action", () => {
		const transcriptEvidence = allEvidence().filter((entry) =>
			["transcript-word-timings", "filler-token-classification"].includes(
				entry.kind,
			),
		);
		const remove = createStudioExecutionPolicy({
			settings: settings({ fillerHandling: "remove" }),
			evidence: transcriptEvidence,
		});
		const review = createStudioExecutionPolicy({
			settings: settings({ fillerHandling: "review" }),
			evidence: transcriptEvidence,
		});
		const keep = createStudioExecutionPolicy({
			settings: settings({ fillerHandling: "keep" }),
			evidence: [],
		});

		expect(remove.fields.fillerHandling.status).toBe("review");
		expect(remove.fields.fillerHandling.resolvedValue.destructive).toBe(true);
		expect(remove.fields.fillerHandling.resolvedValue.automaticRemoval).toBe(
			false,
		);
		expect(review.fields.fillerHandling.status).toBe("review");
		expect(review.fields.fillerHandling.resolvedValue.destructive).toBe(false);
		expect(keep.fields.fillerHandling.status).toBe("automatic");
		expect(keep.fields.fillerHandling.requiredEvidence).toEqual([]);
		expect(keep.fields.fillerHandling.resolvedValue.destructive).toBe(false);
	});

	test("is deterministic, deeply frozen, and does not mutate caller inputs", () => {
		const inputSettings = settings();
		const inputEvidence = allEvidence().reverse();
		const settingsSnapshot = jsonClone(inputSettings);
		const evidenceSnapshot = jsonClone(inputEvidence);

		const first = createStudioExecutionPolicy({
			settings: inputSettings,
			evidence: inputEvidence,
		});
		const second = createStudioExecutionPolicy({
			settings: { ...inputSettings },
			evidence: [...inputEvidence].reverse(),
		});

		expect(first).toEqual(second);
		expect(first.settingsFingerprint).toBe(second.settingsFingerprint);
		expect(first.evidenceFingerprint).toBe(second.evidenceFingerprint);
		expect(first.planFingerprint).toBe(second.planFingerprint);
		expect(inputSettings).toEqual(settingsSnapshot);
		expect(inputEvidence).toEqual(evidenceSnapshot);
		expect(Object.isFrozen(inputSettings)).toBe(false);
		expect(Object.isFrozen(inputEvidence)).toBe(false);
		expect(Object.isFrozen(first)).toBe(true);
		expect(Object.isFrozen(first.settings)).toBe(true);
		expect(Object.isFrozen(first.evidence)).toBe(true);
		expect(Object.isFrozen(first.evidence[0])).toBe(true);
		expect(Object.isFrozen(first.fields)).toBe(true);
		expect(Object.isFrozen(first.fields.brollDensity.requiredEvidence)).toBe(
			true,
		);
		expect(Object.isFrozen(first.fields.brollDensity.satisfiedEvidence)).toBe(
			true,
		);
		expect(Object.isFrozen(first.roughCut.options)).toBe(true);
		expect(Object.isFrozen(first.variants.variantIds)).toBe(true);
	});

	test("maps sensitivity monotonically around the MediaIndex baseline", () => {
		const evidence: StudioExecutionEvidence[] = [
			{
				kind: "video-frame-differences",
				artifactId: "frames",
				fingerprint: "frames-v1",
			},
		];
		const low = createStudioExecutionPolicy({
			settings: settings({ sceneSensitivity: 0 }),
			evidence,
		});
		const baseline = createStudioExecutionPolicy({
			settings: settings({ sceneSensitivity: 50 }),
			evidence,
		});
		const high = createStudioExecutionPolicy({
			settings: settings({ sceneSensitivity: 100 }),
			evidence,
		});

		expect(
			low.sceneDetection.thresholds.minimumFrameDifference,
		).toBeGreaterThan(
			baseline.sceneDetection.thresholds.minimumFrameDifference,
		);
		expect(high.sceneDetection.thresholds.minimumFrameDifference).toBeLessThan(
			baseline.sceneDetection.thresholds.minimumFrameDifference,
		);
		expect(low.sceneDetection.thresholds.minimumSeparationSeconds).toBe(0.75);
		expect(high.sceneDetection.thresholds.minimumSeparationSeconds).toBe(0.25);
	});

	test("preserves rough-cut legality for valid values near the padding boundary", () => {
		const policy = createStudioExecutionPolicy({
			settings: settings({
				silenceThresholdMs: 150.000001,
				cutPaddingMs: 75,
			}),
			evidence: [
				{
					kind: "audio-energy-intervals",
					artifactId: "audio-index",
					fingerprint: "audio-index-v1",
				},
			],
		});

		expect(policy.roughCut.options.minimumEvidenceSeconds).toBe(
			150.000001 / 1_000,
		);
		expect(policy.roughCut.options.cutPaddingSeconds).toBe(75 / 1_000);
		expect(policy.roughCut.options.cutPaddingSeconds * 2).toBeLessThan(
			policy.roughCut.options.minimumEvidenceSeconds,
		);
	});

	test("detects settings, evidence, and payload staleness", () => {
		const evidence = allEvidence();
		const originalSettings = settings();
		const policy = createStudioExecutionPolicy({
			settings: originalSettings,
			evidence,
		});

		const current = inspectStudioExecutionPolicyStaleness({
			policy,
			settings: { ...originalSettings },
			evidence: [...evidence].reverse(),
		});
		expect(current.stale).toBe(false);
		expect(current.reasons).toEqual([]);
		expect(Object.isFrozen(current)).toBe(true);
		expect(Object.isFrozen(current.reasons)).toBe(true);
		expect(
			isStudioExecutionPolicyStale({
				policy,
				settings: originalSettings,
				evidence,
			}),
		).toBe(false);

		const changedSettings = inspectStudioExecutionPolicyStaleness({
			policy,
			settings: settings({ targetLufs: -16 }),
			evidence,
		});
		expect(changedSettings.stale).toBe(true);
		expect(changedSettings.reasons).toContain("settings-changed");

		const changedEvidence = inspectStudioExecutionPolicyStaleness({
			policy,
			settings: originalSettings,
			evidence: evidence.map((entry) =>
				entry.kind === "person-tracks"
					? { ...entry, fingerprint: "person-v2" }
					: entry,
			),
		});
		expect(changedEvidence.stale).toBe(true);
		expect(changedEvidence.reasons).toContain("evidence-changed");

		const tampered: StudioExecutionPolicy = jsonClone(policy);
		Object.defineProperty(tampered.fields.targetLufs, "value", {
			value: -20,
			configurable: true,
			enumerable: true,
			writable: true,
		});
		const changedPayload = inspectStudioExecutionPolicyStaleness({
			policy: tampered,
			settings: originalSettings,
			evidence,
		});
		expect(changedPayload.stale).toBe(true);
		expect(changedPayload.reasons).toContain("policy-integrity-mismatch");
		expect(() => assertStudioExecutionPolicyIntegrity(tampered)).toThrow(
			"fingerprint does not match",
		);
	});

	test("rejects invalid settings instead of clamping them", () => {
		const invalidSettings: Array<[string, unknown]> = [
			["silenceThresholdMs", Number.NaN],
			["silenceThresholdMs", 149],
			["silenceThresholdMs", 2_001],
			["cutPaddingMs", Number.POSITIVE_INFINITY],
			["cutPaddingMs", -1],
			["cutPaddingMs", 801],
			["sceneSensitivity", -0.1],
			["sceneSensitivity", 100.1],
			["brollDensity", -1],
			["brollDensity", 101],
			["captionDensity", -1],
			["captionDensity", 101],
			["punchInIntensity", -1],
			["punchInIntensity", 25],
			["targetLufs", -25],
			["targetLufs", -5],
			["outputCount", 0],
			["outputCount", 7],
			["outputCount", 2.5],
			["fillerHandling", "automatic"],
		];

		for (const [field, value] of invalidSettings) {
			expect(() =>
				createStudioExecutionPolicy({
					settings: { ...settings(), [field]: value },
				}),
			).toThrow();
		}
		expect(() =>
			createStudioExecutionPolicy({
				settings: settings({
					silenceThresholdMs: 300,
					cutPaddingMs: 150,
				}),
			}),
		).toThrow("less than half");
		expect(() =>
			createStudioExecutionPolicy({
				settings: { ...settings(), unknownSetting: 1 },
			}),
		).toThrow("exactly the supported fields");
	});

	test("rejects malformed, unsupported, and ambiguous evidence", () => {
		expect(() =>
			createStudioExecutionPolicy({
				settings: settings(),
				evidence: [
					{
						kind: "emotion-score",
						artifactId: "emotion",
						fingerprint: "v1",
					},
				],
			}),
		).toThrow("unsupported kind");
		expect(() =>
			createStudioExecutionPolicy({
				settings: settings(),
				evidence: [
					{
						kind: "person-tracks",
						artifactId: "person",
						fingerprint: "v1",
						confidence: 0.9,
					},
				],
			}),
		).toThrow("exactly kind, artifactId, and fingerprint");
		expect(() =>
			createStudioExecutionPolicy({
				settings: settings(),
				evidence: [
					{
						kind: "person-tracks",
						artifactId: "person",
						fingerprint: "v1",
					},
					{
						kind: "person-tracks",
						artifactId: "person",
						fingerprint: "v2",
					},
				],
			}),
		).toThrow("duplicated");
		expect(() =>
			createStudioExecutionPolicy({
				settings: settings(),
				evidence: [
					{
						kind: "person-tracks",
						artifactId: " ",
						fingerprint: "v1",
					},
				],
			}),
		).toThrow("artifactId");
	});
});
