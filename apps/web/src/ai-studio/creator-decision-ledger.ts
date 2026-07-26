import { IndexedDBAdapter } from "@/services/storage/indexeddb-adapter";

export const CREATOR_DECISION_LEDGER_FORMAT =
	"visioncut.creator-decision-ledger/v1";
export const CREATOR_DECISION_EVENT_FORMAT =
	"visioncut.creator-decision-event/v1";
export const CREATOR_DECISION_DERIVATION_FORMAT =
	"visioncut.creator-decision-derivation/v1";
export const CREATOR_DECISION_LEDGER_UPDATED_EVENT =
	"visioncut:creator-decision-ledger-updated";
export const DEFAULT_CREATOR_DECISION_HALF_LIFE_DAYS = 90;

export type CreatorDecisionAction =
	| "approve"
	| "reject"
	| "apply"
	| "undo"
	| "export-confirm";

export type CreatorDecisionSourceKind =
	| "confirmed-plan"
	| "edit-decision"
	| "rough-cut"
	| "story-graph"
	| "export"
	| "manual-preference";

export type CreatorDecisionSurface =
	| "director-review"
	| "edit-review"
	| "timeline"
	| "story-canvas"
	| "export-center"
	| "creator-dna";

export type CreatorDecisionPreferenceKey =
	| "rhythm"
	| "captionDensity"
	| "audioPriority"
	| "visualStyle"
	| "platform"
	| "aspectRatio";

export type CreatorDecisionPreferenceDirection = "support" | "oppose";

export interface CreatorDecisionPreferenceEvidence {
	key: CreatorDecisionPreferenceKey;
	value: string;
}

export interface CreatorDecisionEventSource {
	kind: CreatorDecisionSourceKind;
	sourceId: string;
	surface: CreatorDecisionSurface;
}

export interface CreatorDecisionPrivacyBoundary {
	scope: "project";
	storage: "local-browser";
	allowed: readonly [
		"opaque-source-id",
		"decision-action",
		"structured-preference",
		"timestamps",
	];
	prohibited: readonly [
		"raw-media",
		"transcript-full-text",
		"api-key",
		"provider-secret",
		"unreviewed-model-inference",
	];
}

export interface CreatorDecisionLedgerEvent {
	id: string;
	formatVersion: typeof CREATOR_DECISION_EVENT_FORMAT;
	projectId: string;
	action: CreatorDecisionAction;
	occurredAt: string;
	recordedAt: string;
	source: CreatorDecisionEventSource;
	preferences: readonly CreatorDecisionPreferenceEvidence[];
	consent: {
		explicit: true;
		actor: "user";
		initiatedBy:
			| "approve-control"
			| "reject-control"
			| "apply-control"
			| "undo-control"
			| "export-confirmation";
	};
	reversal?: {
		reversesEventId: string;
	};
	lifecycle: {
		revocable: true;
		deletable: true;
		revokedAt?: string;
	};
	privacy: CreatorDecisionPrivacyBoundary;
}

export interface CreatorDecisionLedger {
	id: string;
	formatVersion: typeof CREATOR_DECISION_LEDGER_FORMAT;
	projectId: string;
	enabled: boolean;
	revision: number;
	createdAt: string;
	updatedAt: string;
	events: readonly CreatorDecisionLedgerEvent[];
	privacy: CreatorDecisionPrivacyBoundary;
}

export interface CreateCreatorDecisionEventInput {
	eventId?: string;
	projectId: string;
	action: CreatorDecisionAction;
	occurredAt?: string;
	recordedAt?: string;
	source: CreatorDecisionEventSource;
	preferences?: readonly CreatorDecisionPreferenceEvidence[];
	reversesEventId?: string;
}

export interface CreatorDecisionDerivedSource {
	eventId: string;
	projectId: string;
	action: CreatorDecisionAction;
	direction: CreatorDecisionPreferenceDirection;
	occurredAt: string;
	source: CreatorDecisionEventSource;
	decayWeight: number;
}

export interface CreatorDecisionDerivedPreference {
	key: CreatorDecisionPreferenceKey;
	value: string;
	confidence: number;
	sampleCount: number;
	effectiveSampleCount: number;
	supportWeight: number;
	opposeWeight: number;
	lastEvidenceAt: string;
	sourceEventIds: readonly string[];
	sources: readonly CreatorDecisionDerivedSource[];
	explanation: string;
}

export interface CreatorDecisionDerivation {
	formatVersion: typeof CREATOR_DECISION_DERIVATION_FORMAT;
	asOf: string;
	halfLifeDays: number;
	eligibleEventCount: number;
	preferences: Partial<
		Record<CreatorDecisionPreferenceKey, CreatorDecisionDerivedPreference>
	>;
	policy: {
		explicitUserActionsOnly: true;
		projectScopedSources: true;
		timeDecayApplied: true;
		ignoresRevokedEvents: true;
		ignoresReversedEvents: true;
	};
}

const ledgerAdapter = new IndexedDBAdapter<CreatorDecisionLedger>({
	dbName: "visioncut-creator-decision-ledger",
	storeName: "project-ledgers",
	version: 1,
});
const memoryLedgers = new Map<string, CreatorDecisionLedger>();

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const SECRET_PATTERN =
	/(?:\bsk-[A-Za-z0-9_-]{8,}\b|\bapi[_ -]?key\b|\bauthorization\s*:|\bbearer\s+[A-Za-z0-9._-]{8,}|-----BEGIN [A-Z ]+PRIVATE KEY-----)/iu;
const DATA_URL_PATTERN = /^data:(?:video|audio|image)\//iu;
const PREFERENCE_KEYS = new Set<CreatorDecisionPreferenceKey>([
	"rhythm",
	"captionDensity",
	"audioPriority",
	"visualStyle",
	"platform",
	"aspectRatio",
]);
const ACTIONS = new Set<CreatorDecisionAction>([
	"approve",
	"reject",
	"apply",
	"undo",
	"export-confirm",
]);
const SOURCE_KINDS = new Set<CreatorDecisionSourceKind>([
	"confirmed-plan",
	"edit-decision",
	"rough-cut",
	"story-graph",
	"export",
	"manual-preference",
]);
const SURFACES = new Set<CreatorDecisionSurface>([
	"director-review",
	"edit-review",
	"timeline",
	"story-canvas",
	"export-center",
	"creator-dna",
]);
const DAY_MS = 86_400_000;

interface PreferenceAccumulator {
	key: CreatorDecisionPreferenceKey;
	value: string;
	sampleCount: number;
	effectiveSampleCount: number;
	supportWeight: number;
	opposeWeight: number;
	lastEvidenceAt: string;
	sources: CreatorDecisionDerivedSource[];
	actionCounts: Record<CreatorDecisionAction, number>;
}

function nowIso(): string {
	return new Date().toISOString();
}

function canUseIndexedDB(): boolean {
	return typeof indexedDB !== "undefined";
}

function round({
	value,
	digits = 3,
}: {
	value: number;
	digits?: number;
}): number {
	const scale = 10 ** digits;
	return Math.round(value * scale) / scale;
}

function latestTimestamp({
	left,
	right,
}: {
	left: string;
	right: string;
}): string {
	return left >= right ? left : right;
}

function createPrivacyBoundary(): CreatorDecisionPrivacyBoundary {
	return {
		scope: "project",
		storage: "local-browser",
		allowed: [
			"opaque-source-id",
			"decision-action",
			"structured-preference",
			"timestamps",
		],
		prohibited: [
			"raw-media",
			"transcript-full-text",
			"api-key",
			"provider-secret",
			"unreviewed-model-inference",
		],
	};
}

function assertExactKeys({
	value,
	allowed,
	label,
}: {
	value: object;
	allowed: readonly string[];
	label: string;
}): void {
	const allowedKeys = new Set(allowed);
	const extraKeys = Object.keys(value).filter((key) => !allowedKeys.has(key));
	if (extraKeys.length > 0) {
		throw new Error(
			`${label} contains unsupported fields: ${extraKeys.join(", ")}`,
		);
	}
}

function assertPrivacyBoundary(privacy: CreatorDecisionPrivacyBoundary): void {
	assertExactKeys({
		value: privacy,
		allowed: ["scope", "storage", "allowed", "prohibited"],
		label: "Decision privacy boundary",
	});
	const expected = createPrivacyBoundary();
	if (
		privacy.scope !== expected.scope ||
		privacy.storage !== expected.storage ||
		privacy.allowed.join("\u0000") !== expected.allowed.join("\u0000") ||
		privacy.prohibited.join("\u0000") !== expected.prohibited.join("\u0000")
	) {
		throw new Error("Decision privacy boundary was changed or weakened");
	}
}

function assertIdentifier({
	value,
	label,
}: {
	value: string;
	label: string;
}): string {
	if (typeof value !== "string") {
		throw new Error(`${label} must be a string`);
	}
	const normalized = value.trim();
	if (!IDENTIFIER_PATTERN.test(normalized)) {
		throw new Error(
			`${label} must be an opaque identifier using letters, numbers, dot, colon, dash or underscore`,
		);
	}
	if (SECRET_PATTERN.test(normalized)) {
		throw new Error(`${label} must not contain a credential`);
	}
	return normalized;
}

function assertIsoTimestamp({
	value,
	label,
}: {
	value: string;
	label: string;
}): string {
	if (typeof value !== "string") {
		throw new Error(`${label} must be a string`);
	}
	const timestamp = Date.parse(value);
	if (!Number.isFinite(timestamp)) {
		throw new Error(`${label} must be an ISO timestamp`);
	}
	return new Date(timestamp).toISOString();
}

function normalizePreferenceValue({
	key,
	value,
}: CreatorDecisionPreferenceEvidence): string {
	if (typeof value !== "string") {
		throw new Error(`${key} must be a string`);
	}
	const normalized = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
	if (!normalized || Array.from(normalized).length > 80) {
		throw new Error(`${key} must contain between 1 and 80 characters`);
	}
	if (SECRET_PATTERN.test(normalized) || DATA_URL_PATTERN.test(normalized)) {
		throw new Error(`${key} contains data excluded by the privacy boundary`);
	}
	if (
		key === "rhythm" &&
		!new Set(["calm", "balanced", "fast"]).has(normalized)
	) {
		throw new Error("rhythm must be calm, balanced or fast");
	}
	if (
		key === "captionDensity" &&
		!new Set(["minimal", "balanced", "dense"]).has(normalized)
	) {
		throw new Error("captionDensity must be minimal, balanced or dense");
	}
	if (
		key === "audioPriority" &&
		!new Set(["voice", "music", "ambient"]).has(normalized)
	) {
		throw new Error("audioPriority must be voice, music or ambient");
	}
	if (
		key === "aspectRatio" &&
		!/^[1-9]\d{0,2}:[1-9]\d{0,2}$/u.test(normalized)
	) {
		throw new Error("aspectRatio must use a width:height value");
	}
	return normalized;
}

function normalizePreferences(
	preferences: readonly CreatorDecisionPreferenceEvidence[],
): CreatorDecisionPreferenceEvidence[] {
	if (preferences.length > PREFERENCE_KEYS.size) {
		throw new Error("A decision event may include at most six preferences");
	}
	const seen = new Set<CreatorDecisionPreferenceKey>();
	return preferences.map((preference) => {
		assertExactKeys({
			value: preference,
			allowed: ["key", "value"],
			label: "Decision preference",
		});
		if (!PREFERENCE_KEYS.has(preference.key)) {
			throw new Error("Unsupported Creator DNA preference");
		}
		if (seen.has(preference.key)) {
			throw new Error(`Duplicate preference ${preference.key}`);
		}
		seen.add(preference.key);
		return {
			key: preference.key,
			value: normalizePreferenceValue(preference),
		};
	});
}

function initiatedByAction(
	action: CreatorDecisionAction,
): CreatorDecisionLedgerEvent["consent"]["initiatedBy"] {
	switch (action) {
		case "approve":
			return "approve-control";
		case "reject":
			return "reject-control";
		case "apply":
			return "apply-control";
		case "undo":
			return "undo-control";
		case "export-confirm":
			return "export-confirmation";
	}
}

function assertSource(
	source: CreatorDecisionEventSource,
): CreatorDecisionEventSource {
	assertExactKeys({
		value: source,
		allowed: ["kind", "sourceId", "surface"],
		label: "Decision source",
	});
	if (!SOURCE_KINDS.has(source.kind)) {
		throw new Error("Unsupported decision source");
	}
	if (!SURFACES.has(source.surface)) {
		throw new Error("Unsupported decision surface");
	}
	return {
		kind: source.kind,
		sourceId: assertIdentifier({
			value: source.sourceId,
			label: "sourceId",
		}),
		surface: source.surface,
	};
}

function assertEventAction(event: CreatorDecisionLedgerEvent): void {
	if (!ACTIONS.has(event.action)) {
		throw new Error("Only explicit user decision actions may be recorded");
	}
	if (event.action === "export-confirm" && event.source.kind !== "export") {
		throw new Error("export-confirm events must come from an export source");
	}
	if (event.action === "undo" && !event.reversal) {
		throw new Error("undo events must identify the event they reverse");
	}
	if (event.action !== "undo" && event.reversal) {
		throw new Error("Only undo events may reverse another event");
	}
}

function assertEvent(event: CreatorDecisionLedgerEvent): void {
	assertExactKeys({
		value: event,
		allowed: [
			"id",
			"formatVersion",
			"projectId",
			"action",
			"occurredAt",
			"recordedAt",
			"source",
			"preferences",
			"consent",
			"reversal",
			"lifecycle",
			"privacy",
		],
		label: "Decision event",
	});
	if (event.formatVersion !== CREATOR_DECISION_EVENT_FORMAT) {
		throw new Error("Unsupported decision event format");
	}
	assertIdentifier({ value: event.id, label: "eventId" });
	assertIdentifier({ value: event.projectId, label: "projectId" });
	const occurredAt = assertIsoTimestamp({
		value: event.occurredAt,
		label: "occurredAt",
	});
	const recordedAt = assertIsoTimestamp({
		value: event.recordedAt,
		label: "recordedAt",
	});
	if (recordedAt < occurredAt) {
		throw new Error("recordedAt cannot be earlier than occurredAt");
	}
	const source = assertSource(event.source);
	if (
		source.sourceId !== event.source.sourceId ||
		JSON.stringify(normalizePreferences(event.preferences)) !==
			JSON.stringify(event.preferences)
	) {
		throw new Error("Decision event contains non-normalized stored values");
	}
	assertEventAction(event);
	assertExactKeys({
		value: event.consent,
		allowed: ["explicit", "actor", "initiatedBy"],
		label: "Decision consent",
	});
	if (
		event.consent.explicit !== true ||
		event.consent.actor !== "user" ||
		event.consent.initiatedBy !== initiatedByAction(event.action)
	) {
		throw new Error("Decision event must preserve explicit user consent");
	}
	assertExactKeys({
		value: event.lifecycle,
		allowed: ["revocable", "deletable", "revokedAt"],
		label: "Decision lifecycle",
	});
	if (
		event.lifecycle.revocable !== true ||
		event.lifecycle.deletable !== true
	) {
		throw new Error("Decision events must remain revocable and deletable");
	}
	if (event.lifecycle.revokedAt) {
		const revokedAt = assertIsoTimestamp({
			value: event.lifecycle.revokedAt,
			label: "revokedAt",
		});
		if (revokedAt < occurredAt) {
			throw new Error("revokedAt cannot be earlier than occurredAt");
		}
	}
	assertPrivacyBoundary(event.privacy);
	if (event.reversal) {
		assertExactKeys({
			value: event.reversal,
			allowed: ["reversesEventId"],
			label: "Decision reversal",
		});
	}
	if (
		event.reversal &&
		assertIdentifier({
			value: event.reversal.reversesEventId,
			label: "reversesEventId",
		}) === event.id
	) {
		throw new Error("An event cannot reverse itself");
	}
}

function assertLedger(ledger: CreatorDecisionLedger): void {
	assertExactKeys({
		value: ledger,
		allowed: [
			"id",
			"formatVersion",
			"projectId",
			"enabled",
			"revision",
			"createdAt",
			"updatedAt",
			"events",
			"privacy",
		],
		label: "Decision ledger",
	});
	if (ledger.formatVersion !== CREATOR_DECISION_LEDGER_FORMAT) {
		throw new Error("Unsupported decision ledger format");
	}
	assertIdentifier({ value: ledger.id, label: "ledgerId" });
	assertIdentifier({ value: ledger.projectId, label: "projectId" });
	if (ledger.id !== ledger.projectId) {
		throw new Error("Ledger id must match its project scope");
	}
	if (typeof ledger.enabled !== "boolean") {
		throw new Error("Ledger enabled state must be boolean");
	}
	if (!Number.isInteger(ledger.revision) || ledger.revision < 0) {
		throw new Error("Ledger revision must be a non-negative integer");
	}
	const createdAt = assertIsoTimestamp({
		value: ledger.createdAt,
		label: "createdAt",
	});
	const updatedAt = assertIsoTimestamp({
		value: ledger.updatedAt,
		label: "updatedAt",
	});
	if (updatedAt < createdAt) {
		throw new Error("Ledger updatedAt cannot be earlier than createdAt");
	}
	assertPrivacyBoundary(ledger.privacy);
	const ids = new Set<string>();
	for (const event of ledger.events) {
		assertEvent(event);
		if (event.projectId !== ledger.projectId) {
			throw new Error("Every decision event must match the ledger project");
		}
		if (ids.has(event.id)) {
			throw new Error(`Duplicate decision event ${event.id}`);
		}
		ids.add(event.id);
	}
	const activeUndoTargets = new Set<string>();
	for (const event of ledger.events) {
		if (!event.reversal) continue;
		const target = ledger.events.find(
			(candidate) => candidate.id === event.reversal?.reversesEventId,
		);
		if (!target || target.action !== "apply") {
			throw new Error("Stored undo event must reference an apply event");
		}
		if (!event.lifecycle.revokedAt) {
			if (activeUndoTargets.has(target.id)) {
				throw new Error(
					"An apply event cannot have multiple active undo events",
				);
			}
			activeUndoTargets.add(target.id);
		}
	}
}

function dispatchLedgerUpdated(ledger: CreatorDecisionLedger): void {
	if (typeof window === "undefined") return;
	window.dispatchEvent(
		new CustomEvent(CREATOR_DECISION_LEDGER_UPDATED_EVENT, {
			detail: {
				projectId: ledger.projectId,
				revision: ledger.revision,
			},
		}),
	);
}

function directionForAction(
	action: CreatorDecisionAction,
): CreatorDecisionPreferenceDirection {
	return action === "reject" || action === "undo" ? "oppose" : "support";
}

function actionWeight(action: CreatorDecisionAction): number {
	switch (action) {
		case "approve":
			return 0.8;
		case "reject":
			return 0.8;
		case "apply":
			return 1;
		case "undo":
			return 0.7;
		case "export-confirm":
			return 1.15;
	}
}

function createActionCounts(): Record<CreatorDecisionAction, number> {
	return {
		approve: 0,
		reject: 0,
		apply: 0,
		undo: 0,
		"export-confirm": 0,
	};
}

function preferenceAccumulatorKey({
	key,
	value,
}: {
	key: CreatorDecisionPreferenceKey;
	value: string;
}): string {
	return `${key}\u0000${value}`;
}

function preferenceExplanation({
	accumulator,
	halfLifeDays,
}: {
	accumulator: PreferenceAccumulator;
	halfLifeDays: number;
}): string {
	const counts = accumulator.actionCounts;
	return [
		`基于 ${accumulator.sampleCount} 次明确用户动作`,
		`批准 ${counts.approve}`,
		`拒绝 ${counts.reject}`,
		`应用 ${counts.apply}`,
		`撤销 ${counts.undo}`,
		`导出确认 ${counts["export-confirm"]}`,
		`按 ${halfLifeDays} 天半衰期计算`,
		`净支持 ${round({ value: accumulator.supportWeight - accumulator.opposeWeight })}`,
	].join("；");
}

export function createCreatorDecisionLedger({
	projectId,
	createdAt = nowIso(),
}: {
	projectId: string;
	createdAt?: string;
}): CreatorDecisionLedger {
	const normalizedProjectId = assertIdentifier({
		value: projectId,
		label: "projectId",
	});
	const timestamp = assertIsoTimestamp({
		value: createdAt,
		label: "createdAt",
	});
	return {
		id: normalizedProjectId,
		formatVersion: CREATOR_DECISION_LEDGER_FORMAT,
		projectId: normalizedProjectId,
		enabled: true,
		revision: 0,
		createdAt: timestamp,
		updatedAt: timestamp,
		events: [],
		privacy: createPrivacyBoundary(),
	};
}

export function createCreatorDecisionEvent({
	eventId = crypto.randomUUID(),
	projectId,
	action,
	occurredAt = nowIso(),
	recordedAt = occurredAt,
	source,
	preferences = [],
	reversesEventId,
}: CreateCreatorDecisionEventInput): CreatorDecisionLedgerEvent {
	if (!ACTIONS.has(action)) {
		throw new Error("Only explicit user decision actions may be recorded");
	}
	const event: CreatorDecisionLedgerEvent = {
		id: assertIdentifier({ value: eventId, label: "eventId" }),
		formatVersion: CREATOR_DECISION_EVENT_FORMAT,
		projectId: assertIdentifier({ value: projectId, label: "projectId" }),
		action,
		occurredAt: assertIsoTimestamp({
			value: occurredAt,
			label: "occurredAt",
		}),
		recordedAt: assertIsoTimestamp({
			value: recordedAt,
			label: "recordedAt",
		}),
		source: assertSource(source),
		preferences: normalizePreferences(preferences),
		consent: {
			explicit: true,
			actor: "user",
			initiatedBy: initiatedByAction(action),
		},
		...(reversesEventId
			? {
					reversal: {
						reversesEventId: assertIdentifier({
							value: reversesEventId,
							label: "reversesEventId",
						}),
					},
				}
			: {}),
		lifecycle: {
			revocable: true,
			deletable: true,
		},
		privacy: createPrivacyBoundary(),
	};
	assertEvent(event);
	return event;
}

export function appendCreatorDecisionEvent({
	ledger,
	event,
}: {
	ledger: CreatorDecisionLedger;
	event: CreatorDecisionLedgerEvent;
}): CreatorDecisionLedger {
	assertLedger(ledger);
	assertEvent(event);
	if (!ledger.enabled) return ledger;
	if (ledger.projectId !== event.projectId) {
		throw new Error("Decision event does not belong to this project");
	}
	const existing = ledger.events.find((candidate) => candidate.id === event.id);
	if (existing) {
		if (JSON.stringify(existing) === JSON.stringify(event)) return ledger;
		throw new Error(`Decision event id ${event.id} is already in use`);
	}
	if (event.reversal) {
		const target = ledger.events.find(
			(candidate) => candidate.id === event.reversal?.reversesEventId,
		);
		if (!target) {
			throw new Error("Undo target does not exist in this project ledger");
		}
		if (target.action !== "apply") {
			throw new Error("Undo events may only reverse an apply event");
		}
		if (target.lifecycle.revokedAt) {
			throw new Error("Undo target has already been revoked");
		}
		const activeUndo = ledger.events.find(
			(candidate) =>
				candidate.action === "undo" &&
				!candidate.lifecycle.revokedAt &&
				candidate.reversal?.reversesEventId === target.id,
		);
		if (activeUndo) {
			throw new Error(`Apply event ${target.id} already has an active undo`);
		}
	}
	return {
		...ledger,
		revision: ledger.revision + 1,
		updatedAt: latestTimestamp({
			left: ledger.updatedAt,
			right: event.recordedAt,
		}),
		events: [...ledger.events, event],
	};
}

export function setCreatorDecisionLedgerEnabled({
	ledger,
	enabled,
	at = nowIso(),
}: {
	ledger: CreatorDecisionLedger;
	enabled: boolean;
	at?: string;
}): CreatorDecisionLedger {
	assertLedger(ledger);
	if (ledger.enabled === enabled) return ledger;
	return {
		...ledger,
		enabled,
		revision: ledger.revision + 1,
		updatedAt: latestTimestamp({
			left: ledger.updatedAt,
			right: assertIsoTimestamp({ value: at, label: "updatedAt" }),
		}),
	};
}

export function revokeCreatorDecisionEvent({
	ledger,
	eventId,
	at = nowIso(),
}: {
	ledger: CreatorDecisionLedger;
	eventId: string;
	at?: string;
}): CreatorDecisionLedger {
	assertLedger(ledger);
	const normalizedEventId = assertIdentifier({
		value: eventId,
		label: "eventId",
	});
	const eventIndex = ledger.events.findIndex(
		(event) => event.id === normalizedEventId,
	);
	if (eventIndex < 0) throw new Error("Decision event was not found");
	const event = ledger.events[eventIndex];
	if (!event || event.lifecycle.revokedAt) return ledger;
	const revokedAt = assertIsoTimestamp({ value: at, label: "revokedAt" });
	const events = ledger.events.map((candidate, index) =>
		index === eventIndex
			? {
					...candidate,
					lifecycle: {
						...candidate.lifecycle,
						revokedAt,
					},
				}
			: candidate,
	);
	return {
		...ledger,
		revision: ledger.revision + 1,
		updatedAt: latestTimestamp({
			left: ledger.updatedAt,
			right: revokedAt,
		}),
		events,
	};
}

export function deleteCreatorDecisionEvent({
	ledger,
	eventId,
	at = nowIso(),
}: {
	ledger: CreatorDecisionLedger;
	eventId: string;
	at?: string;
}): CreatorDecisionLedger {
	assertLedger(ledger);
	const normalizedEventId = assertIdentifier({
		value: eventId,
		label: "eventId",
	});
	if (!ledger.events.some((event) => event.id === normalizedEventId)) {
		return ledger;
	}
	const updatedAt = assertIsoTimestamp({ value: at, label: "updatedAt" });
	return {
		...ledger,
		revision: ledger.revision + 1,
		updatedAt: latestTimestamp({
			left: ledger.updatedAt,
			right: updatedAt,
		}),
		events: ledger.events.filter(
			(event) =>
				event.id !== normalizedEventId &&
				event.reversal?.reversesEventId !== normalizedEventId,
		),
	};
}

export function deriveCreatorDecisionPreferences({
	ledgers,
	asOf = nowIso(),
	halfLifeDays = DEFAULT_CREATOR_DECISION_HALF_LIFE_DAYS,
}: {
	ledgers: readonly CreatorDecisionLedger[];
	asOf?: string;
	halfLifeDays?: number;
}): CreatorDecisionDerivation {
	const normalizedAsOf = assertIsoTimestamp({
		value: asOf,
		label: "asOf",
	});
	if (
		!Number.isFinite(halfLifeDays) ||
		halfLifeDays < 1 ||
		halfLifeDays > 3_650
	) {
		throw new Error("halfLifeDays must be between 1 and 3650");
	}
	const asOfMs = Date.parse(normalizedAsOf);
	const accumulators = new Map<string, PreferenceAccumulator>();
	let eligibleEventCount = 0;

	for (const ledger of ledgers) {
		assertLedger(ledger);
		const activeEvents = ledger.events.filter(
			(event) => !event.lifecycle.revokedAt,
		);
		const reversedEventIds = new Set(
			activeEvents
				.filter((event) => event.action === "undo")
				.flatMap((event) =>
					event.reversal ? [event.reversal.reversesEventId] : [],
				),
		);
		for (const event of activeEvents) {
			if (reversedEventIds.has(event.id)) continue;
			eligibleEventCount += 1;
			const occurredAtMs = Date.parse(event.occurredAt);
			const ageDays = Math.max(0, (asOfMs - occurredAtMs) / DAY_MS);
			const decayWeight = 0.5 ** (ageDays / halfLifeDays);
			const direction = directionForAction(event.action);
			const weightedEvidence = decayWeight * actionWeight(event.action);

			for (const preference of event.preferences) {
				const accumulatorId = preferenceAccumulatorKey({
					key: preference.key,
					value: preference.value,
				});
				const accumulator = accumulators.get(accumulatorId) ?? {
					key: preference.key,
					value: preference.value,
					sampleCount: 0,
					effectiveSampleCount: 0,
					supportWeight: 0,
					opposeWeight: 0,
					lastEvidenceAt: event.occurredAt,
					sources: [],
					actionCounts: createActionCounts(),
				};
				accumulator.sampleCount += 1;
				accumulator.effectiveSampleCount += decayWeight;
				accumulator.actionCounts[event.action] += 1;
				if (direction === "support") {
					accumulator.supportWeight += weightedEvidence;
				} else {
					accumulator.opposeWeight += weightedEvidence;
				}
				if (event.occurredAt > accumulator.lastEvidenceAt) {
					accumulator.lastEvidenceAt = event.occurredAt;
				}
				accumulator.sources.push({
					eventId: event.id,
					projectId: event.projectId,
					action: event.action,
					direction,
					occurredAt: event.occurredAt,
					source: event.source,
					decayWeight: round({ value: decayWeight }),
				});
				accumulators.set(accumulatorId, accumulator);
			}
		}
	}

	const winners = new Map<
		CreatorDecisionPreferenceKey,
		PreferenceAccumulator
	>();
	for (const accumulator of accumulators.values()) {
		const netSupport = accumulator.supportWeight - accumulator.opposeWeight;
		if (netSupport <= 0 || accumulator.supportWeight <= 0) continue;
		const current = winners.get(accumulator.key);
		const currentNet = current
			? current.supportWeight - current.opposeWeight
			: Number.NEGATIVE_INFINITY;
		if (
			!current ||
			netSupport > currentNet ||
			(netSupport === currentNet && accumulator.value < current.value)
		) {
			winners.set(accumulator.key, accumulator);
		}
	}

	const preferences: CreatorDecisionDerivation["preferences"] = {};
	for (const [key, accumulator] of winners) {
		const totalWeight = accumulator.supportWeight + accumulator.opposeWeight;
		const consistency =
			totalWeight > 0 ? accumulator.supportWeight / totalWeight : 0;
		const evidenceCoverage = 1 - Math.exp(-accumulator.effectiveSampleCount);
		const confidence = Math.min(
			0.98,
			0.2 + 0.78 * consistency * evidenceCoverage,
		);
		const sources = [...accumulator.sources].sort(
			(left, right) =>
				right.occurredAt.localeCompare(left.occurredAt) ||
				left.eventId.localeCompare(right.eventId),
		);
		preferences[key] = {
			key,
			value: accumulator.value,
			confidence: round({ value: confidence }),
			sampleCount: accumulator.sampleCount,
			effectiveSampleCount: round({
				value: accumulator.effectiveSampleCount,
			}),
			supportWeight: round({ value: accumulator.supportWeight }),
			opposeWeight: round({ value: accumulator.opposeWeight }),
			lastEvidenceAt: accumulator.lastEvidenceAt,
			sourceEventIds: sources.map((source) => source.eventId),
			sources,
			explanation: preferenceExplanation({
				accumulator,
				halfLifeDays,
			}),
		};
	}

	return {
		formatVersion: CREATOR_DECISION_DERIVATION_FORMAT,
		asOf: normalizedAsOf,
		halfLifeDays,
		eligibleEventCount,
		preferences,
		policy: {
			explicitUserActionsOnly: true,
			projectScopedSources: true,
			timeDecayApplied: true,
			ignoresRevokedEvents: true,
			ignoresReversedEvents: true,
		},
	};
}

export async function loadCreatorDecisionLedger(
	projectId: string,
): Promise<CreatorDecisionLedger> {
	const normalizedProjectId = assertIdentifier({
		value: projectId,
		label: "projectId",
	});
	const stored = canUseIndexedDB()
		? await ledgerAdapter.get(normalizedProjectId)
		: (memoryLedgers.get(normalizedProjectId) ?? null);
	if (!stored) {
		return createCreatorDecisionLedger({ projectId: normalizedProjectId });
	}
	assertLedger(stored);
	return structuredClone(stored);
}

export async function saveCreatorDecisionLedger(
	ledger: CreatorDecisionLedger,
): Promise<void> {
	assertLedger(ledger);
	if (canUseIndexedDB()) {
		await ledgerAdapter.set({ key: ledger.projectId, value: ledger });
	} else {
		memoryLedgers.set(ledger.projectId, structuredClone(ledger));
	}
	dispatchLedgerUpdated(ledger);
}

export async function recordCreatorDecisionEvent(
	event: CreatorDecisionLedgerEvent,
): Promise<CreatorDecisionLedger> {
	const current = await loadCreatorDecisionLedger(event.projectId);
	const next = appendCreatorDecisionEvent({ ledger: current, event });
	if (next !== current) await saveCreatorDecisionLedger(next);
	return next;
}

export async function setStoredCreatorDecisionLedgerEnabled({
	projectId,
	enabled,
	at,
}: {
	projectId: string;
	enabled: boolean;
	at?: string;
}): Promise<CreatorDecisionLedger> {
	const current = await loadCreatorDecisionLedger(projectId);
	const next = setCreatorDecisionLedgerEnabled({
		ledger: current,
		enabled,
		...(at === undefined ? {} : { at }),
	});
	if (next !== current) await saveCreatorDecisionLedger(next);
	return next;
}

export async function revokeStoredCreatorDecisionEvent({
	projectId,
	eventId,
	at,
}: {
	projectId: string;
	eventId: string;
	at?: string;
}): Promise<CreatorDecisionLedger> {
	const current = await loadCreatorDecisionLedger(projectId);
	const next = revokeCreatorDecisionEvent({
		ledger: current,
		eventId,
		...(at === undefined ? {} : { at }),
	});
	if (next !== current) await saveCreatorDecisionLedger(next);
	return next;
}

export async function deleteStoredCreatorDecisionEvent({
	projectId,
	eventId,
	at,
}: {
	projectId: string;
	eventId: string;
	at?: string;
}): Promise<CreatorDecisionLedger> {
	const current = await loadCreatorDecisionLedger(projectId);
	const next = deleteCreatorDecisionEvent({
		ledger: current,
		eventId,
		...(at === undefined ? {} : { at }),
	});
	if (next !== current) await saveCreatorDecisionLedger(next);
	return next;
}

export async function loadAllCreatorDecisionLedgers(): Promise<
	CreatorDecisionLedger[]
> {
	const ledgers = canUseIndexedDB()
		? await ledgerAdapter.getAll()
		: [...memoryLedgers.values()].map((ledger) => structuredClone(ledger));
	for (const ledger of ledgers) assertLedger(ledger);
	return ledgers.sort((left, right) =>
		left.projectId.localeCompare(right.projectId),
	);
}

export async function deleteCreatorDecisionLedger(
	projectId: string,
): Promise<void> {
	const normalizedProjectId = assertIdentifier({
		value: projectId,
		label: "projectId",
	});
	if (canUseIndexedDB()) {
		await ledgerAdapter.remove(normalizedProjectId);
	} else {
		memoryLedgers.delete(normalizedProjectId);
	}
}

export async function clearCreatorDecisionLedgers(): Promise<void> {
	if (canUseIndexedDB()) {
		await ledgerAdapter.clear();
	} else {
		memoryLedgers.clear();
	}
}

export function exportCreatorDecisionLedger(
	ledger: CreatorDecisionLedger,
): string {
	assertLedger(ledger);
	return JSON.stringify(ledger, null, 2);
}
