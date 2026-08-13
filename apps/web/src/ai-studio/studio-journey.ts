export type StudioJourneyStageId =
	| "understand"
	| "design"
	| "produce"
	| "deliver";

export type StudioJourneyStageStatus = "complete" | "current" | "waiting";

export type StudioJourneyTargetView =
	| "analysis"
	| "workflows"
	| "team"
	| "delivery";

export interface StudioJourneyInput {
	readonly assetCount: number;
	readonly analyzableAssetCount: number;
	readonly analyzedAssetCount: number;
	readonly hasIntent: boolean;
	readonly storyNodeCount: number;
	readonly timelineElementCount: number;
	readonly succeededAgentCount: number;
	readonly totalAgentCount: number;
	readonly exportReady: boolean;
	readonly exportBlockerCount: number;
}

export interface StudioJourneyStage {
	readonly id: StudioJourneyStageId;
	readonly label: string;
	readonly status: StudioJourneyStageStatus;
	readonly summary: string;
	readonly targetView: StudioJourneyTargetView;
}

export interface StudioJourney {
	readonly stages: readonly StudioJourneyStage[];
	readonly completedCount: number;
	readonly progressPercent: number;
	readonly nextStage: StudioJourneyStage | null;
}

function normalizeCount(value: number): number {
	return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function buildStudioJourney(input: StudioJourneyInput): StudioJourney {
	const assetCount = normalizeCount(input.assetCount);
	const analyzableAssetCount = Math.min(
		assetCount,
		normalizeCount(input.analyzableAssetCount),
	);
	const analyzedAssetCount = Math.min(
		analyzableAssetCount,
		normalizeCount(input.analyzedAssetCount),
	);
	const storyNodeCount = normalizeCount(input.storyNodeCount);
	const timelineElementCount = normalizeCount(input.timelineElementCount);
	const succeededAgentCount = Math.min(
		normalizeCount(input.totalAgentCount),
		normalizeCount(input.succeededAgentCount),
	);
	const totalAgentCount = normalizeCount(input.totalAgentCount);

	const completed = {
		understand:
			assetCount > 0 &&
			(analyzableAssetCount === 0 ||
				analyzedAssetCount >= analyzableAssetCount),
		design: input.hasIntent && storyNodeCount > 0,
		produce: timelineElementCount > 0,
		deliver: input.exportReady,
	} satisfies Record<StudioJourneyStageId, boolean>;

	const firstIncomplete = (
		["understand", "design", "produce", "deliver"] as const
	).find((id) => !completed[id]);

	const statusFor = (id: StudioJourneyStageId): StudioJourneyStageStatus => {
		if (completed[id]) return "complete";
		return id === firstIncomplete ? "current" : "waiting";
	};

	const stages: readonly StudioJourneyStage[] = [
		{
			id: "understand",
			label: "理解",
			status: statusFor("understand"),
			targetView: "analysis",
			summary:
				assetCount === 0
					? "导入素材"
					: analyzableAssetCount === 0
						? `${assetCount} 个图片素材就绪`
						: `${analyzedAssetCount}/${analyzableAssetCount} 已采样`,
		},
		{
			id: "design",
			label: "设计",
			status: statusFor("design"),
			targetView: "workflows",
			summary:
				storyNodeCount > 0
					? `${storyNodeCount} 个故事节点`
					: input.hasIntent
						? "选择配方并生成结构"
						: "明确成片意图",
		},
		{
			id: "produce",
			label: "制作",
			status: statusFor("produce"),
			targetView: "team",
			summary:
				timelineElementCount > 0
					? `${timelineElementCount} 个时间线元素`
					: totalAgentCount > 0
						? `${succeededAgentCount}/${totalAgentCount} 个角色完成`
						: "建立可审阅任务",
		},
		{
			id: "deliver",
			label: "交付",
			status: statusFor("deliver"),
			targetView: "delivery",
			summary: input.exportReady
				? "可以开始本地渲染"
				: input.exportBlockerCount > 0
					? `${normalizeCount(input.exportBlockerCount)} 个阻断待处理`
					: "检查版本与输出",
		},
	];
	const completedCount = stages.filter(
		(stage) => stage.status === "complete",
	).length;

	return {
		stages,
		completedCount,
		progressPercent: Math.round((completedCount / stages.length) * 100),
		nextStage: stages.find((stage) => stage.status === "current") ?? null,
	};
}
