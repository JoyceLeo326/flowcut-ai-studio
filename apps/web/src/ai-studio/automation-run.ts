import { z } from "zod";

export const AUTOMATION_RUN_SCHEMA_VERSION = 1 as const;
export const AUTOMATION_RUN_STATUSES = [
	"queued",
	"running",
	"review",
	"failed",
	"done",
	"cancelled",
] as const;
export const AUTOMATION_RUN_RESULT_KINDS = [
	"edit-plan",
	"media-asset",
	"project-version",
	"render",
	"report",
	"timeline-version",
] as const;
export const AUTOMATION_RUN_EVENT_TYPES = [
	"created",
	"started",
	"progressed",
	"submitted-for-review",
	"failed",
	"retried",
	"cancelled",
	"approved",
] as const;

export type AutomationRunStatus = (typeof AUTOMATION_RUN_STATUSES)[number];
export type AutomationRunResultKind =
	(typeof AUTOMATION_RUN_RESULT_KINDS)[number];
export type AutomationRunEventType =
	(typeof AUTOMATION_RUN_EVENT_TYPES)[number];

export interface AutomationRunProgress {
	readonly percent: number;
	readonly message: string;
}

export interface AutomationRunFailure {
	readonly code: string;
	readonly reason: string;
	readonly retryable: boolean;
}

export interface AutomationRunResultReference {
	readonly kind: AutomationRunResultKind;
	readonly id: string;
	readonly label: string;
}

export interface AutomationRunApproval {
	readonly approvedAt: string;
	readonly approvedBy: string;
}

export interface AutomationRunCancellation {
	readonly cancelledAt: string;
	readonly cancelledBy: string;
	readonly reason: string;
}

export interface AutomationRunEvent {
	readonly sequence: number;
	readonly type: AutomationRunEventType;
	readonly from: AutomationRunStatus | null;
	readonly to: AutomationRunStatus;
	readonly at: string;
	readonly progress: number;
	readonly retryCount: number;
	readonly detail: string;
}

export interface AutomationRun {
	readonly kind: "visioncut.automation-run";
	readonly schemaVersion: typeof AUTOMATION_RUN_SCHEMA_VERSION;
	readonly runId: string;
	readonly projectId: string;
	readonly automationId: string;
	readonly title: string;
	readonly status: AutomationRunStatus;
	readonly progress: AutomationRunProgress;
	readonly retryCount: number;
	readonly maxRetries: number;
	readonly failure: AutomationRunFailure | null;
	readonly resultReferences: readonly AutomationRunResultReference[];
	readonly approval: AutomationRunApproval | null;
	readonly cancellation: AutomationRunCancellation | null;
	readonly createdAt: string;
	readonly queuedAt: string;
	readonly updatedAt: string;
	readonly startedAt: string | null;
	readonly reviewRequestedAt: string | null;
	readonly failedAt: string | null;
	readonly completedAt: string | null;
	readonly cancelledAt: string | null;
	readonly execution: {
		readonly localOnly: true;
		readonly network: false;
		readonly paidService: false;
	};
	readonly history: readonly AutomationRunEvent[];
}

export interface AutomationRunActionAvailability {
	readonly start: boolean;
	readonly updateProgress: boolean;
	readonly submitForReview: boolean;
	readonly retry: boolean;
	readonly cancel: boolean;
	readonly approve: boolean;
}

export class AutomationRunInvariantError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AutomationRunInvariantError";
	}
}

export class AutomationRunTransitionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AutomationRunTransitionError";
	}
}

const canonicalTimestampSchema = z.string().refine(
	(value) => {
		const milliseconds = Date.parse(value);
		return (
			Number.isFinite(milliseconds) &&
			new Date(milliseconds).toISOString() === value
		);
	},
	{ message: "Timestamp must be a canonical ISO-8601 UTC string." },
);

const requiredTextSchema = z.string().trim().min(1).max(512);
const identifierSchema = z.string().trim().min(1).max(160);
const progressSchema = z
	.object({
		percent: z.number().int().min(0).max(100),
		message: requiredTextSchema,
	})
	.strict();
const failureSchema = z
	.object({
		code: identifierSchema,
		reason: requiredTextSchema,
		retryable: z.boolean(),
	})
	.strict();
const resultReferenceSchema = z
	.object({
		kind: z.enum(AUTOMATION_RUN_RESULT_KINDS),
		id: identifierSchema,
		label: requiredTextSchema,
	})
	.strict();
const approvalSchema = z
	.object({
		approvedAt: canonicalTimestampSchema,
		approvedBy: identifierSchema,
	})
	.strict();
const cancellationSchema = z
	.object({
		cancelledAt: canonicalTimestampSchema,
		cancelledBy: identifierSchema,
		reason: requiredTextSchema,
	})
	.strict();
const eventSchema = z
	.object({
		sequence: z.number().int().positive(),
		type: z.enum(AUTOMATION_RUN_EVENT_TYPES),
		from: z.enum(AUTOMATION_RUN_STATUSES).nullable(),
		to: z.enum(AUTOMATION_RUN_STATUSES),
		at: canonicalTimestampSchema,
		progress: z.number().int().min(0).max(100),
		retryCount: z.number().int().nonnegative(),
		detail: requiredTextSchema,
	})
	.strict();

const automationRunSchema = z
	.object({
		kind: z.literal("visioncut.automation-run"),
		schemaVersion: z.literal(AUTOMATION_RUN_SCHEMA_VERSION),
		runId: identifierSchema,
		projectId: identifierSchema,
		automationId: identifierSchema,
		title: requiredTextSchema,
		status: z.enum(AUTOMATION_RUN_STATUSES),
		progress: progressSchema,
		retryCount: z.number().int().nonnegative(),
		maxRetries: z.number().int().min(0).max(10),
		failure: failureSchema.nullable(),
		resultReferences: z.array(resultReferenceSchema),
		approval: approvalSchema.nullable(),
		cancellation: cancellationSchema.nullable(),
		createdAt: canonicalTimestampSchema,
		queuedAt: canonicalTimestampSchema,
		updatedAt: canonicalTimestampSchema,
		startedAt: canonicalTimestampSchema.nullable(),
		reviewRequestedAt: canonicalTimestampSchema.nullable(),
		failedAt: canonicalTimestampSchema.nullable(),
		completedAt: canonicalTimestampSchema.nullable(),
		cancelledAt: canonicalTimestampSchema.nullable(),
		execution: z
			.object({
				localOnly: z.literal(true),
				network: z.literal(false),
				paidService: z.literal(false),
			})
			.strict(),
		history: z.array(eventSchema).min(1),
	})
	.strict();

function normalizeText({
	value,
	label,
	maxLength = 512,
}: {
	value: string;
	label: string;
	maxLength?: number;
}): string {
	const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
	if (!normalized) {
		throw new AutomationRunInvariantError(`${label} cannot be empty.`);
	}
	if (normalized.length > maxLength) {
		throw new AutomationRunInvariantError(
			`${label} cannot exceed ${maxLength} characters.`,
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
}) {
	const milliseconds = Date.parse(value);
	if (!Number.isFinite(milliseconds)) {
		throw new AutomationRunInvariantError(
			`${label} must be a valid timestamp.`,
		);
	}
	return new Date(milliseconds).toISOString();
}

function normalizeTransitionTimestamp({
	run,
	at,
}: {
	run: AutomationRun;
	at: string;
}): string {
	const normalized = normalizeTimestamp({
		value: at,
		label: "Transition time",
	});
	if (Date.parse(normalized) < Date.parse(run.updatedAt)) {
		throw new AutomationRunTransitionError(
			"Transition time cannot be earlier than the previous event.",
		);
	}
	return normalized;
}

function compareText({ left, right }: { left: string; right: string }): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function normalizeResultReferences({
	references,
}: {
	references: readonly AutomationRunResultReference[];
}): readonly AutomationRunResultReference[] {
	if (references.length === 0) {
		throw new AutomationRunTransitionError(
			"Review requires at least one real result reference.",
		);
	}

	const normalized = references.map((reference) => ({
		kind: reference.kind,
		id: normalizeText({
			value: reference.id,
			label: "Result id",
			maxLength: 160,
		}),
		label: normalizeText({ value: reference.label, label: "Result label" }),
	}));
	const keys = normalized.map(({ kind, id }) => `${kind}:${id}`);
	if (new Set(keys).size !== keys.length) {
		throw new AutomationRunTransitionError(
			"Result references must be unique by kind and id.",
		);
	}

	return normalized.sort((left, right) =>
		compareText({
			left: `${left.kind}:${left.id}`,
			right: `${right.kind}:${right.id}`,
		}),
	);
}

function freezeAutomationRun({ run }: { run: AutomationRun }): AutomationRun {
	return Object.freeze({
		...run,
		progress: Object.freeze({ ...run.progress }),
		failure: run.failure ? Object.freeze({ ...run.failure }) : null,
		resultReferences: Object.freeze(
			run.resultReferences.map((reference) => Object.freeze({ ...reference })),
		),
		approval: run.approval ? Object.freeze({ ...run.approval }) : null,
		cancellation: run.cancellation
			? Object.freeze({ ...run.cancellation })
			: null,
		execution: Object.freeze({ ...run.execution }),
		history: Object.freeze(
			run.history.map((event) => Object.freeze({ ...event })),
		),
	});
}

function appendEvent({
	run,
	type,
	to,
	at,
	progress,
	retryCount,
	detail,
}: {
	run: AutomationRun;
	type: AutomationRunEventType;
	to: AutomationRunStatus;
	at: string;
	progress: number;
	retryCount: number;
	detail: string;
}): readonly AutomationRunEvent[] {
	return [
		...run.history,
		{
			sequence: run.history.length + 1,
			type,
			from: run.status,
			to,
			at,
			progress,
			retryCount,
			detail: normalizeText({ value: detail, label: "Event detail" }),
		},
	];
}

function assertStatus({
	run,
	action,
	allowed,
}: {
	run: AutomationRun;
	action: string;
	allowed: readonly AutomationRunStatus[];
}) {
	if (!allowed.includes(run.status)) {
		throw new AutomationRunTransitionError(
			`${action} is not allowed while a run is ${run.status}.`,
		);
	}
}

function assertTimestampOrder({
	earlier,
	later,
	label,
}: {
	earlier: string;
	later: string;
	label: string;
}) {
	if (Date.parse(later) < Date.parse(earlier)) {
		throw new AutomationRunInvariantError(`${label} is out of order.`);
	}
}

function assertEventTransition({ event }: { event: AutomationRunEvent }): void {
	const transitionIsValid =
		(event.type === "created" &&
			event.from === null &&
			event.to === "queued") ||
		(event.type === "started" &&
			event.from === "queued" &&
			event.to === "running") ||
		(event.type === "progressed" &&
			event.from === "running" &&
			event.to === "running") ||
		(event.type === "submitted-for-review" &&
			event.from === "running" &&
			event.to === "review") ||
		(event.type === "failed" &&
			(event.from === "queued" || event.from === "running") &&
			event.to === "failed") ||
		(event.type === "retried" &&
			event.from === "failed" &&
			event.to === "queued") ||
		(event.type === "cancelled" &&
			(event.from === "queued" ||
				event.from === "running" ||
				event.from === "review") &&
			event.to === "cancelled") ||
		(event.type === "approved" &&
			event.from === "review" &&
			event.to === "done");
	const progressIsValid =
		((event.type === "created" ||
			event.type === "started" ||
			event.type === "retried") &&
			event.progress === 0) ||
		((event.type === "progressed" || event.type === "failed") &&
			event.progress < 100) ||
		((event.type === "submitted-for-review" || event.type === "approved") &&
			event.progress === 100) ||
		event.type === "cancelled";

	if (!transitionIsValid || !progressIsValid) {
		throw new AutomationRunInvariantError(
			`Invalid ${event.type} event transition.`,
		);
	}
}

function assertStatusInvariants({ run }: { run: AutomationRun }): void {
	const hasNoTerminalMetadata =
		run.failure === null &&
		run.approval === null &&
		run.cancellation === null &&
		run.failedAt === null &&
		run.completedAt === null &&
		run.cancelledAt === null;

	if (run.status === "queued") {
		if (
			run.progress.percent !== 0 ||
			run.startedAt !== null ||
			run.reviewRequestedAt !== null ||
			run.resultReferences.length !== 0 ||
			!hasNoTerminalMetadata
		) {
			throw new AutomationRunInvariantError("Queued run metadata is invalid.");
		}
		return;
	}

	if (run.status === "running") {
		if (
			run.startedAt === null ||
			run.reviewRequestedAt !== null ||
			run.progress.percent >= 100 ||
			run.resultReferences.length !== 0 ||
			!hasNoTerminalMetadata
		) {
			throw new AutomationRunInvariantError("Running run metadata is invalid.");
		}
		return;
	}

	if (run.status === "review") {
		if (
			run.startedAt === null ||
			run.reviewRequestedAt === null ||
			run.progress.percent !== 100 ||
			run.resultReferences.length === 0 ||
			!hasNoTerminalMetadata
		) {
			throw new AutomationRunInvariantError("Review run metadata is invalid.");
		}
		return;
	}

	if (run.status === "failed") {
		if (
			run.failure === null ||
			run.failedAt === null ||
			run.progress.percent >= 100 ||
			run.resultReferences.length !== 0 ||
			run.approval !== null ||
			run.cancellation !== null ||
			run.completedAt !== null ||
			run.cancelledAt !== null
		) {
			throw new AutomationRunInvariantError("Failed run metadata is invalid.");
		}
		return;
	}

	if (run.status === "done") {
		if (
			run.startedAt === null ||
			run.reviewRequestedAt === null ||
			run.completedAt === null ||
			run.approval === null ||
			run.approval.approvedAt !== run.completedAt ||
			run.progress.percent !== 100 ||
			run.resultReferences.length === 0 ||
			run.failure !== null ||
			run.cancellation !== null ||
			run.failedAt !== null ||
			run.cancelledAt !== null
		) {
			throw new AutomationRunInvariantError("Done run metadata is invalid.");
		}
		return;
	}

	if (
		run.cancellation === null ||
		run.cancelledAt === null ||
		run.cancellation.cancelledAt !== run.cancelledAt ||
		run.approval !== null ||
		run.failure !== null ||
		run.completedAt !== null ||
		run.failedAt !== null
	) {
		throw new AutomationRunInvariantError("Cancelled run metadata is invalid.");
	}
}

export function assertAutomationRunInvariants({
	run,
}: {
	run: AutomationRun;
}): void {
	const parsed = automationRunSchema.safeParse(run);
	if (!parsed.success) {
		throw new AutomationRunInvariantError(
			parsed.error.issues[0]?.message ?? "Invalid run.",
		);
	}
	if (run.retryCount > run.maxRetries) {
		throw new AutomationRunInvariantError(
			"Retry count cannot exceed the configured maximum.",
		);
	}
	if (
		!run.execution.localOnly ||
		run.execution.network ||
		run.execution.paidService
	) {
		throw new AutomationRunInvariantError(
			"Automation runs must remain local and free.",
		);
	}

	const first = run.history[0];
	if (
		first.type !== "created" ||
		first.sequence !== 1 ||
		first.from !== null ||
		first.to !== "queued" ||
		first.at !== run.createdAt ||
		first.progress !== 0 ||
		first.retryCount !== 0
	) {
		throw new AutomationRunInvariantError(
			"Run must start with a queued creation event.",
		);
	}

	let previous = first;
	assertEventTransition({ event: first });
	for (let index = 1; index < run.history.length; index += 1) {
		const event = run.history[index];
		const expectedRetryCount =
			event.type === "retried" ? previous.retryCount + 1 : previous.retryCount;
		if (
			event.sequence !== index + 1 ||
			event.from !== previous.to ||
			Date.parse(event.at) < Date.parse(previous.at) ||
			event.retryCount !== expectedRetryCount
		) {
			throw new AutomationRunInvariantError(
				"Run event history is not contiguous.",
			);
		}
		assertEventTransition({ event });
		previous = event;
	}

	if (
		previous.to !== run.status ||
		previous.at !== run.updatedAt ||
		previous.progress !== run.progress.percent ||
		previous.retryCount !== run.retryCount
	) {
		throw new AutomationRunInvariantError(
			"Current state must match the final history event.",
		);
	}

	const resultKeys = run.resultReferences.map(
		({ kind, id }) => `${kind}:${id}`,
	);
	if (new Set(resultKeys).size !== resultKeys.length) {
		throw new AutomationRunInvariantError("Result references must be unique.");
	}

	assertTimestampOrder({
		earlier: run.createdAt,
		later: run.queuedAt,
		label: "Queued timestamp",
	});
	assertTimestampOrder({
		earlier: run.createdAt,
		later: run.updatedAt,
		label: "Updated timestamp",
	});
	if (run.startedAt) {
		assertTimestampOrder({
			earlier: run.queuedAt,
			later: run.startedAt,
			label: "Started timestamp",
		});
	}
	if (run.reviewRequestedAt && run.startedAt) {
		assertTimestampOrder({
			earlier: run.startedAt,
			later: run.reviewRequestedAt,
			label: "Review timestamp",
		});
	}
	if (run.completedAt && run.reviewRequestedAt) {
		assertTimestampOrder({
			earlier: run.reviewRequestedAt,
			later: run.completedAt,
			label: "Completion timestamp",
		});
	}
	assertStatusInvariants({ run });
}

function finalizeAutomationRun({ run }: { run: AutomationRun }): AutomationRun {
	assertAutomationRunInvariants({ run });
	return freezeAutomationRun({ run });
}

export function createAutomationRun({
	runId,
	projectId,
	automationId,
	title,
	createdAt,
	maxRetries = 2,
}: {
	runId: string;
	projectId: string;
	automationId: string;
	title: string;
	createdAt: string;
	maxRetries?: number;
}): AutomationRun {
	if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 10) {
		throw new AutomationRunInvariantError(
			"Maximum retries must be an integer from 0 to 10.",
		);
	}
	const at = normalizeTimestamp({ value: createdAt, label: "Creation time" });
	const progress = { percent: 0, message: "Queued locally" } as const;
	return finalizeAutomationRun({
		run: {
			kind: "visioncut.automation-run",
			schemaVersion: AUTOMATION_RUN_SCHEMA_VERSION,
			runId: normalizeText({ value: runId, label: "Run id", maxLength: 160 }),
			projectId: normalizeText({
				value: projectId,
				label: "Project id",
				maxLength: 160,
			}),
			automationId: normalizeText({
				value: automationId,
				label: "Automation id",
				maxLength: 160,
			}),
			title: normalizeText({ value: title, label: "Run title" }),
			status: "queued",
			progress,
			retryCount: 0,
			maxRetries,
			failure: null,
			resultReferences: [],
			approval: null,
			cancellation: null,
			createdAt: at,
			queuedAt: at,
			updatedAt: at,
			startedAt: null,
			reviewRequestedAt: null,
			failedAt: null,
			completedAt: null,
			cancelledAt: null,
			execution: { localOnly: true, network: false, paidService: false },
			history: [
				{
					sequence: 1,
					type: "created",
					from: null,
					to: "queued",
					at,
					progress: 0,
					retryCount: 0,
					detail: progress.message,
				},
			],
		},
	});
}

export function startAutomationRun({
	run,
	at,
	message = "Running locally",
}: {
	run: AutomationRun;
	at: string;
	message?: string;
}): AutomationRun {
	assertAutomationRunInvariants({ run });
	assertStatus({ run, action: "Start", allowed: ["queued"] });
	const timestamp = normalizeTransitionTimestamp({ run, at });
	const detail = normalizeText({ value: message, label: "Progress message" });
	return finalizeAutomationRun({
		run: {
			...run,
			status: "running",
			progress: { percent: 0, message: detail },
			updatedAt: timestamp,
			startedAt: timestamp,
			history: appendEvent({
				run,
				type: "started",
				to: "running",
				at: timestamp,
				progress: 0,
				retryCount: run.retryCount,
				detail,
			}),
		},
	});
}

export function updateAutomationRunProgress({
	run,
	at,
	percent,
	message,
}: {
	run: AutomationRun;
	at: string;
	percent: number;
	message: string;
}): AutomationRun {
	assertAutomationRunInvariants({ run });
	assertStatus({ run, action: "Update progress", allowed: ["running"] });
	if (
		!Number.isInteger(percent) ||
		percent < run.progress.percent ||
		percent > 99
	) {
		throw new AutomationRunTransitionError(
			"Running progress must be a non-decreasing integer from 0 to 99.",
		);
	}
	const timestamp = normalizeTransitionTimestamp({ run, at });
	const detail = normalizeText({ value: message, label: "Progress message" });
	return finalizeAutomationRun({
		run: {
			...run,
			progress: { percent, message: detail },
			updatedAt: timestamp,
			history: appendEvent({
				run,
				type: "progressed",
				to: "running",
				at: timestamp,
				progress: percent,
				retryCount: run.retryCount,
				detail,
			}),
		},
	});
}

export function submitAutomationRunForReview({
	run,
	at,
	resultReferences,
	message = "Ready for review",
}: {
	run: AutomationRun;
	at: string;
	resultReferences: readonly AutomationRunResultReference[];
	message?: string;
}): AutomationRun {
	assertAutomationRunInvariants({ run });
	assertStatus({ run, action: "Submit for review", allowed: ["running"] });
	const timestamp = normalizeTransitionTimestamp({ run, at });
	const detail = normalizeText({ value: message, label: "Review message" });
	const references = normalizeResultReferences({
		references: resultReferences,
	});
	return finalizeAutomationRun({
		run: {
			...run,
			status: "review",
			progress: { percent: 100, message: detail },
			resultReferences: references,
			updatedAt: timestamp,
			reviewRequestedAt: timestamp,
			history: appendEvent({
				run,
				type: "submitted-for-review",
				to: "review",
				at: timestamp,
				progress: 100,
				retryCount: run.retryCount,
				detail,
			}),
		},
	});
}

export function failAutomationRun({
	run,
	at,
	code,
	reason,
	retryable,
}: {
	run: AutomationRun;
	at: string;
	code: string;
	reason: string;
	retryable: boolean;
}): AutomationRun {
	assertAutomationRunInvariants({ run });
	assertStatus({ run, action: "Fail", allowed: ["queued", "running"] });
	const timestamp = normalizeTransitionTimestamp({ run, at });
	const failure = {
		code: normalizeText({ value: code, label: "Failure code", maxLength: 160 }),
		reason: normalizeText({ value: reason, label: "Failure reason" }),
		retryable,
	};
	return finalizeAutomationRun({
		run: {
			...run,
			status: "failed",
			progress: { percent: run.progress.percent, message: failure.reason },
			failure,
			resultReferences: [],
			updatedAt: timestamp,
			failedAt: timestamp,
			history: appendEvent({
				run,
				type: "failed",
				to: "failed",
				at: timestamp,
				progress: run.progress.percent,
				retryCount: run.retryCount,
				detail: failure.reason,
			}),
		},
	});
}

export function retryAutomationRun({
	run,
	at,
}: {
	run: AutomationRun;
	at: string;
}): AutomationRun {
	assertAutomationRunInvariants({ run });
	assertStatus({ run, action: "Retry", allowed: ["failed"] });
	if (!run.failure?.retryable) {
		throw new AutomationRunTransitionError("This failure is not retryable.");
	}
	if (run.retryCount >= run.maxRetries) {
		throw new AutomationRunTransitionError("The retry limit has been reached.");
	}
	const timestamp = normalizeTransitionTimestamp({ run, at });
	const retryCount = run.retryCount + 1;
	const detail = `Queued for retry ${retryCount}`;
	return finalizeAutomationRun({
		run: {
			...run,
			status: "queued",
			progress: { percent: 0, message: detail },
			retryCount,
			failure: null,
			resultReferences: [],
			approval: null,
			cancellation: null,
			queuedAt: timestamp,
			updatedAt: timestamp,
			startedAt: null,
			reviewRequestedAt: null,
			failedAt: null,
			completedAt: null,
			cancelledAt: null,
			history: appendEvent({
				run,
				type: "retried",
				to: "queued",
				at: timestamp,
				progress: 0,
				retryCount,
				detail,
			}),
		},
	});
}

export function cancelAutomationRun({
	run,
	at,
	cancelledBy,
	reason,
}: {
	run: AutomationRun;
	at: string;
	cancelledBy: string;
	reason: string;
}): AutomationRun {
	assertAutomationRunInvariants({ run });
	assertStatus({
		run,
		action: "Cancel",
		allowed: ["queued", "running", "review"],
	});
	const timestamp = normalizeTransitionTimestamp({ run, at });
	const cancellation = {
		cancelledAt: timestamp,
		cancelledBy: normalizeText({
			value: cancelledBy,
			label: "Cancellation actor",
			maxLength: 160,
		}),
		reason: normalizeText({ value: reason, label: "Cancellation reason" }),
	};
	return finalizeAutomationRun({
		run: {
			...run,
			status: "cancelled",
			progress: {
				percent: run.progress.percent,
				message: cancellation.reason,
			},
			cancellation,
			updatedAt: timestamp,
			cancelledAt: timestamp,
			history: appendEvent({
				run,
				type: "cancelled",
				to: "cancelled",
				at: timestamp,
				progress: run.progress.percent,
				retryCount: run.retryCount,
				detail: cancellation.reason,
			}),
		},
	});
}

export function approveAutomationRun({
	run,
	at,
	approvedBy,
}: {
	run: AutomationRun;
	at: string;
	approvedBy: string;
}): AutomationRun {
	assertAutomationRunInvariants({ run });
	assertStatus({ run, action: "Approve", allowed: ["review"] });
	if (run.resultReferences.length === 0) {
		throw new AutomationRunTransitionError(
			"A run cannot be approved without a result reference.",
		);
	}
	const timestamp = normalizeTransitionTimestamp({ run, at });
	const actor = normalizeText({
		value: approvedBy,
		label: "Approval actor",
		maxLength: 160,
	});
	const detail = `Approved by ${actor}`;
	return finalizeAutomationRun({
		run: {
			...run,
			status: "done",
			progress: { percent: 100, message: detail },
			approval: { approvedAt: timestamp, approvedBy: actor },
			updatedAt: timestamp,
			completedAt: timestamp,
			history: appendEvent({
				run,
				type: "approved",
				to: "done",
				at: timestamp,
				progress: 100,
				retryCount: run.retryCount,
				detail,
			}),
		},
	});
}

export function canRetryAutomationRun({
	run,
}: {
	run: AutomationRun;
}): boolean {
	return (
		run.status === "failed" &&
		run.failure?.retryable === true &&
		run.retryCount < run.maxRetries
	);
}

export function canCancelAutomationRun({
	run,
}: {
	run: AutomationRun;
}): boolean {
	return (
		run.status === "queued" ||
		run.status === "running" ||
		run.status === "review"
	);
}

export function canApproveAutomationRun({
	run,
}: {
	run: AutomationRun;
}): boolean {
	return run.status === "review" && run.resultReferences.length > 0;
}

export function isTerminalAutomationRun({
	run,
}: {
	run: AutomationRun;
}): boolean {
	return (
		run.status === "done" ||
		run.status === "cancelled" ||
		(run.status === "failed" && !canRetryAutomationRun({ run }))
	);
}

export function selectAutomationRunActions({
	run,
}: {
	run: AutomationRun;
}): AutomationRunActionAvailability {
	return {
		start: run.status === "queued",
		updateProgress: run.status === "running",
		submitForReview: run.status === "running",
		retry: canRetryAutomationRun({ run }),
		cancel: canCancelAutomationRun({ run }),
		approve: canApproveAutomationRun({ run }),
	};
}

export function selectAutomationRunsByStatus({
	runs,
	status,
}: {
	runs: readonly AutomationRun[];
	status: AutomationRunStatus;
}): readonly AutomationRun[] {
	return runs.filter((run) => run.status === status);
}

export function selectActiveAutomationRuns({
	runs,
}: {
	runs: readonly AutomationRun[];
}): readonly AutomationRun[] {
	return runs.filter(
		(run) =>
			run.status === "queued" ||
			run.status === "running" ||
			run.status === "review",
	);
}

export function selectAutomationRunById({
	runs,
	runId,
}: {
	runs: readonly AutomationRun[];
	runId: string;
}): AutomationRun | null {
	return runs.find((run) => run.runId === runId) ?? null;
}

export function serializeAutomationRun({
	run,
}: {
	run: AutomationRun;
}): string {
	assertAutomationRunInvariants({ run });
	return JSON.stringify(run);
}

export function parseAutomationRun({
	value,
}: {
	value: unknown;
}): AutomationRun {
	const parsed = automationRunSchema.safeParse(value);
	if (!parsed.success) {
		throw new AutomationRunInvariantError(
			parsed.error.issues[0]?.message ?? "Stored automation run is invalid.",
		);
	}
	const run: AutomationRun = parsed.data;
	return finalizeAutomationRun({ run });
}

export function deserializeAutomationRun({
	serialized,
}: {
	serialized: string;
}): AutomationRun {
	let value: unknown;
	try {
		value = JSON.parse(serialized);
	} catch {
		throw new AutomationRunInvariantError(
			"Stored automation run is not valid JSON.",
		);
	}
	return parseAutomationRun({ value });
}
