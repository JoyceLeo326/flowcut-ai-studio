import { describe, expect, test } from "bun:test";
import {
	approveAgentTask,
	createAgentOrchestration,
	getAgentTaskByRole,
} from "./agent-orchestrator";
import {
	createAgentRuntimeSession,
	executeAgentRuntimeSession,
	AgentRuntimeValidationError,
	type AgentRuntimeSession,
} from "./agent-runtime";
import {
	AgentSessionStorageConflictError,
	clearProjectAgentRuntimeSessions,
	IndexedDBAgentSessionStorage,
	listProjectAgentRuntimeSessions,
	loadAgentRuntimeSession,
	MemoryAgentSessionStorage,
	saveAgentRuntimeSession,
} from "./agent-session-store";
import { createIntentSpec } from "./intent-spec";

const CREATED_AT = "2026-07-26T02:00:00.000Z";

function createSession({
	projectId = "project-session-store",
	nonce = "session-store",
}: {
	projectId?: string;
	nonce?: string;
} = {}): AgentRuntimeSession {
	const intent = createIntentSpec({
		projectId,
		userIntent: "整理采访素材并保留完整审计轨迹",
		source: "home",
		createdAt: CREATED_AT,
	});
	let orchestration = createAgentOrchestration({
		intentSpec: intent,
		createdAt: CREATED_AT,
		evidence: [
			{
				evidenceId: "asset-session-test",
				kind: "asset-metadata",
				label: "Stored media metadata",
				referenceId: "asset:session-test",
				origin: "project-metadata",
			},
		],
	});
	const director = getAgentTaskByRole({
		orchestration,
		role: "director",
	});
	orchestration = approveAgentTask({
		orchestration,
		taskId: director.taskId,
		approvedBy: "store-test",
		at: "2026-07-26T02:00:00.001Z",
	});
	return createAgentRuntimeSession({
		orchestration,
		roles: ["director"],
		createdAt: "2026-07-26T02:01:00.000Z",
		sessionNonce: nonce,
	});
}

describe("VisionCut agent session audit storage", () => {
	test("persists and loads a frozen project-scoped session", async () => {
		const storage = new MemoryAgentSessionStorage();
		const source = createSession();
		const saved = await saveAgentRuntimeSession({ session: source, storage });
		const loaded = await loadAgentRuntimeSession({
			projectId: source.projectId,
			sessionId: source.sessionId,
			storage,
		});

		expect(saved).toEqual(source);
		expect(loaded).toEqual(source);
		expect(Object.isFrozen(loaded)).toBe(true);
		expect(Object.isFrozen(loaded?.runs)).toBe(true);
		expect(loaded?.guarantees.apiKeysStored).toBe(false);
	});

	test("persists every runtime revision through the update callback", async () => {
		const storage = new MemoryAgentSessionStorage();
		const created = createSession({ nonce: "runtime-updates" });
		let persistedUpdates = 0;
		const completed = await executeAgentRuntimeSession({
			session: created,
			orchestration: {
				kind: "visioncut.agent-orchestration",
				schemaVersion: 2,
				orchestrationId: created.orchestrationId,
				projectId: created.projectId,
				revision: created.orchestrationRevision,
				intent: {
					projectId: created.projectId,
					revision: 1,
					userIntent: "整理采访素材并保留完整审计轨迹",
					updatedAt: CREATED_AT,
				},
				evidence: created.runs[0].inputEvidence.map((item) => ({
					...item,
					producedByOrchestrator: false as const,
				})),
				tasks: [
					{
						taskId: created.runs[0].taskId,
						role: "director",
						title: created.runs[0].title,
						purpose: created.runs[0].purpose,
						status: "ready",
						dependencyTaskIds: [],
						evidenceRequirements: created.runs[0].evidenceRequirements,
						inputEvidenceIds: created.runs[0].inputEvidence.map(
							(item) => item.evidenceId,
						),
						outputReferences: [
							{
								outputId: `${created.orchestrationId}/output/director`,
								kind: "director-brief",
								label: "Director brief",
								state: "expected",
								artifactReference: null,
								origin: null,
								producedAt: null,
							},
						],
						approvalGate: {
							required: true,
							phase: "before-run",
							status: "approved",
							decidedAt: "2026-07-26T02:00:00.001Z",
							decidedBy: "store-test",
							note: null,
						},
						blockers: [],
						limitations: [],
						attemptCount: 0,
						retryCount: 0,
						maxRetries: 2,
						failure: null,
					},
				],
				guarantees: {
					deterministicLocalRules: true,
					network: false,
					paidService: false,
					modelInvokedByOrchestrator: false,
					mediaAnalysisPerformedByOrchestrator: false,
					mediaMutationPerformedByOrchestrator: false,
					outputsArePlansUntilReferenced: true,
				},
				createdAt: CREATED_AT,
				updatedAt: CREATED_AT,
				history: [
					{
						eventId: "event-1",
						revision: 1,
						type: "created",
						at: CREATED_AT,
						taskId: null,
						detail: "Test orchestration",
					},
				],
			},
			onUpdate: async ({ session }) => {
				await saveAgentRuntimeSession({ session, storage });
				persistedUpdates += 1;
			},
		});
		const loaded = await loadAgentRuntimeSession({
			projectId: completed.projectId,
			sessionId: completed.sessionId,
			storage,
		});

		expect(persistedUpdates).toBeGreaterThanOrEqual(4);
		expect(loaded).toEqual(completed);
		expect(loaded?.runs[0].attempts).toHaveLength(1);
		expect(loaded?.runs[0].attempts[0].status).toBe("local-evidence-only");
	});

	test("rejects changed or skipped revisions for an existing session", async () => {
		const storage = new MemoryAgentSessionStorage();
		const source = createSession();
		await saveAgentRuntimeSession({ session: source, storage });
		const changed = structuredClone(source) as AgentRuntimeSession;
		Reflect.set(
			changed,
			"orchestrationRevision",
			source.orchestrationRevision + 1,
		);

		await expect(
			saveAgentRuntimeSession({ session: changed, storage }),
		).rejects.toBeInstanceOf(AgentSessionStorageConflictError);
		const skipped = structuredClone(source) as AgentRuntimeSession;
		Reflect.set(skipped, "revision", source.revision + 2);
		Reflect.set(skipped, "events", [
			...source.events,
			...Array.from({ length: 2 }, (_, index) => ({
				eventId: `${source.sessionId}/event/${index + 2}`,
				revision: index + 2,
				type: "session-finished",
				at: new Date(Date.parse(source.updatedAt) + index + 1).toISOString(),
				runId: null,
				detail: "Synthetic stale update",
			})),
		]);
		Reflect.set(
			skipped,
			"updatedAt",
			new Date(Date.parse(source.updatedAt) + 2).toISOString(),
		);

		await expect(
			saveAgentRuntimeSession({ session: skipped, storage }),
		).rejects.toBeInstanceOf(AgentSessionStorageConflictError);
	});

	test("rejects recursively injected credentials and binary payloads", async () => {
		const storage = new MemoryAgentSessionStorage();
		const unsafe = structuredClone(createSession()) as AgentRuntimeSession;
		Reflect.set(unsafe, "debug", {
			request: { apiKey: "sk-never-persist-this" },
		});

		await expect(
			saveAgentRuntimeSession({ session: unsafe, storage }),
		).rejects.toBeInstanceOf(AgentRuntimeValidationError);

		const binary = structuredClone(
			createSession({
				nonce: "binary",
			}),
		) as AgentRuntimeSession;
		Reflect.set(binary, "binary", new Uint8Array([1, 2, 3]));
		await expect(
			saveAgentRuntimeSession({ session: binary, storage }),
		).rejects.toBeInstanceOf(AgentRuntimeValidationError);
	});

	test("uses memory fallback without IndexedDB and clears one project only", async () => {
		const fallback = new MemoryAgentSessionStorage();
		const storage = new IndexedDBAgentSessionStorage({
			indexedDBFactory: null,
			fallback,
		});
		const first = createSession({ projectId: "project-one", nonce: "one" });
		const second = createSession({ projectId: "project-two", nonce: "two" });
		await saveAgentRuntimeSession({ session: first, storage });
		await saveAgentRuntimeSession({ session: second, storage });

		expect(
			await listProjectAgentRuntimeSessions({
				projectId: "project-one",
				storage,
			}),
		).toHaveLength(1);
		await clearProjectAgentRuntimeSessions({
			projectId: "project-one",
			storage,
		});
		expect(
			await listProjectAgentRuntimeSessions({
				projectId: "project-one",
				storage,
			}),
		).toHaveLength(0);
		expect(
			await listProjectAgentRuntimeSessions({
				projectId: "project-two",
				storage,
			}),
		).toHaveLength(1);
	});
});
