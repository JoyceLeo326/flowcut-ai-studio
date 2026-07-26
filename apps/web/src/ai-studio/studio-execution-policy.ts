import type { StudioProSettings } from "./catalog";
import { MEDIA_INDEX_THRESHOLDS } from "./media-index";
import type { RoughCutOptions } from "./rough-cut-plan";

export const STUDIO_EXECUTION_POLICY_KIND =
	"visioncut.studio-execution-policy" as const;
export const STUDIO_EXECUTION_POLICY_SCHEMA_VERSION = 1 as const;
export const STUDIO_EXECUTION_POLICY_VERSION = "1.0.0" as const;
export const STUDIO_EXECUTION_FINGERPRINT_ALGORITHM =
	"fnv1a-dual-32/canonical-json-v1" as const;

export type StudioExecutionStatus = "automatic" | "review" | "blocked";

export type StudioExecutionEvidenceKind =
	| "audio-energy-intervals"
	| "video-frame-differences"
	| "transcript-word-timings"
	| "filler-token-classification"
	| "person-tracks"
	| "semantic-scene-labels"
	| "b-roll-candidates"
	| "integrated-loudness-measurement"
	| "approved-base-plan";

export interface StudioExecutionEvidence {
	readonly kind: StudioExecutionEvidenceKind;
	readonly artifactId: string;
	readonly fingerprint: string;
}

export interface StudioExecutionFieldPolicy<TValue, TResolvedValue> {
	readonly field: keyof StudioProSettings;
	readonly value: TValue;
	readonly resolvedValue: TResolvedValue;
	readonly status: StudioExecutionStatus;
	readonly eligibleStatus: Exclude<StudioExecutionStatus, "blocked">;
	readonly requiredEvidence: readonly StudioExecutionEvidenceKind[];
	readonly satisfiedEvidence: readonly StudioExecutionEvidence[];
	readonly missingEvidence: readonly StudioExecutionEvidenceKind[];
	readonly requiresExplicitApproval: boolean;
	readonly reason: string;
}

export interface StudioSceneDetectionThresholds {
	readonly sensitivityPercent: number;
	readonly minimumFrameDifference: number;
	readonly combinedFrameDifference: number;
	readonly minimumLuminanceDelta: number;
	readonly minimumSeparationSeconds: number;
}

export interface StudioExecutionPolicy {
	readonly kind: typeof STUDIO_EXECUTION_POLICY_KIND;
	readonly schemaVersion: typeof STUDIO_EXECUTION_POLICY_SCHEMA_VERSION;
	readonly policyVersion: typeof STUDIO_EXECUTION_POLICY_VERSION;
	readonly fingerprintAlgorithm: typeof STUDIO_EXECUTION_FINGERPRINT_ALGORITHM;
	readonly settingsFingerprint: string;
	readonly evidenceFingerprint: string;
	readonly planFingerprint: string;
	readonly settings: Readonly<StudioProSettings>;
	readonly evidence: readonly StudioExecutionEvidence[];
	readonly fields: {
		readonly silenceThresholdMs: StudioExecutionFieldPolicy<
			number,
			{
				readonly milliseconds: number;
				readonly seconds: number;
				readonly roughCutOption: "minimumEvidenceSeconds";
			}
		>;
		readonly cutPaddingMs: StudioExecutionFieldPolicy<
			number,
			{
				readonly milliseconds: number;
				readonly seconds: number;
				readonly roughCutOption: "cutPaddingSeconds";
			}
		>;
		readonly sceneSensitivity: StudioExecutionFieldPolicy<
			number,
			StudioSceneDetectionThresholds
		>;
		readonly brollDensity: StudioExecutionFieldPolicy<
			number,
			{
				readonly densityPercent: number;
				readonly proposalRatio: number;
				readonly reviewOnly: true;
			}
		>;
		readonly captionDensity: StudioExecutionFieldPolicy<
			number,
			{
				readonly densityPercent: number;
				readonly proposalRatio: number;
				readonly reviewOnly: true;
			}
		>;
		readonly punchInIntensity: StudioExecutionFieldPolicy<
			number,
			{
				readonly intensityPercent: number;
				readonly maximumScale: number;
				readonly reviewOnly: true;
			}
		>;
		readonly targetLufs: StudioExecutionFieldPolicy<
			number,
			{
				readonly integratedLufs: number;
				readonly unit: "LUFS";
				readonly deliveryRequirement: "required";
			}
		>;
		readonly outputCount: StudioExecutionFieldPolicy<
			number,
			{
				readonly count: number;
				readonly variantIds: readonly string[];
				readonly source: "approved-base-plan";
			}
		>;
		readonly fillerHandling: StudioExecutionFieldPolicy<
			StudioProSettings["fillerHandling"],
			{
				readonly mode: StudioProSettings["fillerHandling"];
				readonly destructive: boolean;
				readonly automaticRemoval: false;
			}
		>;
	};
	readonly roughCut: {
		readonly options: RoughCutOptions;
		readonly candidateGenerationStatus: StudioExecutionStatus;
		readonly evidenceKind: "audio-energy-intervals";
		readonly appliesAutomaticallyToCandidatesOnly: true;
		readonly operationsRequireExplicitApproval: true;
	};
	readonly sceneDetection: {
		readonly thresholds: StudioSceneDetectionThresholds;
		readonly status: StudioExecutionStatus;
		readonly evidenceKind: "video-frame-differences";
		readonly producesCandidatesOnly: true;
		readonly makesSemanticClaims: false;
	};
	readonly reviewOnly: {
		readonly broll: StudioExecutionPolicy["fields"]["brollDensity"];
		readonly captions: StudioExecutionPolicy["fields"]["captionDensity"];
		readonly punchIn: StudioExecutionPolicy["fields"]["punchInIntensity"];
	};
	readonly delivery: {
		readonly targetIntegratedLufs: number;
		readonly unit: "LUFS";
		readonly requirement: "required";
		readonly status: StudioExecutionStatus;
		readonly requiredEvidence: readonly ["integrated-loudness-measurement"];
	};
	readonly variants: {
		readonly count: number;
		readonly variantIds: readonly string[];
		readonly status: StudioExecutionStatus;
		readonly source: "approved-base-plan";
	};
	readonly filler: {
		readonly mode: StudioProSettings["fillerHandling"];
		readonly status: StudioExecutionStatus;
		readonly automaticRemoval: false;
		readonly requiresWordLevelReview: boolean;
	};
	readonly guarantees: {
		readonly deterministic: true;
		readonly settingsAreNotEvidence: true;
		readonly semanticOperationsNeedSemanticEvidence: true;
		readonly creativeOperationsAreReviewOnly: true;
		readonly destructiveFillerRemovalIsNeverAutomatic: true;
		readonly roughCutOperationsNeedExplicitApproval: true;
	};
}

export type StudioExecutionPolicyStaleReason =
	| "unsupported-policy-version"
	| "policy-integrity-mismatch"
	| "settings-changed"
	| "evidence-changed";

export interface StudioExecutionPolicyStaleness {
	readonly stale: boolean;
	readonly reasons: readonly StudioExecutionPolicyStaleReason[];
	readonly storedSettingsFingerprint: string;
	readonly currentSettingsFingerprint: string;
	readonly storedEvidenceFingerprint: string;
	readonly currentEvidenceFingerprint: string;
	readonly storedPlanFingerprint: string;
	readonly currentPlanFingerprint: string;
}

export class StudioExecutionPolicyError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "StudioExecutionPolicyError";
	}
}

const SETTING_KEYS = [
	"silenceThresholdMs",
	"cutPaddingMs",
	"sceneSensitivity",
	"brollDensity",
	"captionDensity",
	"punchInIntensity",
	"targetLufs",
	"outputCount",
	"fillerHandling",
] as const satisfies readonly (keyof StudioProSettings)[];

const EVIDENCE_KINDS = [
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

const EVIDENCE_ORDER = new Map(
	EVIDENCE_KINDS.map((kind, index) => [kind, index] as const),
);

const ROUGH_CUT_MINIMUM_KEPT_SEGMENT_SECONDS = 0.2;
const MAX_EVIDENCE_COUNT = 1_000;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function normalizeZero(value: number): number {
	return Object.is(value, -0) ? 0 : value;
}

function finiteNumber({
	value,
	label,
	minimum,
	maximum,
	integer = false,
}: {
	value: unknown;
	label: string;
	minimum: number;
	maximum: number;
	integer?: boolean;
}): number {
	if (
		typeof value !== "number" ||
		!Number.isFinite(value) ||
		value < minimum ||
		value > maximum ||
		(integer && !Number.isInteger(value))
	) {
		throw new StudioExecutionPolicyError(
			`${label} must be ${integer ? "an integer " : ""}between ${minimum} and ${maximum}.`,
		);
	}
	return normalizeZero(value);
}

function normalizeSettings(value: unknown): StudioProSettings {
	if (!isPlainRecord(value)) {
		throw new StudioExecutionPolicyError(
			"StudioProSettings must be a plain object.",
		);
	}
	const actualKeys = Object.keys(value).sort();
	const expectedKeys = [...SETTING_KEYS].sort();
	if (
		actualKeys.length !== expectedKeys.length ||
		actualKeys.some((key, index) => key !== expectedKeys[index])
	) {
		throw new StudioExecutionPolicyError(
			"StudioProSettings must contain exactly the supported fields.",
		);
	}

	const silenceThresholdMs = finiteNumber({
		value: value.silenceThresholdMs,
		label: "silenceThresholdMs",
		minimum: 150,
		maximum: 2_000,
	});
	const cutPaddingMs = finiteNumber({
		value: value.cutPaddingMs,
		label: "cutPaddingMs",
		minimum: 0,
		maximum: 800,
	});
	if (cutPaddingMs * 2 >= silenceThresholdMs) {
		throw new StudioExecutionPolicyError(
			"cutPaddingMs must be less than half of silenceThresholdMs.",
		);
	}

	const fillerHandling = value.fillerHandling;
	if (
		fillerHandling !== "review" &&
		fillerHandling !== "remove" &&
		fillerHandling !== "keep"
	) {
		throw new StudioExecutionPolicyError(
			"fillerHandling must be review, remove, or keep.",
		);
	}

	return {
		silenceThresholdMs,
		cutPaddingMs,
		sceneSensitivity: finiteNumber({
			value: value.sceneSensitivity,
			label: "sceneSensitivity",
			minimum: 0,
			maximum: 100,
		}),
		brollDensity: finiteNumber({
			value: value.brollDensity,
			label: "brollDensity",
			minimum: 0,
			maximum: 100,
		}),
		captionDensity: finiteNumber({
			value: value.captionDensity,
			label: "captionDensity",
			minimum: 0,
			maximum: 100,
		}),
		punchInIntensity: finiteNumber({
			value: value.punchInIntensity,
			label: "punchInIntensity",
			minimum: 0,
			maximum: 24,
		}),
		targetLufs: finiteNumber({
			value: value.targetLufs,
			label: "targetLufs",
			minimum: -24,
			maximum: -6,
		}),
		outputCount: finiteNumber({
			value: value.outputCount,
			label: "outputCount",
			minimum: 1,
			maximum: 6,
			integer: true,
		}),
		fillerHandling,
	};
}

function normalizeBoundedString({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): string {
	if (typeof value !== "string") {
		throw new StudioExecutionPolicyError(`${label} must be a string.`);
	}
	const normalized = value.trim();
	if (
		normalized.length === 0 ||
		normalized.length > 256 ||
		[...normalized].some((character) => {
			const code = character.charCodeAt(0);
			return code <= 31 || code === 127;
		})
	) {
		throw new StudioExecutionPolicyError(`${label} is invalid.`);
	}
	return normalized;
}

function isEvidenceKind(value: unknown): value is StudioExecutionEvidenceKind {
	return (
		typeof value === "string" &&
		EVIDENCE_KINDS.some((supportedKind) => supportedKind === value)
	);
}

function normalizeEvidence(
	value: readonly StudioExecutionEvidence[] | unknown,
): StudioExecutionEvidence[] {
	if (!Array.isArray(value)) {
		throw new StudioExecutionPolicyError("Evidence must be an array.");
	}
	if (value.length > MAX_EVIDENCE_COUNT) {
		throw new StudioExecutionPolicyError(
			`Evidence cannot exceed ${MAX_EVIDENCE_COUNT} entries.`,
		);
	}

	const normalized = value.map((entry, index) => {
		if (!isPlainRecord(entry)) {
			throw new StudioExecutionPolicyError(
				`Evidence at index ${index} must be a plain object.`,
			);
		}
		const keys = Object.keys(entry).sort();
		if (
			keys.length !== 3 ||
			keys[0] !== "artifactId" ||
			keys[1] !== "fingerprint" ||
			keys[2] !== "kind"
		) {
			throw new StudioExecutionPolicyError(
				`Evidence at index ${index} must contain exactly kind, artifactId, and fingerprint.`,
			);
		}
		if (!isEvidenceKind(entry.kind)) {
			throw new StudioExecutionPolicyError(
				`Evidence at index ${index} has an unsupported kind.`,
			);
		}
		return {
			kind: entry.kind,
			artifactId: normalizeBoundedString({
				value: entry.artifactId,
				label: `Evidence artifactId at index ${index}`,
			}),
			fingerprint: normalizeBoundedString({
				value: entry.fingerprint,
				label: `Evidence fingerprint at index ${index}`,
			}),
		};
	});

	normalized.sort((left, right) => {
		const kindOrder =
			(EVIDENCE_ORDER.get(left.kind) ?? Number.MAX_SAFE_INTEGER) -
			(EVIDENCE_ORDER.get(right.kind) ?? Number.MAX_SAFE_INTEGER);
		if (kindOrder !== 0) return kindOrder;
		const artifactOrder = left.artifactId.localeCompare(right.artifactId, "en");
		if (artifactOrder !== 0) return artifactOrder;
		return left.fingerprint.localeCompare(right.fingerprint, "en");
	});

	const artifactKeys = new Set<string>();
	for (const entry of normalized) {
		const key = `${entry.kind}\u0000${entry.artifactId}`;
		if (artifactKeys.has(key)) {
			throw new StudioExecutionPolicyError(
				`Evidence artifact ${entry.artifactId} is duplicated for ${entry.kind}.`,
			);
		}
		artifactKeys.add(key);
	}
	return normalized;
}

function round({
	value,
	digits = 6,
}: {
	value: number;
	digits?: number;
}): number {
	return normalizeZero(Number(value.toFixed(digits)));
}

function millisecondsToSeconds(milliseconds: number): number {
	return normalizeZero(milliseconds / 1_000);
}

function ratio(percent: number): number {
	return round({ value: percent / 100 });
}

function sceneThresholds(
	sensitivityPercent: number,
): StudioSceneDetectionThresholds {
	const thresholdFactor = 1.5 - sensitivityPercent / 100;
	return {
		sensitivityPercent,
		minimumFrameDifference: round({
			value:
				MEDIA_INDEX_THRESHOLDS.scene.minimumFrameDifference * thresholdFactor,
		}),
		combinedFrameDifference: round({
			value:
				MEDIA_INDEX_THRESHOLDS.scene.combinedFrameDifference * thresholdFactor,
		}),
		minimumLuminanceDelta: round({
			value:
				MEDIA_INDEX_THRESHOLDS.scene.minimumLuminanceDelta * thresholdFactor,
		}),
		minimumSeparationSeconds: round({
			value: 0.75 - sensitivityPercent * 0.005,
		}),
	};
}

function canonicalJson({
	value,
	path = "$",
}: {
	value: unknown;
	path?: string;
}): string {
	if (value === null) return "null";
	if (typeof value === "string" || typeof value === "boolean") {
		return JSON.stringify(value);
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw new StudioExecutionPolicyError(
				`${path} cannot contain a non-finite number.`,
			);
		}
		return JSON.stringify(normalizeZero(value));
	}
	if (Array.isArray(value)) {
		return `[${value
			.map((entry, index) =>
				canonicalJson({ value: entry, path: `${path}[${index}]` }),
			)
			.join(",")}]`;
	}
	if (!isPlainRecord(value)) {
		throw new StudioExecutionPolicyError(
			`${path} must contain only plain JSON values.`,
		);
	}
	return `{${Object.keys(value)
		.sort()
		.map(
			(key) =>
				`${JSON.stringify(key)}:${canonicalJson({
					value: value[key],
					path: `${path}.${key}`,
				})}`,
		)
		.join(",")}}`;
}

function fingerprint({
	namespace,
	value,
}: {
	namespace: string;
	value: unknown;
}): string {
	const serialized = `${namespace}\u0000${canonicalJson({ value })}`;
	let left = 0x811c9dc5;
	let right = 0x9e3779b9;
	for (let index = 0; index < serialized.length; index++) {
		const code = serialized.charCodeAt(index);
		left ^= code;
		left = Math.imul(left, 0x01000193);
		right ^= code + index;
		right = Math.imul(right, 0x85ebca6b);
		right ^= right >>> 13;
	}
	return `vcfp1_${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0)
		.toString(16)
		.padStart(8, "0")}`;
}

function deepFreeze<T>(value: T): T {
	if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
		return value;
	}
	for (const key of Object.keys(value)) {
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (descriptor && "value" in descriptor) {
			const nested: unknown = descriptor.value;
			deepFreeze(nested);
		}
	}
	return Object.freeze(value);
}

function evidenceFor({
	evidence,
	requiredEvidence,
}: {
	evidence: readonly StudioExecutionEvidence[];
	requiredEvidence: readonly StudioExecutionEvidenceKind[];
}): {
	satisfiedEvidence: StudioExecutionEvidence[];
	missingEvidence: StudioExecutionEvidenceKind[];
} {
	const required = new Set(requiredEvidence);
	const satisfiedEvidence = evidence.filter((entry) =>
		required.has(entry.kind),
	);
	const availableKinds = new Set(satisfiedEvidence.map((entry) => entry.kind));
	return {
		satisfiedEvidence: [...satisfiedEvidence],
		missingEvidence: requiredEvidence.filter(
			(kind) => !availableKinds.has(kind),
		),
	};
}

function fieldPolicy<TValue, TResolvedValue>({
	field,
	value,
	resolvedValue,
	eligibleStatus,
	requiredEvidence,
	evidence,
	availableReason,
	blockedReason,
}: {
	field: keyof StudioProSettings;
	value: TValue;
	resolvedValue: TResolvedValue;
	eligibleStatus: Exclude<StudioExecutionStatus, "blocked">;
	requiredEvidence: readonly StudioExecutionEvidenceKind[];
	evidence: readonly StudioExecutionEvidence[];
	availableReason: string;
	blockedReason: string;
}): StudioExecutionFieldPolicy<TValue, TResolvedValue> {
	const gate = evidenceFor({ evidence, requiredEvidence });
	const status =
		gate.missingEvidence.length === 0 ? eligibleStatus : ("blocked" as const);
	return {
		field,
		value,
		resolvedValue,
		status,
		eligibleStatus,
		requiredEvidence: [...requiredEvidence],
		satisfiedEvidence: gate.satisfiedEvidence,
		missingEvidence: gate.missingEvidence,
		requiresExplicitApproval: status === "review",
		reason: status === "blocked" ? blockedReason : availableReason,
	};
}

function planFingerprintPayload(
	policy: Omit<StudioExecutionPolicy, "planFingerprint">,
): unknown {
	return policy;
}

export function createStudioExecutionPolicy({
	settings: inputSettings,
	evidence: inputEvidence = [],
}: {
	settings: StudioProSettings | unknown;
	evidence?: readonly StudioExecutionEvidence[] | unknown;
}): StudioExecutionPolicy {
	const settings = normalizeSettings(inputSettings);
	const evidence = normalizeEvidence(inputEvidence);
	const settingsFingerprint = fingerprint({
		namespace: "studio-settings",
		value: settings,
	});
	const evidenceFingerprint = fingerprint({
		namespace: "studio-evidence",
		value: evidence,
	});

	const silenceThresholdSeconds = millisecondsToSeconds(
		settings.silenceThresholdMs,
	);
	const cutPaddingSeconds = millisecondsToSeconds(settings.cutPaddingMs);
	const thresholds = sceneThresholds(settings.sceneSensitivity);
	const variantIds = Array.from(
		{ length: settings.outputCount },
		(_, index) => `variant-${String(index + 1).padStart(2, "0")}`,
	);

	const silenceThresholdMs = fieldPolicy({
		field: "silenceThresholdMs",
		value: settings.silenceThresholdMs,
		resolvedValue: {
			milliseconds: settings.silenceThresholdMs,
			seconds: silenceThresholdSeconds,
			roughCutOption: "minimumEvidenceSeconds" as const,
		},
		eligibleStatus: "automatic",
		requiredEvidence: ["audio-energy-intervals"],
		evidence,
		availableReason:
			"Applies the duration threshold to local audio-energy candidate generation only; proposed removals still require approval.",
		blockedReason:
			"Audio-energy intervals are required before a silence duration threshold can produce candidates.",
	});
	const cutPaddingMs = fieldPolicy({
		field: "cutPaddingMs",
		value: settings.cutPaddingMs,
		resolvedValue: {
			milliseconds: settings.cutPaddingMs,
			seconds: cutPaddingSeconds,
			roughCutOption: "cutPaddingSeconds" as const,
		},
		eligibleStatus: "automatic",
		requiredEvidence: ["audio-energy-intervals"],
		evidence,
		availableReason:
			"Applies exact cut padding to local audio-energy candidates only; no timeline edit is automatic.",
		blockedReason:
			"Audio-energy intervals are required before cut padding can be applied to candidate ranges.",
	});
	const sceneSensitivity = fieldPolicy({
		field: "sceneSensitivity",
		value: settings.sceneSensitivity,
		resolvedValue: thresholds,
		eligibleStatus: "automatic",
		requiredEvidence: ["video-frame-differences"],
		evidence,
		availableReason:
			"Applies deterministic numeric thresholds to frame-difference candidate detection without making semantic scene claims.",
		blockedReason:
			"Video frame-difference samples are required before scene thresholds can produce candidates.",
	});
	const brollDensity = fieldPolicy({
		field: "brollDensity",
		value: settings.brollDensity,
		resolvedValue: {
			densityPercent: settings.brollDensity,
			proposalRatio: ratio(settings.brollDensity),
			reviewOnly: true as const,
		},
		eligibleStatus: "review",
		requiredEvidence: ["semantic-scene-labels", "b-roll-candidates"],
		evidence,
		availableReason:
			"Semantic scene labels and identified B-roll candidates may produce placement proposals, but every placement remains review-only.",
		blockedReason:
			"B-roll density cannot produce placements without semantic scene evidence and identified B-roll candidates.",
	});
	const captionDensity = fieldPolicy({
		field: "captionDensity",
		value: settings.captionDensity,
		resolvedValue: {
			densityPercent: settings.captionDensity,
			proposalRatio: ratio(settings.captionDensity),
			reviewOnly: true as const,
		},
		eligibleStatus: "review",
		requiredEvidence: ["transcript-word-timings"],
		evidence,
		availableReason:
			"Word-timed transcript evidence may produce caption proposals, but text and timing remain review-only.",
		blockedReason:
			"Caption density cannot produce captions without word-timed transcript evidence.",
	});
	const punchInIntensity = fieldPolicy({
		field: "punchInIntensity",
		value: settings.punchInIntensity,
		resolvedValue: {
			intensityPercent: settings.punchInIntensity,
			maximumScale: round({ value: 1 + settings.punchInIntensity / 100 }),
			reviewOnly: true as const,
		},
		eligibleStatus: "review",
		requiredEvidence: ["person-tracks"],
		evidence,
		availableReason:
			"Person-track evidence may produce crop-safe punch-in proposals, but every timing and crop remains review-only.",
		blockedReason:
			"Punch-in intensity cannot produce crops without current person-track evidence.",
	});
	const targetLufs = fieldPolicy({
		field: "targetLufs",
		value: settings.targetLufs,
		resolvedValue: {
			integratedLufs: settings.targetLufs,
			unit: "LUFS" as const,
			deliveryRequirement: "required" as const,
		},
		eligibleStatus: "automatic",
		requiredEvidence: ["integrated-loudness-measurement"],
		evidence,
		availableReason:
			"The target is a required delivery constraint and can be evaluated against measured integrated loudness.",
		blockedReason:
			"Integrated loudness measurement is required before LUFS compliance can be evaluated or mastered.",
	});
	const outputCount = fieldPolicy({
		field: "outputCount",
		value: settings.outputCount,
		resolvedValue: {
			count: settings.outputCount,
			variantIds,
			source: "approved-base-plan" as const,
		},
		eligibleStatus: "automatic",
		requiredEvidence: ["approved-base-plan"],
		evidence,
		availableReason:
			"Schedules a deterministic number of variants from an explicitly approved base plan.",
		blockedReason:
			"An approved base plan is required before output variants can be scheduled.",
	});

	const fillerRequiredEvidence =
		settings.fillerHandling === "keep"
			? ([] as const)
			: (["transcript-word-timings", "filler-token-classification"] as const);
	const fillerEligibleStatus =
		settings.fillerHandling === "keep"
			? ("automatic" as const)
			: ("review" as const);
	const fillerHandling = fieldPolicy({
		field: "fillerHandling",
		value: settings.fillerHandling,
		resolvedValue: {
			mode: settings.fillerHandling,
			destructive: settings.fillerHandling === "remove",
			automaticRemoval: false as const,
		},
		eligibleStatus: fillerEligibleStatus,
		requiredEvidence: fillerRequiredEvidence,
		evidence,
		availableReason:
			settings.fillerHandling === "keep"
				? "Keeping filler words is a non-destructive no-op and needs no inferred evidence."
				: "Word timings and explicit filler classification may produce review candidates; removal is never automatic.",
		blockedReason:
			"Filler handling needs both word-timed transcript evidence and explicit filler-token classification.",
	});

	const roughCutOptions: RoughCutOptions = {
		minimumEvidenceSeconds: silenceThresholdSeconds,
		cutPaddingSeconds,
		minimumKeptSegmentSeconds: ROUGH_CUT_MINIMUM_KEPT_SEGMENT_SECONDS,
	};

	const policyWithoutPlanFingerprint: Omit<
		StudioExecutionPolicy,
		"planFingerprint"
	> = {
		kind: STUDIO_EXECUTION_POLICY_KIND,
		schemaVersion: STUDIO_EXECUTION_POLICY_SCHEMA_VERSION,
		policyVersion: STUDIO_EXECUTION_POLICY_VERSION,
		fingerprintAlgorithm: STUDIO_EXECUTION_FINGERPRINT_ALGORITHM,
		settingsFingerprint,
		evidenceFingerprint,
		settings,
		evidence,
		fields: {
			silenceThresholdMs,
			cutPaddingMs,
			sceneSensitivity,
			brollDensity,
			captionDensity,
			punchInIntensity,
			targetLufs,
			outputCount,
			fillerHandling,
		},
		roughCut: {
			options: roughCutOptions,
			candidateGenerationStatus: silenceThresholdMs.status,
			evidenceKind: "audio-energy-intervals",
			appliesAutomaticallyToCandidatesOnly: true,
			operationsRequireExplicitApproval: true,
		},
		sceneDetection: {
			thresholds,
			status: sceneSensitivity.status,
			evidenceKind: "video-frame-differences",
			producesCandidatesOnly: true,
			makesSemanticClaims: false,
		},
		reviewOnly: {
			broll: brollDensity,
			captions: captionDensity,
			punchIn: punchInIntensity,
		},
		delivery: {
			targetIntegratedLufs: settings.targetLufs,
			unit: "LUFS",
			requirement: "required",
			status: targetLufs.status,
			requiredEvidence: ["integrated-loudness-measurement"],
		},
		variants: {
			count: settings.outputCount,
			variantIds,
			status: outputCount.status,
			source: "approved-base-plan",
		},
		filler: {
			mode: settings.fillerHandling,
			status: fillerHandling.status,
			automaticRemoval: false,
			requiresWordLevelReview: settings.fillerHandling !== "keep",
		},
		guarantees: {
			deterministic: true,
			settingsAreNotEvidence: true,
			semanticOperationsNeedSemanticEvidence: true,
			creativeOperationsAreReviewOnly: true,
			destructiveFillerRemovalIsNeverAutomatic: true,
			roughCutOperationsNeedExplicitApproval: true,
		},
	};
	const planFingerprint = fingerprint({
		namespace: "studio-execution-plan",
		value: planFingerprintPayload(policyWithoutPlanFingerprint),
	});

	return deepFreeze({
		...policyWithoutPlanFingerprint,
		planFingerprint,
	});
}

function policyIntegrityFingerprint(policy: StudioExecutionPolicy): string {
	const { planFingerprint: _planFingerprint, ...payload } = policy;
	return fingerprint({
		namespace: "studio-execution-plan",
		value: planFingerprintPayload(payload),
	});
}

export function assertStudioExecutionPolicyIntegrity(
	policy: StudioExecutionPolicy,
): void {
	if (
		policy.kind !== STUDIO_EXECUTION_POLICY_KIND ||
		policy.schemaVersion !== STUDIO_EXECUTION_POLICY_SCHEMA_VERSION ||
		policy.policyVersion !== STUDIO_EXECUTION_POLICY_VERSION ||
		policy.fingerprintAlgorithm !== STUDIO_EXECUTION_FINGERPRINT_ALGORITHM
	) {
		throw new StudioExecutionPolicyError(
			"Studio execution policy version is unsupported.",
		);
	}
	if (policyIntegrityFingerprint(policy) !== policy.planFingerprint) {
		throw new StudioExecutionPolicyError(
			"Studio execution policy fingerprint does not match its payload.",
		);
	}
}

export function inspectStudioExecutionPolicyStaleness({
	policy,
	settings,
	evidence = [],
}: {
	policy: StudioExecutionPolicy;
	settings: StudioProSettings | unknown;
	evidence?: readonly StudioExecutionEvidence[] | unknown;
}): StudioExecutionPolicyStaleness {
	const current = createStudioExecutionPolicy({ settings, evidence });
	const reasons: StudioExecutionPolicyStaleReason[] = [];

	if (
		policy.kind !== STUDIO_EXECUTION_POLICY_KIND ||
		policy.schemaVersion !== STUDIO_EXECUTION_POLICY_SCHEMA_VERSION ||
		policy.policyVersion !== STUDIO_EXECUTION_POLICY_VERSION ||
		policy.fingerprintAlgorithm !== STUDIO_EXECUTION_FINGERPRINT_ALGORITHM
	) {
		reasons.push("unsupported-policy-version");
	}
	try {
		if (policyIntegrityFingerprint(policy) !== policy.planFingerprint) {
			reasons.push("policy-integrity-mismatch");
		}
	} catch {
		reasons.push("policy-integrity-mismatch");
	}
	if (policy.settingsFingerprint !== current.settingsFingerprint) {
		reasons.push("settings-changed");
	}
	if (policy.evidenceFingerprint !== current.evidenceFingerprint) {
		reasons.push("evidence-changed");
	}
	if (
		reasons.length === 0 &&
		policy.planFingerprint !== current.planFingerprint
	) {
		reasons.push("policy-integrity-mismatch");
	}

	return deepFreeze({
		stale: reasons.length > 0,
		reasons,
		storedSettingsFingerprint: policy.settingsFingerprint,
		currentSettingsFingerprint: current.settingsFingerprint,
		storedEvidenceFingerprint: policy.evidenceFingerprint,
		currentEvidenceFingerprint: current.evidenceFingerprint,
		storedPlanFingerprint: policy.planFingerprint,
		currentPlanFingerprint: current.planFingerprint,
	});
}

export function isStudioExecutionPolicyStale(
	input: Parameters<typeof inspectStudioExecutionPolicyStaleness>[0],
): boolean {
	return inspectStudioExecutionPolicyStaleness(input).stale;
}
