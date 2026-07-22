import { describe, expect, test } from "bun:test";
import { AUTOMATION_RECIPES, type StudioCapabilityId } from "./catalog";
import {
	EDIT_PLAN_DOMAIN_ORDER,
	EditPlanInvariantError,
	applyApprovedEditPlanOperations,
	approveAllEditPlanOperations,
	approveEditPlanOperation,
	assertEditPlanInvariants,
	createEditPlanSnapshot,
	createVersionedEditPlan,
	getEditPlanOperation,
	getEditPlanOperations,
	rejectAllEditPlanOperations,
	rejectEditPlanOperation,
	serializeEditPlan,
	undoEditPlanApplication,
	type VersionedEditPlan,
} from "./edit-plan";

function createTalkingHeadPlan(): VersionedEditPlan {
	return createVersionedEditPlan({
		intent: "把这段知识口播剪得紧凑自然，先给我审阅方案",
		workflow: "talking-head-cleanup",
	});
}

function operationIdFor({
	plan,
	capabilityId,
}: {
	plan: VersionedEditPlan;
	capabilityId: StudioCapabilityId;
}): string {
	const operation = getEditPlanOperations(plan).find(
		(item) => item.capabilityId === capabilityId,
	);
	if (!operation) throw new Error(`Missing operation: ${capabilityId}`);
	return operation.id;
}

describe("VisionCut reviewable edit plan", () => {
	test("creates a complete local-only plan from intent and workflow", () => {
		const plan = createTalkingHeadPlan();
		const recipe = AUTOMATION_RECIPES.find(
			(item) => item.id === "talking-head-cleanup",
		);

		expect(recipe).toBeDefined();
		expect(plan.groups.map((group) => group.domain)).toEqual(
			EDIT_PLAN_DOMAIN_ORDER,
		);
		expect(getEditPlanOperations(plan)).toHaveLength(
			recipe?.capabilityIds.length ?? 0,
		);
		expect(
			getEditPlanOperations(plan).every(
				(operation) => operation.status === "proposed",
			),
		).toBe(true);
		expect(
			getEditPlanOperations(plan).every(
				(operation) =>
					operation.target.length > 0 &&
					operation.reason.includes("不代表已经分析素材") &&
					operation.expectedImpact.includes("不修改视频") &&
					operation.risk.description.length > 0,
			),
		).toBe(true);
		expect(plan.basis.mediaAnalyzed).toBe(false);
		expect(plan.basis.deterministic).toBe(true);
		expect(plan.requirements).toEqual({
			network: false,
			paidService: false,
			apiKey: false,
		});
		expect(plan.applicationScope).toBe("review-state-only");
		expect(() => assertEditPlanInvariants(plan)).not.toThrow();
	});

	test("is deterministic for normalized equivalent inputs", () => {
		const first = createVersionedEditPlan({
			intent: "  旅行   Vlog 做成自然纪录片  ",
			workflow: "travel-vlog",
		});
		const second = createVersionedEditPlan({
			intent: "旅行 Vlog 做成自然纪录片",
			workflow: { id: "travel-vlog" },
		});
		const different = createVersionedEditPlan({
			intent: "旅行 Vlog 做成快速预告片",
			workflow: "travel-vlog",
		});

		expect(first).toEqual(second);
		expect(first.planId).toBe(second.planId);
		expect(first.versionId).toBe(second.versionId);
		expect(first.planId).not.toBe(different.planId);
	});

	test("approves and rejects one operation through immutable revisions", () => {
		const original = createTalkingHeadPlan();
		const operationId = operationIdFor({
			plan: original,
			capabilityId: "remove-fillers",
		});
		const originalJson = JSON.stringify(original);
		const approved = approveEditPlanOperation({ plan: original, operationId });
		const rejected = rejectEditPlanOperation({ plan: approved, operationId });

		expect(getEditPlanOperation({ plan: original, operationId }).status).toBe(
			"proposed",
		);
		expect(getEditPlanOperation({ plan: approved, operationId }).status).toBe(
			"approved",
		);
		expect(getEditPlanOperation({ plan: rejected, operationId }).status).toBe(
			"rejected",
		);
		expect(original.revision).toBe(1);
		expect(approved.revision).toBe(2);
		expect(rejected.revision).toBe(3);
		expect(approved.versionId).not.toBe(original.versionId);
		expect(rejected.versionId).not.toBe(approved.versionId);
		expect(JSON.stringify(original)).toBe(originalJson);
		expect(approved).not.toBe(original);
		expect(approveEditPlanOperation({ plan: approved, operationId })).toBe(
			approved,
		);
	});

	test("supports approve-all and domain-scoped reject-all", () => {
		const original = createTalkingHeadPlan();
		const approved = approveAllEditPlanOperations({ plan: original });
		const rejectedEdit = rejectAllEditPlanOperations({
			plan: approved,
			domains: ["edit"],
		});

		expect(
			getEditPlanOperations(approved).every(
				(operation) => operation.status === "approved",
			),
		).toBe(true);
		expect(approved.revision).toBe(original.revision + 1);
		expect(
			getEditPlanOperations(rejectedEdit)
				.filter((operation) => operation.domain === "edit")
				.every((operation) => operation.status === "rejected"),
		).toBe(true);
		expect(
			getEditPlanOperations(rejectedEdit)
				.filter((operation) => operation.domain !== "edit")
				.every((operation) => operation.status === "approved"),
		).toBe(true);
	});

	test("creates deterministic, independent version snapshots", () => {
		const plan = approveAllEditPlanOperations({
			plan: createTalkingHeadPlan(),
		});
		const first = createEditPlanSnapshot({ plan, label: "导演审阅版" });
		const second = createEditPlanSnapshot({ plan, label: "导演审阅版" });
		const later = rejectEditPlanOperation({
			plan,
			operationId: operationIdFor({
				plan,
				capabilityId: "remove-fillers",
			}),
		});

		expect(first).toEqual(second);
		expect(first.snapshotId).toBe(second.snapshotId);
		expect(first.plan).not.toBe(plan);
		expect(first.plan).toEqual(plan);
		expect(first.versionId).toBe(plan.versionId);
		expect(first.plan.versionId).not.toBe(later.versionId);
		expect(JSON.parse(JSON.stringify(first))).toEqual(first);
	});

	test("applies only approved operations and emits a serializable undo receipt", () => {
		const proposed = createTalkingHeadPlan();
		const fillerId = operationIdFor({
			plan: proposed,
			capabilityId: "remove-fillers",
		});
		const captionId = operationIdFor({
			plan: proposed,
			capabilityId: "keyword-captions",
		});
		const rejectedId = operationIdFor({
			plan: proposed,
			capabilityId: "insert-broll",
		});
		const approvedFiller = approveEditPlanOperation({
			plan: proposed,
			operationId: fillerId,
		});
		const reviewed = rejectEditPlanOperation({
			plan: approveEditPlanOperation({
				plan: approvedFiller,
				operationId: captionId,
			}),
			operationId: rejectedId,
		});
		const result = applyApprovedEditPlanOperations({ plan: reviewed });

		expect(
			getEditPlanOperation({ plan: result.plan, operationId: fillerId }).status,
		).toBe("applied");
		expect(
			getEditPlanOperation({ plan: result.plan, operationId: captionId })
				.status,
		).toBe("applied");
		expect(
			getEditPlanOperation({ plan: result.plan, operationId: rejectedId })
				.status,
		).toBe("rejected");
		expect(
			result.undoReceipt.changes.map((change) => change.operationId),
		).toEqual([fillerId, captionId]);
		expect(result.undoReceipt.applicationScope).toBe("review-state-only");
		expect(result.undoReceipt.fromVersionId).toBe(reviewed.versionId);
		expect(result.undoReceipt.toVersionId).toBe(result.plan.versionId);
		expect(JSON.parse(JSON.stringify(result.undoReceipt))).toEqual(
			result.undoReceipt,
		);
		expect(
			getEditPlanOperation({ plan: reviewed, operationId: fillerId }).status,
		).toBe("approved");
	});

	test("undo restores approved states as a new immutable version", () => {
		const approved = approveAllEditPlanOperations({
			plan: createTalkingHeadPlan(),
		});
		const fillerId = operationIdFor({
			plan: approved,
			capabilityId: "remove-fillers",
		});
		const captionId = operationIdFor({
			plan: approved,
			capabilityId: "keyword-captions",
		});
		const applied = applyApprovedEditPlanOperations({
			plan: approved,
			operationIds: [fillerId, captionId],
		});
		const undone = undoEditPlanApplication({
			plan: applied.plan,
			receipt: applied.undoReceipt,
		});

		expect(
			getEditPlanOperation({ plan: undone, operationId: fillerId }).status,
		).toBe("approved");
		expect(
			getEditPlanOperation({ plan: undone, operationId: captionId }).status,
		).toBe("approved");
		expect(undone.revision).toBe(applied.plan.revision + 1);
		expect(undone.versionId).not.toBe(applied.plan.versionId);
		expect(
			getEditPlanOperation({ plan: applied.plan, operationId: fillerId })
				.status,
		).toBe("applied");
		expect(() =>
			undoEditPlanApplication({
				plan: undone,
				receipt: applied.undoReceipt,
			}),
		).toThrow("stale");
	});

	test("enforces review and application transition invariants", () => {
		const proposed = createTalkingHeadPlan();
		const operationId = operationIdFor({
			plan: proposed,
			capabilityId: "remove-fillers",
		});

		expect(() => applyApprovedEditPlanOperations({ plan: proposed })).toThrow(
			"No approved operations",
		);
		expect(() =>
			approveEditPlanOperation({
				plan: proposed,
				operationId: "missing-operation",
			}),
		).toThrow(EditPlanInvariantError);

		const approved = approveEditPlanOperation({ plan: proposed, operationId });
		const applied = applyApprovedEditPlanOperations({
			plan: approved,
			operationIds: [operationId],
		});
		expect(() =>
			rejectEditPlanOperation({ plan: applied.plan, operationId }),
		).toThrow("must be undone");
		expect(() =>
			applyApprovedEditPlanOperations({
				plan: applied.plan,
				operationIds: [operationId],
			}),
		).toThrow("must be approved");
	});

	test("serializes as plain IndexedDB-safe data without APIs or runtime objects", () => {
		const plan = approveAllEditPlanOperations({
			plan: createTalkingHeadPlan(),
		});
		const serialized = serializeEditPlan(plan);
		const stored = JSON.parse(serialized);

		expect(stored).toEqual(plan);
		expect(serialized).not.toContain("Date(");
		expect(serialized).not.toContain("function");
		expect(serialized).not.toContain('apiKey":true');
		expect(serialized).not.toContain('network":true');
	});

	test("rejects empty intent before creating a plan", () => {
		expect(() =>
			createVersionedEditPlan({
				intent: "  \n\t ",
				workflow: "talking-head-cleanup",
			}),
		).toThrow("Intent cannot be empty");
	});
});
