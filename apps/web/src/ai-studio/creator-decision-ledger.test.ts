import { describe, expect, test } from "bun:test";
import {
	appendCreatorDecisionEvent,
	createCreatorDecisionEvent,
	createCreatorDecisionLedger,
	deleteCreatorDecisionEvent,
	deriveCreatorDecisionPreferences,
	exportCreatorDecisionLedger,
	revokeCreatorDecisionEvent,
	setCreatorDecisionLedgerEnabled,
	type CreatorDecisionAction,
	type CreatorDecisionPreferenceEvidence,
	type CreatorDecisionSourceKind,
} from "./creator-decision-ledger";

const PROJECT_ID = "project-ledger-test";

function createEvent({
	eventId,
	action = "approve",
	occurredAt = "2026-07-01T00:00:00.000Z",
	sourceKind = "edit-decision",
	preferences = [{ key: "rhythm", value: "fast" }],
	reversesEventId,
}: {
	eventId: string;
	action?: CreatorDecisionAction;
	occurredAt?: string;
	sourceKind?: CreatorDecisionSourceKind;
	preferences?: readonly CreatorDecisionPreferenceEvidence[];
	reversesEventId?: string;
}) {
	return createCreatorDecisionEvent({
		eventId,
		projectId: PROJECT_ID,
		action,
		occurredAt,
		source: {
			kind: sourceKind,
			sourceId: `source-${eventId}`,
			surface: sourceKind === "export" ? "export-center" : "edit-review",
		},
		preferences,
		reversesEventId,
	});
}

function appendEvents(
	...events: ReturnType<typeof createCreatorDecisionEvent>[]
) {
	let ledger = createCreatorDecisionLedger({
		projectId: PROJECT_ID,
		createdAt: "2026-06-01T00:00:00.000Z",
	});
	for (const event of events) {
		ledger = appendCreatorDecisionEvent({ ledger, event });
	}
	return ledger;
}

describe("Creator decision ledger", () => {
	test("records only an explicit project-scoped user decision contract", () => {
		const event = createEvent({ eventId: "event-approved" });

		expect(event.projectId).toBe(PROJECT_ID);
		expect(event.consent).toEqual({
			explicit: true,
			actor: "user",
			initiatedBy: "approve-control",
		});
		expect(event.lifecycle).toEqual({
			revocable: true,
			deletable: true,
		});
		expect(event.privacy.scope).toBe("project");
		expect(event.privacy.storage).toBe("local-browser");
		expect(event.privacy.prohibited).toEqual([
			"raw-media",
			"transcript-full-text",
			"api-key",
			"provider-secret",
			"unreviewed-model-inference",
		]);
		expect("payload" in event).toBe(false);
		expect("transcript" in event).toBe(false);
		expect("media" in event).toBe(false);
	});

	test("rejects credentials, media payloads and free-form source text", () => {
		expect(() =>
			createEvent({
				eventId: "event-secret",
				preferences: [
					{ key: "visualStyle", value: "apiKey=credential-placeholder-12345" },
				],
			}),
		).toThrow("privacy boundary");
		expect(() =>
			createEvent({
				eventId: "event-media",
				preferences: [
					{
						key: "visualStyle",
						value: "data:video/mp4;base64,AAAA",
					},
				],
			}),
		).toThrow("privacy boundary");
		expect(() =>
			createCreatorDecisionEvent({
				eventId: "event-source-text",
				projectId: PROJECT_ID,
				action: "approve",
				source: {
					kind: "edit-decision",
					sourceId: "把整段字幕全文放进来",
					surface: "edit-review",
				},
			}),
		).toThrow("opaque identifier");
	});

	test("rejects unsupported implicit observation actions at runtime", () => {
		const event = createEvent({ eventId: "event-mutated" });
		Reflect.set(event, "action", "analyze");

		expect(() =>
			appendCreatorDecisionEvent({
				ledger: createCreatorDecisionLedger({ projectId: PROJECT_ID }),
				event,
			}),
		).toThrow("explicit user decision");
	});

	test("rejects runtime payload injection or weakened consent metadata", () => {
		const withPayload = createEvent({ eventId: "event-payload" });
		Reflect.set(withPayload, "payload", {
			transcriptText: "private transcript",
		});
		expect(() =>
			appendCreatorDecisionEvent({
				ledger: createCreatorDecisionLedger({ projectId: PROJECT_ID }),
				event: withPayload,
			}),
		).toThrow("unsupported fields");

		const withoutConsent = createEvent({ eventId: "event-consent" });
		Reflect.set(withoutConsent.consent, "explicit", false);
		expect(() =>
			appendCreatorDecisionEvent({
				ledger: createCreatorDecisionLedger({ projectId: PROJECT_ID }),
				event: withoutConsent,
			}),
		).toThrow("explicit user consent");
	});

	test("keeps every event inside its project ledger", () => {
		const foreignEvent = createCreatorDecisionEvent({
			eventId: "event-foreign",
			projectId: "another-project",
			action: "apply",
			source: {
				kind: "rough-cut",
				sourceId: "rough-cut-1",
				surface: "timeline",
			},
		});

		expect(() =>
			appendCreatorDecisionEvent({
				ledger: createCreatorDecisionLedger({ projectId: PROJECT_ID }),
				event: foreignEvent,
			}),
		).toThrow("does not belong");
	});

	test("pauses recording without deleting existing user decisions", () => {
		const first = createEvent({ eventId: "event-before-pause" });
		const ledger = appendEvents(first);
		const paused = setCreatorDecisionLedgerEnabled({
			ledger,
			enabled: false,
			at: "2026-07-02T00:00:00.000Z",
		});
		const afterAttempt = appendCreatorDecisionEvent({
			ledger: paused,
			event: createEvent({ eventId: "event-while-paused" }),
		});

		expect(afterAttempt).toBe(paused);
		expect(afterAttempt.events).toEqual([first]);
	});

	test("supports reversible revocation and permanent single-event deletion", () => {
		const ledger = appendEvents(
			createEvent({ eventId: "event-keep" }),
			createEvent({ eventId: "event-remove" }),
		);
		const revoked = revokeCreatorDecisionEvent({
			ledger,
			eventId: "event-keep",
			at: "2026-07-03T00:00:00.000Z",
		});
		const deleted = deleteCreatorDecisionEvent({
			ledger: revoked,
			eventId: "event-remove",
			at: "2026-07-04T00:00:00.000Z",
		});

		expect(revoked.events[0]?.lifecycle.revokedAt).toBe(
			"2026-07-03T00:00:00.000Z",
		);
		expect(deleted.events.map((event) => event.id)).toEqual(["event-keep"]);
		expect(deleted.revision).toBe(4);
	});

	test("an explicit undo removes its target from preference evidence", () => {
		const applied = createEvent({
			eventId: "event-apply",
			action: "apply",
		});
		const undo = createEvent({
			eventId: "event-undo",
			action: "undo",
			occurredAt: "2026-07-02T00:00:00.000Z",
			preferences: [],
			reversesEventId: applied.id,
		});
		const result = deriveCreatorDecisionPreferences({
			ledgers: [appendEvents(applied, undo)],
			asOf: "2026-07-03T00:00:00.000Z",
		});

		expect(result.eligibleEventCount).toBe(1);
		expect(result.preferences).toEqual({});
		expect(result.policy.ignoresReversedEvents).toBe(true);
	});

	test("requires an undo target from the same ledger", () => {
		const undo = createEvent({
			eventId: "event-orphan-undo",
			action: "undo",
			preferences: [],
			reversesEventId: "missing-apply",
		});

		expect(() => appendEvents(undo)).toThrow("Undo target does not exist");
	});

	test("links one idempotent undo to one apply and rejects duplicate active undos", () => {
		const applied = createEvent({
			eventId: "event-apply-once",
			action: "apply",
		});
		const undo = createEvent({
			eventId: "event-undo-once",
			action: "undo",
			preferences: [],
			reversesEventId: applied.id,
		});
		const ledger = appendEvents(applied, undo);
		const repeated = appendCreatorDecisionEvent({ ledger, event: undo });
		const competingUndo = createEvent({
			eventId: "event-undo-twice",
			action: "undo",
			preferences: [],
			reversesEventId: applied.id,
		});

		expect(repeated).toBe(ledger);
		expect(ledger.events[1]?.reversal?.reversesEventId).toBe(applied.id);
		expect(() =>
			appendCreatorDecisionEvent({ ledger, event: competingUndo }),
		).toThrow("already has an active undo");
	});

	test("allows undo events to reverse apply events only", () => {
		const approved = createEvent({
			eventId: "event-approved-not-applied",
			action: "approve",
		});
		const undo = createEvent({
			eventId: "event-invalid-undo",
			action: "undo",
			preferences: [],
			reversesEventId: approved.id,
		});

		expect(() => appendEvents(approved, undo)).toThrow(
			"only reverse an apply event",
		);
	});

	test("derives explainable preferences with source counts and time decay", () => {
		const olderApprove = createEvent({
			eventId: "event-old-approve",
			action: "approve",
			occurredAt: "2026-01-01T00:00:00.000Z",
			sourceKind: "confirmed-plan",
		});
		const recentApply = createEvent({
			eventId: "event-recent-apply",
			action: "apply",
			occurredAt: "2026-06-30T00:00:00.000Z",
			sourceKind: "rough-cut",
		});
		const recentReject = createEvent({
			eventId: "event-recent-reject",
			action: "reject",
			occurredAt: "2026-06-30T12:00:00.000Z",
			preferences: [{ key: "rhythm", value: "calm" }],
		});
		const result = deriveCreatorDecisionPreferences({
			ledgers: [appendEvents(olderApprove, recentApply, recentReject)],
			asOf: "2026-07-01T00:00:00.000Z",
			halfLifeDays: 90,
		});
		const rhythm = result.preferences.rhythm;

		expect(rhythm?.value).toBe("fast");
		expect(rhythm?.sampleCount).toBe(2);
		expect(rhythm?.effectiveSampleCount).toBeLessThan(2);
		expect(rhythm?.effectiveSampleCount).toBeGreaterThan(1);
		expect(rhythm?.sourceEventIds).toEqual([
			"event-recent-apply",
			"event-old-approve",
		]);
		expect(rhythm?.sources[0]?.source.kind).toBe("rough-cut");
		expect(rhythm?.explanation).toContain("2 次明确用户动作");
		expect(rhythm?.explanation).toContain("90 天半衰期");
		expect(result.policy.explicitUserActionsOnly).toBe(true);
	});

	test("treats an explicit rejection as opposing evidence, not a preference", () => {
		const approved = createEvent({
			eventId: "event-approve-fast",
			action: "approve",
			occurredAt: "2026-07-01T00:00:00.000Z",
		});
		const rejected = createEvent({
			eventId: "event-reject-fast",
			action: "reject",
			occurredAt: "2026-07-02T00:00:00.000Z",
		});
		const result = deriveCreatorDecisionPreferences({
			ledgers: [appendEvents(approved, rejected)],
			asOf: "2026-07-03T00:00:00.000Z",
		});

		expect(result.eligibleEventCount).toBe(2);
		expect(result.preferences.rhythm).toBeUndefined();
	});

	test("uses an export confirmation as explicit positive evidence", () => {
		const event = createEvent({
			eventId: "event-export",
			action: "export-confirm",
			sourceKind: "export",
			preferences: [
				{ key: "platform", value: "Bilibili" },
				{ key: "aspectRatio", value: "16:9" },
			],
		});
		const result = deriveCreatorDecisionPreferences({
			ledgers: [appendEvents(event)],
			asOf: event.occurredAt,
		});

		expect(result.preferences.platform?.value).toBe("Bilibili");
		expect(result.preferences.platform?.sources[0]?.action).toBe(
			"export-confirm",
		);
		expect(result.preferences.aspectRatio?.supportWeight).toBe(1.15);
	});

	test("ignores revoked decisions while retaining evidence recorded before pause", () => {
		const event = createEvent({ eventId: "event-revoked" });
		const revoked = revokeCreatorDecisionEvent({
			ledger: appendEvents(event),
			eventId: event.id,
			at: "2026-07-02T00:00:00.000Z",
		});
		const disabled = setCreatorDecisionLedgerEnabled({
			ledger: appendEvents(createEvent({ eventId: "event-disabled-project" })),
			enabled: false,
		});
		const result = deriveCreatorDecisionPreferences({
			ledgers: [revoked, disabled],
			asOf: "2026-07-03T00:00:00.000Z",
		});

		expect(result.eligibleEventCount).toBe(1);
		expect(result.preferences.rhythm?.value).toBe("fast");
	});

	test("exports inspectable JSON without private content fields", () => {
		const exported = exportCreatorDecisionLedger(
			appendEvents(
				createEvent({
					eventId: "event-export-json",
					preferences: [
						{ key: "audioPriority", value: "voice" },
						{ key: "visualStyle", value: "clean-editorial" },
					],
				}),
			),
		);

		expect(exported).toContain("visioncut.creator-decision-ledger/v1");
		expect(exported).toContain('"explicit": true');
		expect(exported).not.toContain("rawMedia");
		expect(exported).not.toContain("transcriptText");
		expect(exported).not.toContain("apiKey");
	});
});
