import type { IntentSpec, IntentSpecTarget } from "./intent-spec";

export const AGENT_ORCHESTRATION_KIND =
	"visioncut.agent-orchestration" as const;
export const AGENT_ORCHESTRATION_SCHEMA_VERSION = 1 as const;

export const AGENT_ROLES = [
	"director",
	"story",
	"editor",
	"color",
	"sound",
	"growth",
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

export type AgentEvidenceKind =
	| "intent-spec"
	| "publication-target"
	| "asset-metadata"
	| "audio-metadata"
	| "scene-analysis"
	| "transcript"
	| "visual-analysis"
	| "audio-analysis"
	| "audience-brief"
	| "brand-guideline"
	| "style-reference"
	| "performance-data"
	| "human-note";

export type AgentEvidenceOrigin =
	| "user-intent"
	| "project-metadata"
	| "user-provided"
	| "imported-result"
	| "external-provider-result";

export interface AgentEvidenceInput {
	readonly evidenceId: string;
	readonly kind: Exclude<AgentEvidenceKind, "intent-spec">;
	readonly label: string;
	readonly referenceId: string;
	readonly origin: Exclude<AgentEvidenceOrigin, "user-intent">;
}

export interface AgentEvidence {
	readonly evidenceId: string;
	readonly kind: AgentEvidenceKind;
	readonly label: string;
	readonly referenceId: string;
	readonly origin: AgentEvidenceOrigin;
	readonly producedByOrchestrator: false;
}

export interface AgentIntentReference {
	readonly projectId: string;
	readonly revision: number;
	readonly userIntent: string;
	readonly target?: IntentSpecTarget;
	readonly updatedAt: string;
}

export interface AgentEvidenceRequirement {
	readonly requirementId: string;
	readonly description: string;
	readonly anyOfKinds: readonly AgentEvidenceKind[];
	readonly minimum: number;
}

export type AgentTaskStatus =
	| "blocked"
	| "awaiting-approval"
	| "ready"
	| "running"
	| "succeeded"
	| "failed"
	| "rejected";

export type AgentApprovalStatus = "pending" | "approved" | "rejected";

export interface AgentApprovalGate {
	readonly required: true;
	readonly phase: "before-run";
	readonly status: AgentApprovalStatus;
	readonly decidedAt: string | null;
	readonly decidedBy: string | null;
	readonly note: string | null;
}

export type AgentTaskOutputKind =
	| "director-brief"
	| "story-plan"
	| "edit-plan"
	| "color-plan"
	| "sound-plan"
	| "growth-plan";

export type AgentTaskOutputOrigin =
	| "local-rule-result"
	| "user-provided"
	| "imported-result"
	| "external-provider-result";

export interface AgentTaskOutputReference {
	readonly outputId: string;
	readonly kind: AgentTaskOutputKind;
	readonly label: string;
	readonly state: "expected" | "available";
	readonly artifactReference: string | null;
	readonly origin: AgentTaskOutputOrigin | null;
	readonly producedAt: string | null;
}

export interface AgentTaskOutputResult {
	readonly outputId: string;
	readonly artifactReference: string;
	readonly origin: AgentTaskOutputOrigin;
}

export interface AgentTaskFailure {
	readonly code: string;
	readonly message: string;
	readonly retryable: boolean;
	readonly failedAt: string;
	readonly attempt: number;
}

export type AgentTaskBlockerKind = "dependency" | "evidence" | "approval";

export interface AgentTaskBlocker {
	readonly kind: AgentTaskBlockerKind;
	readonly referenceId: string;
	readonly message: string;
}

export interface AgentTask {
	readonly taskId: string;
	readonly role: AgentRole;
	readonly title: string;
	readonly purpose: string;
	readonly status: AgentTaskStatus;
	readonly dependencyTaskIds: readonly string[];
	readonly evidenceRequirements: readonly AgentEvidenceRequirement[];
	readonly inputEvidenceIds: readonly string[];
	readonly outputReferences: readonly AgentTaskOutputReference[];
	readonly approvalGate: AgentApprovalGate;
	readonly blockers: readonly AgentTaskBlocker[];
	readonly limitations: readonly string[];
	readonly attemptCount: number;
	readonly retryCount: number;
	readonly maxRetries: number;
	readonly failure: AgentTaskFailure | null;
}

export type AgentOrchestrationEventType =
	| "created"
	| "evidence-added"
	| "task-approved"
	| "task-rejected"
	| "task-started"
	| "task-succeeded"
	| "task-failed"
	| "task-retried";

export interface AgentOrchestrationEvent {
	readonly eventId: string;
	readonly revision: number;
	readonly type: AgentOrchestrationEventType;
	readonly at: string;
	readonly taskId: string | null;
	readonly detail: string;
}

export interface AgentOrchestrationGuarantees {
	readonly deterministicLocalRules: true;
	readonly network: false;
	readonly paidService: false;
	readonly modelInvokedByOrchestrator: false;
	readonly mediaAnalysisPerformedByOrchestrator: false;
	readonly mediaMutationPerformedByOrchestrator: false;
	readonly outputsArePlansUntilReferenced: true;
}

export interface AgentOrchestration {
	readonly kind: typeof AGENT_ORCHESTRATION_KIND;
	readonly schemaVersion: typeof AGENT_ORCHESTRATION_SCHEMA_VERSION;
	readonly orchestrationId: string;
	readonly projectId: string;
	readonly revision: number;
	readonly intent: AgentIntentReference;
	readonly evidence: readonly AgentEvidence[];
	readonly tasks: readonly AgentTask[];
	readonly guarantees: AgentOrchestrationGuarantees;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly history: readonly AgentOrchestrationEvent[];
}

export type AgentTaskGraph = AgentOrchestration;

export class AgentOrchestratorInvariantError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentOrchestratorInvariantError";
	}
}

export class AgentOrchestratorTransitionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentOrchestratorTransitionError";
	}
}

interface AgentTaskTemplate {
	readonly role: AgentRole;
	readonly title: string;
	readonly purpose: string;
	readonly dependencyRoles: readonly AgentRole[];
	readonly evidenceRequirements: readonly AgentEvidenceRequirement[];
	readonly acceptedEvidenceKinds: readonly AgentEvidenceKind[] | "all";
	readonly outputKind: AgentTaskOutputKind;
	readonly outputLabel: string;
	readonly specificLimitation: string;
}

const PLAN_ONLY_LIMITATION =
	"This task produces a reviewable plan reference only; it does not analyze or mutate media.";

const TASK_TEMPLATES: readonly AgentTaskTemplate[] = [
	{
		role: "director",
		title: "Director intent brief",
		purpose:
			"Translate the user's intent and cited evidence into a reviewable production brief.",
		dependencyRoles: [],
		evidenceRequirements: [
			{
				requirementId: "director-intent",
				description: "A versioned user IntentSpec is required.",
				anyOfKinds: ["intent-spec"],
				minimum: 1,
			},
		],
		acceptedEvidenceKinds: "all",
		outputKind: "director-brief",
		outputLabel: "Reviewable director brief",
		specificLimitation:
			"Local rules can organize intent and evidence, but cannot claim creative model judgment.",
	},
	{
		role: "story",
		title: "Story structure plan",
		purpose:
			"Propose a story structure grounded in the approved director brief and available evidence.",
		dependencyRoles: ["director"],
		evidenceRequirements: [
			{
				requirementId: "story-intent",
				description: "The user's IntentSpec is required for story planning.",
				anyOfKinds: ["intent-spec"],
				minimum: 1,
			},
		],
		acceptedEvidenceKinds: [
			"intent-spec",
			"asset-metadata",
			"scene-analysis",
			"transcript",
			"human-note",
			"brand-guideline",
		],
		outputKind: "story-plan",
		outputLabel: "Reviewable story plan",
		specificLimitation:
			"Without transcript or scene evidence, story suggestions must remain conceptual and must not describe unseen footage.",
	},
	{
		role: "editor",
		title: "Edit decision plan",
		purpose:
			"Prepare reversible edit decisions from the approved story plan and cited media evidence.",
		dependencyRoles: ["story"],
		evidenceRequirements: [
			{
				requirementId: "editor-media-context",
				description:
					"At least one media metadata, scene analysis, or transcript reference is required.",
				anyOfKinds: ["asset-metadata", "scene-analysis", "transcript"],
				minimum: 1,
			},
		],
		acceptedEvidenceKinds: [
			"intent-spec",
			"asset-metadata",
			"scene-analysis",
			"transcript",
			"human-note",
		],
		outputKind: "edit-plan",
		outputLabel: "Reviewable edit decision plan",
		specificLimitation:
			"No cut, trim, timing, or footage-quality claim is valid without referenced media evidence.",
	},
	{
		role: "color",
		title: "Color treatment plan",
		purpose:
			"Propose a color treatment based on intent and cited visual context.",
		dependencyRoles: ["editor"],
		evidenceRequirements: [
			{
				requirementId: "color-visual-context",
				description:
					"At least one asset metadata or visual analysis reference is required.",
				anyOfKinds: ["asset-metadata", "visual-analysis"],
				minimum: 1,
			},
		],
		acceptedEvidenceKinds: [
			"intent-spec",
			"asset-metadata",
			"visual-analysis",
			"brand-guideline",
			"style-reference",
			"human-note",
		],
		outputKind: "color-plan",
		outputLabel: "Reviewable color treatment plan",
		specificLimitation:
			"The task cannot claim exposure, palette, skin-tone, or grading findings without imported visual evidence.",
	},
	{
		role: "sound",
		title: "Sound design plan",
		purpose:
			"Propose dialogue, music, ambience, and mix decisions from cited audio context.",
		dependencyRoles: ["editor"],
		evidenceRequirements: [
			{
				requirementId: "sound-audio-context",
				description:
					"At least one audio metadata, audio analysis, or transcript reference is required.",
				anyOfKinds: ["audio-metadata", "audio-analysis", "transcript"],
				minimum: 1,
			},
		],
		acceptedEvidenceKinds: [
			"intent-spec",
			"audio-metadata",
			"audio-analysis",
			"transcript",
			"human-note",
		],
		outputKind: "sound-plan",
		outputLabel: "Reviewable sound design plan",
		specificLimitation:
			"The task cannot claim silence, loudness, speech quality, or music fit without cited audio evidence.",
	},
	{
		role: "growth",
		title: "Distribution and growth plan",
		purpose:
			"Propose packaging and distribution decisions for the stated audience or platform.",
		dependencyRoles: ["story"],
		evidenceRequirements: [
			{
				requirementId: "growth-market-context",
				description:
					"A publication target, audience brief, or performance reference is required.",
				anyOfKinds: [
					"publication-target",
					"audience-brief",
					"performance-data",
				],
				minimum: 1,
			},
		],
		acceptedEvidenceKinds: [
			"intent-spec",
			"publication-target",
			"audience-brief",
			"brand-guideline",
			"performance-data",
			"human-note",
		],
		outputKind: "growth-plan",
		outputLabel: "Reviewable distribution plan",
		specificLimitation:
			"The task cannot claim predicted retention or virality without cited performance evidence.",
	},
] as const;

const TASK_TEMPLATE_BY_ROLE = new Map(
	TASK_TEMPLATES.map((template) => [template.role, template] as const),
);

const GUARANTEES: AgentOrchestrationGuarantees = Object.freeze({
	deterministicLocalRules: true,
	network: false,
	paidService: false,
	modelInvokedByOrchestrator: false,
	mediaAnalysisPerformedByOrchestrator: false,
	mediaMutationPerformedByOrchestrator: false,
	outputsArePlansUntilReferenced: true,
});

const ANALYSIS_EVIDENCE_KINDS = new Set<AgentEvidenceKind>([
	"scene-analysis",
	"transcript",
	"visual-analysis",
	"audio-analysis",
	"performance-data",
]);

const EVIDENCE_KINDS = new Set<string>([
	"intent-spec",
	"publication-target",
	"asset-metadata",
	"audio-metadata",
	"scene-analysis",
	"transcript",
	"visual-analysis",
	"audio-analysis",
	"audience-brief",
	"brand-guideline",
	"style-reference",
	"performance-data",
	"human-note",
]);
const EVIDENCE_ORIGINS = new Set<string>([
	"user-intent",
	"project-metadata",
	"user-provided",
	"imported-result",
	"external-provider-result",
]);
const TASK_STATUSES = new Set<string>([
	"blocked",
	"awaiting-approval",
	"ready",
	"running",
	"succeeded",
	"failed",
	"rejected",
]);
const APPROVAL_STATUSES = new Set<string>(["pending", "approved", "rejected"]);
const OUTPUT_ORIGINS = new Set<string>([
	"local-rule-result",
	"user-provided",
	"imported-result",
	"external-provider-result",
]);
const EVENT_TYPES = new Set<string>([
	"created",
	"evidence-added",
	"task-approved",
	"task-rejected",
	"task-started",
	"task-succeeded",
	"task-failed",
	"task-retried",
]);

function normalizeText({
	value,
	label,
	maxLength,
}: {
	value: string;
	label: string;
	maxLength: number;
}): string {
	if (typeof value !== "string") {
		throw new AgentOrchestratorInvariantError(`${label} must be text.`);
	}
	const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
	if (!normalized) {
		throw new AgentOrchestratorInvariantError(`${label} cannot be empty.`);
	}
	if (Array.from(normalized).length > maxLength) {
		throw new AgentOrchestratorInvariantError(
			`${label} cannot exceed ${maxLength} characters.`,
		);
	}
	return normalized;
}

function normalizeId({
	value,
	label,
}: {
	value: string;
	label: string;
}): string {
	const normalized = normalizeText({ value, label, maxLength: 240 });
	if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(normalized)) {
		throw new AgentOrchestratorInvariantError(
			`${label} contains unsupported characters.`,
		);
	}
	return normalized;
}

function normalizeTimestamp({
	value,
	label,
}: {
	value: string;
	label: string;
}): string {
	if (typeof value !== "string") {
		throw new AgentOrchestratorInvariantError(`${label} must be text.`);
	}
	const milliseconds = Date.parse(value);
	if (!Number.isFinite(milliseconds)) {
		throw new AgentOrchestratorInvariantError(
			`${label} must be a valid timestamp.`,
		);
	}
	const normalized = new Date(milliseconds).toISOString();
	if (normalized !== value) {
		throw new AgentOrchestratorInvariantError(
			`${label} must be a canonical ISO-8601 timestamp.`,
		);
	}
	return normalized;
}

function assertTimestampOrder({
	current,
	next,
}: {
	current: string;
	next: string;
}): void {
	if (Date.parse(next) < Date.parse(current)) {
		throw new AgentOrchestratorTransitionError(
			"Event time cannot be earlier than the orchestration's previous event.",
		);
	}
}

function hashText(value: string): string {
	let hash = 0x811c9dc5;
	for (const character of value) {
		hash ^= character.codePointAt(0) ?? 0;
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

function deepFreeze<T>(value: T): T {
	if (isRecord(value) && !Object.isFrozen(value)) {
		for (const nested of Object.values(value)) {
			deepFreeze(nested);
		}
		Object.freeze(value);
	} else if (Array.isArray(value) && !Object.isFrozen(value)) {
		for (const nested of value) deepFreeze(nested);
		Object.freeze(value);
	}
	return value;
}

function cloneTarget(
	target: IntentSpecTarget | undefined,
): IntentSpecTarget | undefined {
	if (target === undefined) return undefined;
	return {
		...(target.platform === undefined ? {} : { platform: target.platform }),
		...(target.aspectRatio === undefined
			? {}
			: { aspectRatio: target.aspectRatio }),
		...(target.durationSeconds === undefined
			? {}
			: { durationSeconds: target.durationSeconds }),
		...(target.style === undefined ? {} : { style: target.style }),
	};
}

function normalizeIntentSpec(intentSpec: IntentSpec): AgentIntentReference {
	if (intentSpec === null || typeof intentSpec !== "object") {
		throw new AgentOrchestratorInvariantError("IntentSpec must be an object.");
	}
	const projectId = normalizeId({
		value: intentSpec.projectId,
		label: "IntentSpec project id",
	});
	if (!Number.isSafeInteger(intentSpec.revision) || intentSpec.revision < 1) {
		throw new AgentOrchestratorInvariantError(
			"IntentSpec revision must be a positive integer.",
		);
	}
	const userIntent = normalizeText({
		value: intentSpec.userIntent,
		label: "User intent",
		maxLength: 4_000,
	});
	const updatedAt = normalizeTimestamp({
		value: intentSpec.updatedAt,
		label: "IntentSpec updated at",
	});
	const target = cloneTarget(intentSpec.target);
	return {
		projectId,
		revision: intentSpec.revision,
		userIntent,
		...(target === undefined ? {} : { target }),
		updatedAt,
	};
}

function normalizeEvidence(input: AgentEvidenceInput): AgentEvidence {
	const kind = (input as { kind: AgentEvidenceKind }).kind;
	const origin = (input as { origin: AgentEvidenceOrigin }).origin;
	if (!EVIDENCE_KINDS.has(kind)) {
		throw new AgentOrchestratorInvariantError(
			`Unsupported evidence kind ${String(kind)}.`,
		);
	}
	if (!EVIDENCE_ORIGINS.has(origin) || origin === "user-intent") {
		throw new AgentOrchestratorInvariantError(
			`Unsupported supplied evidence origin ${String(origin)}.`,
		);
	}
	const evidenceId = normalizeId({
		value: input.evidenceId,
		label: "Evidence id",
	});
	if (kind === "intent-spec") {
		throw new AgentOrchestratorInvariantError(
			"IntentSpec evidence is reserved and is created from the supplied IntentSpec.",
		);
	}
	if (ANALYSIS_EVIDENCE_KINDS.has(kind) && origin === "project-metadata") {
		throw new AgentOrchestratorInvariantError(
			`${kind} cannot be represented as project metadata; cite an imported, user-provided, or external result.`,
		);
	}
	return {
		evidenceId,
		kind,
		label: normalizeText({
			value: input.label,
			label: "Evidence label",
			maxLength: 240,
		}),
		referenceId: normalizeId({
			value: input.referenceId,
			label: "Evidence reference id",
		}),
		origin,
		producedByOrchestrator: false,
	};
}

function intentEvidence(intent: AgentIntentReference): AgentEvidence {
	return {
		evidenceId: `intent-spec-r${intent.revision}`,
		kind: "intent-spec",
		label: `IntentSpec revision ${intent.revision}`,
		referenceId: `intent-spec:${intent.projectId}:r${intent.revision}`,
		origin: "user-intent",
		producedByOrchestrator: false,
	};
}

function targetEvidence(intent: AgentIntentReference): AgentEvidence | null {
	if (intent.target?.platform === undefined) return null;
	return {
		evidenceId: `intent-target-r${intent.revision}`,
		kind: "publication-target",
		label: `Intent target: ${intent.target.platform}`,
		referenceId: `intent-spec:${intent.projectId}:r${intent.revision}:target`,
		origin: "user-intent",
		producedByOrchestrator: false,
	};
}

function normalizeEvidenceCollection({
	intent,
	evidence,
}: {
	intent: AgentIntentReference;
	evidence: readonly AgentEvidenceInput[];
}): readonly AgentEvidence[] {
	const values: AgentEvidence[] = [intentEvidence(intent)];
	const target = targetEvidence(intent);
	if (target !== null) values.push(target);
	values.push(...evidence.map(normalizeEvidence));
	values.sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));

	const evidenceIds = new Set<string>();
	for (const item of values) {
		if (evidenceIds.has(item.evidenceId)) {
			throw new AgentOrchestratorInvariantError(
				`Evidence id ${item.evidenceId} must be unique.`,
			);
		}
		evidenceIds.add(item.evidenceId);
	}
	return values;
}

function taskIdFor({
	orchestrationId,
	role,
}: {
	orchestrationId: string;
	role: AgentRole;
}): string {
	return `${orchestrationId}/${role}`;
}

function expectedOutputFor({
	orchestrationId,
	template,
}: {
	orchestrationId: string;
	template: AgentTaskTemplate;
}): AgentTaskOutputReference {
	return {
		outputId: `${orchestrationId}/output/${template.role}`,
		kind: template.outputKind,
		label: template.outputLabel,
		state: "expected",
		artifactReference: null,
		origin: null,
		producedAt: null,
	};
}

function requirementSatisfied({
	requirement,
	evidence,
}: {
	requirement: AgentEvidenceRequirement;
	evidence: readonly AgentEvidence[];
}): boolean {
	const matching = evidence.filter((item) =>
		requirement.anyOfKinds.includes(item.kind),
	);
	return matching.length >= requirement.minimum;
}

function acceptedEvidenceForTask({
	template,
	evidence,
}: {
	template: AgentTaskTemplate;
	evidence: readonly AgentEvidence[];
}): readonly string[] {
	return evidence
		.filter(
			(item) =>
				template.acceptedEvidenceKinds === "all" ||
				template.acceptedEvidenceKinds.includes(item.kind),
		)
		.map((item) => item.evidenceId)
		.sort((left, right) => left.localeCompare(right));
}

function computeBlockers({
	task,
	tasks,
	evidence,
}: {
	task: AgentTask;
	tasks: readonly AgentTask[];
	evidence: readonly AgentEvidence[];
}): readonly AgentTaskBlocker[] {
	const blockers: AgentTaskBlocker[] = [];
	for (const dependencyTaskId of task.dependencyTaskIds) {
		const dependency = tasks.find((item) => item.taskId === dependencyTaskId);
		if (dependency?.status !== "succeeded") {
			blockers.push({
				kind: "dependency",
				referenceId: dependencyTaskId,
				message: `Dependency ${dependencyTaskId} has not succeeded.`,
			});
		}
	}
	for (const requirement of task.evidenceRequirements) {
		if (!requirementSatisfied({ requirement, evidence })) {
			blockers.push({
				kind: "evidence",
				referenceId: requirement.requirementId,
				message: requirement.description,
			});
		}
	}
	if (task.approvalGate.status === "pending") {
		blockers.push({
			kind: "approval",
			referenceId: task.taskId,
			message: "Human approval is required before this task may run.",
		});
	}
	return blockers;
}

function derivePendingTaskStatus({
	task,
	blockers,
}: {
	task: AgentTask;
	blockers: readonly AgentTaskBlocker[];
}): AgentTaskStatus {
	if (task.approvalGate.status === "rejected") return "rejected";
	if (blockers.some((blocker) => blocker.kind !== "approval")) return "blocked";
	if (task.approvalGate.status === "pending") return "awaiting-approval";
	return "ready";
}

function refreshTasks({
	tasks,
	evidence,
}: {
	tasks: readonly AgentTask[];
	evidence: readonly AgentEvidence[];
}): readonly AgentTask[] {
	let refreshed = tasks.map((task) => ({
		...task,
		inputEvidenceIds: acceptedEvidenceForTask({
			template: TASK_TEMPLATE_BY_ROLE.get(task.role)!,
			evidence,
		}),
	}));

	for (let iteration = 0; iteration < TASK_TEMPLATES.length; iteration += 1) {
		refreshed = refreshed.map((task) => {
			if (
				["running", "succeeded", "failed", "rejected"].includes(task.status)
			) {
				return task;
			}
			const blockers = computeBlockers({ task, tasks: refreshed, evidence });
			return {
				...task,
				blockers,
				status: derivePendingTaskStatus({ task, blockers }),
			};
		});
	}
	return refreshed;
}

function buildInitialTasks({
	orchestrationId,
	evidence,
	maxRetries,
}: {
	orchestrationId: string;
	evidence: readonly AgentEvidence[];
	maxRetries: number;
}): readonly AgentTask[] {
	const tasks = TASK_TEMPLATES.map((template) => {
		const taskId = taskIdFor({ orchestrationId, role: template.role });
		return {
			taskId,
			role: template.role,
			title: template.title,
			purpose: template.purpose,
			status: "blocked" as const,
			dependencyTaskIds: template.dependencyRoles.map((role) =>
				taskIdFor({ orchestrationId, role }),
			),
			evidenceRequirements: template.evidenceRequirements,
			inputEvidenceIds: acceptedEvidenceForTask({ template, evidence }),
			outputReferences: [expectedOutputFor({ orchestrationId, template })],
			approvalGate: {
				required: true as const,
				phase: "before-run" as const,
				status: "pending" as const,
				decidedAt: null,
				decidedBy: null,
				note: null,
			},
			blockers: [],
			limitations: [PLAN_ONLY_LIMITATION, template.specificLimitation],
			attemptCount: 0,
			retryCount: 0,
			maxRetries,
			failure: null,
		} satisfies AgentTask;
	});
	return refreshTasks({ tasks, evidence });
}

function nextEvent({
	revision,
	type,
	at,
	taskId,
	detail,
}: {
	revision: number;
	type: AgentOrchestrationEventType;
	at: string;
	taskId: string | null;
	detail: string;
}): AgentOrchestrationEvent {
	return {
		eventId: `event-r${revision}`,
		revision,
		type,
		at,
		taskId,
		detail,
	};
}

function createRevision({
	orchestration,
	at,
	type,
	taskId,
	detail,
	evidence = orchestration.evidence,
	tasks,
}: {
	orchestration: AgentOrchestration;
	at: string;
	type: Exclude<AgentOrchestrationEventType, "created">;
	taskId: string | null;
	detail: string;
	evidence?: readonly AgentEvidence[];
	tasks: readonly AgentTask[];
}): AgentOrchestration {
	const normalizedAt = normalizeTimestamp({ value: at, label: "Event time" });
	assertTimestampOrder({
		current: orchestration.updatedAt,
		next: normalizedAt,
	});
	const revision = orchestration.revision + 1;
	const refreshedTasks = refreshTasks({ tasks, evidence });
	const next: AgentOrchestration = {
		...orchestration,
		revision,
		evidence,
		tasks: refreshedTasks,
		updatedAt: normalizedAt,
		history: [
			...orchestration.history,
			nextEvent({
				revision,
				type,
				at: normalizedAt,
				taskId,
				detail: normalizeText({
					value: detail,
					label: "Event detail",
					maxLength: 500,
				}),
			}),
		],
	};
	assertAgentOrchestrationInvariants({ orchestration: next });
	return deepFreeze(next);
}

function taskIndex({
	orchestration,
	taskId,
}: {
	orchestration: AgentOrchestration;
	taskId: string;
}): number {
	const normalizedTaskId = normalizeId({ value: taskId, label: "Task id" });
	const index = orchestration.tasks.findIndex(
		(task) => task.taskId === normalizedTaskId,
	);
	if (index < 0) {
		throw new AgentOrchestratorTransitionError(
			`Task ${normalizedTaskId} does not exist.`,
		);
	}
	return index;
}

function replaceTask({
	tasks,
	index,
	task,
}: {
	tasks: readonly AgentTask[];
	index: number;
	task: AgentTask;
}): readonly AgentTask[] {
	return tasks.map((current, currentIndex) =>
		currentIndex === index ? task : current,
	);
}

function validatedCurrent(
	orchestration: AgentOrchestration,
): AgentOrchestration {
	assertAgentOrchestrationInvariants({ orchestration });
	return orchestration;
}

export function createAgentOrchestration({
	intentSpec,
	evidence = [],
	createdAt,
	maxRetries = 2,
}: {
	intentSpec: IntentSpec;
	evidence?: readonly AgentEvidenceInput[];
	createdAt: string;
	maxRetries?: number;
}): AgentOrchestration {
	const intent = normalizeIntentSpec(intentSpec);
	const normalizedCreatedAt = normalizeTimestamp({
		value: createdAt,
		label: "Created at",
	});
	if (!Number.isSafeInteger(maxRetries) || maxRetries < 0 || maxRetries > 10) {
		throw new AgentOrchestratorInvariantError(
			"Maximum retries must be an integer between 0 and 10.",
		);
	}
	const normalizedEvidence = normalizeEvidenceCollection({ intent, evidence });
	const identity = JSON.stringify({
		projectId: intent.projectId,
		intentRevision: intent.revision,
		updatedAt: intent.updatedAt,
		evidence: normalizedEvidence.map(
			({ evidenceId, kind, referenceId, origin }) => ({
				evidenceId,
				kind,
				referenceId,
				origin,
			}),
		),
	});
	const orchestrationId = `orchestration-${hashText(identity)}`;
	const tasks = buildInitialTasks({
		orchestrationId,
		evidence: normalizedEvidence,
		maxRetries,
	});
	const orchestration: AgentOrchestration = {
		kind: AGENT_ORCHESTRATION_KIND,
		schemaVersion: AGENT_ORCHESTRATION_SCHEMA_VERSION,
		orchestrationId,
		projectId: intent.projectId,
		revision: 1,
		intent,
		evidence: normalizedEvidence,
		tasks,
		guarantees: GUARANTEES,
		createdAt: normalizedCreatedAt,
		updatedAt: normalizedCreatedAt,
		history: [
			nextEvent({
				revision: 1,
				type: "created",
				at: normalizedCreatedAt,
				taskId: null,
				detail:
					"Created a local, reviewable agent task graph from IntentSpec and cited evidence.",
			}),
		],
	};
	assertAgentOrchestrationInvariants({ orchestration });
	return deepFreeze(orchestration);
}

export function addAgentEvidence({
	orchestration,
	evidence,
	at,
}: {
	orchestration: AgentOrchestration;
	evidence: AgentEvidenceInput;
	at: string;
}): AgentOrchestration {
	const current = validatedCurrent(orchestration);
	const normalized = normalizeEvidence(evidence);
	const existing = current.evidence.find(
		(item) => item.evidenceId === normalized.evidenceId,
	);
	if (existing !== undefined) {
		if (JSON.stringify(existing) === JSON.stringify(normalized)) return current;
		throw new AgentOrchestratorTransitionError(
			`Evidence id ${normalized.evidenceId} already refers to different evidence.`,
		);
	}
	const nextEvidence = [...current.evidence, normalized].sort((left, right) =>
		left.evidenceId.localeCompare(right.evidenceId),
	);
	return createRevision({
		orchestration: current,
		at,
		type: "evidence-added",
		taskId: null,
		detail: `Added cited evidence ${normalized.evidenceId}.`,
		evidence: nextEvidence,
		tasks: current.tasks,
	});
}

export function approveAgentTask({
	orchestration,
	taskId,
	approvedBy,
	at,
	note,
}: {
	orchestration: AgentOrchestration;
	taskId: string;
	approvedBy: string;
	at: string;
	note?: string;
}): AgentOrchestration {
	const current = validatedCurrent(orchestration);
	const index = taskIndex({ orchestration: current, taskId });
	const task = current.tasks[index];
	if (task.approvalGate.status === "approved") return current;
	if (task.approvalGate.status !== "pending") {
		throw new AgentOrchestratorTransitionError(
			`Task ${task.taskId} approval has already been rejected.`,
		);
	}
	if (["running", "succeeded", "failed"].includes(task.status)) {
		throw new AgentOrchestratorTransitionError(
			`Task ${task.taskId} cannot be approved from ${task.status}.`,
		);
	}
	const normalizedAt = normalizeTimestamp({
		value: at,
		label: "Approval time",
	});
	const nextTask: AgentTask = {
		...task,
		approvalGate: {
			...task.approvalGate,
			status: "approved",
			decidedAt: normalizedAt,
			decidedBy: normalizeText({
				value: approvedBy,
				label: "Approver",
				maxLength: 160,
			}),
			note:
				note === undefined
					? null
					: normalizeText({
							value: note,
							label: "Approval note",
							maxLength: 500,
						}),
		},
	};
	return createRevision({
		orchestration: current,
		at: normalizedAt,
		type: "task-approved",
		taskId: task.taskId,
		detail: `Human approved ${task.role} task.`,
		tasks: replaceTask({ tasks: current.tasks, index, task: nextTask }),
	});
}

export function rejectAgentTask({
	orchestration,
	taskId,
	rejectedBy,
	at,
	note,
}: {
	orchestration: AgentOrchestration;
	taskId: string;
	rejectedBy: string;
	at: string;
	note: string;
}): AgentOrchestration {
	const current = validatedCurrent(orchestration);
	const index = taskIndex({ orchestration: current, taskId });
	const task = current.tasks[index];
	if (task.approvalGate.status !== "pending") {
		throw new AgentOrchestratorTransitionError(
			`Task ${task.taskId} no longer has a pending approval gate.`,
		);
	}
	if (["running", "succeeded", "failed"].includes(task.status)) {
		throw new AgentOrchestratorTransitionError(
			`Task ${task.taskId} cannot be rejected from ${task.status}.`,
		);
	}
	const normalizedAt = normalizeTimestamp({
		value: at,
		label: "Rejection time",
	});
	const nextTask: AgentTask = {
		...task,
		status: "rejected",
		approvalGate: {
			...task.approvalGate,
			status: "rejected",
			decidedAt: normalizedAt,
			decidedBy: normalizeText({
				value: rejectedBy,
				label: "Reviewer",
				maxLength: 160,
			}),
			note: normalizeText({
				value: note,
				label: "Rejection note",
				maxLength: 500,
			}),
		},
		blockers: [],
	};
	return createRevision({
		orchestration: current,
		at: normalizedAt,
		type: "task-rejected",
		taskId: task.taskId,
		detail: `Human rejected ${task.role} task.`,
		tasks: replaceTask({ tasks: current.tasks, index, task: nextTask }),
	});
}

export function startAgentTask({
	orchestration,
	taskId,
	at,
}: {
	orchestration: AgentOrchestration;
	taskId: string;
	at: string;
}): AgentOrchestration {
	const current = validatedCurrent(orchestration);
	const index = taskIndex({ orchestration: current, taskId });
	const task = current.tasks[index];
	if (task.status !== "ready") {
		throw new AgentOrchestratorTransitionError(
			`Task ${task.taskId} cannot start from ${task.status}.`,
		);
	}
	const nextTask: AgentTask = {
		...task,
		status: "running",
		blockers: [],
		attemptCount: task.attemptCount + 1,
		failure: null,
	};
	return createRevision({
		orchestration: current,
		at,
		type: "task-started",
		taskId: task.taskId,
		detail: `Started local orchestration for ${task.role}; no model or media analysis was invoked.`,
		tasks: replaceTask({ tasks: current.tasks, index, task: nextTask }),
	});
}

export function completeAgentTask({
	orchestration,
	taskId,
	at,
	outputs,
}: {
	orchestration: AgentOrchestration;
	taskId: string;
	at: string;
	outputs: readonly AgentTaskOutputResult[];
}): AgentOrchestration {
	const current = validatedCurrent(orchestration);
	const index = taskIndex({ orchestration: current, taskId });
	const task = current.tasks[index];
	if (task.status !== "running") {
		throw new AgentOrchestratorTransitionError(
			`Task ${task.taskId} cannot succeed from ${task.status}.`,
		);
	}
	if (outputs.length !== task.outputReferences.length) {
		throw new AgentOrchestratorTransitionError(
			`Task ${task.taskId} requires exactly ${task.outputReferences.length} output reference(s).`,
		);
	}
	const normalizedAt = normalizeTimestamp({
		value: at,
		label: "Completion time",
	});
	const outputById = new Map(
		outputs.map((output) => [output.outputId, output]),
	);
	if (outputById.size !== outputs.length) {
		throw new AgentOrchestratorTransitionError("Output ids must be unique.");
	}
	const outputReferences = task.outputReferences.map((expected) => {
		const output = outputById.get(expected.outputId);
		if (output === undefined) {
			throw new AgentOrchestratorTransitionError(
				`Expected output ${expected.outputId} was not referenced.`,
			);
		}
		return {
			...expected,
			state: "available" as const,
			artifactReference: normalizeId({
				value: output.artifactReference,
				label: "Output artifact reference",
			}),
			origin: output.origin,
			producedAt: normalizedAt,
		};
	});
	const nextTask: AgentTask = {
		...task,
		status: "succeeded",
		blockers: [],
		outputReferences,
		failure: null,
	};
	return createRevision({
		orchestration: current,
		at: normalizedAt,
		type: "task-succeeded",
		taskId: task.taskId,
		detail: `${task.role} produced referenced plan output; no media completion is implied.`,
		tasks: replaceTask({ tasks: current.tasks, index, task: nextTask }),
	});
}

export function failAgentTask({
	orchestration,
	taskId,
	at,
	code,
	message,
	retryable,
}: {
	orchestration: AgentOrchestration;
	taskId: string;
	at: string;
	code: string;
	message: string;
	retryable: boolean;
}): AgentOrchestration {
	const current = validatedCurrent(orchestration);
	const index = taskIndex({ orchestration: current, taskId });
	const task = current.tasks[index];
	if (task.status !== "running") {
		throw new AgentOrchestratorTransitionError(
			`Task ${task.taskId} cannot fail from ${task.status}.`,
		);
	}
	const normalizedAt = normalizeTimestamp({ value: at, label: "Failure time" });
	const failure: AgentTaskFailure = {
		code: normalizeId({ value: code, label: "Failure code" }),
		message: normalizeText({
			value: message,
			label: "Failure message",
			maxLength: 500,
		}),
		retryable,
		failedAt: normalizedAt,
		attempt: task.attemptCount,
	};
	const nextTask: AgentTask = {
		...task,
		status: "failed",
		blockers: [],
		failure,
	};
	return createRevision({
		orchestration: current,
		at: normalizedAt,
		type: "task-failed",
		taskId: task.taskId,
		detail: `${task.role} task failed with ${failure.code}.`,
		tasks: replaceTask({ tasks: current.tasks, index, task: nextTask }),
	});
}

export function retryAgentTask({
	orchestration,
	taskId,
	at,
}: {
	orchestration: AgentOrchestration;
	taskId: string;
	at: string;
}): AgentOrchestration {
	const current = validatedCurrent(orchestration);
	const index = taskIndex({ orchestration: current, taskId });
	const task = current.tasks[index];
	if (task.status !== "failed" || task.failure === null) {
		throw new AgentOrchestratorTransitionError(
			`Task ${task.taskId} is not in a failed state.`,
		);
	}
	if (!task.failure.retryable) {
		throw new AgentOrchestratorTransitionError(
			`Task ${task.taskId} failure is not retryable.`,
		);
	}
	if (task.retryCount >= task.maxRetries) {
		throw new AgentOrchestratorTransitionError(
			`Task ${task.taskId} reached its retry limit.`,
		);
	}
	const nextTask: AgentTask = {
		...task,
		status: "blocked",
		retryCount: task.retryCount + 1,
		failure: null,
		outputReferences: task.outputReferences.map((output) => ({
			...output,
			state: "expected",
			artifactReference: null,
			origin: null,
			producedAt: null,
		})),
	};
	return createRevision({
		orchestration: current,
		at,
		type: "task-retried",
		taskId: task.taskId,
		detail: `Prepared retry ${nextTask.retryCount} for ${task.role}.`,
		tasks: replaceTask({ tasks: current.tasks, index, task: nextTask }),
	});
}

export function getAgentTask({
	orchestration,
	taskId,
}: {
	orchestration: AgentOrchestration;
	taskId: string;
}): AgentTask {
	const current = validatedCurrent(orchestration);
	return current.tasks[taskIndex({ orchestration: current, taskId })];
}

export function getAgentTaskByRole({
	orchestration,
	role,
}: {
	orchestration: AgentOrchestration;
	role: AgentRole;
}): AgentTask {
	const current = validatedCurrent(orchestration);
	const task = current.tasks.find((item) => item.role === role);
	if (task === undefined) {
		throw new AgentOrchestratorInvariantError(`Role ${role} has no task.`);
	}
	return task;
}

export function getAgentTasksByStatus({
	orchestration,
	status,
}: {
	orchestration: AgentOrchestration;
	status: AgentTaskStatus;
}): readonly AgentTask[] {
	return validatedCurrent(orchestration).tasks.filter(
		(task) => task.status === status,
	);
}

export function getReadyAgentTasks({
	orchestration,
}: {
	orchestration: AgentOrchestration;
}): readonly AgentTask[] {
	return getAgentTasksByStatus({ orchestration, status: "ready" });
}

export function canStartAgentTask({ task }: { task: AgentTask }): boolean {
	return task.status === "ready";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertPlainSerializable({
	value,
	path = "orchestration",
}: {
	value: unknown;
	path?: string;
}): void {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		if (typeof value === "number" && !Number.isFinite(value)) {
			throw new AgentOrchestratorInvariantError(
				`${path} contains a non-finite number.`,
			);
		}
		return;
	}
	if (Array.isArray(value)) {
		value.forEach((item, index) =>
			assertPlainSerializable({ value: item, path: `${path}[${index}]` }),
		);
		return;
	}
	if (!isRecord(value) || Object.getPrototypeOf(value) !== Object.prototype) {
		throw new AgentOrchestratorInvariantError(
			`${path} must contain only plain JSON-serializable data.`,
		);
	}
	for (const [key, nested] of Object.entries(value)) {
		assertPlainSerializable({ value: nested, path: `${path}.${key}` });
	}
}

function assertEvidenceInvariant(evidence: AgentEvidence): void {
	normalizeId({ value: evidence.evidenceId, label: "Evidence id" });
	normalizeText({
		value: evidence.label,
		label: "Evidence label",
		maxLength: 240,
	});
	normalizeId({ value: evidence.referenceId, label: "Evidence reference id" });
	if (!EVIDENCE_KINDS.has(evidence.kind)) {
		throw new AgentOrchestratorInvariantError(
			`Unsupported stored evidence kind ${String(evidence.kind)}.`,
		);
	}
	if (!EVIDENCE_ORIGINS.has(evidence.origin)) {
		throw new AgentOrchestratorInvariantError(
			`Unsupported stored evidence origin ${String(evidence.origin)}.`,
		);
	}
	if (
		evidence.origin === "user-intent" &&
		evidence.kind !== "intent-spec" &&
		evidence.kind !== "publication-target"
	) {
		throw new AgentOrchestratorInvariantError(
			"User-intent provenance is reserved for IntentSpec-derived evidence.",
		);
	}
	if (evidence.kind === "intent-spec" && evidence.origin !== "user-intent") {
		throw new AgentOrchestratorInvariantError(
			"IntentSpec evidence must retain user-intent provenance.",
		);
	}
	if (evidence.producedByOrchestrator !== false) {
		throw new AgentOrchestratorInvariantError(
			"The local orchestrator cannot claim that it produced input evidence.",
		);
	}
	if (
		ANALYSIS_EVIDENCE_KINDS.has(evidence.kind) &&
		evidence.origin === "project-metadata"
	) {
		throw new AgentOrchestratorInvariantError(
			`${evidence.kind} cannot be claimed as project metadata.`,
		);
	}
}

function assertIntentTargetInvariant(target: unknown): void {
	if (target === undefined) return;
	if (!isRecord(target)) {
		throw new AgentOrchestratorInvariantError(
			"Intent target must be a plain object.",
		);
	}
	const allowedKeys = new Set([
		"platform",
		"aspectRatio",
		"durationSeconds",
		"style",
	]);
	if (Object.keys(target).some((key) => !allowedKeys.has(key))) {
		throw new AgentOrchestratorInvariantError(
			"Intent target contains unsupported fields.",
		);
	}
	let populatedFields = 0;
	for (const [value, label] of [
		[target.platform, "Target platform"],
		[target.aspectRatio, "Target aspect ratio"],
		[target.style, "Target style"],
	] as const) {
		if (value === undefined) continue;
		populatedFields += 1;
		if (typeof value !== "string") {
			throw new AgentOrchestratorInvariantError(`${label} must be text.`);
		}
		if (normalizeText({ value, label, maxLength: 160 }) !== value) {
			throw new AgentOrchestratorInvariantError(`${label} must be normalized.`);
		}
	}
	const durationSeconds = target.durationSeconds;
	if (durationSeconds !== undefined) {
		populatedFields += 1;
		if (
			typeof durationSeconds !== "number" ||
			!Number.isSafeInteger(durationSeconds) ||
			durationSeconds < 1 ||
			durationSeconds > 86_400
		) {
			throw new AgentOrchestratorInvariantError(
				"Target duration must be an integer between 1 and 86400 seconds.",
			);
		}
	}
	if (populatedFields === 0) {
		throw new AgentOrchestratorInvariantError(
			"Intent target must contain at least one preference.",
		);
	}
}

function assertTaskInvariant({
	task,
	tasks,
	evidence,
}: {
	task: AgentTask;
	tasks: readonly AgentTask[];
	evidence: readonly AgentEvidence[];
}): void {
	const template = TASK_TEMPLATE_BY_ROLE.get(task.role);
	if (template === undefined) {
		throw new AgentOrchestratorInvariantError(
			`Unknown agent role ${task.role}.`,
		);
	}
	if (!TASK_STATUSES.has(task.status)) {
		throw new AgentOrchestratorInvariantError(
			`Task ${task.taskId} has an unsupported status.`,
		);
	}
	const orchestrationId = task.taskId.slice(0, task.taskId.lastIndexOf("/"));
	const expectedTaskId = taskIdFor({ orchestrationId, role: task.role });
	if (task.taskId !== expectedTaskId) {
		throw new AgentOrchestratorInvariantError(
			`Task ${task.taskId} does not match its role.`,
		);
	}
	const expectedDependencies = template.dependencyRoles.map((role) =>
		taskIdFor({ orchestrationId, role }),
	);
	if (
		JSON.stringify(task.dependencyTaskIds) !==
		JSON.stringify(expectedDependencies)
	) {
		throw new AgentOrchestratorInvariantError(
			`Task ${task.taskId} has an invalid dependency topology.`,
		);
	}
	if (
		task.title !== template.title ||
		task.purpose !== template.purpose ||
		JSON.stringify(task.evidenceRequirements) !==
			JSON.stringify(template.evidenceRequirements) ||
		JSON.stringify(task.limitations) !==
			JSON.stringify([PLAN_ONLY_LIMITATION, template.specificLimitation])
	) {
		throw new AgentOrchestratorInvariantError(
			`Task ${task.taskId} does not match its deterministic local template.`,
		);
	}
	if (!APPROVAL_STATUSES.has(task.approvalGate.status)) {
		throw new AgentOrchestratorInvariantError(
			`Task ${task.taskId} has an unsupported approval state.`,
		);
	}
	if (!Number.isSafeInteger(task.attemptCount) || task.attemptCount < 0) {
		throw new AgentOrchestratorInvariantError(
			"Attempt count must be non-negative.",
		);
	}
	if (
		!Number.isSafeInteger(task.retryCount) ||
		task.retryCount < 0 ||
		task.retryCount > task.maxRetries
	) {
		throw new AgentOrchestratorInvariantError(
			"Retry count is outside its policy.",
		);
	}
	if (
		!Number.isSafeInteger(task.maxRetries) ||
		task.maxRetries < 0 ||
		task.maxRetries > 10 ||
		task.attemptCount < task.retryCount ||
		task.attemptCount > task.retryCount + 1
	) {
		throw new AgentOrchestratorInvariantError(
			"Task attempts and retry policy are inconsistent.",
		);
	}
	if (
		task.approvalGate.required !== true ||
		task.approvalGate.phase !== "before-run"
	) {
		throw new AgentOrchestratorInvariantError(
			"Every agent task requires a before-run human approval gate.",
		);
	}
	if (task.approvalGate.status === "pending") {
		if (
			task.approvalGate.decidedAt !== null ||
			task.approvalGate.decidedBy !== null ||
			task.approvalGate.note !== null
		) {
			throw new AgentOrchestratorInvariantError(
				"A pending approval gate cannot contain a decision.",
			);
		}
	} else {
		if (
			task.approvalGate.decidedAt === null ||
			task.approvalGate.decidedBy === null
		) {
			throw new AgentOrchestratorInvariantError(
				"A decided approval gate must identify who decided and when.",
			);
		}
		normalizeTimestamp({
			value: task.approvalGate.decidedAt,
			label: "Approval decision time",
		});
		normalizeText({
			value: task.approvalGate.decidedBy,
			label: "Approval decision author",
			maxLength: 160,
		});
		if (task.approvalGate.note !== null) {
			normalizeText({
				value: task.approvalGate.note,
				label: "Approval decision note",
				maxLength: 500,
			});
		}
		if (
			task.approvalGate.status === "rejected" &&
			task.approvalGate.note === null
		) {
			throw new AgentOrchestratorInvariantError(
				"A rejected approval gate must explain the decision.",
			);
		}
	}
	for (const dependencyId of task.dependencyTaskIds) {
		if (!tasks.some((candidate) => candidate.taskId === dependencyId)) {
			throw new AgentOrchestratorInvariantError(
				`Task ${task.taskId} cites missing dependency ${dependencyId}.`,
			);
		}
	}
	for (const evidenceId of task.inputEvidenceIds) {
		if (!evidence.some((item) => item.evidenceId === evidenceId)) {
			throw new AgentOrchestratorInvariantError(
				`Task ${task.taskId} cites missing evidence ${evidenceId}.`,
			);
		}
	}
	const expectedInputEvidenceIds = acceptedEvidenceForTask({
		template,
		evidence,
	});
	if (
		JSON.stringify(task.inputEvidenceIds) !==
		JSON.stringify(expectedInputEvidenceIds)
	) {
		throw new AgentOrchestratorInvariantError(
			`Task ${task.taskId} input evidence references are stale.`,
		);
	}
	if (task.outputReferences.length !== 1) {
		throw new AgentOrchestratorInvariantError(
			`Task ${task.taskId} must expose one expected plan output.`,
		);
	}
	for (const output of task.outputReferences) {
		if (output.outputId !== `${orchestrationId}/output/${task.role}`) {
			throw new AgentOrchestratorInvariantError(
				`Task ${task.taskId} has an invalid output reference id.`,
			);
		}
		if (output.kind !== template.outputKind) {
			throw new AgentOrchestratorInvariantError(
				`Task ${task.taskId} has an invalid output kind.`,
			);
		}
		if (output.label !== template.outputLabel) {
			throw new AgentOrchestratorInvariantError(
				`Task ${task.taskId} has an invalid output label.`,
			);
		}
		if (task.status === "succeeded") {
			if (
				output.state !== "available" ||
				output.artifactReference === null ||
				output.origin === null ||
				output.producedAt === null
			) {
				throw new AgentOrchestratorInvariantError(
					"A succeeded task must cite an available plan output.",
				);
			}
			if (!OUTPUT_ORIGINS.has(output.origin)) {
				throw new AgentOrchestratorInvariantError(
					"A succeeded task has an unsupported output origin.",
				);
			}
			normalizeId({
				value: output.artifactReference,
				label: "Output artifact reference",
			});
			normalizeTimestamp({
				value: output.producedAt,
				label: "Output produced at",
			});
		} else if (
			output.state !== "expected" ||
			output.artifactReference !== null ||
			output.origin !== null ||
			output.producedAt !== null
		) {
			throw new AgentOrchestratorInvariantError(
				"A task that has not succeeded cannot claim an available output.",
			);
		}
	}
	if (task.status === "failed") {
		if (task.failure === null || task.failure.attempt !== task.attemptCount) {
			throw new AgentOrchestratorInvariantError(
				"A failed task must contain failure details for its current attempt.",
			);
		}
		normalizeId({ value: task.failure.code, label: "Failure code" });
		normalizeText({
			value: task.failure.message,
			label: "Failure message",
			maxLength: 500,
		});
		normalizeTimestamp({
			value: task.failure.failedAt,
			label: "Failure time",
		});
		if (typeof task.failure.retryable !== "boolean") {
			throw new AgentOrchestratorInvariantError(
				"Failure retryability must be explicit.",
			);
		}
	} else if (task.failure !== null) {
		throw new AgentOrchestratorInvariantError(
			"Only a failed task may retain failure details.",
		);
	}
	if (
		["running", "succeeded", "failed"].includes(task.status) &&
		task.attemptCount < 1
	) {
		throw new AgentOrchestratorInvariantError(
			"An executed task must have at least one attempt.",
		);
	}
	if (["ready", "running", "succeeded", "failed"].includes(task.status)) {
		if (task.approvalGate.status !== "approved") {
			throw new AgentOrchestratorInvariantError(
				`Task ${task.taskId} cannot be ${task.status} without approval.`,
			);
		}
	}
	if (task.status === "rejected" && task.approvalGate.status !== "rejected") {
		throw new AgentOrchestratorInvariantError(
			"A rejected task must have a rejected approval gate.",
		);
	}
	if (task.status === "rejected" && task.blockers.length > 0) {
		throw new AgentOrchestratorInvariantError(
			"A rejected task cannot retain active blockers.",
		);
	}
	if (["running", "succeeded", "failed"].includes(task.status)) {
		if (
			task.dependencyTaskIds.some(
				(dependencyId) =>
					tasks.find((candidate) => candidate.taskId === dependencyId)
						?.status !== "succeeded",
			) ||
			task.evidenceRequirements.some(
				(requirement) => !requirementSatisfied({ requirement, evidence }),
			) ||
			task.blockers.length > 0
		) {
			throw new AgentOrchestratorInvariantError(
				`Task ${task.taskId} cannot be ${task.status} while prerequisites are unresolved.`,
			);
		}
	}
	if (["blocked", "awaiting-approval", "ready"].includes(task.status)) {
		const expectedBlockers = computeBlockers({ task, tasks, evidence });
		const expectedStatus = derivePendingTaskStatus({
			task,
			blockers: expectedBlockers,
		});
		if (
			task.status !== expectedStatus ||
			JSON.stringify(task.blockers) !== JSON.stringify(expectedBlockers)
		) {
			throw new AgentOrchestratorInvariantError(
				`Task ${task.taskId} has stale derived blockers or status.`,
			);
		}
	}
}

export function assertAgentOrchestrationInvariants({
	orchestration,
}: {
	orchestration: AgentOrchestration;
}): void {
	assertPlainSerializable({ value: orchestration });
	if (
		orchestration.kind !== AGENT_ORCHESTRATION_KIND ||
		orchestration.schemaVersion !== AGENT_ORCHESTRATION_SCHEMA_VERSION
	) {
		throw new AgentOrchestratorInvariantError(
			"Unsupported agent orchestration schema.",
		);
	}
	normalizeId({
		value: orchestration.orchestrationId,
		label: "Orchestration id",
	});
	const normalizedIntentProjectId = normalizeId({
		value: orchestration.intent.projectId,
		label: "Intent project id",
	});
	if (normalizedIntentProjectId !== orchestration.intent.projectId) {
		throw new AgentOrchestratorInvariantError(
			"Intent project id must be normalized.",
		);
	}
	if (
		!Number.isSafeInteger(orchestration.intent.revision) ||
		orchestration.intent.revision < 1
	) {
		throw new AgentOrchestratorInvariantError(
			"Intent revision must be a positive integer.",
		);
	}
	if (
		normalizeText({
			value: orchestration.intent.userIntent,
			label: "User intent",
			maxLength: 4_000,
		}) !== orchestration.intent.userIntent
	) {
		throw new AgentOrchestratorInvariantError(
			"User intent must be normalized.",
		);
	}
	normalizeTimestamp({
		value: orchestration.intent.updatedAt,
		label: "Intent updated at",
	});
	assertIntentTargetInvariant(orchestration.intent.target);
	if (orchestration.projectId !== orchestration.intent.projectId) {
		throw new AgentOrchestratorInvariantError(
			"Orchestration project id must match its IntentSpec reference.",
		);
	}
	if (
		!Number.isSafeInteger(orchestration.revision) ||
		orchestration.revision < 1 ||
		orchestration.history.length !== orchestration.revision
	) {
		throw new AgentOrchestratorInvariantError(
			"Orchestration revision must match its append-only history.",
		);
	}
	const createdAt = normalizeTimestamp({
		value: orchestration.createdAt,
		label: "Created at",
	});
	const updatedAt = normalizeTimestamp({
		value: orchestration.updatedAt,
		label: "Updated at",
	});
	if (Date.parse(updatedAt) < Date.parse(createdAt)) {
		throw new AgentOrchestratorInvariantError(
			"Updated at cannot be earlier than created at.",
		);
	}
	if (Date.parse(createdAt) < Date.parse(orchestration.intent.updatedAt)) {
		throw new AgentOrchestratorInvariantError(
			"Orchestration cannot predate the IntentSpec revision it references.",
		);
	}
	if (JSON.stringify(orchestration.guarantees) !== JSON.stringify(GUARANTEES)) {
		throw new AgentOrchestratorInvariantError(
			"Local honesty guarantees cannot be changed.",
		);
	}
	if (orchestration.tasks.length !== AGENT_ROLES.length) {
		throw new AgentOrchestratorInvariantError(
			"The task graph must contain exactly one task for every required role.",
		);
	}
	const roles = new Set(orchestration.tasks.map((task) => task.role));
	if (AGENT_ROLES.some((role) => !roles.has(role))) {
		throw new AgentOrchestratorInvariantError(
			"The task graph is missing a required agent role.",
		);
	}
	for (const [index, role] of AGENT_ROLES.entries()) {
		const task = orchestration.tasks[index];
		if (
			task.role !== role ||
			task.taskId !==
				taskIdFor({
					orchestrationId: orchestration.orchestrationId,
					role,
				})
		) {
			throw new AgentOrchestratorInvariantError(
				"Agent tasks must preserve the deterministic role order and graph identity.",
			);
		}
	}
	const taskIds = new Set(orchestration.tasks.map((task) => task.taskId));
	if (taskIds.size !== orchestration.tasks.length) {
		throw new AgentOrchestratorInvariantError("Task ids must be unique.");
	}
	const evidenceIds = new Set<string>();
	for (const item of orchestration.evidence) {
		assertEvidenceInvariant(item);
		if (evidenceIds.has(item.evidenceId)) {
			throw new AgentOrchestratorInvariantError("Evidence ids must be unique.");
		}
		evidenceIds.add(item.evidenceId);
	}
	if (
		JSON.stringify(orchestration.evidence.map((item) => item.evidenceId)) !==
		JSON.stringify(
			orchestration.evidence
				.map((item) => item.evidenceId)
				.toSorted((left, right) => left.localeCompare(right)),
		)
	) {
		throw new AgentOrchestratorInvariantError(
			"Evidence references must preserve deterministic id order.",
		);
	}
	const intentEvidenceItems = orchestration.evidence.filter(
		(item) => item.kind === "intent-spec",
	);
	if (
		intentEvidenceItems.length !== 1 ||
		intentEvidenceItems[0].origin !== "user-intent"
	) {
		throw new AgentOrchestratorInvariantError(
			"The graph must contain exactly one IntentSpec evidence reference.",
		);
	}
	const expectedIntentEvidence = intentEvidence(orchestration.intent);
	if (
		JSON.stringify(intentEvidenceItems[0]) !==
		JSON.stringify(expectedIntentEvidence)
	) {
		throw new AgentOrchestratorInvariantError(
			"IntentSpec evidence must match the referenced IntentSpec revision.",
		);
	}
	const expectedTargetEvidence = targetEvidence(orchestration.intent);
	const storedIntentTargetEvidence = orchestration.evidence.filter(
		(item) =>
			item.kind === "publication-target" && item.origin === "user-intent",
	);
	if (
		(expectedTargetEvidence === null &&
			storedIntentTargetEvidence.length !== 0) ||
		(expectedTargetEvidence !== null &&
			(storedIntentTargetEvidence.length !== 1 ||
				JSON.stringify(storedIntentTargetEvidence[0]) !==
					JSON.stringify(expectedTargetEvidence)))
	) {
		throw new AgentOrchestratorInvariantError(
			"Intent-derived publication evidence must match the IntentSpec target.",
		);
	}
	for (const task of orchestration.tasks) {
		assertTaskInvariant({
			task,
			tasks: orchestration.tasks,
			evidence: orchestration.evidence,
		});
	}
	const outputIds = orchestration.tasks.flatMap((task) =>
		task.outputReferences.map((output) => output.outputId),
	);
	if (new Set(outputIds).size !== outputIds.length) {
		throw new AgentOrchestratorInvariantError(
			"Task output ids must be unique.",
		);
	}
	let previousAt = createdAt;
	for (const [index, event] of orchestration.history.entries()) {
		if (!EVENT_TYPES.has(event.type)) {
			throw new AgentOrchestratorInvariantError(
				`History contains unsupported event type ${String(event.type)}.`,
			);
		}
		if (
			event.revision !== index + 1 ||
			event.eventId !== `event-r${index + 1}`
		) {
			throw new AgentOrchestratorInvariantError(
				"History revisions and event ids must be contiguous.",
			);
		}
		normalizeTimestamp({ value: event.at, label: "History event time" });
		if (Date.parse(event.at) < Date.parse(previousAt)) {
			throw new AgentOrchestratorInvariantError(
				"History event times must be non-decreasing.",
			);
		}
		if (
			event.taskId !== null &&
			!orchestration.tasks.some((task) => task.taskId === event.taskId)
		) {
			throw new AgentOrchestratorInvariantError(
				"History event refers to a missing task.",
			);
		}
		if (
			normalizeText({
				value: event.detail,
				label: "History event detail",
				maxLength: 500,
			}) !== event.detail
		) {
			throw new AgentOrchestratorInvariantError(
				"History event detail must be normalized.",
			);
		}
		previousAt = event.at;
	}
	if (
		orchestration.history[0]?.type !== "created" ||
		orchestration.history[0]?.at !== createdAt ||
		orchestration.history.at(-1)?.at !== updatedAt
	) {
		throw new AgentOrchestratorInvariantError(
			"History boundaries must match orchestration timestamps.",
		);
	}
}

function assertAgentOrchestrationShape(
	value: unknown,
): asserts value is AgentOrchestration {
	if (!isRecord(value)) {
		throw new AgentOrchestratorInvariantError(
			"Stored agent orchestration must be an object.",
		);
	}
	if (
		!isRecord(value.intent) ||
		!isRecord(value.guarantees) ||
		!Array.isArray(value.evidence) ||
		!Array.isArray(value.tasks) ||
		!Array.isArray(value.history)
	) {
		throw new AgentOrchestratorInvariantError(
			"Stored agent orchestration is missing required graph collections.",
		);
	}
	if (value.evidence.some((item) => !isRecord(item))) {
		throw new AgentOrchestratorInvariantError(
			"Stored evidence entries must be objects.",
		);
	}
	for (const task of value.tasks) {
		if (
			!isRecord(task) ||
			!Array.isArray(task.dependencyTaskIds) ||
			!Array.isArray(task.evidenceRequirements) ||
			!Array.isArray(task.inputEvidenceIds) ||
			!Array.isArray(task.outputReferences) ||
			!Array.isArray(task.blockers) ||
			!Array.isArray(task.limitations) ||
			!isRecord(task.approvalGate) ||
			(task.failure !== null && !isRecord(task.failure))
		) {
			throw new AgentOrchestratorInvariantError(
				"Stored agent tasks must contain serializable task-state fields.",
			);
		}
		if (
			task.evidenceRequirements.some(
				(requirement) =>
					!isRecord(requirement) || !Array.isArray(requirement.anyOfKinds),
			) ||
			task.outputReferences.some((output) => !isRecord(output)) ||
			task.blockers.some((blocker) => !isRecord(blocker))
		) {
			throw new AgentOrchestratorInvariantError(
				"Stored task requirements, outputs, and blockers must be objects.",
			);
		}
	}
	if (value.history.some((event) => !isRecord(event))) {
		throw new AgentOrchestratorInvariantError(
			"Stored orchestration history entries must be objects.",
		);
	}
}

export function parseAgentOrchestration({
	value,
}: {
	value: unknown;
}): AgentOrchestration {
	const cloned: unknown = structuredClone(value);
	assertAgentOrchestrationShape(cloned);
	assertAgentOrchestrationInvariants({ orchestration: cloned });
	return deepFreeze(cloned);
}

export function serializeAgentOrchestration({
	orchestration,
}: {
	orchestration: AgentOrchestration;
}): string {
	assertAgentOrchestrationInvariants({ orchestration });
	return JSON.stringify(orchestration);
}

export function deserializeAgentOrchestration({
	serialized,
}: {
	serialized: string;
}): AgentOrchestration {
	let value: unknown;
	try {
		value = JSON.parse(serialized);
	} catch {
		throw new AgentOrchestratorInvariantError(
			"Stored agent orchestration is not valid JSON.",
		);
	}
	return parseAgentOrchestration({ value });
}
