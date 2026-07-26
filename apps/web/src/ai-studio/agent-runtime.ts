import {
	AGENT_ROLES,
	type AgentEvidence,
	type AgentEvidenceKind,
	type AgentOrchestration,
	type AgentRole,
	type AgentTask,
} from "./agent-orchestrator";
import {
	assertAgentEvidencePackageInvariants,
	resolveAgentEvidence,
	type AgentEvidencePackage,
	type AgentEvidenceResolverSources,
} from "./agent-evidence-resolver";
import { fingerprintJson, sha256Hex, stableJson } from "./chatcut-fingerprint";

export const AGENT_RUNTIME_SESSION_KIND =
	"visioncut.agent-runtime-session" as const;
export const AGENT_RUNTIME_SESSION_SCHEMA_VERSION = 2 as const;
const LEGACY_AGENT_RUNTIME_SESSION_SCHEMA_VERSION = 1 as const;
export const AGENT_RUNTIME_ROLES = AGENT_ROLES;
export type AgentRuntimeRole = AgentRole;
export const AGENT_RUNTIME_DEFAULT_ROLES = [
	"director",
	"story",
	"camera",
	"editor",
	"sound",
] as const satisfies readonly AgentRuntimeRole[];
export const LOCAL_EVIDENCE_PROVIDER = "local-free" as const;
export const LOCAL_EVIDENCE_MODEL = "visioncut-evidence-only-v1" as const;

const MAX_AUDIT_TEXT_LENGTH = 24_000;
const MAX_ARTIFACT_ITEMS = 50;
const MAX_RUNTIME_ROLES = AGENT_RUNTIME_ROLES.length;
const ROLE_ORDER = new Map(
	AGENT_RUNTIME_ROLES.map((role, index) => [role, index] as const),
);
const EVIDENCE_GATED_ACTION_ROLES = new Set<AgentRuntimeRole>([
	"camera",
	"editor",
	"color",
	"sound",
]);
const SENSITIVE_KEYS = new Set([
	"apikey",
	"authorization",
	"accesstoken",
	"refreshtoken",
	"password",
	"passwd",
	"secret",
	"credential",
	"cookie",
	"privatekey",
	"sessionkey",
]);
const SENSITIVE_VALUE_PATTERNS = [
	/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/giu,
	/\bsk-(?:ant-)?[A-Za-z0-9_-]{8,}\b/gu,
	/\bAIza[A-Za-z0-9_-]{12,}\b/gu,
	/\b(?:api[-_ ]?key|access[-_ ]?token|password|secret)\s*[:=]\s*["']?[^"',\s}]{8,}/giu,
] as const;
const RUNTIME_EVENT_TYPES = new Set<AgentRuntimeEventType>([
	"session-created",
	"session-migrated",
	"session-started",
	"run-started",
	"run-succeeded",
	"run-local-evidence-only",
	"run-failed",
	"run-aborted",
	"run-retry-queued",
	"session-finished",
]);

export type AgentRuntimeSessionStatus =
	| "queued"
	| "running"
	| "succeeded"
	| "local-evidence-only"
	| "partial"
	| "failed"
	| "aborted";

export type AgentRuntimeRunStatus =
	| "queued"
	| "running"
	| "succeeded"
	| "local-evidence-only"
	| "failed"
	| "aborted";

export type AgentRuntimeAttemptStatus =
	| "running"
	| "succeeded"
	| "local-evidence-only"
	| "failed"
	| "aborted";

export type AgentRuntimeExecutionMode = "local-evidence-only" | "byok";

export type AgentRuntimeActionKind =
	| "direction"
	| "story"
	| "camera"
	| "edit"
	| "color"
	| "sound"
	| "growth"
	| "note";

export type AgentRuntimeActionApplicability =
	| "eligible"
	| "review-only"
	| "blocked";

export interface AgentRuntimeEvidence {
	readonly evidenceId: string;
	readonly kind: AgentEvidenceKind;
	readonly label: string;
	readonly referenceId: string;
	readonly origin: AgentEvidence["origin"];
}

export interface AgentRuntimeDependencyArtifact {
	readonly taskId: string;
	readonly runId: string;
	readonly role: AgentRuntimeRole;
	readonly artifactId: string;
	readonly artifactDigest: `sha256:${string}`;
}

export interface AgentRuntimeFinding {
	readonly findingId: string;
	readonly statement: string;
	readonly evidenceIds: readonly string[];
	readonly verification: "evidence-cited" | "uncited";
}

export interface AgentRuntimeAction {
	readonly actionId: string;
	readonly kind: AgentRuntimeActionKind;
	readonly title: string;
	readonly description: string;
	readonly targetReference: string | null;
	readonly evidenceIds: readonly string[];
	readonly applicability: AgentRuntimeActionApplicability;
	readonly blockers: readonly string[];
}

export interface AgentRuntimeDeclaredConflict {
	readonly conflictId: string;
	readonly targetReference: string;
	readonly description: string;
	readonly evidenceIds: readonly string[];
}

export interface AgentRuntimeArtifact {
	readonly kind: "visioncut.agent-runtime-artifact";
	readonly schemaVersion: 1;
	readonly artifactId: string;
	readonly artifactDigest: `sha256:${string}`;
	readonly role: AgentRuntimeRole;
	readonly summary: string;
	readonly upstreamArtifacts: readonly AgentRuntimeDependencyArtifact[];
	readonly evidenceIds: readonly string[];
	readonly findings: readonly AgentRuntimeFinding[];
	readonly actions: readonly AgentRuntimeAction[];
	readonly declaredConflicts: readonly AgentRuntimeDeclaredConflict[];
	readonly limitations: readonly string[];
	readonly generatedBy: AgentRuntimeExecutionMode;
}

export interface AgentRuntimeUsage {
	readonly inputTokens?: number;
	readonly outputTokens?: number;
	readonly totalTokens?: number;
}

export interface AgentRuntimeFailure {
	readonly code: string;
	readonly message: string;
	readonly retryable: boolean;
}

export interface AgentRuntimeAttempt {
	readonly attemptId: string;
	readonly attempt: number;
	readonly executionMode: AgentRuntimeExecutionMode;
	readonly provider: string;
	readonly model: string;
	readonly status: AgentRuntimeAttemptStatus;
	readonly startedAt: string;
	readonly endedAt: string | null;
	readonly durationMs: number | null;
	readonly promptAudit: string;
	readonly responseAudit: string | null;
	readonly usage: AgentRuntimeUsage | null;
	readonly failure: AgentRuntimeFailure | null;
}

export interface AgentRuntimeRun {
	readonly runId: string;
	readonly taskId: string;
	readonly role: AgentRuntimeRole;
	readonly title: string;
	readonly purpose: string;
	readonly dependencyTaskIds: readonly string[];
	readonly dependencyArtifacts: readonly AgentRuntimeDependencyArtifact[];
	readonly evidenceRequirements: AgentTask["evidenceRequirements"];
	readonly inputEvidence: readonly AgentRuntimeEvidence[];
	readonly evidencePackage: AgentEvidencePackage;
	readonly maxRetries: number;
	readonly retryCount: number;
	readonly status: AgentRuntimeRunStatus;
	readonly attempts: readonly AgentRuntimeAttempt[];
	readonly artifact: AgentRuntimeArtifact | null;
}

export interface AgentRuntimeMergeConflict {
	readonly conflictId: string;
	readonly type: "declared" | "target-disagreement";
	readonly roles: readonly AgentRuntimeRole[];
	readonly runIds: readonly string[];
	readonly actionIds: readonly string[];
	readonly targetReference: string;
	readonly description: string;
	readonly evidenceIds: readonly string[];
}

export interface AgentRuntimeMerge {
	readonly fingerprint: `sha256:${string}`;
	readonly runIds: readonly string[];
	readonly artifactIds: readonly string[];
	readonly evidenceIds: readonly string[];
	readonly eligibleActionIds: readonly string[];
	readonly reviewOnlyActionIds: readonly string[];
	readonly blockedActionIds: readonly string[];
	readonly conflicts: readonly AgentRuntimeMergeConflict[];
}

export type AgentRuntimeEventType =
	| "session-created"
	| "session-migrated"
	| "session-started"
	| "run-started"
	| "run-succeeded"
	| "run-local-evidence-only"
	| "run-failed"
	| "run-aborted"
	| "run-retry-queued"
	| "session-finished";

export interface AgentRuntimeEvent {
	readonly eventId: string;
	readonly revision: number;
	readonly type: AgentRuntimeEventType;
	readonly at: string;
	readonly runId: string | null;
	readonly detail: string;
}

export interface AgentRuntimeSession {
	readonly kind: typeof AGENT_RUNTIME_SESSION_KIND;
	readonly schemaVersion: typeof AGENT_RUNTIME_SESSION_SCHEMA_VERSION;
	readonly sessionId: string;
	readonly projectId: string;
	readonly orchestrationId: string;
	readonly orchestrationRevision: number;
	readonly revision: number;
	readonly status: AgentRuntimeSessionStatus;
	readonly selectedRoles: readonly AgentRuntimeRole[];
	readonly concurrencyLimit: number;
	readonly runs: readonly AgentRuntimeRun[];
	readonly merge: AgentRuntimeMerge;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly events: readonly AgentRuntimeEvent[];
	readonly guarantees: {
		readonly localDefault: true;
		readonly apiKeysStored: false;
		readonly mediaMutated: false;
		readonly evidenceRequiredForApplicableActions: true;
		readonly deterministicMerge: true;
	};
}

export interface AgentModelInvocation {
	readonly sessionId: string;
	readonly runId: string;
	readonly role: AgentRuntimeRole;
	readonly attempt: number;
	readonly provider: string;
	readonly model: string;
	readonly systemPrompt: string;
	readonly prompt: string;
	readonly evidence: readonly AgentRuntimeEvidence[];
	readonly evidencePackage: AgentEvidencePackage;
	readonly dependencyArtifacts: readonly AgentRuntimeDependencyArtifact[];
	readonly signal: AbortSignal;
}

export interface AgentModelInvocationSuccess {
	readonly ok: true;
	readonly text: string;
	readonly usage?: AgentRuntimeUsage;
}

export interface AgentModelInvocationFailure {
	readonly ok: false;
	readonly error: {
		readonly code: string;
		readonly message: string;
		readonly retryable: boolean;
	};
}

export type AgentModelInvocationResult =
	| AgentModelInvocationSuccess
	| AgentModelInvocationFailure;

export type AgentModelInvoker = (
	request: AgentModelInvocation,
) => Promise<AgentModelInvocationResult>;

export interface AgentRuntimeModelBinding {
	readonly provider: string;
	readonly model: string;
	readonly invoke: AgentModelInvoker;
}

export type AgentRuntimeEvidenceSources = AgentEvidenceResolverSources;

export interface AgentRuntimeUpdate {
	readonly session: AgentRuntimeSession;
	readonly event: AgentRuntimeEvent;
}

export type AgentRuntimeUpdateHandler = (
	update: AgentRuntimeUpdate,
) => Promise<void> | void;

interface RuntimeClock {
	now(): number;
}

interface ExecuteAgentRuntimeOptions {
	readonly session: AgentRuntimeSession;
	readonly orchestration: AgentOrchestration;
	readonly model?: AgentRuntimeModelBinding;
	readonly signal?: AbortSignal;
	readonly onUpdate?: AgentRuntimeUpdateHandler;
	readonly clock?: RuntimeClock;
	readonly runIds?: readonly string[];
}

export class AgentRuntimeValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentRuntimeValidationError";
	}
}

export class AgentRuntimeExecutionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentRuntimeExecutionError";
	}
}

class AgentModelResultError extends Error {
	readonly code: string;
	readonly retryable: boolean;

	constructor({
		code,
		message,
		retryable,
	}: {
		code: string;
		message: string;
		retryable: boolean;
	}) {
		super(message);
		this.name = "AgentModelResultError";
		this.code = code;
		this.retryable = retryable;
	}
}

const GUARANTEES = Object.freeze({
	localDefault: true,
	apiKeysStored: false,
	mediaMutated: false,
	evidenceRequiredForApplicableActions: true,
	deterministicMerge: true,
} as const);

const EMPTY_MERGE_INPUT = Object.freeze({
	runIds: [] as string[],
	artifactIds: [] as string[],
	evidenceIds: [] as string[],
	eligibleActionIds: [] as string[],
	reviewOnlyActionIds: [] as string[],
	blockedActionIds: [] as string[],
	conflicts: [] as AgentRuntimeMergeConflict[],
});

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<T>(value: T): T {
	if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
		return value;
	}
	for (const key of Reflect.ownKeys(value)) {
		deepFreeze(Reflect.get(value, key));
	}
	return Object.freeze(value);
}

function normalizeText({
	value,
	label,
	maxLength,
	fallback,
}: {
	value: unknown;
	label: string;
	maxLength: number;
	fallback?: string;
}): string {
	if (typeof value !== "string") {
		if (fallback !== undefined) return fallback;
		throw new AgentRuntimeValidationError(`${label} must be text.`);
	}
	const normalized = redactSensitiveText(
		value.normalize("NFKC").trim().replace(/\s+/gu, " "),
	);
	if (!normalized) {
		if (fallback !== undefined) return fallback;
		throw new AgentRuntimeValidationError(`${label} cannot be empty.`);
	}
	return Array.from(normalized).slice(0, maxLength).join("");
}

function normalizeIdentifier({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): string {
	const normalized = normalizeText({ value, label, maxLength: 240 });
	if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(normalized)) {
		throw new AgentRuntimeValidationError(
			`${label} contains unsupported characters.`,
		);
	}
	return normalized;
}

function canonicalTimestamp(milliseconds: number): string {
	if (!Number.isFinite(milliseconds)) {
		throw new AgentRuntimeValidationError(
			"Runtime clock returned invalid time.",
		);
	}
	return new Date(milliseconds).toISOString();
}

function normalizeTimestamp({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): string {
	if (typeof value !== "string") {
		throw new AgentRuntimeValidationError(`${label} must be text.`);
	}
	const milliseconds = Date.parse(value);
	if (
		!Number.isFinite(milliseconds) ||
		new Date(milliseconds).toISOString() !== value
	) {
		throw new AgentRuntimeValidationError(
			`${label} must be a canonical ISO timestamp.`,
		);
	}
	return value;
}

function roleIndex(role: AgentRuntimeRole): number {
	return ROLE_ORDER.get(role) ?? Number.MAX_SAFE_INTEGER;
}

function sortRoles(roles: readonly AgentRuntimeRole[]): AgentRuntimeRole[] {
	return [...roles].sort((left, right) => roleIndex(left) - roleIndex(right));
}

function uniqueSorted(values: readonly string[]): string[] {
	return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isSensitiveKey(value: string): boolean {
	const normalized = value.replace(/[^A-Za-z0-9]/gu, "").toLocaleLowerCase();
	return (
		SENSITIVE_KEYS.has(normalized) ||
		[...SENSITIVE_KEYS].some((key) => normalized.endsWith(key))
	);
}

function redactSensitiveText(value: string): string {
	let redacted = value;
	for (const pattern of SENSITIVE_VALUE_PATTERNS) {
		redacted = redacted.replace(pattern, "[REDACTED]");
	}
	return redacted;
}

export type AgentAuditValue =
	| null
	| boolean
	| number
	| string
	| readonly AgentAuditValue[]
	| { readonly [key: string]: AgentAuditValue };

export function redactAgentAuditValue({
	value,
	path = "$",
	seen = new WeakSet<object>(),
}: {
	value: unknown;
	path?: string;
	seen?: WeakSet<object>;
}): AgentAuditValue {
	if (value === null || typeof value === "boolean") return value;
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw new AgentRuntimeValidationError(
				`${path} contains a non-finite number.`,
			);
		}
		return value;
	}
	if (typeof value === "string") return redactSensitiveText(value);
	if (typeof value !== "object") {
		throw new AgentRuntimeValidationError(
			`${path} is not portable audit data.`,
		);
	}
	if (
		value instanceof ArrayBuffer ||
		ArrayBuffer.isView(value) ||
		(typeof Blob !== "undefined" && value instanceof Blob) ||
		(typeof File !== "undefined" && value instanceof File)
	) {
		throw new AgentRuntimeValidationError(`${path} contains a binary payload.`);
	}
	if (seen.has(value)) {
		throw new AgentRuntimeValidationError(
			`${path} contains a cyclic or shared object reference.`,
		);
	}
	seen.add(value);
	if (Array.isArray(value)) {
		return value.map((entry, index) =>
			redactAgentAuditValue({
				value: entry,
				path: `${path}[${index}]`,
				seen,
			}),
		);
	}
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		throw new AgentRuntimeValidationError(
			`${path} contains a non-JSON object.`,
		);
	}
	const output: Record<string, AgentAuditValue> = {};
	for (const key of Object.keys(value)) {
		output[key] = isSensitiveKey(key)
			? "[REDACTED]"
			: redactAgentAuditValue({
					value: Reflect.get(value, key),
					path: `${path}.${key}`,
					seen,
				});
	}
	return output;
}

export function assertAgentAuditSafe({
	value,
	path = "$",
	seen = new WeakSet<object>(),
}: {
	value: unknown;
	path?: string;
	seen?: WeakSet<object>;
}): void {
	if (value === null || typeof value === "boolean") return;
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw new AgentRuntimeValidationError(
				`${path} contains a non-finite number.`,
			);
		}
		return;
	}
	if (typeof value === "string") {
		if (redactSensitiveText(value) !== value) {
			throw new AgentRuntimeValidationError(
				`${path} contains sensitive credential material.`,
			);
		}
		return;
	}
	if (typeof value !== "object") {
		throw new AgentRuntimeValidationError(`${path} is not portable JSON.`);
	}
	if (
		value instanceof ArrayBuffer ||
		ArrayBuffer.isView(value) ||
		(typeof Blob !== "undefined" && value instanceof Blob) ||
		(typeof File !== "undefined" && value instanceof File)
	) {
		throw new AgentRuntimeValidationError(`${path} contains a binary payload.`);
	}
	if (seen.has(value)) {
		throw new AgentRuntimeValidationError(
			`${path} contains a cyclic or shared object reference.`,
		);
	}
	seen.add(value);
	if (Array.isArray(value)) {
		for (const [index, entry] of value.entries()) {
			assertAgentAuditSafe({
				value: entry,
				path: `${path}[${index}]`,
				seen,
			});
		}
		return;
	}
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		throw new AgentRuntimeValidationError(
			`${path} contains a non-JSON object.`,
		);
	}
	for (const key of Object.keys(value)) {
		if (isSensitiveKey(key)) {
			throw new AgentRuntimeValidationError(
				`${path}.${key} is a forbidden sensitive field.`,
			);
		}
		assertAgentAuditSafe({
			value: Reflect.get(value, key),
			path: `${path}.${key}`,
			seen,
		});
	}
}

function sanitizeAuditText(value: string): string {
	return Array.from(redactSensitiveText(value))
		.slice(0, MAX_AUDIT_TEXT_LENGTH)
		.join("");
}

function evidenceSnapshot({
	task,
	orchestration,
}: {
	task: AgentTask;
	orchestration: AgentOrchestration;
}): AgentRuntimeEvidence[] {
	const accepted = new Set(task.inputEvidenceIds);
	return orchestration.evidence
		.filter((item) => accepted.has(item.evidenceId))
		.map((item) => ({
			evidenceId: item.evidenceId,
			kind: item.kind,
			label: sanitizeAuditText(item.label),
			referenceId: sanitizeAuditText(item.referenceId),
			origin: item.origin,
		}))
		.sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
}

function assertAcyclicRunGraph(runs: readonly AgentRuntimeRun[]): void {
	const runByTaskId = new Map(runs.map((run) => [run.taskId, run] as const));
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (run: AgentRuntimeRun): void => {
		if (visited.has(run.taskId)) return;
		if (visiting.has(run.taskId)) {
			throw new AgentRuntimeValidationError(
				`Agent dependency cycle includes ${run.taskId}.`,
			);
		}
		visiting.add(run.taskId);
		for (const dependencyTaskId of run.dependencyTaskIds) {
			const dependency = runByTaskId.get(dependencyTaskId);
			if (dependency === undefined) {
				throw new AgentRuntimeValidationError(
					`Agent dependency ${dependencyTaskId} is not part of the runtime session.`,
				);
			}
			visit(dependency);
		}
		visiting.delete(run.taskId);
		visited.add(run.taskId);
	};
	for (const run of runs) visit(run);
}

function outputKindForRole(role: AgentRuntimeRole): AgentRuntimeActionKind {
	switch (role) {
		case "director":
			return "direction";
		case "story":
			return "story";
		case "camera":
			return "camera";
		case "editor":
			return "edit";
		case "color":
			return "color";
		case "sound":
			return "sound";
		case "growth":
			return "growth";
	}
}

type EvidenceGatedActionRole = "camera" | "editor" | "color" | "sound";

interface RoleActionEvidenceRule {
	readonly actionKind: "camera" | "edit" | "color" | "sound";
	readonly strongEvidenceKinds: ReadonlySet<AgentEvidenceKind>;
	readonly explanation: string;
}

const ROLE_ACTION_EVIDENCE_MATRIX = {
	camera: {
		actionKind: "camera",
		strongEvidenceKinds: new Set<AgentEvidenceKind>([
			"scene-analysis",
			"visual-analysis",
		]),
		explanation:
			"Camera actions require scene or visual analysis evidence; asset names and generic metadata cannot establish framing, movement, or shot quality.",
	},
	editor: {
		actionKind: "edit",
		strongEvidenceKinds: new Set<AgentEvidenceKind>([
			"scene-analysis",
			"transcript",
			"audio-analysis",
		]),
		explanation:
			"Editor actions require scene, transcript, or audio analysis evidence; asset names and generic metadata are context only.",
	},
	color: {
		actionKind: "color",
		strongEvidenceKinds: new Set<AgentEvidenceKind>(["visual-analysis"]),
		explanation:
			"Color actions require visual analysis evidence; asset names and generic metadata cannot establish a grading decision.",
	},
	sound: {
		actionKind: "sound",
		strongEvidenceKinds: new Set<AgentEvidenceKind>([
			"audio-analysis",
			"transcript",
		]),
		explanation:
			"Sound actions require audio analysis or transcript evidence; generic audio metadata cannot establish a timing or mix decision.",
	},
} as const satisfies Record<EvidenceGatedActionRole, RoleActionEvidenceRule>;

function isEvidenceGatedActionRole(
	role: AgentRuntimeRole,
): role is EvidenceGatedActionRole {
	return EVIDENCE_GATED_ACTION_ROLES.has(role);
}

function evidenceBlockersForAction({
	role,
	actionKind,
	citedKinds,
}: {
	role: AgentRuntimeRole;
	actionKind: AgentRuntimeActionKind;
	citedKinds: ReadonlySet<AgentEvidenceKind>;
}): string[] {
	if (!isEvidenceGatedActionRole(role)) return [];
	const rule = ROLE_ACTION_EVIDENCE_MATRIX[role];
	const blockers: string[] = [];
	if (actionKind !== rule.actionKind) {
		blockers.push(
			`The ${role} contract cannot make a ${actionKind} action eligible.`,
		);
	}
	if (![...rule.strongEvidenceKinds].some((kind) => citedKinds.has(kind))) {
		blockers.push(rule.explanation);
	}
	return blockers;
}

type AgentRuntimeArtifactWithoutDigest = Omit<
	AgentRuntimeArtifact,
	"artifactDigest"
>;

function finalizeArtifact(
	artifact: AgentRuntimeArtifactWithoutDigest,
): AgentRuntimeArtifact {
	return deepFreeze({
		...artifact,
		artifactDigest: fingerprintJson(artifact),
	});
}

function expectedArtifactDigest(
	artifact: AgentRuntimeArtifact,
): `sha256:${string}` {
	const { artifactDigest: _artifactDigest, ...payload } = artifact;
	return fingerprintJson(payload);
}

function localEvidenceArtifact({
	run,
}: {
	run: AgentRuntimeRun;
}): AgentRuntimeArtifact {
	const evidenceIds = run.inputEvidence.map((item) => item.evidenceId);
	const artifactIdentity = {
		runId: run.runId,
		mode: "local-evidence-only",
		evidenceIds,
	};
	return finalizeArtifact({
		kind: "visioncut.agent-runtime-artifact",
		schemaVersion: 1,
		artifactId: `artifact-${sha256Hex(stableJson(artifactIdentity)).slice(0, 20)}`,
		role: run.role,
		summary:
			evidenceIds.length === 0
				? "No model was invoked and no cited evidence was available. No analysis or edit decision was produced."
				: `No model was invoked. The runtime indexed ${evidenceIds.length} cited evidence record(s) without claiming semantic media analysis.`,
		upstreamArtifacts: run.dependencyArtifacts.map((artifact) => ({
			...artifact,
		})),
		evidenceIds,
		findings: run.inputEvidence.slice(0, MAX_ARTIFACT_ITEMS).map((item) => ({
			findingId: `finding-${sha256Hex(`${run.runId}:${item.evidenceId}`).slice(0, 16)}`,
			statement: `Available evidence: ${item.label}`,
			evidenceIds: [item.evidenceId],
			verification:
				run.role !== "camera" ||
				item.kind === "scene-analysis" ||
				item.kind === "visual-analysis"
					? ("evidence-cited" as const)
					: ("uncited" as const),
		})),
		actions: [],
		declaredConflicts: [],
		limitations: [
			"Local evidence-only mode does not call a model.",
			"It does not infer dialogue, people, objects, emotion, or semantic scene content.",
			"It does not mutate media or mark edit actions as applicable.",
			...run.evidencePackage.limitations,
		],
		generatedBy: "local-evidence-only",
	});
}

function buildAgentPrompts({ run }: { run: AgentRuntimeRun }): {
	systemPrompt: string;
	prompt: string;
} {
	const evidence = run.inputEvidence.map((item) => ({
		evidenceId: item.evidenceId,
		kind: item.kind,
		label: item.label,
		referenceId: item.referenceId,
		origin: item.origin,
	}));
	const prompt = [
		`Role: ${run.role}`,
		`Task: ${run.title}`,
		`Purpose: ${run.purpose}`,
		"Completed upstream artifacts (cite these artifactId and artifactDigest values when using an upstream decision):",
		stableJson(run.dependencyArtifacts),
		"Evidence (only these IDs may be cited):",
		stableJson(evidence),
		"Resolved evidence package metadata:",
		stableJson({
			kind: run.evidencePackage.kind,
			schemaVersion: run.evidencePackage.schemaVersion,
			resolverVersion: run.evidencePackage.resolverVersion,
			role: run.evidencePackage.role,
			fingerprint: run.evidencePackage.fingerprint,
			provenance: run.evidencePackage.provenance,
			includedEvidenceIds: run.evidencePackage.includedEvidenceIds,
			omittedEvidenceIds: run.evidencePackage.omittedEvidenceIds,
			budget: run.evidencePackage.budget,
			guarantees: run.evidencePackage.guarantees,
		}),
		"Resolved evidence limitations:",
		stableJson(run.evidencePackage.limitations),
		"Resolved evidence text:",
		run.evidencePackage.text,
		"Return strict JSON with this shape:",
		'{"summary":"...","findings":[{"findingId":"...","statement":"...","evidenceIds":["..."]}],"actions":[{"actionId":"...","kind":"direction|story|camera|edit|color|sound|growth|note","title":"...","description":"...","targetReference":"optional","evidenceIds":["..."],"applicable":false}],"conflicts":[{"conflictId":"...","targetReference":"...","description":"...","evidenceIds":["..."]}]}',
		"Every factual finding and action must cite evidenceId values from the supplied evidence.",
		"Camera, Editor, Color, and Sound actions use separate evidence compatibility rules; generic metadata alone never makes an action eligible.",
		"Camera footage-specific framing or movement findings and actions must cite scene-analysis or visual-analysis evidence; generic metadata is context only.",
		"Do not refer to an upstream result by task ID alone. Use the supplied artifactId and artifactDigest pair.",
		"Never claim to have inspected media beyond the supplied evidence metadata.",
		"Do not infer people, speakers, objects, emotions, or semantic scene content from frame, luminance, or audio-energy signals.",
	].join("\n");
	const systemPrompt = [
		"You are one role in VisionCut's reviewable video-production team.",
		"Use only the supplied evidence and return JSON only.",
		"Do not reveal or request credentials.",
		"Your output is a proposal, never proof that media was changed.",
	].join(" ");
	return {
		systemPrompt: sanitizeAuditText(systemPrompt),
		prompt: sanitizeAuditText(prompt),
	};
}

function extractJsonObject(text: string): unknown | null {
	const trimmed = text.trim();
	const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu)?.[1];
	const candidate = fenced ?? trimmed;
	try {
		return JSON.parse(candidate) as unknown;
	} catch {
		const start = candidate.indexOf("{");
		const end = candidate.lastIndexOf("}");
		if (start < 0 || end <= start) return null;
		try {
			return JSON.parse(candidate.slice(start, end + 1)) as unknown;
		} catch {
			return null;
		}
	}
}

function readStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return uniqueSorted(
		value
			.filter((entry): entry is string => typeof entry === "string")
			.map((entry) => entry.normalize("NFKC").trim())
			.filter(Boolean)
			.slice(0, MAX_ARTIFACT_ITEMS),
	);
}

function normalizeActionKind({
	value,
	role,
}: {
	value: unknown;
	role: AgentRuntimeRole;
}): AgentRuntimeActionKind {
	switch (value) {
		case "direction":
		case "story":
		case "camera":
		case "edit":
		case "color":
		case "sound":
		case "growth":
		case "note":
			return value;
		default:
			return outputKindForRole(role);
	}
}

function normalizeArtifact({
	run,
	responseText,
}: {
	run: AgentRuntimeRun;
	responseText: string;
}): AgentRuntimeArtifact {
	const parsed = extractJsonObject(responseText);
	const source = isRecord(parsed) ? parsed : {};
	const knownEvidence = new Map(
		run.inputEvidence.map((item) => [item.evidenceId, item] as const),
	);
	const normalizeEvidenceIds = (value: unknown) =>
		readStringArray(value).filter((evidenceId) =>
			knownEvidence.has(evidenceId),
		);
	const rawFindings = Array.isArray(source.findings)
		? source.findings.slice(0, MAX_ARTIFACT_ITEMS)
		: [];
	const findings: AgentRuntimeFinding[] = rawFindings
		.filter(isRecord)
		.map((finding, index) => {
			const evidenceIds = normalizeEvidenceIds(finding.evidenceIds);
			const evidenceKinds = new Set(
				evidenceIds
					.map((evidenceId) => knownEvidence.get(evidenceId)?.kind)
					.filter((kind): kind is AgentEvidenceKind => kind !== undefined),
			);
			const evidenceQualifies =
				run.role !== "camera" ||
				evidenceKinds.has("scene-analysis") ||
				evidenceKinds.has("visual-analysis");
			const statement = normalizeText({
				value: finding.statement,
				label: "Finding statement",
				maxLength: 1_200,
				fallback: "Provider returned an empty finding.",
			});
			const requestedId =
				typeof finding.findingId === "string" ? finding.findingId : "";
			const findingId = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(requestedId)
				? requestedId
				: `finding-${sha256Hex(`${run.runId}:${index}:${statement}`).slice(0, 16)}`;
			return {
				findingId,
				statement,
				evidenceIds,
				verification:
					evidenceIds.length > 0 && evidenceQualifies
						? "evidence-cited"
						: "uncited",
			};
		});
	const rawActions = Array.isArray(source.actions)
		? source.actions.slice(0, MAX_ARTIFACT_ITEMS)
		: [];
	const actions: AgentRuntimeAction[] = rawActions
		.filter(isRecord)
		.map((action, index) => {
			const requestedEvidenceIds = readStringArray(action.evidenceIds);
			const evidenceIds = requestedEvidenceIds.filter((evidenceId) =>
				knownEvidence.has(evidenceId),
			);
			const missingEvidenceIds = requestedEvidenceIds.filter(
				(evidenceId) => !knownEvidence.has(evidenceId),
			);
			const citedKinds = new Set(
				evidenceIds
					.map((evidenceId) => knownEvidence.get(evidenceId)?.kind)
					.filter((kind): kind is AgentEvidenceKind => kind !== undefined),
			);
			const actionKind = normalizeActionKind({
				value: action.kind,
				role: run.role,
			});
			const requestedApplicable = action.applicable === true;
			const blockers: string[] = [];
			if (evidenceIds.length === 0) {
				blockers.push("The action does not cite a known evidenceId.");
			}
			if (missingEvidenceIds.length > 0) {
				blockers.push(`Unknown evidenceId: ${missingEvidenceIds.join(", ")}.`);
			}
			blockers.push(
				...evidenceBlockersForAction({
					role: run.role,
					actionKind,
					citedKinds,
				}),
			);
			const canBeEligible =
				EVIDENCE_GATED_ACTION_ROLES.has(run.role) &&
				requestedApplicable &&
				blockers.length === 0;
			const applicability: AgentRuntimeActionApplicability =
				blockers.length > 0
					? "blocked"
					: canBeEligible
						? "eligible"
						: "review-only";
			const title = normalizeText({
				value: action.title,
				label: "Action title",
				maxLength: 240,
				fallback: `${run.role} proposal`,
			});
			const description = normalizeText({
				value: action.description,
				label: "Action description",
				maxLength: 1_600,
				fallback: title,
			});
			const requestedId =
				typeof action.actionId === "string" ? action.actionId : "";
			const actionId = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(requestedId)
				? requestedId
				: `action-${sha256Hex(`${run.runId}:${index}:${title}`).slice(0, 16)}`;
			return {
				actionId,
				kind: actionKind,
				title,
				description,
				targetReference:
					typeof action.targetReference === "string" &&
					action.targetReference.trim()
						? normalizeText({
								value: action.targetReference,
								label: "Action target",
								maxLength: 240,
							})
						: null,
				evidenceIds,
				applicability,
				blockers,
			};
		});
	const rawConflicts = Array.isArray(source.conflicts)
		? source.conflicts.slice(0, MAX_ARTIFACT_ITEMS)
		: [];
	const declaredConflicts: AgentRuntimeDeclaredConflict[] = rawConflicts
		.filter(isRecord)
		.map((conflict, index) => {
			const targetReference = normalizeText({
				value: conflict.targetReference,
				label: "Conflict target",
				maxLength: 240,
				fallback: `role:${run.role}`,
			});
			const description = normalizeText({
				value: conflict.description,
				label: "Conflict description",
				maxLength: 1_200,
				fallback: "Provider declared an unspecified conflict.",
			});
			const requestedId =
				typeof conflict.conflictId === "string" ? conflict.conflictId : "";
			return {
				conflictId: /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(requestedId)
					? requestedId
					: `declared-${sha256Hex(`${run.runId}:${index}:${targetReference}`).slice(0, 16)}`,
				targetReference,
				description,
				evidenceIds: normalizeEvidenceIds(conflict.evidenceIds),
			};
		});
	const evidenceIds = uniqueSorted([
		...findings.flatMap((finding) => finding.evidenceIds),
		...actions.flatMap((action) => action.evidenceIds),
		...declaredConflicts.flatMap((conflict) => conflict.evidenceIds),
	]);
	const fallbackSummary =
		parsed === null
			? `Provider returned unstructured text. It was retained for review but produced no applicable actions: ${sanitizeAuditText(responseText).slice(0, 800)}`
			: `${run.role} returned a structured review artifact.`;
	const summary = normalizeText({
		value: source.summary,
		label: "Artifact summary",
		maxLength: 2_000,
		fallback: fallbackSummary,
	});
	const artifactIdentity = {
		runId: run.runId,
		upstreamArtifacts: run.dependencyArtifacts.map((artifact) => ({
			...artifact,
		})),
		summary,
		findings,
		actions,
		declaredConflicts,
	};
	return finalizeArtifact({
		kind: "visioncut.agent-runtime-artifact",
		schemaVersion: 1,
		artifactId: `artifact-${sha256Hex(stableJson(artifactIdentity)).slice(0, 20)}`,
		role: run.role,
		summary,
		upstreamArtifacts: run.dependencyArtifacts.map((artifact) => ({
			...artifact,
		})),
		evidenceIds,
		findings,
		actions,
		declaredConflicts,
		limitations: [
			"Provider output is a reviewable proposal and does not prove media mutation.",
			"Only actions with known, role-appropriate evidence can be eligible for a later approval step.",
			...(run.role === "camera"
				? [
						"Camera framing, movement, and shot-quality claims require scene or visual analysis evidence.",
					]
				: []),
		],
		generatedBy: "byok",
	});
}

function mergeRuntimeArtifacts({
	runs,
}: {
	runs: readonly AgentRuntimeRun[];
}): AgentRuntimeMerge {
	const availableRuns = runs
		.filter((run) => run.artifact !== null)
		.sort(
			(left, right) =>
				roleIndex(left.role) - roleIndex(right.role) ||
				left.runId.localeCompare(right.runId),
		);
	if (availableRuns.length === 0) {
		return deepFreeze({
			fingerprint: fingerprintJson(EMPTY_MERGE_INPUT),
			...EMPTY_MERGE_INPUT,
		});
	}
	const conflicts: AgentRuntimeMergeConflict[] = [];
	for (const run of availableRuns) {
		for (const declared of run.artifact?.declaredConflicts ?? []) {
			const identity = {
				type: "declared",
				runId: run.runId,
				conflictId: declared.conflictId,
				targetReference: declared.targetReference,
			};
			conflicts.push({
				conflictId: `merge-conflict-${sha256Hex(stableJson(identity)).slice(0, 18)}`,
				type: "declared",
				roles: [run.role],
				runIds: [run.runId],
				actionIds: [],
				targetReference: declared.targetReference,
				description: declared.description,
				evidenceIds: declared.evidenceIds,
			});
		}
	}
	const actionsByTarget = new Map<
		string,
		Array<{ run: AgentRuntimeRun; action: AgentRuntimeAction }>
	>();
	for (const run of availableRuns) {
		for (const action of run.artifact?.actions ?? []) {
			if (action.targetReference === null) continue;
			const values = actionsByTarget.get(action.targetReference) ?? [];
			values.push({ run, action });
			actionsByTarget.set(action.targetReference, values);
		}
	}
	for (const [targetReference, values] of [...actionsByTarget.entries()].sort(
		([left], [right]) => left.localeCompare(right),
	)) {
		const eligible = values.filter(
			(value) => value.action.applicability === "eligible",
		);
		const roles = new Set(eligible.map((value) => value.run.role));
		const proposals = new Set(
			eligible.map((value) =>
				`${value.action.kind}:${value.action.description}`
					.normalize("NFKC")
					.toLocaleLowerCase(),
			),
		);
		if (roles.size < 2 || proposals.size < 2) continue;
		const sorted = [...eligible].sort(
			(left, right) =>
				roleIndex(left.run.role) - roleIndex(right.run.role) ||
				left.action.actionId.localeCompare(right.action.actionId),
		);
		const identity = {
			type: "target-disagreement",
			targetReference,
			actionIds: sorted.map((value) => value.action.actionId),
		};
		conflicts.push({
			conflictId: `merge-conflict-${sha256Hex(stableJson(identity)).slice(0, 18)}`,
			type: "target-disagreement",
			roles: [...new Set(sorted.map((value) => value.run.role))].sort(
				(left, right) => roleIndex(left) - roleIndex(right),
			),
			runIds: sorted.map((value) => value.run.runId),
			actionIds: sorted.map((value) => value.action.actionId),
			targetReference,
			description:
				"Multiple agents proposed different evidence-qualified actions for the same target.",
			evidenceIds: uniqueSorted(
				sorted.flatMap((value) => value.action.evidenceIds),
			),
		});
	}
	conflicts.sort(
		(left, right) =>
			left.targetReference.localeCompare(right.targetReference) ||
			left.type.localeCompare(right.type) ||
			left.conflictId.localeCompare(right.conflictId),
	);
	const actions = availableRuns.flatMap((run) => run.artifact?.actions ?? []);
	const mergeInput = {
		runIds: availableRuns.map((run) => run.runId),
		artifactIds: availableRuns.map((run) => run.artifact?.artifactId ?? ""),
		evidenceIds: uniqueSorted(
			availableRuns.flatMap((run) => run.artifact?.evidenceIds ?? []),
		),
		eligibleActionIds: uniqueSorted(
			actions
				.filter((action) => action.applicability === "eligible")
				.map((action) => action.actionId),
		),
		reviewOnlyActionIds: uniqueSorted(
			actions
				.filter((action) => action.applicability === "review-only")
				.map((action) => action.actionId),
		),
		blockedActionIds: uniqueSorted(
			actions
				.filter((action) => action.applicability === "blocked")
				.map((action) => action.actionId),
		),
		conflicts,
	};
	return deepFreeze({
		fingerprint: fingerprintJson(mergeInput),
		...mergeInput,
	});
}

function deriveSessionStatus(
	runs: readonly AgentRuntimeRun[],
): AgentRuntimeSessionStatus {
	if (runs.some((run) => run.status === "running")) return "running";
	if (runs.some((run) => run.status === "queued")) return "queued";
	const statuses = new Set(runs.map((run) => run.status));
	if (statuses.size === 1 && statuses.has("succeeded")) return "succeeded";
	if (statuses.size === 1 && statuses.has("local-evidence-only")) {
		return "local-evidence-only";
	}
	if (statuses.size === 1 && statuses.has("failed")) return "failed";
	if (statuses.size === 1 && statuses.has("aborted")) return "aborted";
	return "partial";
}

function createEvent({
	sessionId,
	revision,
	type,
	at,
	runId,
	detail,
}: {
	sessionId: string;
	revision: number;
	type: AgentRuntimeEventType;
	at: string;
	runId: string | null;
	detail: string;
}): AgentRuntimeEvent {
	return {
		eventId: `${sessionId}/event/${revision}`,
		revision,
		type,
		at,
		runId,
		detail: sanitizeAuditText(detail),
	};
}

function updateSession({
	session,
	runs,
	type,
	at,
	runId,
	detail,
}: {
	session: AgentRuntimeSession;
	runs: readonly AgentRuntimeRun[];
	type: AgentRuntimeEventType;
	at: string;
	runId: string | null;
	detail: string;
}): AgentRuntimeSession {
	const revision = session.revision + 1;
	const status =
		type === "session-started"
			? "running"
			: type === "session-finished"
				? deriveSessionStatus(runs)
				: deriveSessionStatus(runs);
	const event = createEvent({
		sessionId: session.sessionId,
		revision,
		type,
		at,
		runId,
		detail,
	});
	return deepFreeze({
		...session,
		revision,
		status,
		runs,
		merge: mergeRuntimeArtifacts({ runs }),
		updatedAt: at,
		events: [...session.events, event],
	});
}

function replaceRun({
	runs,
	runId,
	update,
}: {
	runs: readonly AgentRuntimeRun[];
	runId: string;
	update: (run: AgentRuntimeRun) => AgentRuntimeRun;
}): AgentRuntimeRun[] {
	let found = false;
	const next = runs.map((run) => {
		if (run.runId !== runId) return run;
		found = true;
		return update(run);
	});
	if (!found) {
		throw new AgentRuntimeExecutionError(`Unknown agent run ${runId}.`);
	}
	return next;
}

function normalizeUsage(
	value: AgentRuntimeUsage | undefined,
): AgentRuntimeUsage | null {
	if (value === undefined) return null;
	const normalize = (candidate: number | undefined) =>
		candidate === undefined || !Number.isFinite(candidate) || candidate < 0
			? undefined
			: Math.floor(candidate);
	const inputTokens = normalize(value.inputTokens);
	const outputTokens = normalize(value.outputTokens);
	const totalTokens = normalize(value.totalTokens);
	return {
		...(inputTokens === undefined ? {} : { inputTokens }),
		...(outputTokens === undefined ? {} : { outputTokens }),
		...(totalTokens === undefined ? {} : { totalTokens }),
	};
}

function isAbortError({
	error,
	signal,
}: {
	error: unknown;
	signal: AbortSignal;
}): boolean {
	return (
		signal.aborted ||
		(error instanceof DOMException && error.name === "AbortError") ||
		(error instanceof Error && error.name === "AbortError")
	);
}

function executionFailure(error: unknown): AgentRuntimeFailure {
	if (error instanceof AgentModelResultError) {
		return {
			code: sanitizeAuditText(error.code),
			message: sanitizeAuditText(error.message),
			retryable: error.retryable,
		};
	}
	if (error instanceof AgentRuntimeExecutionError) {
		return {
			code: "runtime-error",
			message: sanitizeAuditText(error.message),
			retryable: true,
		};
	}
	if (error instanceof Error) {
		return {
			code: "model-callback-error",
			message: sanitizeAuditText(error.message),
			retryable: true,
		};
	}
	return {
		code: "unknown-runtime-error",
		message: "The agent callback failed with an unknown error.",
		retryable: true,
	};
}

function validateOrchestrationBinding({
	session,
	orchestration,
}: {
	session: AgentRuntimeSession;
	orchestration: AgentOrchestration;
}): void {
	if (
		session.projectId !== orchestration.projectId ||
		session.orchestrationId !== orchestration.orchestrationId ||
		session.orchestrationRevision !== orchestration.revision
	) {
		throw new AgentRuntimeExecutionError(
			"Agent session no longer matches the active orchestration revision.",
		);
	}
	for (const run of session.runs) {
		const task = orchestration.tasks.find(
			(candidate) => candidate.taskId === run.taskId,
		);
		if (task === undefined || task.role !== run.role) {
			throw new AgentRuntimeExecutionError(
				`Agent contract ${run.taskId} is no longer available.`,
			);
		}
		if (task.approvalGate.status !== "approved") {
			throw new AgentRuntimeExecutionError(
				`The ${run.role} contract is not approved for this orchestration revision.`,
			);
		}
		const expectedDependencies = task.dependencyTaskIds;
		if (
			stableJson(run.dependencyTaskIds) !== stableJson(expectedDependencies) ||
			run.title !== task.title ||
			run.purpose !== task.purpose ||
			stableJson(run.evidenceRequirements) !==
				stableJson(task.evidenceRequirements) ||
			stableJson(run.inputEvidence) !==
				stableJson(evidenceSnapshot({ task, orchestration }))
		) {
			throw new AgentRuntimeExecutionError(
				`The ${run.role} runtime snapshot no longer matches its formal task contract.`,
			);
		}
		try {
			assertAgentEvidencePackageInvariants({
				evidencePackage: run.evidencePackage,
				expectedRole: run.role,
				expectedEvidenceIds: run.inputEvidence.map(
					(evidence) => evidence.evidenceId,
				),
			});
		} catch {
			throw new AgentRuntimeExecutionError(
				`The ${run.role} resolved evidence package is invalid or no longer matches its input snapshot.`,
			);
		}
	}
}

export function resolveAgentRuntimeRoleSelection({
	orchestration,
	roles,
}: {
	orchestration: AgentOrchestration;
	roles: readonly AgentRuntimeRole[];
}): readonly AgentRuntimeRole[] {
	const requested = sortRoles([...new Set(roles)]);
	if (
		requested.length === 0 ||
		requested.some(
			(role) => !(AGENT_RUNTIME_ROLES as readonly string[]).includes(role),
		)
	) {
		throw new AgentRuntimeValidationError(
			"At least one valid agent role must be selected.",
		);
	}
	const taskByRole = new Map(
		orchestration.tasks.map((task) => [task.role, task] as const),
	);
	const roleByTaskId = new Map(
		orchestration.tasks.map((task) => [task.taskId, task.role] as const),
	);
	const resolved = new Set<AgentRuntimeRole>();
	const visiting = new Set<AgentRuntimeRole>();
	const visit = (role: AgentRuntimeRole): void => {
		if (resolved.has(role)) return;
		if (visiting.has(role)) {
			throw new AgentRuntimeValidationError(
				`Agent dependency cycle includes ${role}.`,
			);
		}
		const task = taskByRole.get(role);
		if (task === undefined) {
			throw new AgentRuntimeValidationError(
				`The orchestration has no ${role} contract.`,
			);
		}
		visiting.add(role);
		for (const dependencyTaskId of task.dependencyTaskIds) {
			const dependencyRole = roleByTaskId.get(dependencyTaskId);
			if (dependencyRole === undefined) {
				throw new AgentRuntimeValidationError(
					`${role} references missing dependency ${dependencyTaskId}.`,
				);
			}
			visit(dependencyRole);
		}
		visiting.delete(role);
		resolved.add(role);
	};
	for (const role of requested) visit(role);
	return deepFreeze(sortRoles([...resolved]));
}

function missingEvidenceRequirements({
	task,
	evidence,
}: {
	task: AgentTask;
	evidence: readonly AgentRuntimeEvidence[];
}): readonly AgentTask["evidenceRequirements"][number][] {
	return task.evidenceRequirements.filter((requirement) => {
		const matching = evidence.filter((item) =>
			requirement.anyOfKinds.includes(item.kind),
		);
		return matching.length < requirement.minimum;
	});
}

export function createAgentRuntimeSession({
	orchestration,
	roles = AGENT_RUNTIME_DEFAULT_ROLES,
	concurrencyLimit = 3,
	createdAt = new Date().toISOString(),
	sessionNonce = createdAt,
	evidenceSources = {},
}: {
	orchestration: AgentOrchestration;
	roles?: readonly AgentRuntimeRole[];
	concurrencyLimit?: number;
	createdAt?: string;
	sessionNonce?: string;
	evidenceSources?: AgentRuntimeEvidenceSources;
}): AgentRuntimeSession {
	if (
		!Number.isSafeInteger(concurrencyLimit) ||
		concurrencyLimit < 1 ||
		concurrencyLimit > MAX_RUNTIME_ROLES
	) {
		throw new AgentRuntimeValidationError(
			`Concurrency limit must be between 1 and ${MAX_RUNTIME_ROLES}.`,
		);
	}
	const normalizedCreatedAt = normalizeTimestamp({
		value: createdAt,
		label: "Created at",
	});
	const requestedRoles = sortRoles([...new Set(roles)]);
	if (
		requestedRoles.length === 0 ||
		requestedRoles.length > MAX_RUNTIME_ROLES ||
		requestedRoles.some(
			(role) => !(AGENT_RUNTIME_ROLES as readonly string[]).includes(role),
		)
	) {
		throw new AgentRuntimeValidationError(
			"At least one valid agent role must be selected.",
		);
	}
	const selectedRoles = resolveAgentRuntimeRoleSelection({
		orchestration,
		roles: requestedRoles,
	});
	const taskByRole = new Map(
		orchestration.tasks.map((task) => [task.role, task] as const),
	);
	for (const role of selectedRoles) {
		const task = taskByRole.get(role);
		if (task === undefined) {
			throw new AgentRuntimeValidationError(
				`The orchestration has no ${role} contract.`,
			);
		}
	}
	const runs: AgentRuntimeRun[] = selectedRoles.map((role) => {
		const task = taskByRole.get(role);
		if (task === undefined) {
			throw new AgentRuntimeValidationError(
				`The orchestration has no ${role} contract.`,
			);
		}
		if (task.approvalGate.status !== "approved") {
			throw new AgentRuntimeValidationError(
				`The ${role} contract requires explicit approval before runtime execution.`,
			);
		}
		const inputEvidence = evidenceSnapshot({ task, orchestration });
		const missingRequirements = missingEvidenceRequirements({
			task,
			evidence: inputEvidence,
		});
		if (missingRequirements.length > 0) {
			throw new AgentRuntimeValidationError(
				`The ${role} contract is missing required evidence: ${missingRequirements
					.map((requirement) => requirement.description)
					.join(" ")}`,
			);
		}
		const evidencePackage = resolveAgentEvidence({
			role,
			evidenceReferences: inputEvidence,
			mediaIndexes: evidenceSources.mediaIndexes,
			transcriptArtifact: evidenceSources.transcriptArtifact,
			maxCharacters: evidenceSources.maxCharacters,
		});
		return {
			runId: "",
			taskId: task.taskId,
			role,
			title: task.title,
			purpose: task.purpose,
			dependencyTaskIds: [...task.dependencyTaskIds],
			dependencyArtifacts: [],
			evidenceRequirements: task.evidenceRequirements.map((requirement) => ({
				...requirement,
				anyOfKinds: [...requirement.anyOfKinds],
			})),
			inputEvidence,
			evidencePackage,
			maxRetries: task.maxRetries,
			retryCount: 0,
			status: "queued",
			attempts: [],
			artifact: null,
		};
	});
	const sessionIdentity = {
		projectId: orchestration.projectId,
		orchestrationId: orchestration.orchestrationId,
		orchestrationRevision: orchestration.revision,
		selectedRoles,
		evidencePackageFingerprints: runs.map(
			(run) => run.evidencePackage.fingerprint,
		),
		sessionNonce: normalizeText({
			value: sessionNonce,
			label: "Session nonce",
			maxLength: 240,
		}),
	};
	const sessionId = `agent-session-${sha256Hex(stableJson(sessionIdentity)).slice(0, 20)}`;
	const boundRuns = runs.map((run) => ({
		...run,
		runId: `${sessionId}/${run.role}`,
	}));
	assertAcyclicRunGraph(boundRuns);
	const event = createEvent({
		sessionId,
		revision: 1,
		type: "session-created",
		at: normalizedCreatedAt,
		runId: null,
		detail: `Created an auditable session for ${selectedRoles.join(", ")}.`,
	});
	return deepFreeze({
		kind: AGENT_RUNTIME_SESSION_KIND,
		schemaVersion: AGENT_RUNTIME_SESSION_SCHEMA_VERSION,
		sessionId,
		projectId: orchestration.projectId,
		orchestrationId: orchestration.orchestrationId,
		orchestrationRevision: orchestration.revision,
		revision: 1,
		status: "queued",
		selectedRoles,
		concurrencyLimit,
		runs: boundRuns,
		merge: mergeRuntimeArtifacts({ runs: boundRuns }),
		createdAt: normalizedCreatedAt,
		updatedAt: normalizedCreatedAt,
		events: [event],
		guarantees: GUARANTEES,
	});
}

function hasUsableArtifact(run: AgentRuntimeRun): boolean {
	return (
		(run.status === "succeeded" || run.status === "local-evidence-only") &&
		run.artifact !== null
	);
}

function dependencyRunsFor({
	run,
	runs,
}: {
	run: AgentRuntimeRun;
	runs: readonly AgentRuntimeRun[];
}): AgentRuntimeRun[] {
	const runByTaskId = new Map(runs.map((item) => [item.taskId, item] as const));
	return run.dependencyTaskIds.map((taskId) => {
		const dependency = runByTaskId.get(taskId);
		if (dependency === undefined) {
			throw new AgentRuntimeExecutionError(
				`${run.role} references missing dependency ${taskId}.`,
			);
		}
		return dependency;
	});
}

function dependencyArtifactSnapshot({
	run,
	runs,
}: {
	run: AgentRuntimeRun;
	runs: readonly AgentRuntimeRun[];
}): AgentRuntimeDependencyArtifact[] {
	return dependencyRunsFor({ run, runs }).map((dependency) => {
		if (!hasUsableArtifact(dependency) || dependency.artifact === null) {
			throw new AgentRuntimeExecutionError(
				`${run.role} cannot start before ${dependency.role} completes with an artifact.`,
			);
		}
		return {
			taskId: dependency.taskId,
			runId: dependency.runId,
			role: dependency.role,
			artifactId: dependency.artifact.artifactId,
			artifactDigest: dependency.artifact.artifactDigest,
		};
	});
}

async function executeAgentRuntimeInternal({
	session,
	orchestration,
	model,
	signal: suppliedSignal,
	onUpdate,
	clock = { now: () => Date.now() },
	runIds,
}: ExecuteAgentRuntimeOptions): Promise<AgentRuntimeSession> {
	validateOrchestrationBinding({ session, orchestration });
	assertAcyclicRunGraph(session.runs);
	const controller = new AbortController();
	const suppliedAbort = () => controller.abort(suppliedSignal?.reason);
	if (suppliedSignal?.aborted) suppliedAbort();
	else suppliedSignal?.addEventListener("abort", suppliedAbort, { once: true });
	const signal = controller.signal;
	const targetIds = new Set(
		runIds ??
			session.runs
				.filter((run) => run.status === "queued")
				.map((run) => run.runId),
	);
	const targetRuns = session.runs.filter((run) => targetIds.has(run.runId));
	if (
		targetRuns.length === 0 ||
		targetRuns.some((run) => run.status !== "queued")
	) {
		throw new AgentRuntimeExecutionError(
			"Runtime execution requires at least one queued run.",
		);
	}

	let current = session;
	let commitQueue = Promise.resolve();
	const commit = async ({
		mutate,
		type,
		runId,
		detail,
	}: {
		mutate: (runs: readonly AgentRuntimeRun[]) => readonly AgentRuntimeRun[];
		type: AgentRuntimeEventType;
		runId: string | null;
		detail: string;
	}): Promise<void> => {
		const operation = commitQueue.then(async () => {
			const at = canonicalTimestamp(clock.now());
			const next = updateSession({
				session: current,
				runs: mutate(current.runs),
				type,
				at,
				runId,
				detail,
			});
			current = next;
			const event = next.events.at(-1);
			if (event !== undefined) await onUpdate?.({ session: next, event });
		});
		commitQueue = operation.catch(() => undefined);
		await operation;
	};

	await commit({
		mutate: (runs) => runs,
		type: "session-started",
		runId: null,
		detail: `Started ${targetRuns.length} agent run(s) with concurrency ${session.concurrencyLimit}.`,
	});

	const runOne = async (runId: string): Promise<void> => {
		const queuedRun = current.runs.find((run) => run.runId === runId);
		if (queuedRun === undefined) {
			throw new AgentRuntimeExecutionError(`Unknown queued run ${runId}.`);
		}
		const dependencyArtifacts = signal.aborted
			? []
			: dependencyArtifactSnapshot({
					run: queuedRun,
					runs: current.runs,
				});
		const hydratedRun: AgentRuntimeRun = {
			...queuedRun,
			dependencyArtifacts,
		};
		const prompts = buildAgentPrompts({ run: hydratedRun });
		const promptAudit = sanitizeAuditText(
			`[system]\n${prompts.systemPrompt}\n\n[user]\n${prompts.prompt}`,
		);
		const executionMode: AgentRuntimeExecutionMode =
			model === undefined ? "local-evidence-only" : "byok";
		const provider = model?.provider ?? LOCAL_EVIDENCE_PROVIDER;
		const modelId = model?.model ?? LOCAL_EVIDENCE_MODEL;
		let attempt = queuedRun.attempts.length + 1;
		let attemptId = `${runId}/attempt/${attempt}`;
		let startedMilliseconds = clock.now();
		if (signal.aborted) {
			const at = canonicalTimestamp(startedMilliseconds);
			await commit({
				mutate: (runs) =>
					replaceRun({
						runs,
						runId,
						update: (run) => ({
							...run,
							dependencyArtifacts,
							status: "aborted",
							retryCount: Math.max(0, attempt - 1),
							attempts: [
								...run.attempts,
								{
									attemptId,
									attempt,
									executionMode,
									provider,
									model: modelId,
									status: "aborted",
									startedAt: at,
									endedAt: at,
									durationMs: 0,
									promptAudit,
									responseAudit: null,
									usage: null,
									failure: {
										code: "aborted",
										message: "The run was cancelled before it started.",
										retryable: true,
									},
								},
							],
							artifact: null,
						}),
					}),
				type: "run-aborted",
				runId,
				detail: `${queuedRun.role} was cancelled before invocation.`,
			});
			return;
		}
		await commit({
			mutate: (runs) =>
				replaceRun({
					runs,
					runId,
					update: (run) => {
						attempt = run.attempts.length + 1;
						attemptId = `${runId}/attempt/${attempt}`;
						startedMilliseconds = clock.now();
						return {
							...run,
							dependencyArtifacts,
							status: "running",
							retryCount: Math.max(0, attempt - 1),
							attempts: [
								...run.attempts,
								{
									attemptId,
									attempt,
									executionMode,
									provider,
									model: modelId,
									status: "running",
									startedAt: canonicalTimestamp(startedMilliseconds),
									endedAt: null,
									durationMs: null,
									promptAudit,
									responseAudit: null,
									usage: null,
									failure: null,
								},
							],
							artifact: null,
						};
					},
				}),
			type: "run-started",
			runId,
			detail: `${queuedRun.role} attempt ${attempt} started with ${provider}/${modelId}.`,
		});
		const runningRun = current.runs.find((run) => run.runId === runId);
		if (runningRun === undefined) {
			throw new AgentRuntimeExecutionError(`Running state lost for ${runId}.`);
		}
		try {
			if (model === undefined) {
				const artifact = localEvidenceArtifact({ run: runningRun });
				const endedMilliseconds = clock.now();
				await commit({
					mutate: (runs) =>
						replaceRun({
							runs,
							runId,
							update: (run) => ({
								...run,
								status: "local-evidence-only",
								artifact,
								attempts: run.attempts.map((entry) =>
									entry.attemptId === attemptId
										? {
												...entry,
												status: "local-evidence-only",
												endedAt: canonicalTimestamp(endedMilliseconds),
												durationMs: Math.max(
													0,
													endedMilliseconds - startedMilliseconds,
												),
											}
										: entry,
								),
							}),
						}),
					type: "run-local-evidence-only",
					runId,
					detail: `${runningRun.role} indexed cited evidence without a model call.`,
				});
				return;
			}
			const result = await model.invoke({
				sessionId: current.sessionId,
				runId,
				role: runningRun.role,
				attempt,
				provider,
				model: modelId,
				systemPrompt: prompts.systemPrompt,
				prompt: prompts.prompt,
				evidence: runningRun.inputEvidence,
				evidencePackage: runningRun.evidencePackage,
				dependencyArtifacts: runningRun.dependencyArtifacts,
				signal,
			});
			if (!result.ok) {
				throw new AgentModelResultError(result.error);
			}
			const responseAudit = sanitizeAuditText(result.text);
			const artifact = normalizeArtifact({
				run: runningRun,
				responseText: result.text,
			});
			const endedMilliseconds = clock.now();
			await commit({
				mutate: (runs) =>
					replaceRun({
						runs,
						runId,
						update: (run) => ({
							...run,
							status: "succeeded",
							artifact,
							attempts: run.attempts.map((entry) =>
								entry.attemptId === attemptId
									? {
											...entry,
											status: "succeeded",
											endedAt: canonicalTimestamp(endedMilliseconds),
											durationMs: Math.max(
												0,
												endedMilliseconds - startedMilliseconds,
											),
											responseAudit,
											usage: normalizeUsage(result.usage),
										}
									: entry,
							),
						}),
					}),
				type: "run-succeeded",
				runId,
				detail: `${runningRun.role} produced a structured, evidence-gated artifact.`,
			});
		} catch (error) {
			const endedMilliseconds = clock.now();
			const aborted = isAbortError({ error, signal });
			const failure = aborted
				? {
						code: "aborted",
						message: "The user cancelled this agent run.",
						retryable: true,
					}
				: executionFailure(error);
			await commit({
				mutate: (runs) =>
					replaceRun({
						runs,
						runId,
						update: (run) => ({
							...run,
							status: aborted ? "aborted" : "failed",
							artifact: null,
							attempts: run.attempts.map((entry) =>
								entry.attemptId === attemptId
									? {
											...entry,
											status: aborted ? "aborted" : "failed",
											endedAt: canonicalTimestamp(endedMilliseconds),
											durationMs: Math.max(
												0,
												endedMilliseconds - startedMilliseconds,
											),
											failure,
										}
									: entry,
							),
						}),
					}),
				type: aborted ? "run-aborted" : "run-failed",
				runId,
				detail: `${runningRun.role} ${aborted ? "was cancelled" : "failed"}: ${failure.message}`,
			});
		}
	};

	const queuedIds = targetRuns.map((run) => run.runId);
	const failForDependencies = async ({
		runId,
		dependencies,
	}: {
		runId: string;
		dependencies: readonly AgentRuntimeRun[];
	}): Promise<void> => {
		const queuedRun = current.runs.find((run) => run.runId === runId);
		if (queuedRun === undefined) {
			throw new AgentRuntimeExecutionError(`Unknown queued run ${runId}.`);
		}
		const attempt = queuedRun.attempts.length + 1;
		const attemptId = `${runId}/attempt/${attempt}`;
		const at = canonicalTimestamp(clock.now());
		const unavailable = dependencies
			.map((dependency) => `${dependency.role}:${dependency.status}`)
			.join(", ");
		const failure: AgentRuntimeFailure = {
			code: "dependency-unavailable",
			message: `Required upstream artifacts are unavailable (${unavailable}).`,
			retryable: true,
		};
		await commit({
			mutate: (runs) =>
				replaceRun({
					runs,
					runId,
					update: (run) => ({
						...run,
						status: "failed",
						retryCount: Math.max(0, attempt - 1),
						dependencyArtifacts: [],
						attempts: [
							...run.attempts,
							{
								attemptId,
								attempt,
								executionMode:
									model === undefined ? "local-evidence-only" : "byok",
								provider: model?.provider ?? LOCAL_EVIDENCE_PROVIDER,
								model: model?.model ?? LOCAL_EVIDENCE_MODEL,
								status: "failed",
								startedAt: at,
								endedAt: at,
								durationMs: 0,
								promptAudit:
									"Invocation skipped because a required upstream artifact was unavailable.",
								responseAudit: null,
								usage: null,
								failure,
							},
						],
						artifact: null,
					}),
				}),
			type: "run-failed",
			runId,
			detail: `${queuedRun.role} did not start because required upstream artifacts were unavailable.`,
		});
	};
	const workerCount = Math.min(session.concurrencyLimit, queuedIds.length);
	try {
		const pending = new Set(queuedIds);
		const active = new Map<string, Promise<void>>();
		while (pending.size > 0 || active.size > 0) {
			let progressed = false;
			for (const runId of [...pending]) {
				if (active.size >= workerCount) break;
				const run = current.runs.find((candidate) => candidate.runId === runId);
				if (run === undefined) {
					throw new AgentRuntimeExecutionError(`Unknown queued run ${runId}.`);
				}
				const dependencies = dependencyRunsFor({
					run,
					runs: current.runs,
				});
				if (signal.aborted) {
					pending.delete(runId);
					const operation = runOne(runId).finally(() => {
						active.delete(runId);
					});
					active.set(runId, operation);
					progressed = true;
					continue;
				}
				const unavailable = dependencies.filter(
					(dependency) =>
						dependency.status === "failed" || dependency.status === "aborted",
				);
				if (unavailable.length > 0) {
					pending.delete(runId);
					await failForDependencies({
						runId,
						dependencies: unavailable,
					});
					progressed = true;
					continue;
				}
				if (!dependencies.every(hasUsableArtifact)) continue;
				pending.delete(runId);
				const operation = runOne(runId).finally(() => {
					active.delete(runId);
				});
				active.set(runId, operation);
				progressed = true;
			}
			if (active.size > 0) {
				await Promise.race(active.values());
				continue;
			}
			if (pending.size > 0 && !progressed) {
				throw new AgentRuntimeExecutionError(
					"Agent dependency graph cannot make progress; a dependency is queued outside this execution.",
				);
			}
		}
		await commitQueue;
		await commit({
			mutate: (runs) => runs,
			type: "session-finished",
			runId: null,
			detail: "Agent runtime session reached a terminal state.",
		});
		return current;
	} finally {
		suppliedSignal?.removeEventListener("abort", suppliedAbort);
	}
}

export async function executeAgentRuntimeSession(
	options: ExecuteAgentRuntimeOptions,
): Promise<AgentRuntimeSession> {
	return executeAgentRuntimeInternal(options);
}

export async function retryAgentRuntimeRuns({
	session,
	orchestration,
	runIds,
	model,
	signal,
	onUpdate,
	clock = { now: () => Date.now() },
}: Omit<ExecuteAgentRuntimeOptions, "runIds"> & {
	readonly runIds: readonly string[];
}): Promise<AgentRuntimeSession> {
	const uniqueRunIds = uniqueSorted(runIds);
	if (uniqueRunIds.length === 0) {
		throw new AgentRuntimeExecutionError("Select at least one run to retry.");
	}
	let queued = session;
	for (const runId of uniqueRunIds) {
		const run = queued.runs.find((candidate) => candidate.runId === runId);
		if (run === undefined) {
			throw new AgentRuntimeExecutionError(`Unknown retry run ${runId}.`);
		}
		if (run.status !== "failed" && run.status !== "aborted") {
			throw new AgentRuntimeExecutionError(
				`${run.role} can only retry after failure or cancellation.`,
			);
		}
		if (run.retryCount >= run.maxRetries) {
			throw new AgentRuntimeExecutionError(
				`${run.role} reached its retry limit.`,
			);
		}
		if (run.attempts.at(-1)?.failure?.retryable !== true) {
			throw new AgentRuntimeExecutionError(
				`${run.role} failed with a non-retryable error.`,
			);
		}
		const at = canonicalTimestamp(clock.now());
		queued = updateSession({
			session: queued,
			runs: replaceRun({
				runs: queued.runs,
				runId,
				update: (candidate) => ({
					...candidate,
					status: "queued",
					artifact: null,
				}),
			}),
			type: "run-retry-queued",
			at,
			runId,
			detail: `Queued retry ${run.retryCount + 1} for ${run.role}.`,
		});
		const event = queued.events.at(-1);
		if (event !== undefined) await onUpdate?.({ session: queued, event });
	}
	return executeAgentRuntimeInternal({
		session: queued,
		orchestration,
		runIds: uniqueRunIds,
		...(model === undefined ? {} : { model }),
		...(signal === undefined ? {} : { signal }),
		...(onUpdate === undefined ? {} : { onUpdate }),
		clock,
	});
}

function assertRuntimeSessionShape(
	session: AgentRuntimeSession,
): AgentRuntimeSession {
	if (
		session.kind !== AGENT_RUNTIME_SESSION_KIND ||
		session.schemaVersion !== AGENT_RUNTIME_SESSION_SCHEMA_VERSION
	) {
		throw new AgentRuntimeValidationError(
			"Unsupported agent runtime session schema.",
		);
	}
	normalizeIdentifier({ value: session.sessionId, label: "Session id" });
	normalizeIdentifier({ value: session.projectId, label: "Project id" });
	normalizeIdentifier({
		value: session.orchestrationId,
		label: "Orchestration id",
	});
	normalizeTimestamp({
		value: session.createdAt,
		label: "Session created at",
	});
	normalizeTimestamp({
		value: session.updatedAt,
		label: "Session updated at",
	});
	if (
		!Number.isSafeInteger(session.revision) ||
		session.revision < 1 ||
		session.events.length !== session.revision
	) {
		throw new AgentRuntimeValidationError(
			"Session revision must match its complete event history.",
		);
	}
	if (
		!Number.isSafeInteger(session.concurrencyLimit) ||
		session.concurrencyLimit < 1 ||
		session.concurrencyLimit > MAX_RUNTIME_ROLES
	) {
		throw new AgentRuntimeValidationError(
			"Stored concurrency limit is invalid.",
		);
	}
	if (
		session.selectedRoles.length === 0 ||
		new Set(session.selectedRoles).size !== session.selectedRoles.length ||
		session.runs.length !== session.selectedRoles.length
	) {
		throw new AgentRuntimeValidationError(
			"Stored runtime role selection is invalid.",
		);
	}
	for (const [index, role] of session.selectedRoles.entries()) {
		if (
			!(AGENT_RUNTIME_ROLES as readonly string[]).includes(role) ||
			session.runs[index]?.role !== role
		) {
			throw new AgentRuntimeValidationError(
				"Stored runtime roles must use canonical contract order.",
			);
		}
	}
	const runIds = new Set(session.runs.map((run) => run.runId));
	let previousEventAt = session.createdAt;
	for (const [index, event] of session.events.entries()) {
		if (
			event.revision !== index + 1 ||
			event.eventId !== `${session.sessionId}/event/${index + 1}` ||
			!RUNTIME_EVENT_TYPES.has(event.type) ||
			(event.runId !== null && !runIds.has(event.runId))
		) {
			throw new AgentRuntimeValidationError(
				"Stored runtime event history is invalid.",
			);
		}
		normalizeTimestamp({
			value: event.at,
			label: "Runtime event time",
		});
		if (Date.parse(event.at) < Date.parse(previousEventAt)) {
			throw new AgentRuntimeValidationError(
				"Stored runtime event times must be non-decreasing.",
			);
		}
		if (
			normalizeText({
				value: event.detail,
				label: "Runtime event detail",
				maxLength: MAX_AUDIT_TEXT_LENGTH,
			}) !== event.detail
		) {
			throw new AgentRuntimeValidationError(
				"Stored runtime event detail is not normalized.",
			);
		}
		previousEventAt = event.at;
	}
	if (
		session.events[0]?.type !== "session-created" ||
		session.events[0]?.at !== session.createdAt ||
		session.events.at(-1)?.at !== session.updatedAt ||
		session.events.filter((event) => event.type === "session-migrated").length >
			1
	) {
		throw new AgentRuntimeValidationError(
			"Stored runtime event boundaries are invalid.",
		);
	}
	assertAcyclicRunGraph(session.runs);
	const runByTaskId = new Map(
		session.runs.map((run) => [run.taskId, run] as const),
	);
	const evidenceByRun = new Map(
		session.runs.map(
			(run) =>
				[
					run.runId,
					new Map(
						run.inputEvidence.map((evidence) => [
							evidence.evidenceId,
							evidence,
						]),
					),
				] as const,
		),
	);
	for (const run of session.runs) {
		normalizeIdentifier({ value: run.runId, label: "Run id" });
		normalizeIdentifier({ value: run.taskId, label: "Task id" });
		assertAgentEvidencePackageInvariants({
			evidencePackage: run.evidencePackage,
			expectedRole: run.role,
			expectedEvidenceIds: run.inputEvidence.map(
				(evidence) => evidence.evidenceId,
			),
		});
		if (run.runId !== `${session.sessionId}/${run.role}`) {
			throw new AgentRuntimeValidationError(
				"Stored run id does not match its session and role.",
			);
		}
		if (
			run.retryCount !== Math.max(0, run.attempts.length - 1) ||
			run.retryCount > run.maxRetries
		) {
			throw new AgentRuntimeValidationError(
				"Stored retry count does not match attempt history.",
			);
		}
		if (
			!Array.isArray(run.dependencyArtifacts) ||
			new Set(run.dependencyTaskIds).size !== run.dependencyTaskIds.length ||
			new Set(run.dependencyArtifacts.map((item) => item.taskId)).size !==
				run.dependencyArtifacts.length
		) {
			throw new AgentRuntimeValidationError(
				"Stored dependency references are invalid.",
			);
		}
		for (const dependencyTaskId of run.dependencyTaskIds) {
			if (!runByTaskId.has(dependencyTaskId)) {
				throw new AgentRuntimeValidationError(
					`Stored dependency ${dependencyTaskId} is missing.`,
				);
			}
		}
		for (const reference of run.dependencyArtifacts) {
			const dependency = runByTaskId.get(reference.taskId);
			if (
				dependency === undefined ||
				dependency.runId !== reference.runId ||
				dependency.role !== reference.role ||
				dependency.artifact === null ||
				dependency.artifact.artifactId !== reference.artifactId ||
				dependency.artifact.artifactDigest !== reference.artifactDigest ||
				!run.dependencyTaskIds.includes(reference.taskId)
			) {
				throw new AgentRuntimeValidationError(
					"Stored upstream artifact reference does not match its completed dependency.",
				);
			}
		}
		const dependencyInvocationWasAttempted = run.attempts.some(
			(attempt) =>
				attempt.failure?.code !== "dependency-unavailable" &&
				!(
					attempt.failure?.code === "aborted" &&
					attempt.durationMs === 0 &&
					run.dependencyArtifacts.length === 0
				),
		);
		if (
			dependencyInvocationWasAttempted &&
			run.dependencyArtifacts.length !== run.dependencyTaskIds.length
		) {
			throw new AgentRuntimeValidationError(
				"A started downstream run must bind every upstream artifact.",
			);
		}
		for (const [index, attempt] of run.attempts.entries()) {
			if (
				attempt.attempt !== index + 1 ||
				attempt.attemptId !== `${run.runId}/attempt/${attempt.attempt}`
			) {
				throw new AgentRuntimeValidationError(
					"Stored attempt sequence is invalid.",
				);
			}
		}
		if (run.artifact !== null) {
			if (run.artifact.role !== run.role) {
				throw new AgentRuntimeValidationError(
					"Stored artifact role does not match its run.",
				);
			}
			if (
				run.artifact.artifactDigest !== expectedArtifactDigest(run.artifact) ||
				stableJson(run.artifact.upstreamArtifacts) !==
					stableJson(run.dependencyArtifacts)
			) {
				throw new AgentRuntimeValidationError(
					"Stored artifact digest or upstream provenance is invalid.",
				);
			}
			const evidence = evidenceByRun.get(run.runId) ?? new Map();
			for (const finding of run.artifact.findings) {
				if (
					finding.evidenceIds.some((evidenceId) => !evidence.has(evidenceId))
				) {
					throw new AgentRuntimeValidationError(
						"Stored finding cites evidence outside its input snapshot.",
					);
				}
				if (finding.verification === "evidence-cited") {
					const citedKinds = new Set(
						finding.evidenceIds
							.map((evidenceId) => evidence.get(evidenceId)?.kind)
							.filter((kind): kind is AgentEvidenceKind => kind !== undefined),
					);
					if (
						finding.evidenceIds.length === 0 ||
						(run.role === "camera" &&
							!citedKinds.has("scene-analysis") &&
							!citedKinds.has("visual-analysis"))
					) {
						throw new AgentRuntimeValidationError(
							"Stored evidence-cited finding violates the role evidence contract.",
						);
					}
				}
			}
			for (const action of run.artifact.actions) {
				if (
					action.evidenceIds.some((evidenceId) => !evidence.has(evidenceId))
				) {
					throw new AgentRuntimeValidationError(
						"Stored action cites evidence outside its input snapshot.",
					);
				}
				if (
					action.applicability === "eligible" &&
					action.evidenceIds.length === 0
				) {
					throw new AgentRuntimeValidationError(
						"An eligible action must cite evidence.",
					);
				}
				if (action.applicability === "eligible") {
					const citedKinds = new Set(
						action.evidenceIds
							.map((evidenceId) => evidence.get(evidenceId)?.kind)
							.filter((kind): kind is AgentEvidenceKind => kind !== undefined),
					);
					if (
						evidenceBlockersForAction({
							role: run.role,
							actionKind: action.kind,
							citedKinds,
						}).length > 0
					) {
						throw new AgentRuntimeValidationError(
							"Stored eligible action violates the role evidence matrix.",
						);
					}
				}
			}
		}
	}
	const derivedStatus =
		session.events.at(-1)?.type === "session-started" &&
		session.runs.every((run) => run.status === "queued")
			? "running"
			: deriveSessionStatus(session.runs);
	if (
		stableJson(session.guarantees) !== stableJson(GUARANTEES) ||
		session.status !== derivedStatus
	) {
		throw new AgentRuntimeValidationError(
			"Stored runtime guarantees or status are invalid.",
		);
	}
	const expectedMerge = mergeRuntimeArtifacts({ runs: session.runs });
	if (stableJson(expectedMerge) !== stableJson(session.merge)) {
		throw new AgentRuntimeValidationError(
			"Stored deterministic merge does not match the run artifacts.",
		);
	}
	assertAgentAuditSafe({ value: session });
	return session;
}

type AgentRuntimeRunWithOptionalEvidencePackage = Omit<
	AgentRuntimeRun,
	"evidencePackage"
> & {
	readonly evidencePackage?: AgentEvidencePackage;
};

function hydrateEvidencePackage(
	run: AgentRuntimeRunWithOptionalEvidencePackage,
): AgentRuntimeRun {
	const evidencePackage =
		run.evidencePackage ??
		resolveAgentEvidence({
			role: run.role,
			evidenceReferences: run.inputEvidence,
		});
	assertAgentEvidencePackageInvariants({
		evidencePackage,
		expectedRole: run.role,
		expectedEvidenceIds: run.inputEvidence.map(
			(evidence) => evidence.evidenceId,
		),
	});
	return {
		...run,
		evidencePackage,
	};
}

type LegacyAgentRuntimeSession = Omit<AgentRuntimeSession, "schemaVersion"> & {
	readonly schemaVersion: typeof LEGACY_AGENT_RUNTIME_SESSION_SCHEMA_VERSION;
};

function isAgentRuntimeSessionCandidate(
	value: unknown,
): value is AgentRuntimeSession | LegacyAgentRuntimeSession {
	return (
		isRecord(value) &&
		value.kind === AGENT_RUNTIME_SESSION_KIND &&
		(value.schemaVersion === AGENT_RUNTIME_SESSION_SCHEMA_VERSION ||
			value.schemaVersion === LEGACY_AGENT_RUNTIME_SESSION_SCHEMA_VERSION) &&
		typeof value.sessionId === "string" &&
		typeof value.projectId === "string" &&
		typeof value.orchestrationId === "string" &&
		typeof value.orchestrationRevision === "number" &&
		typeof value.revision === "number" &&
		typeof value.status === "string" &&
		Array.isArray(value.selectedRoles) &&
		typeof value.concurrencyLimit === "number" &&
		Array.isArray(value.runs) &&
		isRecord(value.merge) &&
		typeof value.createdAt === "string" &&
		typeof value.updatedAt === "string" &&
		Array.isArray(value.events) &&
		isRecord(value.guarantees)
	);
}

function migrateLegacyRuntimeSession(
	session: AgentRuntimeSession | LegacyAgentRuntimeSession,
): AgentRuntimeSession {
	if (session.schemaVersion === AGENT_RUNTIME_SESSION_SCHEMA_VERSION) {
		return {
			...session,
			runs: session.runs.map(hydrateEvidencePackage),
		};
	}
	const syntheticCameraTaskId = `${session.orchestrationId}/task/camera`;
	const formalCameraTaskId = `${session.orchestrationId}/camera`;
	const migrateTaskId = (taskId: string) =>
		taskId === syntheticCameraTaskId ? formalCameraTaskId : taskId;
	const normalizedRuns = session.runs.map((run) => {
		const legacyRun = run as AgentRuntimeRun & {
			readonly dependencyArtifacts?: readonly AgentRuntimeDependencyArtifact[];
		};
		const dependencyArtifacts = Array.isArray(legacyRun.dependencyArtifacts)
			? legacyRun.dependencyArtifacts.map((reference) => ({
					...reference,
					taskId: migrateTaskId(reference.taskId),
				}))
			: [];
		const artifact =
			run.artifact === null
				? null
				: {
						...run.artifact,
						upstreamArtifacts: Array.isArray(run.artifact.upstreamArtifacts)
							? run.artifact.upstreamArtifacts.map((reference) => ({
									...reference,
									taskId: migrateTaskId(reference.taskId),
								}))
							: dependencyArtifacts.map((reference) => ({ ...reference })),
					};
		return {
			...run,
			taskId: migrateTaskId(run.taskId),
			dependencyTaskIds: run.dependencyTaskIds.map(migrateTaskId),
			dependencyArtifacts,
			artifact,
			legacySyntheticCamera: run.taskId === syntheticCameraTaskId,
		};
	});
	const migratedByTaskId = new Map<string, AgentRuntimeRun>();
	const migratedRuns = normalizedRuns.map(
		({ legacySyntheticCamera, ...run }): AgentRuntimeRun => {
			const dependencyArtifacts = run.dependencyArtifacts.map((reference) => {
				const dependency = migratedByTaskId.get(reference.taskId);
				if (dependency?.artifact === null || dependency === undefined) {
					throw new AgentRuntimeValidationError(
						"Legacy runtime dependency artifact cannot be reconstructed.",
					);
				}
				return {
					taskId: dependency.taskId,
					runId: dependency.runId,
					role: dependency.role,
					artifactId: dependency.artifact.artifactId,
					artifactDigest: dependency.artifact.artifactDigest,
				};
			});
			let artifact: AgentRuntimeArtifact | null = null;
			if (run.artifact !== null) {
				if (!isRecord(run.artifact)) {
					throw new AgentRuntimeValidationError(
						"Stored runtime artifact must be an object.",
					);
				}
				const limitations = [
					...run.artifact.limitations,
					...(legacySyntheticCamera
						? [
								"Legacy synthetic Camera output is retained for audit only and does not approve the formal Camera task.",
							]
						: []),
				];
				const {
					artifactDigest: _legacyDigest,
					upstreamArtifacts: _legacyUpstreamArtifacts,
					...artifactPayload
				} = run.artifact;
				const evidenceKindById = new Map(
					run.inputEvidence.map(
						(evidence) => [evidence.evidenceId, evidence.kind] as const,
					),
				);
				const findings = artifactPayload.findings.map((finding) => {
					if (run.role !== "camera") return finding;
					const hasStrongEvidence = finding.evidenceIds.some((evidenceId) => {
						const kind = evidenceKindById.get(evidenceId);
						return kind === "scene-analysis" || kind === "visual-analysis";
					});
					return {
						...finding,
						verification: hasStrongEvidence
							? ("evidence-cited" as const)
							: ("uncited" as const),
					};
				});
				const actions = artifactPayload.actions.map((action) => {
					if (action.applicability !== "eligible") return action;
					const citedKinds = new Set(
						action.evidenceIds
							.map((evidenceId) => evidenceKindById.get(evidenceId))
							.filter((kind): kind is AgentEvidenceKind => kind !== undefined),
					);
					const blockers = evidenceBlockersForAction({
						role: run.role,
						actionKind: action.kind,
						citedKinds,
					});
					if (blockers.length === 0) return action;
					return {
						...action,
						applicability: "blocked" as const,
						blockers: uniqueSorted([...action.blockers, ...blockers]),
					};
				});
				artifact = finalizeArtifact({
					...artifactPayload,
					findings,
					actions,
					upstreamArtifacts: dependencyArtifacts,
					limitations: uniqueSorted(limitations),
				});
			}
			const migratedRun: AgentRuntimeRun = {
				...run,
				dependencyArtifacts,
				artifact,
			};
			migratedByTaskId.set(migratedRun.taskId, migratedRun);
			return migratedRun;
		},
	);
	const runs = migratedRuns.map(hydrateEvidencePackage);
	const revision = session.revision + 1;
	const migrationEvent = createEvent({
		sessionId: session.sessionId,
		revision,
		type: "session-migrated",
		at: session.updatedAt,
		runId: null,
		detail:
			"Migrated runtime audit data to schema 2. Synthetic Camera task ids were normalized without creating an approval decision.",
	});
	return {
		...session,
		schemaVersion: AGENT_RUNTIME_SESSION_SCHEMA_VERSION,
		revision,
		runs,
		merge: mergeRuntimeArtifacts({ runs }),
		events: [...session.events, migrationEvent],
	};
}

export function parseAgentRuntimeSession({
	value,
}: {
	value: unknown;
}): AgentRuntimeSession | null {
	try {
		assertAgentAuditSafe({ value });
		if (!isAgentRuntimeSessionCandidate(value)) return null;
		const cloned = migrateLegacyRuntimeSession(structuredClone(value));
		return deepFreeze(assertRuntimeSessionShape(cloned));
	} catch {
		return null;
	}
}

export function serializeAgentRuntimeSession({
	session,
}: {
	session: AgentRuntimeSession;
}): string {
	assertRuntimeSessionShape(session);
	return JSON.stringify(session);
}

export function deserializeAgentRuntimeSession({
	value,
}: {
	value: string;
}): AgentRuntimeSession {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value) as unknown;
	} catch {
		throw new AgentRuntimeValidationError(
			"Stored agent runtime session is not valid JSON.",
		);
	}
	const session = parseAgentRuntimeSession({ value: parsed });
	if (session === null) {
		throw new AgentRuntimeValidationError(
			"Stored agent runtime session failed validation.",
		);
	}
	return session;
}
