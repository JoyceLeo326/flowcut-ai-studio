import { describe, expect, test } from "bun:test";
import {
	CAMERA_AGENT_TASK_CONTRACT,
	approveAgentTask,
	createAgentOrchestration,
	getAgentTaskByRole,
	type AgentOrchestration,
} from "./agent-orchestrator";
import {
	assertAgentAuditSafe,
	createAgentRuntimeSession,
	deserializeAgentRuntimeSession,
	executeAgentRuntimeSession,
	parseAgentRuntimeSession,
	redactAgentAuditValue,
	resolveAgentRuntimeRoleSelection,
	retryAgentRuntimeRuns,
	type AgentModelInvoker,
	type AgentRuntimeRole,
	type AgentRuntimeSession,
} from "./agent-runtime";
import { createIntentSpec } from "./intent-spec";
import { createMediaIndex, type MediaIndex } from "./media-index";
import {
	createTimelineTranscriptArtifact,
	type TimelineTranscriptArtifact,
} from "./transcript-artifact";

const CREATED_AT = "2026-07-26T01:00:00.000Z";
const RUNTIME_AT = "2026-07-26T01:01:00.000Z";

function createRuntimeMediaIndex(): MediaIndex {
	return createMediaIndex({
		assetId: "main",
		metadata: {
			durationSeconds: 10,
			hasVideo: true,
			hasAudio: true,
			videoWidth: 1920,
			videoHeight: 1080,
			nominalFrameRate: 30,
			source: {
				sourceId: "runtime-metadata",
				method: "html-media-element",
			},
		},
		videoFrameSamples: [
			{
				atSeconds: 0,
				differenceFromPrevious: 0,
				meanLuminance: 0.35,
				source: {
					sourceId: "runtime-frames",
					method: "canvas-2d-frame-sampler",
				},
			},
			{
				atSeconds: 3,
				differenceFromPrevious: 0.76,
				meanLuminance: 0.68,
				source: {
					sourceId: "runtime-frames",
					method: "canvas-2d-frame-sampler",
				},
			},
		],
		audioWindowSamples: [
			{
				startSeconds: 0,
				endSeconds: 0.5,
				rms: 0.004,
				peak: 0.012,
				source: {
					sourceId: "runtime-audio",
					method: "web-audio-api",
				},
			},
			{
				startSeconds: 0.5,
				endSeconds: 1,
				rms: 0.06,
				peak: 0.2,
				source: {
					sourceId: "runtime-audio",
					method: "web-audio-api",
				},
			},
		],
	});
}

function createRuntimeTranscript(): TimelineTranscriptArtifact {
	return createTimelineTranscriptArtifact({
		draft: {
			projectId: "project-agent-runtime",
			sceneId: "scene-main",
			timelineId: "scene-main",
			captionTrackId: "track-captions",
			language: {
				code: "en",
				basis: "user-selected",
				verified: false,
			},
			provenance: "local-whisper",
			sourceMetadata: {
				kind: "local-whisper",
				runtimePackage: "@huggingface/transformers",
				modelId: "whisper-small",
				modelRepository: "onnx-community/whisper-small",
				audioSource: "active-timeline-mix",
				mediaStored: false,
				apiKeyStored: false,
			},
			fullText: "Pause here. Continue with the product proof.",
			segments: [
				{
					text: "Pause here.",
					startSeconds: 0,
					endSeconds: 0.8,
				},
				{
					text: "Continue with the product proof.",
					startSeconds: 1.2,
					endSeconds: 2.8,
				},
			],
		},
		revision: 1,
		createdAt: "2026-07-26T00:59:00.000Z",
		previousArtifactFingerprint: null,
	});
}

function createApprovedGraph({
	roles = ["director", "editor", "sound"],
	mediaIndex,
	transcriptArtifact,
}: {
	roles?: readonly AgentRuntimeRole[];
	mediaIndex?: MediaIndex;
	transcriptArtifact?: TimelineTranscriptArtifact;
} = {}): AgentOrchestration {
	const intent = createIntentSpec({
		projectId: "project-agent-runtime",
		userIntent: "把三段采访整理成克制、清晰、声音自然的品牌短片",
		target: {
			platform: "YouTube",
			aspectRatio: "16:9",
			durationSeconds: 120,
			style: "restrained documentary",
		},
		source: "home",
		createdAt: CREATED_AT,
	});
	let graph = createAgentOrchestration({
		intentSpec: intent,
		createdAt: CREATED_AT,
		evidence: [
			{
				evidenceId: "asset-main",
				kind: "asset-metadata",
				label: "Interview clip metadata",
				referenceId: "asset:main",
				origin: "project-metadata",
			},
			{
				evidenceId: "scene-main",
				kind: "scene-analysis",
				label: "Imported frame-change candidates",
				referenceId: mediaIndex?.mediaIndexId ?? "media-index:main",
				origin: "imported-result",
			},
			{
				evidenceId: "audio-meta",
				kind: "audio-metadata",
				label: "Audio stream metadata",
				referenceId: "asset:main:audio",
				origin: "project-metadata",
			},
			{
				evidenceId: "audio-main",
				kind: "audio-analysis",
				label: "Imported energy activity candidates",
				referenceId: mediaIndex?.mediaIndexId ?? "media-index:main:audio",
				origin: "imported-result",
			},
			{
				evidenceId: "visual-main",
				kind: "visual-analysis",
				label: "Imported shot composition analysis",
				referenceId: mediaIndex?.mediaIndexId ?? "media-index:main:visual",
				origin: "imported-result",
			},
			...(transcriptArtifact === undefined
				? []
				: [
						{
							evidenceId: "transcript-main",
							kind: "transcript" as const,
							label: "Segment transcript",
							referenceId: transcriptArtifact.artifactId,
							origin: "imported-result" as const,
						},
					]),
		],
		maxRetries: 2,
	});
	const approvedRoles = resolveAgentRuntimeRoleSelection({
		orchestration: graph,
		roles,
	});
	for (const [index, role] of approvedRoles.entries()) {
		const task = getAgentTaskByRole({ orchestration: graph, role });
		graph = approveAgentTask({
			orchestration: graph,
			taskId: task.taskId,
			approvedBy: "runtime-test",
			at: new Date(Date.parse(CREATED_AT) + index + 1).toISOString(),
		});
	}
	return graph;
}

function responseForRole(role: AgentRuntimeRole): string {
	const evidenceId =
		role === "sound"
			? "audio-main"
			: role === "editor"
				? "scene-main"
				: role === "color" || role === "camera"
					? "visual-main"
					: "scene-main";
	const kind =
		role === "sound"
			? "sound"
			: role === "editor"
				? "edit"
				: role === "color"
					? "color"
					: role === "camera"
						? "camera"
						: role === "story"
							? "story"
							: role === "growth"
								? "growth"
								: "direction";
	return JSON.stringify({
		summary: `${role} evidence-grounded proposal`,
		findings: [
			{
				findingId: `${role}-finding`,
				statement: `${role} cited one known input`,
				evidenceIds: [evidenceId],
			},
		],
		actions: [
			{
				actionId: `${role}-action`,
				kind,
				title: `${role} opening proposal`,
				description: `${role} proposes a distinct opening treatment`,
				targetReference: "timeline:opening",
				evidenceIds: [evidenceId],
				applicable: true,
			},
		],
		conflicts: [],
	});
}

describe("VisionCut auditable agent runtime", () => {
	test("uses honest local-evidence-only results when no model callback exists", async () => {
		const orchestration = createApprovedGraph();
		const created = createAgentRuntimeSession({
			orchestration,
			createdAt: RUNTIME_AT,
			sessionNonce: "local-test",
		});
		const completed = await executeAgentRuntimeSession({
			session: created,
			orchestration,
		});

		expect(completed.status).toBe("local-evidence-only");
		expect(completed.runs.map((run) => run.role)).toEqual([
			"director",
			"story",
			"camera",
			"editor",
			"sound",
		]);
		expect(
			completed.runs.every(
				(run) =>
					run.status === "local-evidence-only" &&
					run.attempts[0]?.provider === "local-free" &&
					run.artifact?.generatedBy === "local-evidence-only" &&
					run.artifact.actions.length === 0,
			),
		).toBe(true);
		expect(completed.guarantees.apiKeysStored).toBe(false);
		expect(completed.merge.eligibleActionIds).toEqual([]);
	});

	test("binds versioned role-projected evidence packages into every model invocation", async () => {
		const roles = [
			"director",
			"story",
			"camera",
			"editor",
			"color",
			"sound",
			"growth",
		] as const;
		const mediaIndex = createRuntimeMediaIndex();
		const transcriptArtifact = createRuntimeTranscript();
		const orchestration = createApprovedGraph({
			roles,
			mediaIndex,
			transcriptArtifact,
		});
		const requests: Array<Parameters<AgentModelInvoker>[0]> = [];
		const session = createAgentRuntimeSession({
			orchestration,
			roles,
			createdAt: RUNTIME_AT,
			sessionNonce: "resolved-evidence",
			evidenceSources: {
				mediaIndexes: [mediaIndex],
				transcriptArtifact,
				maxCharacters: 4_000,
			},
		});
		const completed = await executeAgentRuntimeSession({
			session,
			orchestration,
			model: {
				provider: "openai",
				model: "gpt-test",
				invoke: async (request) => {
					requests.push(request);
					return { ok: true, text: responseForRole(request.role) };
				},
			},
		});
		const packageFor = (role: AgentRuntimeRole) => {
			const request = requests.find((candidate) => candidate.role === role);
			if (request === undefined) {
				throw new Error(`Missing ${role} invocation.`);
			}
			expect(request.prompt).toContain(request.evidencePackage.fingerprint);
			expect(request.prompt).toContain(request.evidencePackage.text);
			expect(request.evidencePackage.role).toBe(role);
			return request.evidencePackage;
		};

		expect(packageFor("director").text).toContain("meanLuminance=");
		expect(packageFor("director").text).toContain(
			'text="Continue with the product proof."',
		);
		expect(packageFor("story").text).toContain("meanLuminance=");
		expect(packageFor("story").text).toContain("Pause here.");
		expect(packageFor("camera").text).toContain("meanLuminance=");
		expect(packageFor("camera").text).not.toContain("Pause here.");
		expect(packageFor("editor").text).toContain("Pause here.");
		expect(packageFor("color").text).toContain("meanLuminance=");
		expect(packageFor("sound").text).toContain("rms=0.060000");
		expect(packageFor("sound").text).toContain("Pause here.");
		expect(packageFor("growth").text).not.toContain("meanLuminance=");
		expect(packageFor("growth").text).not.toContain("Pause here.");
		expect(completed.status).toBe("succeeded");
		expect(
			completed.runs.every(
				(run) =>
					run.evidencePackage.fingerprint ===
					session.runs.find((candidate) => candidate.role === run.role)
						?.evidencePackage.fingerprint,
			),
		).toBe(true);
	});

	test("rejects a runtime session whose resolved evidence package was tampered", async () => {
		const orchestration = createApprovedGraph({ roles: ["director"] });
		const session = createAgentRuntimeSession({
			orchestration,
			roles: ["director"],
			createdAt: RUNTIME_AT,
			sessionNonce: "tampered-evidence-package",
		});
		const tampered = structuredClone(session);
		const evidencePackage = tampered.runs[0]?.evidencePackage;
		if (evidencePackage === undefined) {
			throw new Error("Expected a resolved evidence package.");
		}
		Reflect.set(
			evidencePackage,
			"text",
			`${evidencePackage.text}\nFabricated semantic claim.`,
		);

		expect(parseAgentRuntimeSession({ value: tampered })).toBeNull();
		await expect(
			executeAgentRuntimeSession({
				session: tampered,
				orchestration,
			}),
		).rejects.toThrow(/resolved evidence package is invalid/iu);
	});

	test("runs ready sibling roles concurrently through a key-free callback", async () => {
		const roles = [
			"director",
			"story",
			"camera",
			"editor",
			"color",
			"sound",
			"growth",
		] as const;
		const orchestration = createApprovedGraph({ roles });
		const created = createAgentRuntimeSession({
			orchestration,
			roles,
			concurrencyLimit: 3,
			createdAt: RUNTIME_AT,
			sessionNonce: "parallel-test",
		});
		let active = 0;
		let maximumActive = 0;
		const invokedRoles: AgentRuntimeRole[] = [];
		const invoke: AgentModelInvoker = async (request) => {
			expect("apiKey" in request).toBe(false);
			expect("authorization" in request).toBe(false);
			active += 1;
			maximumActive = Math.max(maximumActive, active);
			invokedRoles.push(request.role);
			await new Promise((resolve) => setTimeout(resolve, 8));
			active -= 1;
			return { ok: true, text: responseForRole(request.role) };
		};
		const completed = await executeAgentRuntimeSession({
			session: created,
			orchestration,
			model: {
				provider: "openai",
				model: "gpt-test",
				invoke,
			},
		});

		expect(maximumActive).toBe(2);
		expect(new Set(invokedRoles)).toEqual(new Set<AgentRuntimeRole>(roles));
		expect(completed.status).toBe("succeeded");
		expect(completed.runs.every((run) => run.status === "succeeded")).toBe(
			true,
		);
		expect(completed.merge.eligibleActionIds).toEqual([
			"camera-action",
			"color-action",
			"editor-action",
			"sound-action",
		]);
		expect(completed.merge.reviewOnlyActionIds).toEqual([
			"director-action",
			"story-action",
		]);
		expect(completed.merge.blockedActionIds).toContain("growth-action");
		expect(completed.merge.conflicts).toHaveLength(1);
	});

	test("holds Story, Camera, and Editor until their formal dependencies finish", async () => {
		const roles = ["director", "story", "editor"] as const;
		const orchestration = createApprovedGraph({ roles });
		const invokedRoles: AgentRuntimeRole[] = [];
		const requests: Array<Parameters<AgentModelInvoker>[0]> = [];
		let releaseDirector = () => undefined;
		let markDirectorStarted = () => undefined;
		const directorStarted = new Promise<void>((resolve) => {
			markDirectorStarted = resolve;
		});
		const directorRelease = new Promise<void>((resolve) => {
			releaseDirector = resolve;
		});
		const execution = executeAgentRuntimeSession({
			session: createAgentRuntimeSession({
				orchestration,
				roles,
				concurrencyLimit: 3,
				createdAt: RUNTIME_AT,
				sessionNonce: "dag-order",
			}),
			orchestration,
			model: {
				provider: "openai",
				model: "gpt-test",
				invoke: async (request) => {
					invokedRoles.push(request.role);
					requests.push(request);
					if (request.role === "director") {
						markDirectorStarted();
						await directorRelease;
					}
					return { ok: true, text: responseForRole(request.role) };
				},
			},
		});

		await directorStarted;
		await Promise.resolve();
		expect(invokedRoles).toEqual(["director"]);
		releaseDirector();
		const completed = await execution;

		expect(invokedRoles).toEqual(["director", "story", "camera", "editor"]);
		const storyRequest = requests.find((request) => request.role === "story");
		const cameraRequest = requests.find((request) => request.role === "camera");
		const editorRequest = requests.find((request) => request.role === "editor");
		expect(storyRequest?.dependencyArtifacts.map((item) => item.role)).toEqual([
			"director",
		]);
		expect(cameraRequest?.dependencyArtifacts.map((item) => item.role)).toEqual(
			["story"],
		);
		expect(editorRequest?.dependencyArtifacts.map((item) => item.role)).toEqual(
			["story", "camera"],
		);
		expect(completed.status).toBe("succeeded");
	});

	test("rejects cyclic runtime dependencies before invoking a model", () => {
		const roles = ["director", "story"] as const;
		const orchestration = createApprovedGraph({ roles });
		const storyTask = getAgentTaskByRole({ orchestration, role: "story" });
		const cyclic: AgentOrchestration = {
			...orchestration,
			tasks: orchestration.tasks.map((task) =>
				task.role === "director"
					? {
							...task,
							dependencyTaskIds: [storyTask.taskId],
						}
					: task,
			),
		};

		expect(() =>
			createAgentRuntimeSession({
				orchestration: cyclic,
				roles,
				createdAt: RUNTIME_AT,
				sessionNonce: "cycle",
			}),
		).toThrow(/dependency cycle/iu);
	});

	test("binds the Camera artifact id and digest into Editor input", async () => {
		const roles = ["director", "story", "camera", "editor"] as const;
		const orchestration = createApprovedGraph({ roles });
		const requests: Array<Parameters<AgentModelInvoker>[0]> = [];
		const completed = await executeAgentRuntimeSession({
			session: createAgentRuntimeSession({
				orchestration,
				roles,
				concurrencyLimit: 4,
				createdAt: RUNTIME_AT,
				sessionNonce: "camera-reference",
			}),
			orchestration,
			model: {
				provider: "openai",
				model: "gpt-test",
				invoke: async (request) => {
					requests.push(request);
					return { ok: true, text: responseForRole(request.role) };
				},
			},
		});
		const cameraRun = completed.runs.find((run) => run.role === "camera");
		const editorRun = completed.runs.find((run) => run.role === "editor");
		const editorRequest = requests.find((request) => request.role === "editor");
		const cameraReference = editorRequest?.dependencyArtifacts.find(
			(reference) => reference.role === "camera",
		);

		expect(CAMERA_AGENT_TASK_CONTRACT.outputKind).toBe("camera-plan");
		expect(cameraRun?.artifact?.role).toBe("camera");
		expect(cameraReference?.artifactId).toBe(cameraRun?.artifact?.artifactId);
		expect(cameraReference?.artifactDigest).toBe(
			cameraRun?.artifact?.artifactDigest,
		);
		expect(cameraReference?.artifactDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
		expect(editorRequest?.prompt).toContain(cameraReference?.artifactId ?? "");
		expect(editorRequest?.prompt).toContain(
			cameraReference?.artifactDigest ?? "",
		);
		expect(editorRun?.artifact?.upstreamArtifacts).toContainEqual(
			cameraReference,
		);
	});

	test("requires the formal Camera approval before an Editor session can be created", () => {
		const orchestration = createApprovedGraph({
			roles: ["director", "story"],
		});

		expect(() =>
			createAgentRuntimeSession({
				orchestration,
				roles: ["editor"],
				createdAt: RUNTIME_AT,
				sessionNonce: "camera-approval-gate",
			}),
		).toThrow(/camera contract requires explicit approval/iu);
	});

	test("never marks Camera actions eligible from generic metadata", async () => {
		const orchestration = createApprovedGraph({ roles: ["camera"] });
		const completed = await executeAgentRuntimeSession({
			session: createAgentRuntimeSession({
				orchestration,
				roles: ["camera"],
				createdAt: RUNTIME_AT,
				sessionNonce: "camera-weak-evidence",
			}),
			orchestration,
			model: {
				provider: "openai",
				model: "gpt-test",
				invoke: async (request) =>
					request.role === "camera"
						? {
								ok: true,
								text: JSON.stringify({
									summary: "Metadata-only Camera proposal",
									findings: [
										{
											findingId: "camera-metadata-finding",
											statement:
												"The asset label proves a tracking camera move.",
											evidenceIds: ["asset-main"],
										},
									],
									actions: [
										{
											actionId: "camera-metadata-only",
											kind: "camera",
											title: "Claim a tracking move",
											description: "Treat the named asset as a tracking shot.",
											targetReference: "asset:main",
											evidenceIds: ["asset-main"],
											applicable: true,
										},
									],
								}),
							}
						: { ok: true, text: responseForRole(request.role) },
			},
		});
		const action = completed.runs.find((run) => run.role === "camera")?.artifact
			?.actions[0];
		const finding = completed.runs.find((run) => run.role === "camera")
			?.artifact?.findings[0];

		expect(action?.applicability).toBe("blocked");
		expect(action?.blockers.join(" ")).toContain("generic metadata");
		expect(finding?.verification).toBe("uncited");
		expect(completed.merge.eligibleActionIds).not.toContain(
			"camera-metadata-only",
		);
	});

	test("blocks Editor invocation when Camera fails", async () => {
		const orchestration = createApprovedGraph({ roles: ["editor"] });
		const invokedRoles: AgentRuntimeRole[] = [];
		const completed = await executeAgentRuntimeSession({
			session: createAgentRuntimeSession({
				orchestration,
				roles: ["editor"],
				createdAt: RUNTIME_AT,
				sessionNonce: "camera-failure-blocks-editor",
			}),
			orchestration,
			model: {
				provider: "openai",
				model: "gpt-test",
				invoke: async (request) => {
					invokedRoles.push(request.role);
					if (request.role === "camera") {
						return {
							ok: false,
							error: {
								code: "camera-provider-failure",
								message: "Camera planning failed.",
								retryable: true,
							},
						};
					}
					return { ok: true, text: responseForRole(request.role) };
				},
			},
		});
		const editor = completed.runs.find((run) => run.role === "editor");

		expect(invokedRoles).not.toContain("editor");
		expect(editor?.status).toBe("failed");
		expect(editor?.attempts[0]?.failure?.code).toBe("dependency-unavailable");
	});

	test("migrates synthetic Camera audit ids without manufacturing approval", async () => {
		const orchestration = createApprovedGraph({ roles: ["editor"] });
		const current = createAgentRuntimeSession({
			orchestration,
			roles: ["editor"],
			createdAt: RUNTIME_AT,
			sessionNonce: "legacy-synthetic-camera",
		});
		const legacy = JSON.parse(JSON.stringify(current));
		const formalCameraTaskId = `${orchestration.orchestrationId}/camera`;
		const syntheticCameraTaskId = `${orchestration.orchestrationId}/task/camera`;
		legacy.schemaVersion = 1;
		legacy.runs = legacy.runs.map(
			(run: AgentRuntimeSession["runs"][number]) => ({
				...run,
				taskId:
					run.taskId === formalCameraTaskId
						? syntheticCameraTaskId
						: run.taskId,
				dependencyTaskIds: run.dependencyTaskIds.map((taskId) =>
					taskId === formalCameraTaskId ? syntheticCameraTaskId : taskId,
				),
			}),
		);

		const migrated = parseAgentRuntimeSession({ value: legacy });
		expect(migrated?.schemaVersion).toBe(2);
		expect(migrated?.runs.find((run) => run.role === "camera")?.taskId).toBe(
			formalCameraTaskId,
		);
		expect(
			migrated?.runs
				.find((run) => run.role === "editor")
				?.dependencyTaskIds.includes(formalCameraTaskId),
		).toBe(true);
		expect(migrated?.events.at(-1)?.type).toBe("session-migrated");
		expect(migrated?.events.at(-1)?.detail).toContain(
			"without creating an approval decision",
		);
		expect(
			deserializeAgentRuntimeSession({
				value: JSON.stringify(migrated),
			}),
		).toEqual(migrated);

		const unapproved = structuredClone(orchestration);
		const cameraIndex = unapproved.tasks.findIndex(
			(task) => task.role === "camera",
		);
		Reflect.set(unapproved.tasks[cameraIndex], "approvalGate", {
			required: true,
			phase: "before-run",
			status: "pending",
			decidedAt: null,
			decidedBy: null,
			note: null,
		});
		await expect(
			executeAgentRuntimeSession({
				session: migrated!,
				orchestration: unapproved,
			}),
		).rejects.toThrow(/camera contract is not approved/iu);
	});

	test("produces the same deterministic merge despite completion order", async () => {
		const orchestration = createApprovedGraph();
		const runWithDelays = async ({
			delays,
			nonce,
		}: {
			delays: Record<AgentRuntimeRole, number>;
			nonce: string;
		}) =>
			executeAgentRuntimeSession({
				session: createAgentRuntimeSession({
					orchestration,
					createdAt: RUNTIME_AT,
					sessionNonce: nonce,
				}),
				orchestration,
				model: {
					provider: "anthropic",
					model: "claude-test",
					invoke: async (request) => {
						await new Promise((resolve) =>
							setTimeout(resolve, delays[request.role]),
						);
						return {
							ok: true,
							text: responseForRole(request.role),
						};
					},
				},
			});
		const roleDelays = {
			director: 1,
			story: 1,
			camera: 1,
			editor: 6,
			color: 1,
			sound: 3,
			growth: 1,
		} satisfies Record<AgentRuntimeRole, number>;
		const reversedDelays = {
			...roleDelays,
			director: 7,
			editor: 1,
			sound: 4,
		};
		const first = await runWithDelays({
			delays: roleDelays,
			nonce: "deterministic",
		});
		const second = await runWithDelays({
			delays: reversedDelays,
			nonce: "deterministic",
		});

		expect(first.merge).toEqual(second.merge);
		expect(first.merge.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/u);
	});

	test("blocks edit actions that cite missing evidence", async () => {
		const orchestration = createApprovedGraph({ roles: ["editor"] });
		const completed = await executeAgentRuntimeSession({
			session: createAgentRuntimeSession({
				orchestration,
				roles: ["editor"],
				createdAt: RUNTIME_AT,
				sessionNonce: "missing-evidence",
			}),
			orchestration,
			model: {
				provider: "gemini",
				model: "gemini-test",
				invoke: async () => ({
					ok: true,
					text: JSON.stringify({
						summary: "Unsupported edit proposal",
						findings: [],
						actions: [
							{
								actionId: "unsafe-cut",
								kind: "edit",
								title: "Cut an unseen pause",
								description: "Remove a pause that is not in evidence.",
								targetReference: "timeline:clip-1",
								evidenceIds: ["missing-transcript"],
								applicable: true,
							},
						],
					}),
				}),
			},
		});
		const action = completed.runs.find((run) => run.role === "editor")?.artifact
			?.actions[0];

		expect(action?.applicability).toBe("blocked");
		expect(action?.evidenceIds).toEqual([]);
		expect(action?.blockers.join(" ")).toContain("missing-transcript");
		expect(completed.merge.eligibleActionIds).toEqual([]);
		expect(completed.merge.blockedActionIds).toEqual(["unsafe-cut"]);
	});

	test("keeps weak role-specific evidence blocked for direct actions", async () => {
		const cases = [
			{
				role: "editor",
				kind: "edit",
				evidenceId: "asset-main",
				blocker: "generic metadata",
			},
			{
				role: "color",
				kind: "color",
				evidenceId: "asset-main",
				blocker: "generic metadata",
			},
			{
				role: "sound",
				kind: "sound",
				evidenceId: "audio-meta",
				blocker: "generic audio metadata",
			},
		] as const;
		for (const item of cases) {
			const orchestration = createApprovedGraph({ roles: [item.role] });
			const completed = await executeAgentRuntimeSession({
				session: createAgentRuntimeSession({
					orchestration,
					roles: [item.role],
					createdAt: RUNTIME_AT,
					sessionNonce: `weak-${item.role}`,
				}),
				orchestration,
				model: {
					provider: "openai",
					model: "gpt-test",
					invoke: async () => ({
						ok: true,
						text: JSON.stringify({
							summary: "Weakly supported proposal",
							findings: [],
							actions: [
								{
									actionId: `weak-${item.role}`,
									kind: item.kind,
									title: "Remove a named time range",
									description:
										"Delete 00:10-00:15 based only on the asset label.",
									targetReference: "timeline:00:10-00:15",
									evidenceIds: [item.evidenceId],
									applicable: true,
								},
							],
						}),
					}),
				},
			});
			const action = completed.runs.find((run) => run.role === item.role)
				?.artifact?.actions[0];
			expect(action?.applicability).toBe("blocked");
			expect(action?.blockers.join(" ")).toContain(item.blocker);
		}
	});

	test("aborts active callbacks and records a retryable cancelled attempt", async () => {
		const orchestration = createApprovedGraph();
		const controller = new AbortController();
		const invoke: AgentModelInvoker = (request) =>
			new Promise((_, reject) => {
				request.signal.addEventListener(
					"abort",
					() => reject(new DOMException("cancelled", "AbortError")),
					{ once: true },
				);
			});
		const execution = executeAgentRuntimeSession({
			session: createAgentRuntimeSession({
				orchestration,
				createdAt: RUNTIME_AT,
				sessionNonce: "abort-test",
			}),
			orchestration,
			model: { provider: "openai", model: "gpt-test", invoke },
			signal: controller.signal,
		});
		setTimeout(() => controller.abort(), 5);
		const completed = await execution;

		expect(completed.status).toBe("aborted");
		expect(completed.runs.every((run) => run.status === "aborted")).toBe(true);
		expect(
			completed.runs.every(
				(run) =>
					run.attempts[0]?.failure?.code === "aborted" &&
					run.attempts[0]?.failure?.retryable === true,
			),
		).toBe(true);
	});

	test("retries failed roles without discarding prior audit attempts", async () => {
		const orchestration = createApprovedGraph({ roles: ["editor"] });
		const initial = await executeAgentRuntimeSession({
			session: createAgentRuntimeSession({
				orchestration,
				roles: ["editor"],
				createdAt: RUNTIME_AT,
				sessionNonce: "retry-test",
			}),
			orchestration,
			model: {
				provider: "openai",
				model: "gpt-test",
				invoke: async (request) =>
					request.role === "editor"
						? {
								ok: false,
								error: {
									code: "upstream-timeout",
									message: "Timed out",
									retryable: true,
								},
							}
						: { ok: true, text: responseForRole(request.role) },
			},
		});
		const failedEditor = initial.runs.find((run) => run.role === "editor");
		expect(failedEditor).toBeDefined();
		const retried = await retryAgentRuntimeRuns({
			session: initial,
			orchestration,
			runIds: [failedEditor!.runId],
			model: {
				provider: "openai",
				model: "gpt-test",
				invoke: async () => ({
					ok: true,
					text: responseForRole("editor"),
				}),
			},
		});

		expect(failedEditor?.status).toBe("failed");
		const retriedEditor = retried.runs.find((run) => run.role === "editor");
		expect(retriedEditor?.status).toBe("succeeded");
		expect(retriedEditor?.retryCount).toBe(1);
		expect(retriedEditor?.attempts.map((attempt) => attempt.status)).toEqual([
			"failed",
			"succeeded",
		]);
	});

	test("preserves non-retryable provider failures", async () => {
		const orchestration = createApprovedGraph({ roles: ["editor"] });
		const failed = await executeAgentRuntimeSession({
			session: createAgentRuntimeSession({
				orchestration,
				roles: ["editor"],
				createdAt: RUNTIME_AT,
				sessionNonce: "non-retryable",
			}),
			orchestration,
			model: {
				provider: "openai",
				model: "gpt-test",
				invoke: async (request) =>
					request.role === "editor"
						? {
								ok: false,
								error: {
									code: "invalid-api-key",
									message: "The provider rejected this credential.",
									retryable: false,
								},
							}
						: { ok: true, text: responseForRole(request.role) },
			},
		});
		const failedEditor = failed.runs.find((run) => run.role === "editor");

		expect(failedEditor?.attempts[0].failure).toEqual({
			code: "invalid-api-key",
			message: "The provider rejected this credential.",
			retryable: false,
		});
		await expect(
			retryAgentRuntimeRuns({
				session: failed,
				orchestration,
				runIds: [failedEditor!.runId],
			}),
		).rejects.toThrow("non-retryable");
	});

	test("redacts credential-shaped text returned inside model artifacts", async () => {
		const orchestration = createApprovedGraph({ roles: ["director"] });
		const completed = await executeAgentRuntimeSession({
			session: createAgentRuntimeSession({
				orchestration,
				roles: ["director"],
				createdAt: RUNTIME_AT,
				sessionNonce: "response-redaction",
			}),
			orchestration,
			model: {
				provider: "openai",
				model: "gpt-test",
				invoke: async () => ({
					ok: true,
					text: JSON.stringify({
						summary: "apiKey=sk-should-never-be-audited",
						findings: [],
						actions: [],
					}),
				}),
			},
		});

		expect(completed.runs[0].artifact?.summary).toBe("[REDACTED]");
		expect(completed.runs[0].attempts[0].responseAudit).not.toContain(
			"sk-should-never-be-audited",
		);
		expect(() => assertAgentAuditSafe({ value: completed })).not.toThrow();
	});

	test("recursively redacts or rejects credential-shaped audit material", () => {
		const unsafe = {
			request: {
				headers: {
					authorization: "Bearer top-secret-token",
				},
				config: {
					apiKey: "sk-test-secret-value",
				},
			},
			response: "password=never-store-this",
		};
		const redacted = redactAgentAuditValue({ value: unsafe });

		expect(redacted).toEqual({
			request: {
				headers: { authorization: "[REDACTED]" },
				config: { apiKey: "[REDACTED]" },
			},
			response: "[REDACTED]",
		});
		expect(() => assertAgentAuditSafe({ value: unsafe })).toThrow(
			/forbidden sensitive field|credential material/u,
		);
	});
});
