import {
	type AgentEvidenceKind,
	type AgentEvidenceOrigin,
} from "./agent-orchestrator";
import {
	assertAgentAuditSafe,
	parseAgentRuntimeSession,
	type AgentRuntimeAction,
	type AgentRuntimeRole,
	type AgentRuntimeRun,
	type AgentRuntimeSession,
} from "./agent-runtime";
import {
	fingerprintJson,
	sha256Hex,
	stableJson,
	type Sha256Fingerprint,
} from "./chatcut-fingerprint";

export const AGENT_OPERATION_REVIEW_LEDGER_KIND =
	"visioncut.agent-operation-review-ledger" as const;
export const AGENT_OPERATION_REVIEW_LEDGER_SCHEMA_VERSION = 1 as const;
export const AGENT_INTENT_PATCH_KIND = "visioncut.agent-intent-patch" as const;
export const AGENT_INTENT_PATCH_SCHEMA_VERSION = 1 as const;

export const AGENT_EXECUTABLE_INTENT_ROLES = [
	"color",
	"sound",
	"growth",
] as const satisfies readonly AgentRuntimeRole[];

export type AgentExecutableIntentRole =
	(typeof AGENT_EXECUTABLE_INTENT_ROLES)[number];
export type AgentOperationAvailability = "ready" | "conflicted";
export type AgentOperationReviewStatus =
	| "pending"
	| "approved"
	| "rejected"
	| "unavailable";
export type AgentIntentPatchStatus = "inactive" | "active" | "undone";
export type AgentIntentPatchOperation =
	| "set-color-direction"
	| "set-sound-direction"
	| "set-distribution-direction";

export interface AgentOperationEvidenceBinding {
	readonly evidenceId: string;
	readonly kind: AgentEvidenceKind;
	readonly referenceId: string;
	readonly origin: AgentEvidenceOrigin;
}

export interface AgentOperationSource {
	readonly sessionId: string;
	readonly runId: string;
	readonly artifactId: string;
	readonly artifactDigest: Sha256Fingerprint;
	readonly actionId: string;
	readonly mergeFingerprint: Sha256Fingerprint;
	readonly sourceFingerprint: Sha256Fingerprint;
}

export interface AgentIntentPatch {
	readonly kind: typeof AGENT_INTENT_PATCH_KIND;
	readonly schemaVersion: typeof AGENT_INTENT_PATCH_SCHEMA_VERSION;
	readonly patchId: string;
	readonly patchFingerprint: Sha256Fingerprint;
	readonly domain: AgentExecutableIntentRole;
	readonly operation: AgentIntentPatchOperation;
	readonly targetReference: string;
	readonly instruction: string;
	readonly evidence: readonly AgentOperationEvidenceBinding[];
	readonly source: AgentOperationSource;
	readonly constraints: {
		readonly mediaMutation: false;
		readonly externalSideEffect: false;
		readonly downstreamExecutorRequired: true;
		readonly explicitActivationRequired: true;
	};
}

export interface AgentOperationProposal {
	readonly proposalId: string;
	readonly role: AgentExecutableIntentRole;
	readonly title: string;
	readonly description: string;
	readonly targetReference: string;
	readonly evidence: readonly AgentOperationEvidenceBinding[];
	readonly source: AgentOperationSource;
	readonly availability: AgentOperationAvailability;
	readonly blockers: readonly string[];
	readonly review: {
		readonly status: AgentOperationReviewStatus;
		readonly decidedAt: string | null;
		readonly decidedBy: string | null;
		readonly note: string | null;
	};
	readonly patch: AgentIntentPatch;
	readonly activation: {
		readonly status: AgentIntentPatchStatus;
		readonly receiptId: string | null;
		readonly activatedAt: string | null;
		readonly activatedBy: string | null;
		readonly undoneAt: string | null;
		readonly undoneBy: string | null;
	};
}

export type AgentOperationReviewEventType =
	| "ledger-created"
	| "proposal-approved"
	| "proposal-rejected"
	| "patch-activated"
	| "patch-undone";

export interface AgentOperationReviewEvent {
	readonly eventId: string;
	readonly revision: number;
	readonly type: AgentOperationReviewEventType;
	readonly at: string;
	readonly proposalId: string | null;
	readonly actor: string | null;
	readonly note: string | null;
	readonly patchId: string | null;
}

export interface AgentOperationReviewLedger {
	readonly kind: typeof AGENT_OPERATION_REVIEW_LEDGER_KIND;
	readonly schemaVersion: typeof AGENT_OPERATION_REVIEW_LEDGER_SCHEMA_VERSION;
	readonly ledgerId: string;
	readonly projectId: string;
	readonly sessionId: string;
	readonly mergeFingerprint: Sha256Fingerprint;
	readonly sourceRuntimeRevision: number;
	readonly revision: number;
	readonly proposals: readonly AgentOperationProposal[];
	readonly events: readonly AgentOperationReviewEvent[];
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly guarantees: {
		readonly evidenceBound: true;
		readonly explicitHumanReview: true;
		readonly mediaMutated: false;
		readonly externalSideEffects: false;
		readonly activationIsReversible: true;
		readonly apiKeysStored: false;
	};
}

export type AgentOperationReviewStaleReason =
	| "session-changed"
	| "merge-changed"
	| "proposal-source-changed";

export interface AgentOperationReviewStaleness {
	readonly stale: boolean;
	readonly reasons: readonly AgentOperationReviewStaleReason[];
}

export class AgentOperationReviewError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentOperationReviewError";
	}
}

const GUARANTEES = Object.freeze({
	evidenceBound: true,
	explicitHumanReview: true,
	mediaMutated: false,
	externalSideEffects: false,
	activationIsReversible: true,
	apiKeysStored: false,
} as const);

const PATCH_CONSTRAINTS = Object.freeze({
	mediaMutation: false,
	externalSideEffect: false,
	downstreamExecutorRequired: true,
	explicitActivationRequired: true,
} as const);

const REVIEW_EVENT_TYPES = new Set<AgentOperationReviewEventType>([
	"ledger-created",
	"proposal-approved",
	"proposal-rejected",
	"patch-activated",
	"patch-undone",
]);

const EXECUTABLE_ROLE_SET = new Set<AgentRuntimeRole>(
	AGENT_EXECUTABLE_INTENT_ROLES,
);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExecutableRole(
	role: AgentRuntimeRole,
): role is AgentExecutableIntentRole {
	return EXECUTABLE_ROLE_SET.has(role);
}

function deepFreeze<T>(value: T): T {
	if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
		return value;
	}
	for (const key of Reflect.ownKeys(value)) deepFreeze(Reflect.get(value, key));
	return Object.freeze(value);
}

function normalizeText({
	value,
	label,
	maxLength,
	required = true,
}: {
	value: unknown;
	label: string;
	maxLength: number;
	required?: boolean;
}): string {
	if (typeof value !== "string") {
		throw new AgentOperationReviewError(`${label} must be text.`);
	}
	const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
	if (required && !normalized) {
		throw new AgentOperationReviewError(`${label} cannot be empty.`);
	}
	if (Array.from(normalized).length > maxLength) {
		throw new AgentOperationReviewError(`${label} is too long.`);
	}
	return normalized;
}

function normalizeIdentifier({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): string {
	const normalized = normalizeText({ value, label, maxLength: 300 });
	if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(normalized)) {
		throw new AgentOperationReviewError(`${label} is invalid.`);
	}
	return normalized;
}

function normalizeTimestamp({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): string {
	if (typeof value !== "string") {
		throw new AgentOperationReviewError(`${label} must be text.`);
	}
	const milliseconds = Date.parse(value);
	if (
		!Number.isFinite(milliseconds) ||
		new Date(milliseconds).toISOString() !== value
	) {
		throw new AgentOperationReviewError(`${label} must be canonical ISO time.`);
	}
	return value;
}

function operationForRole(
	role: AgentExecutableIntentRole,
): AgentIntentPatchOperation {
	switch (role) {
		case "color":
			return "set-color-direction";
		case "sound":
			return "set-sound-direction";
		case "growth":
			return "set-distribution-direction";
	}
}

function expectedLedgerId({
	projectId,
	sessionId,
	mergeFingerprint,
	sourceRuntimeRevision,
}: {
	projectId: string;
	sessionId: string;
	mergeFingerprint: Sha256Fingerprint;
	sourceRuntimeRevision: number;
}): string {
	return `agent-operation-ledger-${sha256Hex(
		stableJson({
			projectId,
			sessionId,
			mergeFingerprint,
			sourceRuntimeRevision,
		}),
	).slice(0, 24)}`;
}

export function agentOperationLedgerIdForSession({
	session,
}: {
	session: AgentRuntimeSession;
}): string {
	const parsed = parseAgentRuntimeSession({ value: session });
	if (parsed === null) {
		throw new AgentOperationReviewError("Runtime session is invalid.");
	}
	return expectedLedgerId({
		projectId: parsed.projectId,
		sessionId: parsed.sessionId,
		mergeFingerprint: parsed.merge.fingerprint,
		sourceRuntimeRevision: parsed.revision,
	});
}

function sourceFingerprint({
	sessionId,
	run,
	action,
	targetReference,
	evidence,
	mergeFingerprint,
	availability,
	blockers,
}: {
	sessionId: string;
	run: AgentRuntimeRun;
	action: AgentRuntimeAction;
	targetReference: string;
	evidence: readonly AgentOperationEvidenceBinding[];
	mergeFingerprint: Sha256Fingerprint;
	availability: AgentOperationAvailability;
	blockers: readonly string[];
}): Sha256Fingerprint {
	if (run.artifact === null) {
		throw new AgentOperationReviewError("Operation source has no artifact.");
	}
	return fingerprintJson({
		sessionId,
		runId: run.runId,
		artifactId: run.artifact.artifactId,
		artifactDigest: run.artifact.artifactDigest,
		actionId: action.actionId,
		role: run.role,
		title: action.title,
		description: action.description,
		targetReference,
		evidence,
		mergeFingerprint,
		availability,
		blockers,
	});
}

function patchFingerprint(
	patch: Omit<AgentIntentPatch, "patchFingerprint">,
): Sha256Fingerprint {
	return fingerprintJson(patch);
}

function expectedProposalId(sourceFingerprintValue: Sha256Fingerprint): string {
	return `operation-proposal-${sha256Hex(sourceFingerprintValue).slice(0, 24)}`;
}

function expectedPatchId({
	proposalId,
	sourceFingerprintValue,
}: {
	proposalId: string;
	sourceFingerprintValue: Sha256Fingerprint;
}): string {
	return `intent-patch-${sha256Hex(
		`${proposalId}:${sourceFingerprintValue}`,
	).slice(0, 24)}`;
}

function expectedActivationReceiptId({
	ledgerId,
	proposalId,
	patchFingerprintValue,
	activatedAt,
	actor,
}: {
	ledgerId: string;
	proposalId: string;
	patchFingerprintValue: Sha256Fingerprint;
	activatedAt: string;
	actor: string;
}): string {
	return `intent-activation-${sha256Hex(
		stableJson({
			ledgerId,
			proposalId,
			patchFingerprint: patchFingerprintValue,
			activatedAt,
			actor,
		}),
	).slice(0, 24)}`;
}

function buildProposal({
	session,
	run,
	action,
	duplicateActionIds,
}: {
	session: AgentRuntimeSession;
	run: AgentRuntimeRun;
	action: AgentRuntimeAction;
	duplicateActionIds: ReadonlySet<string>;
}): AgentOperationProposal {
	if (!isExecutableRole(run.role) || run.artifact === null) {
		throw new AgentOperationReviewError(
			"Action is outside the intent-patch roles.",
		);
	}
	const evidenceById = new Map(
		run.inputEvidence.map((item) => [item.evidenceId, item] as const),
	);
	const evidence = action.evidenceIds.map((evidenceId) => {
		const item = evidenceById.get(evidenceId);
		if (item === undefined) {
			throw new AgentOperationReviewError(
				`Action ${action.actionId} cites unavailable evidence.`,
			);
		}
		return {
			evidenceId: item.evidenceId,
			kind: item.kind,
			referenceId: item.referenceId,
			origin: item.origin,
		};
	});
	const targetReference =
		action.targetReference ?? `project:${session.projectId}/${run.role}`;
	const conflicts = session.merge.conflicts.filter(
		(conflict) =>
			conflict.actionIds.includes(action.actionId) ||
			(conflict.targetReference === targetReference &&
				conflict.roles.includes(run.role)),
	);
	const blockers = [
		...(duplicateActionIds.has(action.actionId)
			? ["The action id is duplicated across runtime artifacts."]
			: []),
		...conflicts.map(
			(conflict) =>
				`Resolve conflict ${conflict.conflictId} before approval: ${conflict.description}`,
		),
	];
	const availability: AgentOperationAvailability =
		blockers.length === 0 ? "ready" : "conflicted";
	const fingerprint = sourceFingerprint({
		sessionId: session.sessionId,
		run,
		action,
		targetReference,
		evidence,
		mergeFingerprint: session.merge.fingerprint,
		availability,
		blockers,
	});
	const proposalId = expectedProposalId(fingerprint);
	const source: AgentOperationSource = {
		sessionId: session.sessionId,
		runId: run.runId,
		artifactId: run.artifact.artifactId,
		artifactDigest: run.artifact.artifactDigest,
		actionId: action.actionId,
		mergeFingerprint: session.merge.fingerprint,
		sourceFingerprint: fingerprint,
	};
	const patchWithoutFingerprint: Omit<AgentIntentPatch, "patchFingerprint"> = {
		kind: AGENT_INTENT_PATCH_KIND,
		schemaVersion: AGENT_INTENT_PATCH_SCHEMA_VERSION,
		patchId: expectedPatchId({
			proposalId,
			sourceFingerprintValue: fingerprint,
		}),
		domain: run.role,
		operation: operationForRole(run.role),
		targetReference,
		instruction: action.description,
		evidence,
		source,
		constraints: PATCH_CONSTRAINTS,
	};
	return {
		proposalId,
		role: run.role,
		title: action.title,
		description: action.description,
		targetReference,
		evidence,
		source,
		availability,
		blockers,
		review: {
			status: blockers.length === 0 ? "pending" : "unavailable",
			decidedAt: null,
			decidedBy: null,
			note: null,
		},
		patch: {
			...patchWithoutFingerprint,
			evidence: evidence.map((item) => ({ ...item })),
			source: { ...source },
			constraints: { ...PATCH_CONSTRAINTS },
			patchFingerprint: patchFingerprint(patchWithoutFingerprint),
		},
		activation: {
			status: "inactive",
			receiptId: null,
			activatedAt: null,
			activatedBy: null,
			undoneAt: null,
			undoneBy: null,
		},
	};
}

function proposalsForSession(
	session: AgentRuntimeSession,
): AgentOperationProposal[] {
	const candidates = session.runs.flatMap((run) =>
		isExecutableRole(run.role) && run.artifact !== null
			? run.artifact.actions
					.filter(
						(action) =>
							action.applicability === "eligible" &&
							action.kind === run.role &&
							session.merge.eligibleActionIds.includes(action.actionId),
					)
					.map((action) => ({ run, action }))
			: [],
	);
	const counts = new Map<string, number>();
	for (const { action } of candidates) {
		counts.set(action.actionId, (counts.get(action.actionId) ?? 0) + 1);
	}
	const duplicates = new Set(
		[...counts].filter(([, count]) => count > 1).map(([actionId]) => actionId),
	);
	return candidates
		.map(({ run, action }) =>
			buildProposal({
				session,
				run,
				action,
				duplicateActionIds: duplicates,
			}),
		)
		.sort(
			(left, right) =>
				AGENT_EXECUTABLE_INTENT_ROLES.indexOf(left.role) -
					AGENT_EXECUTABLE_INTENT_ROLES.indexOf(right.role) ||
				left.proposalId.localeCompare(right.proposalId),
		);
}

function createEvent({
	ledgerId,
	revision,
	type,
	at,
	proposalId,
	actor,
	note,
	patchId,
}: Omit<AgentOperationReviewEvent, "eventId"> & {
	ledgerId: string;
}): AgentOperationReviewEvent {
	return {
		eventId: `${ledgerId}/event/${revision}`,
		revision,
		type,
		at,
		proposalId,
		actor,
		note,
		patchId,
	};
}

export function createAgentOperationReviewLedger({
	session,
	createdAt,
}: {
	session: AgentRuntimeSession;
	createdAt: string;
}): AgentOperationReviewLedger {
	const parsed = parseAgentRuntimeSession({ value: session });
	if (parsed === null) {
		throw new AgentOperationReviewError("Runtime session is invalid.");
	}
	if (parsed.status === "queued" || parsed.status === "running") {
		throw new AgentOperationReviewError(
			"Operation review requires a completed runtime session.",
		);
	}
	const at = normalizeTimestamp({
		value: createdAt,
		label: "Ledger creation time",
	});
	const ledgerId = agentOperationLedgerIdForSession({ session: parsed });
	const ledger: AgentOperationReviewLedger = {
		kind: AGENT_OPERATION_REVIEW_LEDGER_KIND,
		schemaVersion: AGENT_OPERATION_REVIEW_LEDGER_SCHEMA_VERSION,
		ledgerId,
		projectId: parsed.projectId,
		sessionId: parsed.sessionId,
		mergeFingerprint: parsed.merge.fingerprint,
		sourceRuntimeRevision: parsed.revision,
		revision: 1,
		proposals: proposalsForSession(parsed),
		events: [
			createEvent({
				ledgerId,
				revision: 1,
				type: "ledger-created",
				at,
				proposalId: null,
				actor: null,
				note: null,
				patchId: null,
			}),
		],
		createdAt: at,
		updatedAt: at,
		guarantees: GUARANTEES,
	};
	assertAgentOperationReviewLedgerIntegrity(ledger);
	return deepFreeze(ledger);
}

function proposalIndex({
	ledger,
	proposalId,
}: {
	ledger: AgentOperationReviewLedger;
	proposalId: string;
}): number {
	const index = ledger.proposals.findIndex(
		(proposal) => proposal.proposalId === proposalId,
	);
	if (index < 0) {
		throw new AgentOperationReviewError(`Unknown proposal ${proposalId}.`);
	}
	return index;
}

function nextLedger({
	ledger,
	proposal,
	type,
	at,
	actor,
	note,
}: {
	ledger: AgentOperationReviewLedger;
	proposal: AgentOperationProposal;
	type: Exclude<AgentOperationReviewEventType, "ledger-created">;
	at: string;
	actor: string;
	note: string | null;
}): AgentOperationReviewLedger {
	const eventAt = normalizeTimestamp({
		value: at,
		label: "Review event time",
	});
	if (Date.parse(eventAt) < Date.parse(ledger.updatedAt)) {
		throw new AgentOperationReviewError(
			"Review event time cannot precede the audit ledger.",
		);
	}
	const revision = ledger.revision + 1;
	const index = proposalIndex({ ledger, proposalId: proposal.proposalId });
	const proposals = [...ledger.proposals];
	proposals[index] = proposal;
	const next: AgentOperationReviewLedger = {
		...ledger,
		revision,
		proposals,
		events: [
			...ledger.events,
			createEvent({
				ledgerId: ledger.ledgerId,
				revision,
				type,
				at: eventAt,
				proposalId: proposal.proposalId,
				actor,
				note,
				patchId:
					type === "patch-activated" || type === "patch-undone"
						? proposal.patch.patchId
						: null,
			}),
		],
		updatedAt: eventAt,
	};
	assertAgentOperationReviewLedgerIntegrity(next);
	return deepFreeze(next);
}

function requireFresh({
	ledger,
	session,
}: {
	ledger: AgentOperationReviewLedger;
	session: AgentRuntimeSession;
}): void {
	const staleness = inspectAgentOperationReviewStaleness({ ledger, session });
	if (staleness.stale) {
		throw new AgentOperationReviewError(
			`Operation review is stale: ${staleness.reasons.join(", ")}.`,
		);
	}
}

export function approveAgentOperationProposal({
	ledger,
	session,
	proposalId,
	approvedBy,
	at,
	note = null,
}: {
	ledger: AgentOperationReviewLedger;
	session: AgentRuntimeSession;
	proposalId: string;
	approvedBy: string;
	at: string;
	note?: string | null;
}): AgentOperationReviewLedger {
	assertAgentOperationReviewLedgerIntegrity(ledger);
	requireFresh({ ledger, session });
	const proposal = ledger.proposals[proposalIndex({ ledger, proposalId })];
	if (
		proposal.availability !== "ready" ||
		proposal.review.status !== "pending"
	) {
		throw new AgentOperationReviewError(
			"Only a ready, pending proposal can be approved.",
		);
	}
	const actor = normalizeIdentifier({
		value: approvedBy,
		label: "Approval actor",
	});
	const decisionAt = normalizeTimestamp({
		value: at,
		label: "Approval time",
	});
	const normalizedNote =
		note === null
			? null
			: normalizeText({
					value: note,
					label: "Approval note",
					maxLength: 800,
					required: false,
				}) || null;
	return nextLedger({
		ledger,
		proposal: {
			...proposal,
			review: {
				status: "approved",
				decidedAt: decisionAt,
				decidedBy: actor,
				note: normalizedNote,
			},
		},
		type: "proposal-approved",
		at: decisionAt,
		actor,
		note: normalizedNote,
	});
}

export function rejectAgentOperationProposal({
	ledger,
	session,
	proposalId,
	rejectedBy,
	at,
	note,
}: {
	ledger: AgentOperationReviewLedger;
	session: AgentRuntimeSession;
	proposalId: string;
	rejectedBy: string;
	at: string;
	note: string;
}): AgentOperationReviewLedger {
	assertAgentOperationReviewLedgerIntegrity(ledger);
	requireFresh({ ledger, session });
	const proposal = ledger.proposals[proposalIndex({ ledger, proposalId })];
	if (
		proposal.availability !== "ready" ||
		proposal.review.status !== "pending"
	) {
		throw new AgentOperationReviewError(
			"Only a ready, pending proposal can be rejected.",
		);
	}
	const actor = normalizeIdentifier({
		value: rejectedBy,
		label: "Rejection actor",
	});
	const decisionAt = normalizeTimestamp({
		value: at,
		label: "Rejection time",
	});
	const normalizedNote = normalizeText({
		value: note,
		label: "Rejection note",
		maxLength: 800,
	});
	return nextLedger({
		ledger,
		proposal: {
			...proposal,
			review: {
				status: "rejected",
				decidedAt: decisionAt,
				decidedBy: actor,
				note: normalizedNote,
			},
		},
		type: "proposal-rejected",
		at: decisionAt,
		actor,
		note: normalizedNote,
	});
}

export function activateAgentIntentPatch({
	ledger,
	session,
	proposalId,
	activatedBy,
	at,
}: {
	ledger: AgentOperationReviewLedger;
	session: AgentRuntimeSession;
	proposalId: string;
	activatedBy: string;
	at: string;
}): AgentOperationReviewLedger {
	assertAgentOperationReviewLedgerIntegrity(ledger);
	requireFresh({ ledger, session });
	const proposal = ledger.proposals[proposalIndex({ ledger, proposalId })];
	if (
		proposal.availability !== "ready" ||
		proposal.review.status !== "approved" ||
		proposal.activation.status !== "inactive"
	) {
		throw new AgentOperationReviewError(
			"The proposal must be approved and inactive before activation.",
		);
	}
	const actor = normalizeIdentifier({
		value: activatedBy,
		label: "Activation actor",
	});
	const activatedAt = normalizeTimestamp({
		value: at,
		label: "Activation time",
	});
	const receiptId = expectedActivationReceiptId({
		ledgerId: ledger.ledgerId,
		proposalId,
		patchFingerprintValue: proposal.patch.patchFingerprint,
		activatedAt,
		actor,
	});
	return nextLedger({
		ledger,
		proposal: {
			...proposal,
			activation: {
				status: "active",
				receiptId,
				activatedAt,
				activatedBy: actor,
				undoneAt: null,
				undoneBy: null,
			},
		},
		type: "patch-activated",
		at: activatedAt,
		actor,
		note: null,
	});
}

export function undoAgentIntentPatch({
	ledger,
	session,
	proposalId,
	activationReceiptId,
	undoneBy,
	at,
}: {
	ledger: AgentOperationReviewLedger;
	session: AgentRuntimeSession;
	proposalId: string;
	activationReceiptId: string;
	undoneBy: string;
	at: string;
}): AgentOperationReviewLedger {
	assertAgentOperationReviewLedgerIntegrity(ledger);
	requireFresh({ ledger, session });
	const proposal = ledger.proposals[proposalIndex({ ledger, proposalId })];
	if (
		proposal.activation.status !== "active" ||
		proposal.activation.receiptId !== activationReceiptId
	) {
		throw new AgentOperationReviewError(
			"The active intent patch receipt no longer matches.",
		);
	}
	const actor = normalizeIdentifier({ value: undoneBy, label: "Undo actor" });
	const undoneAt = normalizeTimestamp({ value: at, label: "Undo time" });
	return nextLedger({
		ledger,
		proposal: {
			...proposal,
			activation: {
				...proposal.activation,
				status: "undone",
				undoneAt,
				undoneBy: actor,
			},
		},
		type: "patch-undone",
		at: undoneAt,
		actor,
		note: null,
	});
}

export function inspectAgentOperationReviewStaleness({
	ledger,
	session,
}: {
	ledger: AgentOperationReviewLedger;
	session: AgentRuntimeSession;
}): AgentOperationReviewStaleness {
	assertAgentOperationReviewLedgerIntegrity(ledger);
	const parsed = parseAgentRuntimeSession({ value: session });
	if (parsed === null) {
		return deepFreeze({ stale: true, reasons: ["session-changed"] });
	}
	const reasons: AgentOperationReviewStaleReason[] = [];
	if (
		parsed.projectId !== ledger.projectId ||
		parsed.sessionId !== ledger.sessionId ||
		parsed.revision !== ledger.sourceRuntimeRevision
	) {
		reasons.push("session-changed");
	}
	if (parsed.merge.fingerprint !== ledger.mergeFingerprint) {
		reasons.push("merge-changed");
	}
	if (reasons.length === 0) {
		const current = proposalsForSession(parsed);
		const sourceSnapshot = (proposal: AgentOperationProposal) => ({
			proposalId: proposal.proposalId,
			sourceFingerprint: proposal.source.sourceFingerprint,
			availability: proposal.availability,
			blockers: proposal.blockers,
			patchFingerprint: proposal.patch.patchFingerprint,
		});
		if (
			stableJson(current.map(sourceSnapshot)) !==
			stableJson(ledger.proposals.map(sourceSnapshot))
		) {
			reasons.push("proposal-source-changed");
		}
	}
	return deepFreeze({ stale: reasons.length > 0, reasons });
}

export function getActiveAgentIntentPatches({
	ledger,
	session,
}: {
	ledger: AgentOperationReviewLedger;
	session: AgentRuntimeSession;
}): readonly AgentIntentPatch[] {
	requireFresh({ ledger, session });
	return deepFreeze(
		ledger.proposals
			.filter((proposal) => proposal.activation.status === "active")
			.map((proposal) => proposal.patch),
	);
}

function expectedSourceFingerprint(
	proposal: AgentOperationProposal,
): Sha256Fingerprint {
	return fingerprintJson({
		sessionId: proposal.source.sessionId,
		runId: proposal.source.runId,
		artifactId: proposal.source.artifactId,
		artifactDigest: proposal.source.artifactDigest,
		actionId: proposal.source.actionId,
		role: proposal.role,
		title: proposal.title,
		description: proposal.description,
		targetReference: proposal.targetReference,
		evidence: proposal.evidence,
		mergeFingerprint: proposal.source.mergeFingerprint,
		availability: proposal.availability,
		blockers: proposal.blockers,
	});
}

export function assertAgentOperationReviewLedgerIntegrity(
	ledger: AgentOperationReviewLedger,
): void {
	assertAgentAuditSafe({ value: ledger });
	if (
		ledger.kind !== AGENT_OPERATION_REVIEW_LEDGER_KIND ||
		ledger.schemaVersion !== AGENT_OPERATION_REVIEW_LEDGER_SCHEMA_VERSION
	) {
		throw new AgentOperationReviewError("Unsupported operation review ledger.");
	}
	normalizeIdentifier({ value: ledger.ledgerId, label: "Ledger id" });
	normalizeIdentifier({ value: ledger.projectId, label: "Project id" });
	normalizeIdentifier({ value: ledger.sessionId, label: "Session id" });
	if (
		ledger.ledgerId !==
		expectedLedgerId({
			projectId: ledger.projectId,
			sessionId: ledger.sessionId,
			mergeFingerprint: ledger.mergeFingerprint,
			sourceRuntimeRevision: ledger.sourceRuntimeRevision,
		})
	) {
		throw new AgentOperationReviewError(
			"Ledger identity is not deterministic.",
		);
	}
	if (
		!Number.isSafeInteger(ledger.revision) ||
		ledger.revision < 1 ||
		ledger.events.length !== ledger.revision ||
		!Number.isSafeInteger(ledger.sourceRuntimeRevision) ||
		ledger.sourceRuntimeRevision < 1
	) {
		throw new AgentOperationReviewError("Ledger revision is invalid.");
	}
	const createdAt = normalizeTimestamp({
		value: ledger.createdAt,
		label: "Ledger creation time",
	});
	normalizeTimestamp({
		value: ledger.updatedAt,
		label: "Ledger update time",
	});
	let previousAt = createdAt;
	for (const [index, event] of ledger.events.entries()) {
		if (
			event.revision !== index + 1 ||
			event.eventId !== `${ledger.ledgerId}/event/${index + 1}` ||
			!REVIEW_EVENT_TYPES.has(event.type)
		) {
			throw new AgentOperationReviewError("Ledger event sequence is invalid.");
		}
		const at = normalizeTimestamp({
			value: event.at,
			label: "Ledger event time",
		});
		if (event.type === "ledger-created") {
			if (
				event.proposalId !== null ||
				event.actor !== null ||
				event.note !== null ||
				event.patchId !== null
			) {
				throw new AgentOperationReviewError(
					"Ledger creation event cannot contain a decision.",
				);
			}
		} else {
			if (event.actor === null) {
				throw new AgentOperationReviewError(
					"Review event must identify an actor.",
				);
			}
			normalizeIdentifier({
				value: event.actor,
				label: "Review event actor",
			});
			if (event.type === "proposal-rejected" && event.note === null) {
				throw new AgentOperationReviewError(
					"Proposal rejection must contain a reason.",
				);
			}
			if (event.note !== null) {
				normalizeText({
					value: event.note,
					label: "Review event note",
					maxLength: 800,
				});
			}
			const patchEvent =
				event.type === "patch-activated" || event.type === "patch-undone";
			if (patchEvent !== (event.patchId !== null)) {
				throw new AgentOperationReviewError(
					"Review event patch reference is invalid.",
				);
			}
			if (patchEvent && event.note !== null) {
				throw new AgentOperationReviewError(
					"Patch lifecycle events cannot contain a decision note.",
				);
			}
		}
		if (Date.parse(at) < Date.parse(previousAt)) {
			throw new AgentOperationReviewError("Ledger event time moved backwards.");
		}
		previousAt = at;
	}
	if (
		ledger.events[0]?.type !== "ledger-created" ||
		ledger.events[0]?.at !== ledger.createdAt ||
		ledger.events.at(-1)?.at !== ledger.updatedAt ||
		stableJson(ledger.guarantees) !== stableJson(GUARANTEES)
	) {
		throw new AgentOperationReviewError("Ledger boundaries are invalid.");
	}
	const proposalIds = new Set<string>();
	for (const proposal of ledger.proposals) {
		if (proposalIds.has(proposal.proposalId)) {
			throw new AgentOperationReviewError("Proposal ids must be unique.");
		}
		proposalIds.add(proposal.proposalId);
		normalizeIdentifier({
			value: proposal.proposalId,
			label: "Proposal id",
		});
		normalizeText({
			value: proposal.title,
			label: "Proposal title",
			maxLength: 240,
		});
		normalizeText({
			value: proposal.description,
			label: "Proposal description",
			maxLength: 1_600,
		});
		normalizeText({
			value: proposal.targetReference,
			label: "Proposal target",
			maxLength: 300,
		});
		if (
			!isExecutableRole(proposal.role) ||
			proposal.source.sessionId !== ledger.sessionId ||
			proposal.source.mergeFingerprint !== ledger.mergeFingerprint ||
			proposal.source.sourceFingerprint !==
				expectedSourceFingerprint(proposal) ||
			proposal.proposalId !==
				expectedProposalId(proposal.source.sourceFingerprint)
		) {
			throw new AgentOperationReviewError(
				"Proposal source binding is invalid.",
			);
		}
		if (
			proposal.evidence.length === 0 ||
			new Set(proposal.evidence.map((item) => item.evidenceId)).size !==
				proposal.evidence.length
		) {
			throw new AgentOperationReviewError(
				"Every operation proposal needs unique evidence bindings.",
			);
		}
		for (const evidence of proposal.evidence) {
			normalizeIdentifier({
				value: evidence.evidenceId,
				label: "Proposal evidence id",
			});
			normalizeIdentifier({
				value: evidence.referenceId,
				label: "Proposal evidence reference",
			});
		}
		const patchWithoutFingerprint = {
			kind: proposal.patch.kind,
			schemaVersion: proposal.patch.schemaVersion,
			patchId: proposal.patch.patchId,
			domain: proposal.patch.domain,
			operation: proposal.patch.operation,
			targetReference: proposal.patch.targetReference,
			instruction: proposal.patch.instruction,
			evidence: proposal.patch.evidence,
			source: proposal.patch.source,
			constraints: proposal.patch.constraints,
		};
		if (
			proposal.patch.kind !== AGENT_INTENT_PATCH_KIND ||
			proposal.patch.schemaVersion !== AGENT_INTENT_PATCH_SCHEMA_VERSION ||
			proposal.patch.domain !== proposal.role ||
			proposal.patch.operation !== operationForRole(proposal.role) ||
			proposal.patch.patchId !==
				expectedPatchId({
					proposalId: proposal.proposalId,
					sourceFingerprintValue: proposal.source.sourceFingerprint,
				}) ||
			proposal.patch.targetReference !== proposal.targetReference ||
			proposal.patch.instruction !== proposal.description ||
			stableJson(proposal.patch.evidence) !== stableJson(proposal.evidence) ||
			stableJson(proposal.patch.source) !== stableJson(proposal.source) ||
			stableJson(proposal.patch.constraints) !==
				stableJson(PATCH_CONSTRAINTS) ||
			proposal.patch.patchFingerprint !==
				patchFingerprint(patchWithoutFingerprint)
		) {
			throw new AgentOperationReviewError("Intent patch integrity is invalid.");
		}
		if (
			(proposal.availability === "ready" && proposal.blockers.length > 0) ||
			(proposal.availability === "conflicted" &&
				proposal.blockers.length === 0) ||
			(proposal.availability === "conflicted" &&
				proposal.review.status !== "unavailable")
		) {
			throw new AgentOperationReviewError("Proposal availability is invalid.");
		}
		const events = ledger.events.filter(
			(event) => event.proposalId === proposal.proposalId,
		);
		const approvals = events.filter(
			(event) => event.type === "proposal-approved",
		);
		const rejections = events.filter(
			(event) => event.type === "proposal-rejected",
		);
		const activations = events.filter(
			(event) => event.type === "patch-activated",
		);
		const undos = events.filter((event) => event.type === "patch-undone");
		if (
			proposal.review.status === "pending" ||
			proposal.review.status === "unavailable"
		) {
			if (
				proposal.review.decidedAt !== null ||
				proposal.review.decidedBy !== null ||
				proposal.review.note !== null ||
				approvals.length + rejections.length !== 0
			) {
				throw new AgentOperationReviewError(
					"Undecided proposal has a decision.",
				);
			}
		} else {
			const expectedEvent =
				proposal.review.status === "approved" ? approvals[0] : rejections[0];
			if (
				approvals.length + rejections.length !== 1 ||
				expectedEvent === undefined ||
				proposal.review.decidedAt !== expectedEvent.at ||
				proposal.review.decidedBy !== expectedEvent.actor ||
				proposal.review.note !== expectedEvent.note ||
				(proposal.review.status === "rejected" && !proposal.review.note)
			) {
				throw new AgentOperationReviewError(
					"Proposal decision audit is invalid.",
				);
			}
		}
		if (proposal.activation.status === "inactive") {
			if (
				proposal.activation.receiptId !== null ||
				proposal.activation.activatedAt !== null ||
				proposal.activation.activatedBy !== null ||
				proposal.activation.undoneAt !== null ||
				proposal.activation.undoneBy !== null ||
				activations.length + undos.length !== 0
			) {
				throw new AgentOperationReviewError(
					"Inactive patch has activation data.",
				);
			}
		} else {
			if (
				proposal.review.status !== "approved" ||
				activations.length !== 1 ||
				proposal.activation.receiptId === null ||
				proposal.activation.activatedAt !== activations[0]?.at ||
				proposal.activation.activatedBy !== activations[0]?.actor ||
				activations[0]?.patchId !== proposal.patch.patchId ||
				proposal.activation.receiptId !==
					expectedActivationReceiptId({
						ledgerId: ledger.ledgerId,
						proposalId: proposal.proposalId,
						patchFingerprintValue: proposal.patch.patchFingerprint,
						activatedAt: proposal.activation.activatedAt ?? "",
						actor: proposal.activation.activatedBy ?? "",
					})
			) {
				throw new AgentOperationReviewError(
					"Patch activation audit is invalid.",
				);
			}
			if (proposal.activation.status === "active" && undos.length !== 0) {
				throw new AgentOperationReviewError("Active patch has an undo event.");
			}
			if (
				proposal.activation.status === "undone" &&
				(undos.length !== 1 ||
					proposal.activation.undoneAt !== undos[0]?.at ||
					proposal.activation.undoneBy !== undos[0]?.actor ||
					undos[0]?.patchId !== proposal.patch.patchId)
			) {
				throw new AgentOperationReviewError("Patch undo audit is invalid.");
			}
		}
	}
	for (const event of ledger.events.slice(1)) {
		if (event.proposalId === null || !proposalIds.has(event.proposalId)) {
			throw new AgentOperationReviewError(
				"Review event references no proposal.",
			);
		}
	}
}

export function parseAgentOperationReviewLedger({
	value,
}: {
	value: unknown;
}): AgentOperationReviewLedger | null {
	try {
		if (!isAgentOperationReviewLedgerCandidate(value)) return null;
		const cloned = structuredClone(value);
		assertAgentOperationReviewLedgerIntegrity(cloned);
		return deepFreeze(cloned);
	} catch {
		return null;
	}
}

function isAgentOperationReviewLedgerCandidate(
	value: unknown,
): value is AgentOperationReviewLedger {
	return (
		isRecord(value) &&
		value.kind === AGENT_OPERATION_REVIEW_LEDGER_KIND &&
		value.schemaVersion === AGENT_OPERATION_REVIEW_LEDGER_SCHEMA_VERSION &&
		typeof value.ledgerId === "string" &&
		typeof value.projectId === "string" &&
		typeof value.sessionId === "string" &&
		typeof value.mergeFingerprint === "string" &&
		Number.isSafeInteger(value.sourceRuntimeRevision) &&
		Number.isSafeInteger(value.revision) &&
		Array.isArray(value.proposals) &&
		value.proposals.every(isRecord) &&
		Array.isArray(value.events) &&
		value.events.every(isRecord) &&
		typeof value.createdAt === "string" &&
		typeof value.updatedAt === "string" &&
		isRecord(value.guarantees)
	);
}
