export const ROUGH_CUT_PLAN_KIND = "visioncut.rough-cut-plan" as const;
export const ROUGH_CUT_PLAN_SCHEMA_VERSION = 1 as const;

export type RoughCutReviewStatus = "proposed" | "approved" | "rejected";

export interface RoughCutEvidenceInterval {
	readonly evidenceId: string;
	readonly assetId: string;
	readonly kind: "low-audio-energy";
	readonly startSeconds: number;
	readonly endSeconds: number;
	readonly confidence: number;
	readonly method: string;
}

export interface RoughCutTimelineClip {
	readonly projectId: string;
	readonly sceneId: string;
	readonly trackId: string;
	readonly elementId: string;
	readonly assetId: string;
	readonly timelineStartSeconds: number;
	readonly sourceStartSeconds: number;
	readonly durationSeconds: number;
	readonly playbackRate: 1;
}

export interface RoughCutOptions {
	readonly minimumEvidenceSeconds: number;
	readonly cutPaddingSeconds: number;
	readonly minimumKeptSegmentSeconds: number;
}

export interface RoughCutEvidenceArtifact {
	readonly mediaIndexId: string;
	readonly assetFingerprint: string;
	readonly algorithmVersion: string;
}

export interface RoughCutOperation {
	readonly operationId: string;
	readonly status: RoughCutReviewStatus;
	readonly sourceRange: {
		readonly startSeconds: number;
		readonly endSeconds: number;
	};
	readonly timelineRange: {
		readonly startSeconds: number;
		readonly endSeconds: number;
	};
	readonly removedSeconds: number;
	readonly confidence: number;
	readonly evidenceIds: readonly string[];
	readonly reason: string;
}

export interface RoughCutPlan {
	readonly kind: typeof ROUGH_CUT_PLAN_KIND;
	readonly schemaVersion: typeof ROUGH_CUT_PLAN_SCHEMA_VERSION;
	readonly planId: string;
	readonly projectId: string;
	readonly assetId: string;
	readonly revision: number;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly baseline: RoughCutTimelineClip;
	readonly evidenceArtifact: RoughCutEvidenceArtifact;
	readonly options: RoughCutOptions;
	readonly operations: readonly RoughCutOperation[];
	readonly guarantees: {
		readonly localOnly: true;
		readonly transcriptUsed: false;
		readonly semanticClaims: false;
		readonly requiresExplicitApproval: true;
		readonly reversible: true;
	};
}

export class RoughCutPlanError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RoughCutPlanError";
	}
}

const GUARANTEES = Object.freeze({
	localOnly: true as const,
	transcriptUsed: false as const,
	semanticClaims: false as const,
	requiresExplicitApproval: true as const,
	reversible: true as const,
});

const DEFAULT_OPTIONS: RoughCutOptions = Object.freeze({
	minimumEvidenceSeconds: 0.45,
	cutPaddingSeconds: 0.08,
	minimumKeptSegmentSeconds: 0.2,
});

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumericRange(value: unknown): boolean {
	return (
		isRecord(value) &&
		typeof value.startSeconds === "number" &&
		typeof value.endSeconds === "number"
	);
}

function isRoughCutPlanShape(value: unknown): value is RoughCutPlan {
	if (
		!isRecord(value) ||
		!isRecord(value.baseline) ||
		!isRecord(value.evidenceArtifact) ||
		!isRecord(value.options) ||
		!isRecord(value.guarantees) ||
		!Array.isArray(value.operations)
	) {
		return false;
	}
	const baseline = value.baseline;
	const evidenceArtifact = value.evidenceArtifact;
	const options = value.options;
	return (
		typeof value.kind === "string" &&
		typeof value.schemaVersion === "number" &&
		typeof value.planId === "string" &&
		typeof value.projectId === "string" &&
		typeof value.assetId === "string" &&
		typeof value.revision === "number" &&
		typeof value.createdAt === "string" &&
		typeof value.updatedAt === "string" &&
		typeof baseline.projectId === "string" &&
		typeof baseline.sceneId === "string" &&
		typeof baseline.trackId === "string" &&
		typeof baseline.elementId === "string" &&
		typeof baseline.assetId === "string" &&
		typeof baseline.timelineStartSeconds === "number" &&
		typeof baseline.sourceStartSeconds === "number" &&
		typeof baseline.durationSeconds === "number" &&
		typeof baseline.playbackRate === "number" &&
		typeof evidenceArtifact.mediaIndexId === "string" &&
		typeof evidenceArtifact.assetFingerprint === "string" &&
		typeof evidenceArtifact.algorithmVersion === "string" &&
		typeof options.minimumEvidenceSeconds === "number" &&
		typeof options.cutPaddingSeconds === "number" &&
		typeof options.minimumKeptSegmentSeconds === "number" &&
		value.operations.every(
			(operation) =>
				isRecord(operation) &&
				typeof operation.operationId === "string" &&
				typeof operation.status === "string" &&
				isNumericRange(operation.sourceRange) &&
				isNumericRange(operation.timelineRange) &&
				typeof operation.removedSeconds === "number" &&
				typeof operation.confidence === "number" &&
				Array.isArray(operation.evidenceIds) &&
				operation.evidenceIds.every(
					(evidenceId) => typeof evidenceId === "string",
				) &&
				typeof operation.reason === "string",
		)
	);
}

function normalizeId({
	value,
	label,
}: {
	value: string;
	label: string;
}): string {
	const normalized = value.trim();
	if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u.test(normalized)) {
		throw new RoughCutPlanError(`${label} is invalid.`);
	}
	return normalized;
}

function assertFinite({
	value,
	label,
	minimum = 0,
}: {
	value: number;
	label: string;
	minimum?: number;
}): void {
	if (!Number.isFinite(value) || value < minimum) {
		throw new RoughCutPlanError(`${label} is invalid.`);
	}
}

function canonicalTimestamp(value: string): string {
	const milliseconds = Date.parse(value);
	if (
		!Number.isFinite(milliseconds) ||
		new Date(milliseconds).toISOString() !== value
	) {
		throw new RoughCutPlanError("Timestamp must be canonical ISO-8601.");
	}
	return value;
}

function roundTime(value: number): number {
	return Number(value.toFixed(6));
}

function stableHash(value: string): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}

function freezeOperation(operation: RoughCutOperation): RoughCutOperation {
	Object.freeze(operation.sourceRange);
	Object.freeze(operation.timelineRange);
	Object.freeze(operation.evidenceIds);
	return Object.freeze(operation);
}

function freezePlan(plan: RoughCutPlan): RoughCutPlan {
	Object.freeze(plan.baseline);
	Object.freeze(plan.evidenceArtifact);
	Object.freeze(plan.options);
	for (const operation of plan.operations) freezeOperation(operation);
	Object.freeze(plan.operations);
	return Object.freeze(plan);
}

function normalizeOptions(options?: Partial<RoughCutOptions>): RoughCutOptions {
	const normalized = {
		...DEFAULT_OPTIONS,
		...options,
	};
	assertFinite({
		value: normalized.minimumEvidenceSeconds,
		label: "minimumEvidenceSeconds",
		minimum: 0.1,
	});
	assertFinite({
		value: normalized.cutPaddingSeconds,
		label: "cutPaddingSeconds",
	});
	assertFinite({
		value: normalized.minimumKeptSegmentSeconds,
		label: "minimumKeptSegmentSeconds",
		minimum: 0.05,
	});
	if (normalized.cutPaddingSeconds * 2 >= normalized.minimumEvidenceSeconds) {
		throw new RoughCutPlanError(
			"Cut padding must leave part of the minimum evidence interval removable.",
		);
	}
	return Object.freeze(normalized);
}

function validateClip(clip: RoughCutTimelineClip): RoughCutTimelineClip {
	normalizeId({ value: clip.projectId, label: "projectId" });
	normalizeId({ value: clip.sceneId, label: "sceneId" });
	normalizeId({ value: clip.trackId, label: "trackId" });
	normalizeId({ value: clip.elementId, label: "elementId" });
	normalizeId({ value: clip.assetId, label: "assetId" });
	assertFinite({
		value: clip.timelineStartSeconds,
		label: "timelineStartSeconds",
	});
	assertFinite({
		value: clip.sourceStartSeconds,
		label: "sourceStartSeconds",
	});
	assertFinite({
		value: clip.durationSeconds,
		label: "durationSeconds",
		minimum: 0.001,
	});
	if (clip.playbackRate !== 1) {
		throw new RoughCutPlanError(
			"Only unretimed clips can receive a local rough cut.",
		);
	}
	return Object.freeze({ ...clip });
}

interface CandidateRange {
	startSeconds: number;
	endSeconds: number;
	confidence: number;
	evidenceIds: string[];
}

function collectCandidateRanges({
	clip,
	evidence,
	options,
}: {
	clip: RoughCutTimelineClip;
	evidence: readonly RoughCutEvidenceInterval[];
	options: RoughCutOptions;
}): CandidateRange[] {
	const visibleStart = clip.sourceStartSeconds;
	const visibleEnd = visibleStart + clip.durationSeconds;
	const ranges: CandidateRange[] = [];
	for (const item of evidence) {
		normalizeId({ value: item.evidenceId, label: "evidenceId" });
		if (
			normalizeId({ value: item.assetId, label: "evidence assetId" }) !==
			clip.assetId
		)
			continue;
		if (item.kind !== "low-audio-energy") continue;
		assertFinite({
			value: item.startSeconds,
			label: "evidence startSeconds",
		});
		assertFinite({ value: item.endSeconds, label: "evidence endSeconds" });
		if (item.endSeconds <= item.startSeconds) {
			throw new RoughCutPlanError(
				"Evidence ranges must have positive duration.",
			);
		}
		if (
			!Number.isFinite(item.confidence) ||
			item.confidence < 0 ||
			item.confidence > 1
		) {
			throw new RoughCutPlanError(
				"Evidence confidence must be between zero and one.",
			);
		}
		if (!item.method.trim())
			throw new RoughCutPlanError("Evidence method is required.");
		const intersectionStart = Math.max(visibleStart, item.startSeconds);
		const intersectionEnd = Math.min(visibleEnd, item.endSeconds);
		if (intersectionEnd - intersectionStart < options.minimumEvidenceSeconds) {
			continue;
		}
		const startSeconds = intersectionStart + options.cutPaddingSeconds;
		const endSeconds = intersectionEnd - options.cutPaddingSeconds;
		if (endSeconds <= startSeconds) continue;
		ranges.push({
			startSeconds,
			endSeconds,
			confidence: item.confidence,
			evidenceIds: [item.evidenceId],
		});
	}

	ranges.sort(
		(left, right) =>
			left.startSeconds - right.startSeconds ||
			left.endSeconds - right.endSeconds,
	);
	const merged: CandidateRange[] = [];
	for (const range of ranges) {
		const previous = merged.at(-1);
		if (previous && range.startSeconds <= previous.endSeconds) {
			previous.endSeconds = Math.max(previous.endSeconds, range.endSeconds);
			previous.confidence = Math.min(previous.confidence, range.confidence);
			previous.evidenceIds = [
				...new Set([...previous.evidenceIds, ...range.evidenceIds]),
			].sort();
		} else {
			merged.push({ ...range, evidenceIds: [...range.evidenceIds] });
		}
	}
	return merged;
}

export function createRoughCutPlan({
	clip: inputClip,
	evidence,
	evidenceArtifact: inputEvidenceArtifact,
	options: inputOptions,
	createdAt,
}: {
	clip: RoughCutTimelineClip;
	evidence: readonly RoughCutEvidenceInterval[];
	evidenceArtifact: RoughCutEvidenceArtifact;
	options?: Partial<RoughCutOptions>;
	createdAt: string;
}): RoughCutPlan {
	const clip = validateClip(inputClip);
	const evidenceArtifact = Object.freeze({
		mediaIndexId: normalizeId({
			value: inputEvidenceArtifact.mediaIndexId,
			label: "mediaIndexId",
		}),
		assetFingerprint: normalizeId({
			value: inputEvidenceArtifact.assetFingerprint,
			label: "assetFingerprint",
		}),
		algorithmVersion: inputEvidenceArtifact.algorithmVersion.trim(),
	});
	if (
		!evidenceArtifact.algorithmVersion ||
		evidenceArtifact.algorithmVersion.length > 300
	) {
		throw new RoughCutPlanError("Evidence algorithm version is invalid.");
	}
	const options = normalizeOptions(inputOptions);
	const timestamp = canonicalTimestamp(createdAt);
	const visibleStart = clip.sourceStartSeconds;
	const visibleEnd = visibleStart + clip.durationSeconds;
	const accepted: CandidateRange[] = [];
	for (const candidate of collectCandidateRanges({ clip, evidence, options })) {
		const previousEnd = accepted.at(-1)?.endSeconds ?? visibleStart;
		if (
			candidate.startSeconds - previousEnd <
				options.minimumKeptSegmentSeconds ||
			visibleEnd - candidate.endSeconds < options.minimumKeptSegmentSeconds
		) {
			continue;
		}
		accepted.push(candidate);
	}

	const identity = JSON.stringify({
		clip,
		evidenceArtifact,
		options,
		accepted,
	});
	const planId = `rough-cut-${stableHash(identity)}`;
	const operations = accepted.map((candidate, index) => {
		const sourceStart = roundTime(candidate.startSeconds);
		const sourceEnd = roundTime(candidate.endSeconds);
		const timelineStart = roundTime(
			clip.timelineStartSeconds + sourceStart - clip.sourceStartSeconds,
		);
		const timelineEnd = roundTime(
			clip.timelineStartSeconds + sourceEnd - clip.sourceStartSeconds,
		);
		return {
			operationId: `${planId}-op-${index + 1}`,
			status: "proposed" as const,
			sourceRange: { startSeconds: sourceStart, endSeconds: sourceEnd },
			timelineRange: { startSeconds: timelineStart, endSeconds: timelineEnd },
			removedSeconds: roundTime(sourceEnd - sourceStart),
			confidence: roundTime(candidate.confidence),
			evidenceIds: Object.freeze([...candidate.evidenceIds]),
			reason: "本地音频能量采样显示该区间持续低于活动阈值；尚未进行语音转写。",
		};
	});

	return freezePlan({
		kind: ROUGH_CUT_PLAN_KIND,
		schemaVersion: ROUGH_CUT_PLAN_SCHEMA_VERSION,
		planId,
		projectId: clip.projectId,
		assetId: clip.assetId,
		revision: 1,
		createdAt: timestamp,
		updatedAt: timestamp,
		baseline: clip,
		evidenceArtifact,
		options,
		operations,
		guarantees: GUARANTEES,
	});
}

export function reviewRoughCutOperation({
	plan,
	operationId,
	status,
	updatedAt,
}: {
	plan: RoughCutPlan;
	operationId: string;
	status: Exclude<RoughCutReviewStatus, "proposed">;
	updatedAt: string;
}): RoughCutPlan {
	assertRoughCutPlan(plan);
	canonicalTimestamp(updatedAt);
	if (Date.parse(updatedAt) < Date.parse(plan.updatedAt)) {
		throw new RoughCutPlanError("Review time cannot move backwards.");
	}
	if (
		!plan.operations.some((operation) => operation.operationId === operationId)
	) {
		throw new RoughCutPlanError("Rough-cut operation was not found.");
	}
	return freezePlan({
		...plan,
		revision: plan.revision + 1,
		updatedAt,
		operations: plan.operations.map((operation) =>
			operation.operationId === operationId
				? { ...operation, status }
				: { ...operation },
		),
	});
}

export function reviewAllRoughCutOperations({
	plan,
	status,
	updatedAt,
}: {
	plan: RoughCutPlan;
	status: Exclude<RoughCutReviewStatus, "proposed">;
	updatedAt: string;
}): RoughCutPlan {
	assertRoughCutPlan(plan);
	canonicalTimestamp(updatedAt);
	if (Date.parse(updatedAt) < Date.parse(plan.updatedAt)) {
		throw new RoughCutPlanError("Review time cannot move backwards.");
	}
	return freezePlan({
		...plan,
		revision: plan.revision + 1,
		updatedAt,
		operations: plan.operations.map((operation) => ({ ...operation, status })),
	});
}

export function getApprovedRoughCutOperations(
	plan: RoughCutPlan,
): readonly RoughCutOperation[] {
	assertRoughCutPlan(plan);
	return Object.freeze(
		plan.operations.filter((operation) => operation.status === "approved"),
	);
}

export function assertRoughCutPlan(plan: RoughCutPlan): void {
	if (
		plan.kind !== ROUGH_CUT_PLAN_KIND ||
		plan.schemaVersion !== ROUGH_CUT_PLAN_SCHEMA_VERSION ||
		plan.projectId !== plan.baseline.projectId ||
		plan.assetId !== plan.baseline.assetId ||
		plan.revision < 1 ||
		!Number.isSafeInteger(plan.revision)
	) {
		throw new RoughCutPlanError("Rough-cut plan identity is invalid.");
	}
	validateClip(plan.baseline);
	normalizeId({
		value: plan.evidenceArtifact.mediaIndexId,
		label: "mediaIndexId",
	});
	normalizeId({
		value: plan.evidenceArtifact.assetFingerprint,
		label: "assetFingerprint",
	});
	if (
		!plan.evidenceArtifact.algorithmVersion.trim() ||
		plan.evidenceArtifact.algorithmVersion.length > 300
	) {
		throw new RoughCutPlanError("Evidence algorithm version is invalid.");
	}
	canonicalTimestamp(plan.createdAt);
	canonicalTimestamp(plan.updatedAt);
	if (Date.parse(plan.updatedAt) < Date.parse(plan.createdAt)) {
		throw new RoughCutPlanError("Plan update time cannot predate creation.");
	}
	normalizeOptions(plan.options);
	if (JSON.stringify(plan.guarantees) !== JSON.stringify(GUARANTEES)) {
		throw new RoughCutPlanError("Rough-cut safety guarantees are invalid.");
	}
	let previousEnd = plan.baseline.sourceStartSeconds;
	const operationIds = new Set<string>();
	const sourceEnd =
		plan.baseline.sourceStartSeconds + plan.baseline.durationSeconds;
	for (const operation of plan.operations) {
		normalizeId({ value: operation.operationId, label: "operationId" });
		if (operationIds.has(operation.operationId)) {
			throw new RoughCutPlanError("Rough-cut operation ids must be unique.");
		}
		operationIds.add(operation.operationId);
		if (
			!(["proposed", "approved", "rejected"] as const).includes(
				operation.status,
			)
		) {
			throw new RoughCutPlanError("Rough-cut review status is invalid.");
		}
		if (
			operation.sourceRange.startSeconds < previousEnd ||
			operation.sourceRange.endSeconds <= operation.sourceRange.startSeconds ||
			operation.sourceRange.endSeconds > sourceEnd
		) {
			throw new RoughCutPlanError("Rough-cut source ranges are invalid.");
		}
		if (
			Math.abs(
				operation.timelineRange.startSeconds -
					(plan.baseline.timelineStartSeconds +
						operation.sourceRange.startSeconds -
						plan.baseline.sourceStartSeconds),
			) > 0.000001 ||
			Math.abs(
				operation.timelineRange.endSeconds -
					(plan.baseline.timelineStartSeconds +
						operation.sourceRange.endSeconds -
						plan.baseline.sourceStartSeconds),
			) > 0.000001
		) {
			throw new RoughCutPlanError("Rough-cut timeline mapping is invalid.");
		}
		if (operation.evidenceIds.length === 0 || !operation.reason.trim()) {
			throw new RoughCutPlanError(
				"Every rough-cut operation needs evidence and a reason.",
			);
		}
		previousEnd = operation.sourceRange.endSeconds;
	}
}

export function serializeRoughCutPlan(plan: RoughCutPlan): string {
	assertRoughCutPlan(plan);
	return JSON.stringify(plan);
}

export function deserializeRoughCutPlan(serialized: string): RoughCutPlan {
	let value: unknown;
	try {
		value = JSON.parse(serialized);
	} catch {
		throw new RoughCutPlanError("Stored rough-cut plan is not valid JSON.");
	}
	if (!isRoughCutPlanShape(value)) {
		throw new RoughCutPlanError("Stored rough-cut plan must be an object.");
	}
	const plan = value;
	assertRoughCutPlan(plan);
	return freezePlan(structuredClone(plan));
}
