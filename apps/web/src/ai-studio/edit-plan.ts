import {
	AUTOMATION_RECIPES,
	STUDIO_CAPABILITIES,
	type AutomationRecipe,
	type AutomationRecipeId,
	type StudioCapabilityId,
} from "./catalog";

export const EDIT_PLAN_SCHEMA_VERSION = 1 as const;
export const EDIT_PLAN_DOMAIN_ORDER = [
	"story",
	"edit",
	"color",
	"sound",
	"growth",
] as const;

export type EditPlanDomain = (typeof EDIT_PLAN_DOMAIN_ORDER)[number];
export type EditPlanOperationStatus =
	| "proposed"
	| "approved"
	| "rejected"
	| "applied";
export type EditPlanReviewDecision = "approved" | "rejected";
export type EditPlanRiskLevel = "low" | "medium" | "high";

export interface EditPlanRisk {
	level: EditPlanRiskLevel;
	description: string;
}

export interface ReviewableEditPlanOperation {
	id: string;
	workflowIndex: number;
	domain: EditPlanDomain;
	capabilityId: StudioCapabilityId;
	title: string;
	target: string;
	reason: string;
	expectedImpact: string;
	risk: EditPlanRisk;
	status: EditPlanOperationStatus;
}

export interface EditPlanOperationGroup {
	domain: EditPlanDomain;
	label: string;
	objective: string;
	operations: readonly ReviewableEditPlanOperation[];
}

export interface VersionedEditPlan {
	kind: "visioncut.edit-plan";
	schemaVersion: typeof EDIT_PLAN_SCHEMA_VERSION;
	planId: string;
	revision: number;
	versionId: string;
	intent: string;
	workflow: {
		id: AutomationRecipeId;
		title: string;
		capabilityIds: readonly StudioCapabilityId[];
	};
	basis: {
		source: "user-intent-and-workflow";
		mediaAnalyzed: false;
		deterministic: true;
		notice: string;
	};
	requirements: {
		network: false;
		paidService: false;
		apiKey: false;
	};
	applicationScope: "review-state-only";
	groups: readonly EditPlanOperationGroup[];
}

export interface EditPlanSnapshot {
	kind: "visioncut.edit-plan.snapshot";
	schemaVersion: typeof EDIT_PLAN_SCHEMA_VERSION;
	snapshotId: string;
	label: string;
	planId: string;
	revision: number;
	versionId: string;
	plan: VersionedEditPlan;
}

export interface EditPlanUndoChange {
	operationId: string;
	from: "approved";
	to: "applied";
}

export interface EditPlanUndoReceipt {
	kind: "visioncut.edit-plan.undo-receipt";
	schemaVersion: typeof EDIT_PLAN_SCHEMA_VERSION;
	receiptId: string;
	planId: string;
	fromRevision: number;
	fromVersionId: string;
	toRevision: number;
	toVersionId: string;
	applicationScope: "review-state-only";
	changes: readonly EditPlanUndoChange[];
}

export interface AppliedEditPlanResult {
	plan: VersionedEditPlan;
	undoReceipt: EditPlanUndoReceipt;
}

export type EditPlanWorkflowInput =
	| AutomationRecipeId
	| Pick<AutomationRecipe, "id">;

export class EditPlanInvariantError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EditPlanInvariantError";
	}
}

const DOMAIN_METADATA: Record<
	EditPlanDomain,
	{ label: string; objective: string; impact: string }
> = {
	story: {
		label: "故事",
		objective: "定义信息顺序、叙事重点与情绪推进，不替素材虚构结论。",
		impact: "让故事目标和观看路径更清晰",
	},
	edit: {
		label: "剪辑",
		objective: "规划取舍、节奏、构图与画面衔接，所有删改先经人工确认。",
		impact: "让结构、节奏和画面连续性更符合意图",
	},
	color: {
		label: "色彩",
		objective: "定义统一且可复核的视觉方向，不声称已测量真实画面。",
		impact: "让曝光、色温与整体视觉方向更一致",
	},
	sound: {
		label: "声音",
		objective: "规划人声、环境声与音乐关系，避免覆盖重要表达。",
		impact: "让对白清晰度、氛围和响度关系更稳定",
	},
	growth: {
		label: "发布",
		objective: "规划字幕、包装、版本与交付检查，不预测真实传播结果。",
		impact: "让信息包装和多平台交付更完整",
	},
};

const CAPABILITY_DOMAIN: Record<StudioCapabilityId, EditPlanDomain> = {
	"ingest-media": "edit",
	"transcribe-speech": "story",
	"diarize-speakers": "story",
	"detect-scenes": "edit",
	"detect-silence": "edit",
	"remove-fillers": "edit",
	"remove-retakes": "edit",
	"find-highlights": "story",
	"chapter-story": "story",
	"edit-by-transcript": "edit",
	"select-best-takes": "edit",
	"multicam-switch": "edit",
	"beat-map": "sound",
	"auto-reframe": "edit",
	"smooth-jump-cuts": "edit",
	"dynamic-punch-in": "edit",
	"insert-broll": "edit",
	"generate-broll": "edit",
	"keyword-captions": "growth",
	"bilingual-captions": "growth",
	"motion-callouts": "growth",
	"title-cards": "growth",
	"voice-cleanup": "sound",
	"audio-ducking": "sound",
	"loudness-mastering": "sound",
	"color-match": "color",
	"music-sync": "sound",
	"generate-covers": "growth",
	"create-versions": "growth",
	"delivery-qc": "growth",
	"export-timeline": "growth",
};

const HIGH_RISK_CAPABILITIES: readonly StudioCapabilityId[] = [
	"remove-fillers",
	"remove-retakes",
	"edit-by-transcript",
	"select-best-takes",
	"multicam-switch",
	"generate-broll",
];

const MEDIUM_RISK_CAPABILITIES: readonly StudioCapabilityId[] = [
	"detect-silence",
	"find-highlights",
	"chapter-story",
	"auto-reframe",
	"smooth-jump-cuts",
	"dynamic-punch-in",
	"insert-broll",
	"audio-ducking",
	"color-match",
	"music-sync",
];

function normalizeRequiredText({
	value,
	label,
}: {
	value: string;
	label: string;
}): string {
	const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
	if (!normalized) {
		throw new EditPlanInvariantError(`${label} cannot be empty.`);
	}
	return normalized;
}

function intentExcerpt(intent: string): string {
	const characters = Array.from(intent);
	if (characters.length <= 80) return intent;
	return `${characters.slice(0, 80).join("")}...`;
}

function hashWithSeed({
	value,
	seed,
}: {
	value: string;
	seed: number;
}): string {
	let hash = seed >>> 0;
	for (const character of value) {
		hash ^= character.codePointAt(0) ?? 0;
		hash = Math.imul(hash, 16_777_619);
	}
	return (hash >>> 0).toString(36).padStart(7, "0");
}

function stableDigest(value: string): string {
	return `${hashWithSeed({ value, seed: 2_166_136_261 })}${hashWithSeed({
		value,
		seed: 3_332_816_977,
	})}`;
}

function deterministicId({
	prefix,
	parts,
}: {
	prefix: string;
	parts: readonly string[];
}): string {
	return `${prefix}_${stableDigest(parts.join("\u001f"))}`;
}

function resolveWorkflow(
	workflow: EditPlanWorkflowInput,
): (typeof AUTOMATION_RECIPES)[number] {
	const workflowId = typeof workflow === "string" ? workflow : workflow.id;
	const recipe = AUTOMATION_RECIPES.find((item) => item.id === workflowId);
	if (!recipe) {
		throw new EditPlanInvariantError(`Unknown workflow: ${workflowId}`);
	}
	return recipe;
}

function riskFor(capabilityId: StudioCapabilityId): EditPlanRisk {
	if (HIGH_RISK_CAPABILITIES.includes(capabilityId)) {
		return {
			level: "high",
			description:
				"可能删改、重排或生成内容，容易改变原意；必须逐项预览并人工确认。",
		};
	}
	if (MEDIUM_RISK_CAPABILITIES.includes(capabilityId)) {
		return {
			level: "medium",
			description:
				"可能影响节奏、上下文、构图或感知，应在应用前检查边界与连续性。",
		};
	}
	return {
		level: "low",
		description: "主要影响方案组织或交付表达，仍需确认参数、版权和平台要求。",
	};
}

function getCapability(capabilityId: StudioCapabilityId) {
	const capability = STUDIO_CAPABILITIES.find(
		(item) => item.id === capabilityId,
	);
	if (!capability) {
		throw new EditPlanInvariantError(
			`Unknown studio capability: ${capabilityId}`,
		);
	}
	return capability;
}

function planIdentity({
	intent,
	workflow,
}: {
	intent: string;
	workflow: (typeof AUTOMATION_RECIPES)[number];
}): string {
	return deterministicId({
		prefix: "plan",
		parts: [
			String(EDIT_PLAN_SCHEMA_VERSION),
			intent,
			workflow.id,
			workflow.title,
			workflow.directorPrompt,
			workflow.capabilityIds.join(","),
		],
	});
}

function orderedOperations(
	groups: readonly EditPlanOperationGroup[],
): ReviewableEditPlanOperation[] {
	return groups
		.flatMap((group) => group.operations)
		.slice()
		.sort((left, right) => left.workflowIndex - right.workflowIndex);
}

function versionIdentity({
	planId,
	revision,
	groups,
}: {
	planId: string;
	revision: number;
	groups: readonly EditPlanOperationGroup[];
}): string {
	const operationState = orderedOperations(groups)
		.map((operation) =>
			[
				operation.id,
				String(operation.workflowIndex),
				operation.domain,
				operation.capabilityId,
				operation.title,
				operation.target,
				operation.reason,
				operation.expectedImpact,
				operation.risk.level,
				operation.risk.description,
				operation.status,
			].join("\u001e"),
		)
		.join("\u001d");
	return deterministicId({
		prefix: "version",
		parts: [planId, String(revision), operationState],
	});
}

function buildOperation({
	planId,
	intent,
	workflow,
	capabilityId,
	workflowIndex,
}: {
	planId: string;
	intent: string;
	workflow: (typeof AUTOMATION_RECIPES)[number];
	capabilityId: StudioCapabilityId;
	workflowIndex: number;
}): ReviewableEditPlanOperation {
	const capability = getCapability(capabilityId);
	const domain = CAPABILITY_DOMAIN[capabilityId];
	const metadata = DOMAIN_METADATA[domain];
	return {
		id: deterministicId({
			prefix: "operation",
			parts: [planId, String(workflowIndex), capabilityId],
		}),
		workflowIndex,
		domain,
		capabilityId,
		title: capability.title,
		target: capability.beginnerLabel,
		reason: `工作流“${workflow.title}”包含“${capability.title}”，用于响应用户意图“${intentExcerpt(
			intent,
		)}”。这只是文字规则推导，不代表已经分析素材。`,
		expectedImpact: `若未来由明确的本地执行器执行，预期${metadata.impact}，并实现“${capability.beginnerLabel}”。当前模型只更新审阅状态，不修改视频。`,
		risk: riskFor(capabilityId),
		status: "proposed",
	};
}

function isOperationStatus(value: string): value is EditPlanOperationStatus {
	return (
		value === "proposed" ||
		value === "approved" ||
		value === "rejected" ||
		value === "applied"
	);
}

function isRiskLevel(value: string): value is EditPlanRiskLevel {
	return value === "low" || value === "medium" || value === "high";
}

export function createVersionedEditPlan({
	intent,
	workflow,
}: {
	intent: string;
	workflow: EditPlanWorkflowInput;
}): VersionedEditPlan {
	const normalizedIntent = normalizeRequiredText({
		value: intent,
		label: "Intent",
	});
	const recipe = resolveWorkflow(workflow);
	const planId = planIdentity({ intent: normalizedIntent, workflow: recipe });
	const operations = recipe.capabilityIds.map((capabilityId, workflowIndex) =>
		buildOperation({
			planId,
			intent: normalizedIntent,
			workflow: recipe,
			capabilityId,
			workflowIndex,
		}),
	);
	const groups = EDIT_PLAN_DOMAIN_ORDER.map((domain) => ({
		domain,
		label: DOMAIN_METADATA[domain].label,
		objective: DOMAIN_METADATA[domain].objective,
		operations: operations.filter((operation) => operation.domain === domain),
	}));
	const revision = 1;
	const plan: VersionedEditPlan = {
		kind: "visioncut.edit-plan",
		schemaVersion: EDIT_PLAN_SCHEMA_VERSION,
		planId,
		revision,
		versionId: versionIdentity({ planId, revision, groups }),
		intent: normalizedIntent,
		workflow: {
			id: recipe.id,
			title: recipe.title,
			capabilityIds: [...recipe.capabilityIds],
		},
		basis: {
			source: "user-intent-and-workflow",
			mediaAnalyzed: false,
			deterministic: true,
			notice:
				"该方案仅由用户意图和本地工作流规则生成；它不包含视频、音频、人物、场景或传播表现的分析结论。",
		},
		requirements: {
			network: false,
			paidService: false,
			apiKey: false,
		},
		applicationScope: "review-state-only",
		groups,
	};
	assertEditPlanInvariants(plan);
	return plan;
}

export function getEditPlanOperations(
	plan: VersionedEditPlan,
): readonly ReviewableEditPlanOperation[] {
	return orderedOperations(plan.groups);
}

export function getEditPlanOperation({
	plan,
	operationId,
}: {
	plan: VersionedEditPlan;
	operationId: string;
}): ReviewableEditPlanOperation {
	const operation = getEditPlanOperations(plan).find(
		(item) => item.id === operationId,
	);
	if (!operation) {
		throw new EditPlanInvariantError(`Unknown operation: ${operationId}`);
	}
	return operation;
}

function reviseOperationStatuses({
	plan,
	statuses,
}: {
	plan: VersionedEditPlan;
	statuses: ReadonlyMap<string, EditPlanOperationStatus>;
}): VersionedEditPlan {
	let changed = false;
	const groups = plan.groups.map((group) => {
		let groupChanged = false;
		const operations = group.operations.map((operation) => {
			const status = statuses.get(operation.id);
			if (status === undefined || status === operation.status) return operation;
			changed = true;
			groupChanged = true;
			return { ...operation, status };
		});
		return groupChanged ? { ...group, operations } : group;
	});

	if (!changed) return plan;
	const revision = plan.revision + 1;
	const nextPlan: VersionedEditPlan = {
		...plan,
		revision,
		versionId: versionIdentity({ planId: plan.planId, revision, groups }),
		groups,
	};
	assertEditPlanInvariants(nextPlan);
	return nextPlan;
}

export function reviewEditPlanOperation({
	plan,
	operationId,
	decision,
}: {
	plan: VersionedEditPlan;
	operationId: string;
	decision: EditPlanReviewDecision;
}): VersionedEditPlan {
	assertEditPlanInvariants(plan);
	const operation = getEditPlanOperation({ plan, operationId });
	if (operation.status === "applied") {
		throw new EditPlanInvariantError(
			`Applied operation ${operationId} must be undone before review changes.`,
		);
	}
	return reviseOperationStatuses({
		plan,
		statuses: new Map([[operationId, decision]]),
	});
}

export function approveEditPlanOperation({
	plan,
	operationId,
}: {
	plan: VersionedEditPlan;
	operationId: string;
}): VersionedEditPlan {
	return reviewEditPlanOperation({
		plan,
		operationId,
		decision: "approved",
	});
}

export function rejectEditPlanOperation({
	plan,
	operationId,
}: {
	plan: VersionedEditPlan;
	operationId: string;
}): VersionedEditPlan {
	return reviewEditPlanOperation({
		plan,
		operationId,
		decision: "rejected",
	});
}

export function reviewAllEditPlanOperations({
	plan,
	decision,
	domains = EDIT_PLAN_DOMAIN_ORDER,
}: {
	plan: VersionedEditPlan;
	decision: EditPlanReviewDecision;
	domains?: readonly EditPlanDomain[];
}): VersionedEditPlan {
	assertEditPlanInvariants(plan);
	const selectedDomains = new Set(domains);
	const statuses = new Map<string, EditPlanOperationStatus>();
	for (const operation of getEditPlanOperations(plan)) {
		if (
			operation.status !== "applied" &&
			selectedDomains.has(operation.domain)
		) {
			statuses.set(operation.id, decision);
		}
	}
	return reviseOperationStatuses({ plan, statuses });
}

export function approveAllEditPlanOperations({
	plan,
	domains,
}: {
	plan: VersionedEditPlan;
	domains?: readonly EditPlanDomain[];
}): VersionedEditPlan {
	return reviewAllEditPlanOperations({
		plan,
		decision: "approved",
		...(domains === undefined ? {} : { domains }),
	});
}

export function rejectAllEditPlanOperations({
	plan,
	domains,
}: {
	plan: VersionedEditPlan;
	domains?: readonly EditPlanDomain[];
}): VersionedEditPlan {
	return reviewAllEditPlanOperations({
		plan,
		decision: "rejected",
		...(domains === undefined ? {} : { domains }),
	});
}

function cloneEditPlan(plan: VersionedEditPlan): VersionedEditPlan {
	return {
		...plan,
		workflow: {
			...plan.workflow,
			capabilityIds: [...plan.workflow.capabilityIds],
		},
		basis: { ...plan.basis },
		requirements: { ...plan.requirements },
		groups: plan.groups.map((group) => ({
			...group,
			operations: group.operations.map((operation) => ({
				...operation,
				risk: { ...operation.risk },
			})),
		})),
	};
}

export function createEditPlanSnapshot({
	plan,
	label = `版本 ${plan.revision}`,
}: {
	plan: VersionedEditPlan;
	label?: string;
}): EditPlanSnapshot {
	assertEditPlanInvariants(plan);
	const normalizedLabel = normalizeRequiredText({
		value: label,
		label: "Snapshot label",
	});
	return {
		kind: "visioncut.edit-plan.snapshot",
		schemaVersion: EDIT_PLAN_SCHEMA_VERSION,
		snapshotId: deterministicId({
			prefix: "snapshot",
			parts: [plan.planId, plan.versionId, normalizedLabel],
		}),
		label: normalizedLabel,
		planId: plan.planId,
		revision: plan.revision,
		versionId: plan.versionId,
		plan: cloneEditPlan(plan),
	};
}

export function applyApprovedEditPlanOperations({
	plan,
	operationIds,
}: {
	plan: VersionedEditPlan;
	operationIds?: readonly string[];
}): AppliedEditPlanResult {
	assertEditPlanInvariants(plan);
	const operations = getEditPlanOperations(plan);
	const selectedIds =
		operationIds === undefined
			? operations
					.filter((operation) => operation.status === "approved")
					.map((operation) => operation.id)
			: [...operationIds];
	if (selectedIds.length === 0) {
		throw new EditPlanInvariantError("No approved operations to apply.");
	}
	if (new Set(selectedIds).size !== selectedIds.length) {
		throw new EditPlanInvariantError(
			"Operation selection contains duplicates.",
		);
	}

	const selected = new Set(selectedIds);
	const changes: EditPlanUndoChange[] = [];
	const statuses = new Map<string, EditPlanOperationStatus>();
	for (const operationId of selectedIds) {
		const operation = getEditPlanOperation({ plan, operationId });
		if (operation.status !== "approved") {
			throw new EditPlanInvariantError(
				`Operation ${operationId} must be approved before it can be applied.`,
			);
		}
	}
	for (const operation of operations) {
		if (!selected.has(operation.id)) continue;
		statuses.set(operation.id, "applied");
		changes.push({
			operationId: operation.id,
			from: "approved",
			to: "applied",
		});
	}

	const appliedPlan = reviseOperationStatuses({ plan, statuses });
	const undoReceipt: EditPlanUndoReceipt = {
		kind: "visioncut.edit-plan.undo-receipt",
		schemaVersion: EDIT_PLAN_SCHEMA_VERSION,
		receiptId: deterministicId({
			prefix: "undo",
			parts: [
				plan.planId,
				plan.versionId,
				appliedPlan.versionId,
				changes.map((change) => change.operationId).join(","),
			],
		}),
		planId: plan.planId,
		fromRevision: plan.revision,
		fromVersionId: plan.versionId,
		toRevision: appliedPlan.revision,
		toVersionId: appliedPlan.versionId,
		applicationScope: "review-state-only",
		changes,
	};
	return { plan: appliedPlan, undoReceipt };
}

export function undoEditPlanApplication({
	plan,
	receipt,
}: {
	plan: VersionedEditPlan;
	receipt: EditPlanUndoReceipt;
}): VersionedEditPlan {
	assertEditPlanInvariants(plan);
	if (
		receipt.kind !== "visioncut.edit-plan.undo-receipt" ||
		receipt.schemaVersion !== EDIT_PLAN_SCHEMA_VERSION ||
		receipt.applicationScope !== "review-state-only"
	) {
		throw new EditPlanInvariantError("Unsupported undo receipt.");
	}
	if (receipt.planId !== plan.planId) {
		throw new EditPlanInvariantError("Undo receipt belongs to another plan.");
	}
	if (
		receipt.toRevision !== plan.revision ||
		receipt.toVersionId !== plan.versionId
	) {
		throw new EditPlanInvariantError(
			"Undo receipt is stale or the plan has changed since application.",
		);
	}
	if (receipt.changes.length === 0) {
		throw new EditPlanInvariantError("Undo receipt has no changes.");
	}
	const operationIds = receipt.changes.map((change) => change.operationId);
	if (new Set(operationIds).size !== operationIds.length) {
		throw new EditPlanInvariantError(
			"Undo receipt contains duplicate changes.",
		);
	}

	const statuses = new Map<string, EditPlanOperationStatus>();
	for (const change of receipt.changes) {
		if (change.from !== "approved" || change.to !== "applied") {
			throw new EditPlanInvariantError(
				"Undo receipt contains an invalid change.",
			);
		}
		const operation = getEditPlanOperation({
			plan,
			operationId: change.operationId,
		});
		if (operation.status !== "applied") {
			throw new EditPlanInvariantError(
				`Operation ${change.operationId} is no longer applied.`,
			);
		}
		statuses.set(change.operationId, "approved");
	}
	return reviseOperationStatuses({ plan, statuses });
}

export function serializeEditPlan(plan: VersionedEditPlan): string {
	assertEditPlanInvariants(plan);
	return JSON.stringify(plan);
}

export function assertEditPlanInvariants(plan: VersionedEditPlan): void {
	if (
		plan.kind !== "visioncut.edit-plan" ||
		plan.schemaVersion !== EDIT_PLAN_SCHEMA_VERSION
	) {
		throw new EditPlanInvariantError("Unsupported edit plan schema.");
	}
	if (!Number.isSafeInteger(plan.revision) || plan.revision < 1) {
		throw new EditPlanInvariantError(
			"Plan revision must be a positive integer.",
		);
	}
	if (
		normalizeRequiredText({ value: plan.intent, label: "Intent" }) !==
		plan.intent
	) {
		throw new EditPlanInvariantError("Plan intent must be normalized.");
	}
	if (
		plan.basis.source !== "user-intent-and-workflow" ||
		plan.basis.mediaAnalyzed !== false ||
		plan.basis.deterministic !== true
	) {
		throw new EditPlanInvariantError(
			"Plan basis must remain deterministic and honest.",
		);
	}
	if (
		plan.requirements.network !== false ||
		plan.requirements.paidService !== false ||
		plan.requirements.apiKey !== false ||
		plan.applicationScope !== "review-state-only"
	) {
		throw new EditPlanInvariantError(
			"Local review plans cannot require network, payment, API keys, or media mutation.",
		);
	}
	if (plan.groups.length !== EDIT_PLAN_DOMAIN_ORDER.length) {
		throw new EditPlanInvariantError(
			"Plan must contain all five domain groups.",
		);
	}
	for (const [index, domain] of EDIT_PLAN_DOMAIN_ORDER.entries()) {
		if (plan.groups[index]?.domain !== domain) {
			throw new EditPlanInvariantError("Plan domain groups are out of order.");
		}
	}

	const operations = orderedOperations(plan.groups);
	if (operations.length !== plan.workflow.capabilityIds.length) {
		throw new EditPlanInvariantError(
			"Workflow capabilities and plan operations must have equal length.",
		);
	}
	const operationIds = new Set<string>();
	for (const [index, operation] of operations.entries()) {
		if (operation.workflowIndex !== index) {
			throw new EditPlanInvariantError(
				"Workflow operation indexes must be contiguous and unique.",
			);
		}
		if (operationIds.has(operation.id)) {
			throw new EditPlanInvariantError("Operation ids must be unique.");
		}
		operationIds.add(operation.id);
		if (plan.workflow.capabilityIds[index] !== operation.capabilityId) {
			throw new EditPlanInvariantError(
				"Operation order must match the workflow capability order.",
			);
		}
		if (CAPABILITY_DOMAIN[operation.capabilityId] !== operation.domain) {
			throw new EditPlanInvariantError(
				`Operation ${operation.id} is assigned to the wrong domain.`,
			);
		}
		const containingGroup = plan.groups.find(
			(group) => group.domain === operation.domain,
		);
		if (!containingGroup?.operations.some((item) => item.id === operation.id)) {
			throw new EditPlanInvariantError(
				`Operation ${operation.id} is outside its domain group.`,
			);
		}
		if (!isOperationStatus(operation.status)) {
			throw new EditPlanInvariantError(
				`Operation ${operation.id} has an invalid status.`,
			);
		}
		if (!isRiskLevel(operation.risk.level)) {
			throw new EditPlanInvariantError(
				`Operation ${operation.id} has an invalid risk level.`,
			);
		}
		for (const [label, value] of [
			["title", operation.title],
			["target", operation.target],
			["reason", operation.reason],
			["expected impact", operation.expectedImpact],
			["risk description", operation.risk.description],
		] as const) {
			if (!value.trim()) {
				throw new EditPlanInvariantError(
					`Operation ${operation.id} has an empty ${label}.`,
				);
			}
		}
		const expectedOperationId = deterministicId({
			prefix: "operation",
			parts: [
				plan.planId,
				String(operation.workflowIndex),
				operation.capabilityId,
			],
		});
		if (operation.id !== expectedOperationId) {
			throw new EditPlanInvariantError(
				`Operation ${operation.id} has a non-deterministic id.`,
			);
		}
	}

	const expectedVersionId = versionIdentity({
		planId: plan.planId,
		revision: plan.revision,
		groups: plan.groups,
	});
	if (plan.versionId !== expectedVersionId) {
		throw new EditPlanInvariantError(
			"Plan version id does not match its current content.",
		);
	}
}
