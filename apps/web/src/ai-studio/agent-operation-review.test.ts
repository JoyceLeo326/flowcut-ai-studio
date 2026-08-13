import { describe, expect, test } from "bun:test";

import {
	approveAgentTask,
	createAgentOrchestration,
	getAgentTaskByRole,
	type AgentEvidenceInput,
	type AgentOrchestration,
} from "./agent-orchestrator";
import {
	activateAgentIntentPatch,
	approveAgentOperationProposal,
	assertAgentOperationReviewLedgerIntegrity,
	createAgentOperationReviewLedger,
	getActiveAgentIntentPatches,
	inspectAgentOperationReviewStaleness,
	parseAgentOperationReviewLedger,
	rejectAgentOperationProposal,
	undoAgentIntentPatch,
	type AgentOperationReviewLedger,
} from "./agent-operation-review";
import {
	AgentOperationReviewStorageConflictError,
	loadAgentOperationReviewLedger,
	MemoryAgentOperationReviewStorage,
	saveAgentOperationReviewLedger,
} from "./agent-operation-review-store";
import {
	createAgentRuntimeSession,
	executeAgentRuntimeSession,
	type AgentModelInvoker,
	type AgentRuntimeRole,
	type AgentRuntimeSession,
} from "./agent-runtime";
import { createIntentSpec } from "./intent-spec";

const CREATED_AT = "2026-08-13T01:00:00.000Z";

const EVIDENCE: readonly AgentEvidenceInput[] = [
	{
		evidenceId: "asset-main",
		kind: "asset-metadata",
		label: "Interview asset metadata",
		referenceId: "asset:main",
		origin: "project-metadata",
	},
	{
		evidenceId: "visual-main",
		kind: "visual-analysis",
		label: "Imported visual sample analysis",
		referenceId: "analysis:visual-main:v1",
		origin: "imported-result",
	},
	{
		evidenceId: "audio-main",
		kind: "audio-analysis",
		label: "Imported audio energy and loudness analysis",
		referenceId: "analysis:audio-main:v1",
		origin: "imported-result",
	},
];

function actionResponse(role: AgentRuntimeRole): string {
	const details = {
		director: ["direction", "intent-main", "project:brief"],
		story: ["story", "intent-main", "story:opening"],
		camera: ["camera", "visual-main", "camera:opening"],
		editor: ["edit", "visual-main", "edit:opening"],
		color: ["color", "visual-main", "color:opening"],
		sound: ["sound", "audio-main", "timeline:dialogue"],
		growth: ["growth", "intent-target-r1", "delivery:youtube"],
	} as const;
	const [kind, evidenceId, targetReference] = details[role];
	return JSON.stringify({
		summary: `${role} evidence-bound proposal`,
		findings: [],
		actions: [
			{
				actionId: `${role}-action`,
				kind,
				title: `${role} direction`,
				description: `Use the cited ${role} direction for downstream review.`,
				targetReference,
				evidenceIds: [evidenceId],
				applicable: true,
			},
		],
		conflicts: [],
	});
}

function createApprovedGraph({
	roles,
	evidence = EVIDENCE,
}: {
	roles: readonly AgentRuntimeRole[];
	evidence?: readonly AgentEvidenceInput[];
}): AgentOrchestration {
	const intent = createIntentSpec({
		projectId: "project-operation-review",
		userIntent: "把采访整理成克制清晰的品牌短片",
		target: {
			platform: "YouTube",
			aspectRatio: "16:9",
			durationSeconds: 90,
			style: "restrained documentary",
		},
		source: "home",
		createdAt: CREATED_AT,
	});
	let graph = createAgentOrchestration({
		intentSpec: intent,
		evidence,
		createdAt: CREATED_AT,
	});
	const required = new Set<AgentRuntimeRole>();
	const include = (role: AgentRuntimeRole) => {
		if (required.has(role)) return;
		const task = getAgentTaskByRole({ orchestration: graph, role });
		for (const dependencyId of task.dependencyTaskIds) {
			const dependency = graph.tasks.find(
				(candidate) => candidate.taskId === dependencyId,
			);
			if (dependency !== undefined) include(dependency.role);
		}
		required.add(role);
	};
	for (const role of roles) include(role);
	for (const [index, task] of graph.tasks
		.filter((candidate) => required.has(candidate.role))
		.entries()) {
		graph = approveAgentTask({
			orchestration: graph,
			taskId: task.taskId,
			approvedBy: "operation-review-test",
			at: new Date(Date.parse(CREATED_AT) + index + 1).toISOString(),
		});
	}
	return graph;
}

async function completeSession({
	roles = ["color", "sound", "growth"],
	evidence = EVIDENCE,
	invoker,
	nonce = "operation-review",
}: {
	roles?: readonly AgentRuntimeRole[];
	evidence?: readonly AgentEvidenceInput[];
	invoker?: AgentModelInvoker;
	nonce?: string;
} = {}): Promise<AgentRuntimeSession> {
	const graph = createApprovedGraph({ roles, evidence });
	const session = createAgentRuntimeSession({
		orchestration: graph,
		roles,
		createdAt: "2026-08-13T01:01:00.000Z",
		sessionNonce: nonce,
	});
	return executeAgentRuntimeSession({
		session,
		orchestration: graph,
		model: {
			provider: "openai",
			model: "review-test",
			invoke:
				invoker ??
				(async (request) => ({
					ok: true,
					text: actionResponse(request.role),
				})),
		},
	});
}

function nextAt({
	ledger,
	offset = 1,
}: {
	ledger: AgentOperationReviewLedger;
	offset?: number;
}): string {
	return new Date(Date.parse(ledger.updatedAt) + offset).toISOString();
}

describe("VisionCut executable agent operation review", () => {
	test("creates evidence-bound Color, Sound, and Growth intent proposals", async () => {
		const session = await completeSession();
		const ledger = createAgentOperationReviewLedger({
			session,
			createdAt: "2026-08-13T01:02:00.000Z",
		});

		expect(ledger.proposals.map((proposal) => proposal.role)).toEqual([
			"color",
			"sound",
			"growth",
		]);
		expect(
			ledger.proposals.every((proposal) => proposal.availability === "ready"),
		).toBe(true);
		expect(
			ledger.proposals.every(
				(proposal) => proposal.review.status === "pending",
			),
		).toBe(true);
		expect(
			ledger.proposals.every(
				(proposal) => proposal.patch.constraints.mediaMutation === false,
			),
		).toBe(true);
		expect(
			ledger.proposals.every(
				(proposal) => proposal.patch.constraints.externalSideEffect === false,
			),
		).toBe(true);
		expect(
			ledger.proposals.find((proposal) => proposal.role === "color")?.patch
				.operation,
		).toBe("set-color-direction");
		expect(
			ledger.proposals.find((proposal) => proposal.role === "sound")?.patch
				.operation,
		).toBe("set-sound-direction");
		expect(
			ledger.proposals.find((proposal) => proposal.role === "growth")?.patch
				.operation,
		).toBe("set-distribution-direction");
		expect(Object.isFrozen(ledger)).toBe(true);
		expect(Object.isFrozen(ledger.proposals[0]?.patch)).toBe(true);
		assertAgentOperationReviewLedgerIntegrity(ledger);
	});

	test("requires approval before activation and supports receipt-bound undo", async () => {
		const session = await completeSession({ roles: ["color"] });
		let ledger = createAgentOperationReviewLedger({
			session,
			createdAt: "2026-08-13T01:02:00.000Z",
		});
		const proposal = ledger.proposals[0];
		expect(proposal).toBeDefined();

		expect(() =>
			activateAgentIntentPatch({
				ledger,
				session,
				proposalId: proposal!.proposalId,
				activatedBy: "local-user",
				at: nextAt({ ledger }),
			}),
		).toThrow("must be approved");

		ledger = approveAgentOperationProposal({
			ledger,
			session,
			proposalId: proposal!.proposalId,
			approvedBy: "local-user",
			at: nextAt({ ledger }),
			note: "Visual evidence matches the requested restrained treatment.",
		});
		ledger = activateAgentIntentPatch({
			ledger,
			session,
			proposalId: proposal!.proposalId,
			activatedBy: "local-user",
			at: nextAt({ ledger }),
		});
		const active = getActiveAgentIntentPatches({ ledger, session });
		expect(active).toHaveLength(1);
		expect(active[0]?.domain).toBe("color");
		expect(active[0]?.constraints.mediaMutation).toBe(false);
		const receipt = ledger.proposals[0]?.activation.receiptId;
		expect(receipt).toMatch(/^intent-activation-/u);

		expect(() =>
			undoAgentIntentPatch({
				ledger,
				session,
				proposalId: proposal!.proposalId,
				activationReceiptId: "intent-activation-wrong",
				undoneBy: "local-user",
				at: nextAt({ ledger }),
			}),
		).toThrow("receipt no longer matches");
		ledger = undoAgentIntentPatch({
			ledger,
			session,
			proposalId: proposal!.proposalId,
			activationReceiptId: receipt!,
			undoneBy: "local-user",
			at: nextAt({ ledger }),
		});
		expect(getActiveAgentIntentPatches({ ledger, session })).toEqual([]);
		expect(ledger.events.map((event) => event.type)).toEqual([
			"ledger-created",
			"proposal-approved",
			"patch-activated",
			"patch-undone",
		]);
	});

	test("keeps rejected proposals inactive with a reason in the audit trail", async () => {
		const session = await completeSession({ roles: ["sound"] });
		const initial = createAgentOperationReviewLedger({
			session,
			createdAt: "2026-08-13T01:02:00.000Z",
		});
		const rejected = rejectAgentOperationProposal({
			ledger: initial,
			session,
			proposalId: initial.proposals[0]!.proposalId,
			rejectedBy: "local-user",
			at: nextAt({ ledger: initial }),
			note: "Dialogue needs a fresh loudness measurement.",
		});

		expect(rejected.proposals[0]?.review.status).toBe("rejected");
		expect(rejected.proposals[0]?.activation.status).toBe("inactive");
		expect(rejected.events.at(-1)?.note).toBe(
			"Dialogue needs a fresh loudness measurement.",
		);
		expect(() =>
			activateAgentIntentPatch({
				ledger: rejected,
				session,
				proposalId: rejected.proposals[0]!.proposalId,
				activatedBy: "local-user",
				at: nextAt({ ledger: rejected }),
			}),
		).toThrow("must be approved");
	});

	test("does not expose weak or mismatched role actions as proposals", async () => {
		const session = await completeSession({
			roles: ["color", "sound", "growth"],
			invoker: async (request) => ({
				ok: true,
				text: JSON.stringify({
					summary: "Weak proposal",
					findings: [],
					actions: [
						{
							actionId: `weak-${request.role}`,
							kind: request.role,
							title: "Unsupported direction",
							description: "Use metadata as if it were analysis.",
							targetReference: `project:${request.role}`,
							evidenceIds: ["asset-main"],
							applicable: true,
						},
					],
				}),
			}),
		});
		const ledger = createAgentOperationReviewLedger({
			session,
			createdAt: "2026-08-13T01:02:00.000Z",
		});

		expect(session.merge.eligibleActionIds).toEqual([]);
		expect(session.merge.blockedActionIds).toEqual([
			"weak-camera",
			"weak-color",
			"weak-editor",
			"weak-growth",
			"weak-sound",
		]);
		expect(ledger.proposals).toEqual([]);
	});

	test("marks conflicting eligible actions unavailable for approval", async () => {
		const session = await completeSession({
			roles: ["color", "sound"],
			invoker: async (request) => ({
				ok: true,
				text: JSON.stringify({
					summary: `${request.role} conflict`,
					findings: [],
					actions: [
						{
							actionId: `${request.role}-conflict`,
							kind: request.role,
							title: `${request.role} opening`,
							description: `Apply distinct ${request.role} treatment.`,
							targetReference: "timeline:opening",
							evidenceIds: [
								request.role === "color" ? "visual-main" : "audio-main",
							],
							applicable: true,
						},
					],
				}),
			}),
		});
		const ledger = createAgentOperationReviewLedger({
			session,
			createdAt: "2026-08-13T01:02:00.000Z",
		});

		expect(session.merge.conflicts).toHaveLength(1);
		expect(ledger.proposals).toHaveLength(2);
		expect(
			ledger.proposals.every(
				(proposal) =>
					proposal.availability === "conflicted" &&
					proposal.review.status === "unavailable" &&
					proposal.blockers.length > 0,
			),
		).toBe(true);
	});

	test("fails closed when the runtime snapshot changes", async () => {
		const first = await completeSession({ roles: ["growth"], nonce: "first" });
		const second = await completeSession({
			roles: ["growth"],
			nonce: "second",
		});
		const ledger = createAgentOperationReviewLedger({
			session: first,
			createdAt: "2026-08-13T01:02:00.000Z",
		});

		expect(
			inspectAgentOperationReviewStaleness({ ledger, session: first }),
		).toEqual({ stale: false, reasons: [] });
		expect(
			inspectAgentOperationReviewStaleness({ ledger, session: second }),
		).toEqual({ stale: true, reasons: ["session-changed", "merge-changed"] });
		expect(() =>
			approveAgentOperationProposal({
				ledger,
				session: second,
				proposalId: ledger.proposals[0]!.proposalId,
				approvedBy: "local-user",
				at: nextAt({ ledger }),
			}),
		).toThrow("Operation review is stale");
	});

	test("rejects tampered patches and persists contiguous audit revisions", async () => {
		const session = await completeSession({ roles: ["growth"] });
		const storage = new MemoryAgentOperationReviewStorage();
		const initial = createAgentOperationReviewLedger({
			session,
			createdAt: "2026-08-13T01:02:00.000Z",
		});
		await saveAgentOperationReviewLedger({ ledger: initial, storage });
		const approved = approveAgentOperationProposal({
			ledger: initial,
			session,
			proposalId: initial.proposals[0]!.proposalId,
			approvedBy: "local-user",
			at: nextAt({ ledger: initial }),
		});
		await saveAgentOperationReviewLedger({ ledger: approved, storage });
		expect(await loadAgentOperationReviewLedger({ session, storage })).toEqual(
			approved,
		);

		const skipped = structuredClone(approved) as AgentOperationReviewLedger;
		Reflect.set(skipped, "revision", approved.revision + 2);
		await expect(
			saveAgentOperationReviewLedger({ ledger: skipped, storage }),
		).rejects.toThrow();

		const tampered = structuredClone(approved) as AgentOperationReviewLedger;
		Reflect.set(tampered.proposals[0]!.patch, "instruction", "Publish now.");
		expect(parseAgentOperationReviewLedger({ value: tampered })).toBeNull();
		expect(() => assertAgentOperationReviewLedgerIntegrity(tampered)).toThrow(
			"Intent patch integrity",
		);

		const conflicting = approveAgentOperationProposal({
			ledger: initial,
			session,
			proposalId: initial.proposals[0]!.proposalId,
			approvedBy: "another-local-user",
			at: nextAt({ ledger: initial }),
			note: "A different valid decision at the same revision.",
		});
		await expect(
			saveAgentOperationReviewLedger({ ledger: conflicting, storage }),
		).rejects.toBeInstanceOf(AgentOperationReviewStorageConflictError);
	});
});
