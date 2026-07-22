import { describe, expect, test } from "bun:test";
import { createIntentSpec } from "./intent-spec";
import {
	AGENT_ROLES,
	AgentOrchestratorInvariantError,
	AgentOrchestratorTransitionError,
	addAgentEvidence,
	approveAgentTask,
	assertAgentOrchestrationInvariants,
	completeAgentTask,
	createAgentOrchestration,
	deserializeAgentOrchestration,
	failAgentTask,
	getAgentTaskByRole,
	getReadyAgentTasks,
	parseAgentOrchestration,
	retryAgentTask,
	serializeAgentOrchestration,
	startAgentTask,
	type AgentOrchestration,
	type AgentRole,
} from "./agent-orchestrator";

const TIMES = {
	created: "2026-07-23T09:00:00.000Z",
	directorApproved: "2026-07-23T09:00:01.000Z",
	directorStarted: "2026-07-23T09:00:02.000Z",
	directorDone: "2026-07-23T09:00:03.000Z",
	storyApproved: "2026-07-23T09:00:04.000Z",
	storyStarted: "2026-07-23T09:00:05.000Z",
	storyDone: "2026-07-23T09:00:06.000Z",
	editorApproved: "2026-07-23T09:00:07.000Z",
	editorStarted: "2026-07-23T09:00:08.000Z",
	editorFailed: "2026-07-23T09:00:09.000Z",
	editorRetried: "2026-07-23T09:00:10.000Z",
	editorRestarted: "2026-07-23T09:00:11.000Z",
	editorDone: "2026-07-23T09:00:12.000Z",
	evidenceAdded: "2026-07-23T09:00:13.000Z",
} as const;

function createIntent({ withTarget = true }: { withTarget?: boolean } = {}) {
	return createIntentSpec({
		projectId: "project-agent-test",
		userIntent: "把访谈素材整理成克制、有叙事张力的三分钟品牌短片",
		...(withTarget
			? {
					target: {
						platform: "YouTube",
						aspectRatio: "16:9",
						durationSeconds: 180,
						style: "restrained documentary",
					},
				}
			: {}),
		source: "home",
		createdAt: TIMES.created,
	});
}

function createGraph({
	withTarget = true,
	withMediaEvidence = true,
	maxRetries = 2,
}: {
	withTarget?: boolean;
	withMediaEvidence?: boolean;
	maxRetries?: number;
} = {}): AgentOrchestration {
	return createAgentOrchestration({
		intentSpec: createIntent({ withTarget }),
		evidence: withMediaEvidence
			? [
					{
						evidenceId: "asset-main-metadata",
						kind: "asset-metadata",
						label: "Imported interview clip metadata",
						referenceId: "asset:interview-main",
						origin: "project-metadata",
					},
					{
						evidenceId: "transcript-main",
						kind: "transcript",
						label: "User imported transcript",
						referenceId: "transcript:interview-main:v1",
						origin: "imported-result",
					},
					{
						evidenceId: "audio-main-metadata",
						kind: "audio-metadata",
						label: "Audio stream metadata",
						referenceId: "asset:interview-main:audio",
						origin: "project-metadata",
					},
				]
			: [],
		createdAt: TIMES.created,
		maxRetries,
	});
}

function taskId({
	graph,
	role,
}: {
	graph: AgentOrchestration;
	role: AgentRole;
}): string {
	return getAgentTaskByRole({ orchestration: graph, role }).taskId;
}

function approveRole({
	graph,
	role,
	at,
}: {
	graph: AgentOrchestration;
	role: AgentRole;
	at: string;
}): AgentOrchestration {
	return approveAgentTask({
		orchestration: graph,
		taskId: taskId({ graph, role }),
		approvedBy: "local-user",
		at,
	});
}

function completeRole({
	graph,
	role,
	startedAt,
	completedAt,
}: {
	graph: AgentOrchestration;
	role: AgentRole;
	startedAt: string;
	completedAt: string;
}): AgentOrchestration {
	const task = getAgentTaskByRole({ orchestration: graph, role });
	const running = startAgentTask({
		orchestration: graph,
		taskId: task.taskId,
		at: startedAt,
	});
	return completeAgentTask({
		orchestration: running,
		taskId: task.taskId,
		at: completedAt,
		outputs: [
			{
				outputId: task.outputReferences[0].outputId,
				artifactReference: `indexeddb:agent-plans/${role}/v1`,
				origin: "local-rule-result",
			},
		],
	});
}

function reachStorySuccess(graph = createGraph()): AgentOrchestration {
	let current = approveRole({
		graph,
		role: "director",
		at: TIMES.directorApproved,
	});
	current = completeRole({
		graph: current,
		role: "director",
		startedAt: TIMES.directorStarted,
		completedAt: TIMES.directorDone,
	});
	current = approveRole({
		graph: current,
		role: "story",
		at: TIMES.storyApproved,
	});
	return completeRole({
		graph: current,
		role: "story",
		startedAt: TIMES.storyStarted,
		completedAt: TIMES.storyDone,
	});
}

describe("VisionCut local multi-agent orchestrator", () => {
	test("creates a deterministic, immutable, reviewable graph for all required roles", () => {
		const first = createGraph();
		const second = createGraph();

		expect(first).toEqual(second);
		expect(first.orchestrationId).toBe(second.orchestrationId);
		expect(first.tasks.map((task) => task.role)).toEqual(AGENT_ROLES);
		expect(first.tasks.every((task) => task.approvalGate.required)).toBe(true);
		expect(
			first.tasks.every(
				(task) =>
					task.dependencyTaskIds !== undefined &&
					task.inputEvidenceIds.length > 0 &&
					task.outputReferences.length === 1,
			),
		).toBe(true);
		expect(first.guarantees).toEqual({
			deterministicLocalRules: true,
			network: false,
			paidService: false,
			modelInvokedByOrchestrator: false,
			mediaAnalysisPerformedByOrchestrator: false,
			mediaMutationPerformedByOrchestrator: false,
			outputsArePlansUntilReferenced: true,
		});
		expect(Object.isFrozen(first)).toBe(true);
		expect(Object.isFrozen(first.tasks)).toBe(true);
		expect(Object.isFrozen(first.tasks[0].approvalGate)).toBe(true);
		expect(() =>
			assertAgentOrchestrationInvariants({ orchestration: first }),
		).not.toThrow();
	});

	test("runs the normal Director to Story to Editor path and unlocks parallel roles", () => {
		const initial = createGraph();
		const initialJson = JSON.stringify(initial);
		let graph = reachStorySuccess(initial);

		expect(
			getAgentTaskByRole({ orchestration: graph, role: "story" }).status,
		).toBe("succeeded");
		expect(
			getAgentTaskByRole({ orchestration: graph, role: "editor" }).status,
		).toBe("awaiting-approval");
		expect(
			getAgentTaskByRole({ orchestration: graph, role: "growth" }).status,
		).toBe("awaiting-approval");

		graph = approveRole({
			graph,
			role: "editor",
			at: TIMES.editorApproved,
		});
		graph = completeRole({
			graph,
			role: "editor",
			startedAt: TIMES.editorStarted,
			completedAt: TIMES.editorDone,
		});

		expect(
			getAgentTaskByRole({ orchestration: graph, role: "color" }).status,
		).toBe("awaiting-approval");
		expect(
			getAgentTaskByRole({ orchestration: graph, role: "sound" }).status,
		).toBe("awaiting-approval");
		for (const role of ["color", "sound", "growth"] as const) {
			graph = approveRole({ graph, role, at: TIMES.evidenceAdded });
			graph = completeRole({
				graph,
				role,
				startedAt: TIMES.evidenceAdded,
				completedAt: TIMES.evidenceAdded,
			});
		}
		expect(graph.tasks.every((task) => task.status === "succeeded")).toBe(true);
		expect(JSON.stringify(initial)).toBe(initialJson);
		expect(
			getAgentTaskByRole({ orchestration: graph, role: "editor" })
				.outputReferences[0],
		).toMatchObject({
			state: "available",
			kind: "edit-plan",
			origin: "local-rule-result",
		});
	});

	test("blocks dependencies until upstream tasks actually succeed", () => {
		let graph = createGraph();
		const story = getAgentTaskByRole({ orchestration: graph, role: "story" });
		expect(story.status).toBe("blocked");
		expect(story.blockers).toContainEqual(
			expect.objectContaining({ kind: "dependency" }),
		);
		expect(() =>
			startAgentTask({
				orchestration: graph,
				taskId: story.taskId,
				at: TIMES.storyStarted,
			}),
		).toThrow(AgentOrchestratorTransitionError);

		graph = approveRole({
			graph,
			role: "story",
			at: TIMES.directorApproved,
		});
		expect(
			getAgentTaskByRole({ orchestration: graph, role: "story" }).status,
		).toBe("blocked");
		graph = approveRole({
			graph,
			role: "director",
			at: TIMES.directorStarted,
		});
		graph = completeRole({
			graph,
			role: "director",
			startedAt: TIMES.directorDone,
			completedAt: TIMES.storyApproved,
		});
		expect(
			getAgentTaskByRole({ orchestration: graph, role: "story" }).status,
		).toBe("ready");
	});

	test("requires explicit human approval before a task can run", () => {
		let graph = createGraph();
		const director = getAgentTaskByRole({
			orchestration: graph,
			role: "director",
		});
		expect(director.status).toBe("awaiting-approval");
		expect(() =>
			startAgentTask({
				orchestration: graph,
				taskId: director.taskId,
				at: TIMES.directorStarted,
			}),
		).toThrow("cannot start from awaiting-approval");

		graph = approveRole({
			graph,
			role: "director",
			at: TIMES.directorApproved,
		});
		expect(
			getReadyAgentTasks({ orchestration: graph }).map((task) => task.role),
		).toEqual(["director"]);
		expect(
			getAgentTaskByRole({ orchestration: graph, role: "director" })
				.approvalGate,
		).toMatchObject({
			status: "approved",
			decidedBy: "local-user",
		});
	});

	test("records failure, blocks dependents, and retries without mutating prior versions", () => {
		let graph = reachStorySuccess();
		graph = approveRole({
			graph,
			role: "editor",
			at: TIMES.editorApproved,
		});
		graph = startAgentTask({
			orchestration: graph,
			taskId: taskId({ graph, role: "editor" }),
			at: TIMES.editorStarted,
		});
		const beforeFailure = graph;
		const failed = failAgentTask({
			orchestration: graph,
			taskId: taskId({ graph, role: "editor" }),
			at: TIMES.editorFailed,
			code: "local-plan-parse-error",
			message: "The deterministic plan could not be parsed",
			retryable: true,
		});

		expect(
			getAgentTaskByRole({ orchestration: failed, role: "editor" }),
		).toMatchObject({
			status: "failed",
			attemptCount: 1,
			failure: {
				code: "local-plan-parse-error",
				retryable: true,
			},
		});
		expect(
			getAgentTaskByRole({ orchestration: failed, role: "color" }).status,
		).toBe("blocked");
		expect(
			getAgentTaskByRole({ orchestration: beforeFailure, role: "editor" })
				.status,
		).toBe("running");

		const retried = retryAgentTask({
			orchestration: failed,
			taskId: taskId({ graph: failed, role: "editor" }),
			at: TIMES.editorRetried,
		});
		expect(
			getAgentTaskByRole({ orchestration: retried, role: "editor" }),
		).toMatchObject({
			status: "ready",
			retryCount: 1,
			failure: null,
		});
		const restarted = startAgentTask({
			orchestration: retried,
			taskId: taskId({ graph: retried, role: "editor" }),
			at: TIMES.editorRestarted,
		});
		expect(
			getAgentTaskByRole({ orchestration: restarted, role: "editor" })
				.attemptCount,
		).toBe(2);
	});

	test("enforces non-retryable failures and retry limits", () => {
		let graph = reachStorySuccess(createGraph({ maxRetries: 0 }));
		graph = approveRole({
			graph,
			role: "editor",
			at: TIMES.editorApproved,
		});
		graph = startAgentTask({
			orchestration: graph,
			taskId: taskId({ graph, role: "editor" }),
			at: TIMES.editorStarted,
		});
		const failed = failAgentTask({
			orchestration: graph,
			taskId: taskId({ graph, role: "editor" }),
			at: TIMES.editorFailed,
			code: "unsupported-local-operation",
			message: "This operation is not available in local rules",
			retryable: true,
		});
		expect(() =>
			retryAgentTask({
				orchestration: failed,
				taskId: taskId({ graph: failed, role: "editor" }),
				at: TIMES.editorRetried,
			}),
		).toThrow("retry limit");

		const retryBase = reachStorySuccess();
		const retryApproved = approveRole({
			graph: retryBase,
			role: "editor",
			at: TIMES.editorApproved,
		});
		const retryRunning = startAgentTask({
			orchestration: retryApproved,
			taskId: taskId({ graph: retryApproved, role: "editor" }),
			at: TIMES.editorStarted,
		});
		const nonRetryable = failAgentTask({
			orchestration: retryRunning,
			taskId: taskId({ graph: retryRunning, role: "editor" }),
			at: TIMES.editorFailed,
			code: "missing-capability",
			message: "No local implementation exists",
			retryable: false,
		});
		expect(() =>
			retryAgentTask({
				orchestration: nonRetryable,
				taskId: taskId({ graph: nonRetryable, role: "editor" }),
				at: TIMES.editorRetried,
			}),
		).toThrow("not retryable");
	});

	test("keeps evidence-limited roles blocked and never invents local analysis", () => {
		let graph = reachStorySuccess(
			createGraph({ withTarget: false, withMediaEvidence: false }),
		);

		for (const role of ["editor", "color", "sound", "growth"] as const) {
			const task = getAgentTaskByRole({ orchestration: graph, role });
			expect(task.status).toBe("blocked");
			expect(task.blockers.some((blocker) => blocker.kind === "evidence")).toBe(
				true,
			);
		}
		expect(graph.evidence.every((item) => !item.producedByOrchestrator)).toBe(
			true,
		);
		expect(graph.guarantees.modelInvokedByOrchestrator).toBe(false);
		expect(graph.guarantees.mediaAnalysisPerformedByOrchestrator).toBe(false);
		expect(() =>
			addAgentEvidence({
				orchestration: graph,
				evidence: {
					evidenceId: "fake-analysis",
					kind: "visual-analysis",
					label: "Fake local analysis",
					referenceId: "analysis:fake",
					origin: "project-metadata",
				},
				at: TIMES.evidenceAdded,
			}),
		).toThrow("cannot be represented as project metadata");

		graph = addAgentEvidence({
			orchestration: graph,
			evidence: {
				evidenceId: "imported-transcript",
				kind: "transcript",
				label: "Imported transcript",
				referenceId: "transcript:imported:v1",
				origin: "imported-result",
			},
			at: TIMES.evidenceAdded,
		});
		expect(
			getAgentTaskByRole({ orchestration: graph, role: "editor" }).status,
		).toBe("awaiting-approval");
		expect(
			getAgentTaskByRole({ orchestration: graph, role: "sound" }).status,
		).toBe("blocked");
	});

	test("round-trips as JSON and structured-clone data suitable for IndexedDB", () => {
		const graph = reachStorySuccess();
		const serialized = serializeAgentOrchestration({ orchestration: graph });
		const restored = deserializeAgentOrchestration({ serialized });
		const cloned = parseAgentOrchestration({ value: structuredClone(graph) });

		expect(restored).toEqual(graph);
		expect(cloned).toEqual(graph);
		expect(Object.isFrozen(restored)).toBe(true);
		expect(JSON.parse(serialized)).toEqual(graph);
		expect(serialized).not.toContain("apiKey");
		expect(serialized).not.toContain("function");
	});

	test("rejects illegal transitions and tampered stored states", () => {
		const graph = createGraph();
		const director = getAgentTaskByRole({
			orchestration: graph,
			role: "director",
		});
		expect(() =>
			completeAgentTask({
				orchestration: graph,
				taskId: director.taskId,
				at: TIMES.directorDone,
				outputs: [
					{
						outputId: director.outputReferences[0].outputId,
						artifactReference: "indexeddb:agent-plans/director/v1",
						origin: "local-rule-result",
					},
				],
			}),
		).toThrow("cannot succeed from awaiting-approval");

		const tampered = JSON.parse(JSON.stringify(graph));
		tampered.guarantees.modelInvokedByOrchestrator = true;
		expect(() => parseAgentOrchestration({ value: tampered })).toThrow(
			AgentOrchestratorInvariantError,
		);

		const fakeSuccess = JSON.parse(JSON.stringify(graph));
		fakeSuccess.tasks[0].status = "succeeded";
		expect(() => parseAgentOrchestration({ value: fakeSuccess })).toThrow(
			AgentOrchestratorInvariantError,
		);

		const cyclicDependency = JSON.parse(JSON.stringify(graph));
		cyclicDependency.tasks[0].dependencyTaskIds = [
			cyclicDependency.tasks[1].taskId,
		];
		expect(() => parseAgentOrchestration({ value: cyclicDependency })).toThrow(
			"invalid dependency topology",
		);
		expect(() =>
			deserializeAgentOrchestration({ serialized: "{not-json" }),
		).toThrow("not valid JSON");
	});
});
