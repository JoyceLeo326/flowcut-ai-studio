import { describe, expect, test } from "bun:test";
import {
	AutomationRunInvariantError,
	AutomationRunTransitionError,
	approveAutomationRun,
	assertAutomationRunInvariants,
	cancelAutomationRun,
	canApproveAutomationRun,
	canCancelAutomationRun,
	canRetryAutomationRun,
	createAutomationRun,
	deserializeAutomationRun,
	failAutomationRun,
	isTerminalAutomationRun,
	parseAutomationRun,
	retryAutomationRun,
	selectActiveAutomationRuns,
	selectAutomationRunActions,
	selectAutomationRunById,
	selectAutomationRunsByStatus,
	serializeAutomationRun,
	startAutomationRun,
	submitAutomationRunForReview,
	updateAutomationRunProgress,
	type AutomationRun,
} from "./automation-run";

const TIMES = {
	created: "2026-07-23T08:00:00.000Z",
	started: "2026-07-23T08:00:01.000Z",
	progressed: "2026-07-23T08:00:02.000Z",
	reviewed: "2026-07-23T08:00:03.000Z",
	finished: "2026-07-23T08:00:04.000Z",
	retried: "2026-07-23T08:00:05.000Z",
	restarted: "2026-07-23T08:00:06.000Z",
	failedAgain: "2026-07-23T08:00:07.000Z",
} as const;

function createQueuedRun({ maxRetries = 2 }: { maxRetries?: number } = {}) {
	return createAutomationRun({
		runId: "run-001",
		projectId: "project-001",
		automationId: "talking-head-cleanup",
		title: "Talking head cleanup",
		createdAt: TIMES.created,
		maxRetries,
	});
}

function createRunningRun(): AutomationRun {
	return startAutomationRun({ run: createQueuedRun(), at: TIMES.started });
}

function createReviewRun(): AutomationRun {
	return submitAutomationRunForReview({
		run: updateAutomationRunProgress({
			run: createRunningRun(),
			at: TIMES.progressed,
			percent: 72,
			message: "Prepared a reviewable edit plan",
		}),
		at: TIMES.reviewed,
		resultReferences: [
			{ kind: "edit-plan", id: "plan-001", label: "Edit plan v1" },
			{
				kind: "project-version",
				id: "version-001",
				label: "Before-change snapshot",
			},
		],
	});
}

describe("VisionCut local automation run", () => {
	test("creates deterministic, immutable, local-only queued records", () => {
		const first = createQueuedRun();
		const second = createQueuedRun();

		expect(first).toEqual(second);
		expect(first.status).toBe("queued");
		expect(first.progress).toEqual({ percent: 0, message: "Queued locally" });
		expect(first.execution).toEqual({
			localOnly: true,
			network: false,
			paidService: false,
		});
		expect(first.history).toHaveLength(1);
		expect(first.history[0]).toMatchObject({
			type: "created",
			from: null,
			to: "queued",
			at: TIMES.created,
		});
		expect(Object.isFrozen(first)).toBe(true);
		expect(Object.isFrozen(first.progress)).toBe(true);
		expect(Object.isFrozen(first.history)).toBe(true);
		expect(() => assertAutomationRunInvariants({ run: first })).not.toThrow();
	});

	test("moves through running, review, and explicit approval without mutation", () => {
		const queued = createQueuedRun();
		const queuedJson = JSON.stringify(queued);
		const running = startAutomationRun({ run: queued, at: TIMES.started });
		const progressed = updateAutomationRunProgress({
			run: running,
			at: TIMES.progressed,
			percent: 72,
			message: "Prepared a reviewable edit plan",
		});
		const review = submitAutomationRunForReview({
			run: progressed,
			at: TIMES.reviewed,
			resultReferences: [
				{ kind: "project-version", id: "version-001", label: "Snapshot" },
				{ kind: "edit-plan", id: "plan-001", label: "Plan" },
			],
		});
		const done = approveAutomationRun({
			run: review,
			at: TIMES.finished,
			approvedBy: "local-user",
		});

		expect(running.status).toBe("running");
		expect(progressed.progress.percent).toBe(72);
		expect(review.status).toBe("review");
		expect(review.progress.percent).toBe(100);
		expect(review.resultReferences.map(({ kind }) => kind)).toEqual([
			"edit-plan",
			"project-version",
		]);
		expect(done.status).toBe("done");
		expect(done.approval).toEqual({
			approvedAt: TIMES.finished,
			approvedBy: "local-user",
		});
		expect(done.completedAt).toBe(TIMES.finished);
		expect(done.history.map(({ type }) => type)).toEqual([
			"created",
			"started",
			"progressed",
			"submitted-for-review",
			"approved",
		]);
		expect(JSON.stringify(queued)).toBe(queuedJson);
		expect(queued.status).toBe("queued");
	});

	test("cannot fake completion with 100 percent progress or missing results", () => {
		const running = createRunningRun();

		expect(() =>
			updateAutomationRunProgress({
				run: running,
				at: TIMES.progressed,
				percent: 100,
				message: "Pretend complete",
			}),
		).toThrow(AutomationRunTransitionError);
		expect(() =>
			submitAutomationRunForReview({
				run: running,
				at: TIMES.reviewed,
				resultReferences: [],
			}),
		).toThrow("at least one real result reference");
		expect(() =>
			approveAutomationRun({
				run: running,
				at: TIMES.finished,
				approvedBy: "local-user",
			}),
		).toThrow(AutomationRunTransitionError);
		expect(running.status).toBe("running");
	});

	test("records failure details and performs a clean retry", () => {
		const running = updateAutomationRunProgress({
			run: createRunningRun(),
			at: TIMES.progressed,
			percent: 45,
			message: "Building local plan",
		});
		const failed = failAutomationRun({
			run: running,
			at: TIMES.reviewed,
			code: "local-parse-error",
			reason: "The local plan could not be parsed",
			retryable: true,
		});
		const retried = retryAutomationRun({ run: failed, at: TIMES.retried });

		expect(failed.status).toBe("failed");
		expect(failed.failure).toEqual({
			code: "local-parse-error",
			reason: "The local plan could not be parsed",
			retryable: true,
		});
		expect(failed.failedAt).toBe(TIMES.reviewed);
		expect(canRetryAutomationRun({ run: failed })).toBe(true);
		expect(isTerminalAutomationRun({ run: failed })).toBe(false);
		expect(retried.status).toBe("queued");
		expect(retried.retryCount).toBe(1);
		expect(retried.progress.percent).toBe(0);
		expect(retried.failure).toBeNull();
		expect(retried.startedAt).toBeNull();
		expect(retried.failedAt).toBeNull();
		expect(retried.history.at(-1)).toMatchObject({
			type: "retried",
			from: "failed",
			to: "queued",
			retryCount: 1,
		});
	});

	test("enforces non-retryable failures and retry limits", () => {
		const nonRetryable = failAutomationRun({
			run: createQueuedRun(),
			at: TIMES.started,
			code: "unsupported-input",
			reason: "This input is not supported locally",
			retryable: false,
		});
		expect(canRetryAutomationRun({ run: nonRetryable })).toBe(false);
		expect(isTerminalAutomationRun({ run: nonRetryable })).toBe(true);
		expect(() =>
			retryAutomationRun({ run: nonRetryable, at: TIMES.progressed }),
		).toThrow("not retryable");

		const failedOnce = failAutomationRun({
			run: startAutomationRun({
				run: createQueuedRun({ maxRetries: 1 }),
				at: TIMES.started,
			}),
			at: TIMES.progressed,
			code: "temporary-local-error",
			reason: "Temporary local failure",
			retryable: true,
		});
		const retried = retryAutomationRun({ run: failedOnce, at: TIMES.retried });
		const failedTwice = failAutomationRun({
			run: startAutomationRun({ run: retried, at: TIMES.restarted }),
			at: TIMES.failedAgain,
			code: "temporary-local-error",
			reason: "Temporary local failure again",
			retryable: true,
		});

		expect(failedTwice.retryCount).toBe(1);
		expect(canRetryAutomationRun({ run: failedTwice })).toBe(false);
		expect(() =>
			retryAutomationRun({ run: failedTwice, at: TIMES.failedAgain }),
		).toThrow("retry limit");
	});

	test("cancels queued, running, or review runs and locks terminal states", () => {
		const queuedCancelled = cancelAutomationRun({
			run: createQueuedRun(),
			at: TIMES.started,
			cancelledBy: "local-user",
			reason: "User changed direction",
		});
		const reviewCancelled = cancelAutomationRun({
			run: createReviewRun(),
			at: TIMES.finished,
			cancelledBy: "local-user",
			reason: "Review was declined",
		});

		expect(queuedCancelled.status).toBe("cancelled");
		expect(queuedCancelled.cancellation).toEqual({
			cancelledAt: TIMES.started,
			cancelledBy: "local-user",
			reason: "User changed direction",
		});
		expect(reviewCancelled.resultReferences).toHaveLength(2);
		expect(canCancelAutomationRun({ run: reviewCancelled })).toBe(false);
		expect(isTerminalAutomationRun({ run: reviewCancelled })).toBe(true);
		expect(() =>
			startAutomationRun({ run: queuedCancelled, at: TIMES.progressed }),
		).toThrow(AutomationRunTransitionError);
		expect(() =>
			approveAutomationRun({
				run: reviewCancelled,
				at: TIMES.finished,
				approvedBy: "local-user",
			}),
		).toThrow(AutomationRunTransitionError);
	});

	test("rejects decreasing progress, duplicate results, and backward time", () => {
		const progressed = updateAutomationRunProgress({
			run: createRunningRun(),
			at: TIMES.progressed,
			percent: 60,
			message: "Local work is in progress",
		});

		expect(() =>
			updateAutomationRunProgress({
				run: progressed,
				at: TIMES.reviewed,
				percent: 59,
				message: "Regressed",
			}),
		).toThrow("non-decreasing");
		expect(() =>
			submitAutomationRunForReview({
				run: progressed,
				at: TIMES.reviewed,
				resultReferences: [
					{ kind: "edit-plan", id: "plan-001", label: "First" },
					{ kind: "edit-plan", id: "plan-001", label: "Duplicate" },
				],
			}),
		).toThrow("unique");
		expect(() =>
			failAutomationRun({
				run: progressed,
				at: TIMES.started,
				code: "clock-error",
				reason: "Time moved backward",
				retryable: false,
			}),
		).toThrow("earlier than the previous event");
	});

	test("round-trips through JSON and structured clone for IndexedDB", () => {
		const done = approveAutomationRun({
			run: createReviewRun(),
			at: TIMES.finished,
			approvedBy: "local-user",
		});
		const serialized = serializeAutomationRun({ run: done });
		const deserialized = deserializeAutomationRun({ serialized });
		const cloned: unknown = structuredClone(done);
		const parsedClone = parseAutomationRun({ value: cloned });

		expect(deserialized).toEqual(done);
		expect(parsedClone).toEqual(done);
		expect(Object.isFrozen(deserialized)).toBe(true);
		expect(JSON.parse(serialized)).toEqual(done);
	});

	test("validation rejects malformed or non-local stored records", () => {
		const queued = createQueuedRun();
		const malformed = {
			...JSON.parse(JSON.stringify(queued)),
			execution: { localOnly: false, network: true, paidService: true },
		};

		expect(() => parseAutomationRun({ value: malformed })).toThrow(
			AutomationRunInvariantError,
		);
		expect(() => deserializeAutomationRun({ serialized: "{not-json" })).toThrow(
			"not valid JSON",
		);
	});

	test("selectors expose only state-valid actions and preserve run order", () => {
		const queued = createQueuedRun();
		const running = createRunningRun();
		const review = createReviewRun();
		const done = approveAutomationRun({
			run: review,
			at: TIMES.finished,
			approvedBy: "local-user",
		});
		const runs = [done, queued, review, running] as const;

		expect(selectAutomationRunActions({ run: queued })).toEqual({
			start: true,
			updateProgress: false,
			submitForReview: false,
			retry: false,
			cancel: true,
			approve: false,
		});
		expect(selectAutomationRunActions({ run: review })).toMatchObject({
			approve: true,
			cancel: true,
		});
		expect(canApproveAutomationRun({ run: review })).toBe(true);
		expect(selectAutomationRunsByStatus({ runs, status: "review" })).toEqual([
			review,
		]);
		expect(selectActiveAutomationRuns({ runs })).toEqual([
			queued,
			review,
			running,
		]);
		expect(selectAutomationRunById({ runs, runId: "run-001" })).toBe(done);
		expect(selectAutomationRunById({ runs, runId: "missing" })).toBeNull();
		expect(isTerminalAutomationRun({ run: done })).toBe(true);
	});
});
