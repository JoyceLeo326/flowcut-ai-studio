import { describe, expect, test } from "bun:test";
import { createIntentSpec } from "./intent-spec";
import {
	AGENT_ROLES,
	CAMERA_AGENT_TASK_CONTRACT,
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
	rejectAgentTask,
	retryAgentTask,
	serializeAgentOrchestration,
	startAgentTask,
	type AgentOrchestration,
	type AgentRole,
	type AgentTask,
} from "./agent-orchestrator";

const TIMES = {
	created: "2026-07-23T09:00:00.000Z",
	directorApproved: "2026-07-23T09:00:01.000Z",
	directorStarted: "2026-07-23T09:00:02.000Z",
	directorDone: "2026-07-23T09:00:03.000Z",
	storyApproved: "2026-07-23T09:00:04.000Z",
	storyStarted: "2026-07-23T09:00:05.000Z",
	storyDone: "2026-07-23T09:00:06.000Z",
	cameraApproved: "2026-07-23T09:00:07.000Z",
	cameraStarted: "2026-07-23T09:00:08.000Z",
	cameraDone: "2026-07-23T09:00:09.000Z",
	editorApproved: "2026-07-23T09:00:10.000Z",
	editorStarted: "2026-07-23T09:00:11.000Z",
	editorFailed: "2026-07-23T09:00:12.000Z",
	editorRetried: "2026-07-23T09:00:13.000Z",
	editorRestarted: "2026-07-23T09:00:14.000Z",
	editorDone: "2026-07-23T09:00:15.000Z",
	evidenceAdded: "2026-07-23T09:00:16.000Z",
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
					{
						evidenceId: "visual-main",
						kind: "visual-analysis",
						label: "Imported shot composition analysis",
						referenceId: "analysis:interview-main:visual",
						origin: "imported-result",
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

function reachCameraSuccess(graph = createGraph()): AgentOrchestration {
	let current = reachStorySuccess(graph);
	current = approveRole({
		graph: current,
		role: "camera",
		at: TIMES.cameraApproved,
	});
	return completeRole({
		graph: current,
		role: "camera",
		startedAt: TIMES.cameraStarted,
		completedAt: TIMES.cameraDone,
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

	test("runs the formal Director to Story to Camera to Editor path and unlocks parallel roles", () => {
		const initial = createGraph();
		const initialJson = JSON.stringify(initial);
		let graph = reachStorySuccess(initial);

		expect(
			getAgentTaskByRole({ orchestration: graph, role: "story" }).status,
		).toBe("succeeded");
		expect(
			getAgentTaskByRole({ orchestration: graph, role: "camera" }).status,
		).toBe("awaiting-approval");
		expect(
			getAgentTaskByRole({ orchestration: graph, role: "growth" }).status,
		).toBe("awaiting-approval");
		expect(
			getAgentTaskByRole({ orchestration: graph, role: "editor" }).status,
		).toBe("blocked");

		graph = approveRole({
			graph,
			role: "camera",
			at: TIMES.cameraApproved,
		});
		graph = completeRole({
			graph,
			role: "camera",
			startedAt: TIMES.cameraStarted,
			completedAt: TIMES.cameraDone,
		});
		expect(
			getAgentTaskByRole({ orchestration: graph, role: "editor" }).status,
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

	test("defines Camera as an evidence-gated, independently approved formal task", () => {
		let graph = reachStorySuccess();
		const camera = getAgentTaskByRole({
			orchestration: graph,
			role: "camera",
		});
		const editor = getAgentTaskByRole({
			orchestration: graph,
			role: "editor",
		});

		expect(AGENT_ROLES).toEqual([
			"director",
			"story",
			"camera",
			"editor",
			"color",
			"sound",
			"growth",
		]);
		expect(CAMERA_AGENT_TASK_CONTRACT.outputKind).toBe("camera-plan");
		expect(camera.outputReferences[0].kind).toBe("camera-plan");
		expect(camera.dependencyTaskIds).toEqual([
			taskId({ graph, role: "story" }),
		]);
		expect(editor.dependencyTaskIds).toEqual([
			taskId({ graph, role: "story" }),
			camera.taskId,
		]);

		graph = rejectAgentTask({
			orchestration: graph,
			taskId: camera.taskId,
			rejectedBy: "director-reviewer",
			at: TIMES.cameraApproved,
			note: "The imported visual analysis is not the approved source.",
		});
		expect(
			getAgentTaskByRole({ orchestration: graph, role: "camera" }).status,
		).toBe("rejected");
		expect(
			getAgentTaskByRole({ orchestration: graph, role: "editor" }).status,
		).toBe("blocked");
	});

	test("records failure, blocks dependents, and retries without mutating prior versions", () => {
		let graph = reachCameraSuccess();
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
		let graph = reachCameraSuccess(createGraph({ maxRetries: 0 }));
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

		const retryBase = reachCameraSuccess();
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

		for (const role of [
			"camera",
			"editor",
			"color",
			"sound",
			"growth",
		] as const) {
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
		).toBe("blocked");
		expect(
			getAgentTaskByRole({ orchestration: graph, role: "sound" }).status,
		).toBe("blocked");
		expect(
			getAgentTaskByRole({ orchestration: graph, role: "camera" }).status,
		).toBe("blocked");

		graph = addAgentEvidence({
			orchestration: graph,
			evidence: {
				evidenceId: "imported-visual-analysis",
				kind: "visual-analysis",
				label: "Imported composition analysis",
				referenceId: "visual-analysis:imported:v1",
				origin: "imported-result",
			},
			at: TIMES.evidenceAdded,
		});
		graph = approveRole({
			graph,
			role: "camera",
			at: TIMES.evidenceAdded,
		});
		graph = completeRole({
			graph,
			role: "camera",
			startedAt: TIMES.evidenceAdded,
			completedAt: TIMES.evidenceAdded,
		});
		expect(
			getAgentTaskByRole({ orchestration: graph, role: "editor" }).status,
		).toBe("awaiting-approval");
	});

	test("migrates six-role schema data without fabricating Camera approval", () => {
		let graph = reachCameraSuccess();
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
		const legacy = JSON.parse(JSON.stringify(graph));
		legacy.schemaVersion = 1;
		legacy.tasks = legacy.tasks
			.filter((task: AgentTask) => task.role !== "camera")
			.map((task: AgentTask) =>
				task.role === "editor"
					? {
							...task,
							dependencyTaskIds: [taskId({ graph, role: "story" })],
						}
					: task,
			);
		legacy.history = legacy.history
			.filter(
				(event: { taskId: string | null }) =>
					event.taskId !== taskId({ graph, role: "camera" }),
			)
			.map((event: AgentOrchestration["history"][number], index: number) => ({
				...event,
				eventId: `event-r${index + 1}`,
				revision: index + 1,
			}));
		legacy.revision = legacy.history.length;
		legacy.updatedAt = legacy.history.at(-1).at;

		const migrated = parseAgentOrchestration({ value: legacy });
		const migratedCamera = getAgentTaskByRole({
			orchestration: migrated,
			role: "camera",
		});
		const migratedEditor = getAgentTaskByRole({
			orchestration: migrated,
			role: "editor",
		});

		expect(migrated.schemaVersion).toBe(2);
		expect(migratedCamera.approvalGate).toEqual({
			required: true,
			phase: "before-run",
			status: "pending",
			decidedAt: null,
			decidedBy: null,
			note: null,
		});
		expect(migratedEditor.approvalGate.status).toBe("approved");
		expect(migratedEditor.status).toBe("blocked");
		expect(migratedEditor.outputReferences[0].state).toBe("expected");
		expect(
			migrated.evidence.some(
				(item) =>
					item.kind === "human-note" &&
					item.referenceId ===
						graph.tasks.find((task) => task.role === "editor")
							?.outputReferences[0].artifactReference,
			),
		).toBe(true);
		expect(migrated.history.at(-1)?.type).toBe("schema-migrated");

		const forgedApproval = JSON.parse(JSON.stringify(createGraph()));
		forgedApproval.schemaVersion = 1;
		forgedApproval.tasks = forgedApproval.tasks
			.filter((task: AgentTask) => task.role !== "camera")
			.map((task: AgentTask) =>
				task.role === "editor"
					? {
							...task,
							dependencyTaskIds: [`${forgedApproval.orchestrationId}/story`],
							approvalGate: {
								required: true,
								phase: "before-run",
								status: "approved",
								decidedAt: TIMES.created,
								decidedBy: "forged-user",
								note: null,
							},
						}
					: task,
			);
		expect(() => parseAgentOrchestration({ value: forgedApproval })).toThrow(
			"no matching audit event",
		);
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
