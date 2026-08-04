import type { IntentSpecTargetInput } from "./intent-spec";

export type CreationRole = "独立创作者" | "品牌内容负责人" | "纪录片导演";
export type CreationAudience =
	| "第一次认识主人公的人"
	| "关注人物命运的观众"
	| "通勤静音观看者";
export type CreationPriority = "三秒建立冲突" | "人物情绪完整" | "信息可复述";
export type CreationPlatform = "douyin" | "xiaohongshu" | "bilibili";
export type CreationDuration = 30 | 60 | 180;

export interface CreationMissionSelection {
	creatorName: string;
	creatorRole: CreationRole;
	audience: CreationAudience;
	priority: CreationPriority;
	platform: CreationPlatform;
	durationSeconds: CreationDuration;
	deliveryTime: string;
}

export interface CreationMissionDecision {
	owner: string;
	conflict: string;
	choice: string;
	expectedOutcome: string;
	reviewPrompt: string;
}

export interface CreationMissionResult {
	projectName: string;
	userIntent: string;
	target: IntentSpecTargetInput;
	selection: CreationMissionSelection;
	decision: CreationMissionDecision;
}

export const CREATION_ROLE_OPTIONS: readonly CreationRole[] = [
	"独立创作者",
	"品牌内容负责人",
	"纪录片导演",
];
export const CREATION_AUDIENCE_OPTIONS: readonly CreationAudience[] = [
	"第一次认识主人公的人",
	"关注人物命运的观众",
	"通勤静音观看者",
];
export const CREATION_PRIORITY_OPTIONS: readonly CreationPriority[] = [
	"三秒建立冲突",
	"人物情绪完整",
	"信息可复述",
];

export const CREATION_PLATFORM_OPTIONS: readonly {
	id: CreationPlatform;
	label: string;
}[] = [
	{ id: "douyin", label: "抖音 · 9:16" },
	{ id: "xiaohongshu", label: "小红书 · 4:5" },
	{ id: "bilibili", label: "B站 · 16:9" },
];

const PLATFORM_TARGETS: Record<
	CreationPlatform,
	Pick<IntentSpecTargetInput, "platform" | "aspectRatio">
> = {
	douyin: { platform: "抖音", aspectRatio: "9:16" },
	xiaohongshu: { platform: "小红书", aspectRatio: "4:5" },
	bilibili: { platform: "B站", aspectRatio: "16:9" },
};

const PRIORITY_STRATEGIES: Record<CreationPriority, string> = {
	三秒建立冲突: "前 3 秒先给冲突或结果，再用后续镜头补足因果与证据",
	人物情绪完整: "保留犹豫、选择和代价，让情绪转折有前因也有结果",
	信息可复述: "信息分层、静音可读，保证观众看完能复述一个核心结论",
};

const PRIORITY_CHOICES: Record<CreationPriority, string> = {
	三秒建立冲突: "先交出最强冲突，再回到素材补足原因，不用悬念掩盖事实。",
	人物情绪完整: "宁可少放一个高光，也保留人物犹豫、选择与代价。",
	信息可复述: "删掉不能服务结论的装饰镜头，让信息分层并确保观众能复述。",
};

const REVIEW_PROMPTS: Record<CreationPriority, string> = {
	三秒建立冲突: "遮住标题重看前 3 秒，确认冲突成立；再核对后文是否给出证据。",
	人物情绪完整: "逐段核对主人公的选择前后是否有因果，并保留真实停顿与反应。",
	信息可复述:
		"静音播放一次，请同伴复述核心结论；无法复述就回到字幕与镜头层级调整。",
};

function normalizeText({
	value,
	fallback,
	maxLength,
}: {
	value: string;
	fallback: string;
	maxLength: number;
}): string {
	const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
	return Array.from(normalized || fallback)
		.slice(0, maxLength)
		.join("");
}

export function parseCreationRole({ value }: { value: string }): CreationRole {
	return (
		CREATION_ROLE_OPTIONS.find((option) => option === value) ?? "独立创作者"
	);
}

export function parseCreationAudience({
	value,
}: {
	value: string;
}): CreationAudience {
	return (
		CREATION_AUDIENCE_OPTIONS.find((option) => option === value) ??
		"第一次认识主人公的人"
	);
}

export function parseCreationPriority({
	value,
}: {
	value: string;
}): CreationPriority {
	return (
		CREATION_PRIORITY_OPTIONS.find((option) => option === value) ??
		"三秒建立冲突"
	);
}

export function parseCreationPlatform({
	value,
}: {
	value: string;
}): CreationPlatform {
	return (
		CREATION_PLATFORM_OPTIONS.find((option) => option.id === value)?.id ??
		"douyin"
	);
}

export function parseCreationDuration({
	value,
}: {
	value: string;
}): CreationDuration {
	const duration = Number(value);
	return duration === 30 || duration === 60 || duration === 180 ? duration : 60;
}

export function createDefaultCreationMission(): CreationMissionSelection {
	return {
		creatorName: "林夏",
		creatorRole: "品牌内容负责人",
		audience: "第一次认识主人公的人",
		priority: "三秒建立冲突",
		platform: "douyin",
		durationSeconds: 60,
		deliveryTime: "今晚 20:00",
	};
}

export function buildCreationMission({
	intent,
	selection,
}: {
	intent: string;
	selection: CreationMissionSelection;
}): CreationMissionResult {
	const normalizedIntent = intent
		.normalize("NFKC")
		.trim()
		.replace(/\s+/gu, " ");
	if (!normalizedIntent) throw new Error("Editing intent cannot be empty.");

	const normalizedSelection: CreationMissionSelection = {
		...selection,
		creatorName: normalizeText({
			value: selection.creatorName,
			fallback: "林夏",
			maxLength: 24,
		}),
		deliveryTime: normalizeText({
			value: selection.deliveryTime,
			fallback: "今晚 20:00",
			maxLength: 32,
		}),
	};
	const strategy = PRIORITY_STRATEGIES[normalizedSelection.priority];
	const choice = PRIORITY_CHOICES[normalizedSelection.priority];
	const reviewPrompt = REVIEW_PROMPTS[normalizedSelection.priority];
	const target: IntentSpecTargetInput = {
		...PLATFORM_TARGETS[normalizedSelection.platform],
		durationSeconds: normalizedSelection.durationSeconds,
		style: strategy,
	};
	const conflict = `${normalizedSelection.durationSeconds} 秒成片既要让${normalizedSelection.audience}立即理解，又不能牺牲素材里的因果与证据。`;

	return {
		projectName: Array.from(normalizedIntent).slice(0, 36).join(""),
		userIntent: [
			`主创：${normalizedSelection.creatorName}（${normalizedSelection.creatorRole}）`,
			`交付节点：${normalizedSelection.deliveryTime}`,
			`目标观众：${normalizedSelection.audience}`,
			`成片目标：${normalizedIntent}`,
			`取舍：${normalizedSelection.priority}。${strategy}。`,
			`复核动作：${reviewPrompt}`,
		].join("\n"),
		target,
		selection: normalizedSelection,
		decision: {
			owner: `${normalizedSelection.creatorName} · ${normalizedSelection.creatorRole}`,
			conflict,
			choice,
			expectedOutcome: `在${normalizedSelection.deliveryTime}前得到一版可预览、可复核、可继续精修的剪辑蓝图。`,
			reviewPrompt,
		},
	};
}
