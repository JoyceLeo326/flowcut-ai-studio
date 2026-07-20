import type { ChatCutHandoff, EditPlan, HandoffMediaItem } from "./types";

export function createChatCutHandoff({
	project,
	media,
	plan,
}: {
	project: { id: string; name: string };
	media: HandoffMediaItem[];
	plan: EditPlan;
}): ChatCutHandoff {
	return {
		formatVersion: "flowcut.chatcut-handoff/v1",
		project,
		media,
		plan,
		target: plan.target,
		requestedSteps: plan.steps.filter(
			(step) => step.enabled && step.executor === "chatcut",
		),
		reviewChecklist: plan.reviewChecklist,
		privacy: {
			requiresExplicitUpload: true,
			provider: "ChatCut",
			consent:
				"不要自动上传素材。需要云端转录、静音检测或语义精选前，先向用户确认。",
		},
	};
}

export function formatChatCutTask(handoff: ChatCutHandoff): string {
	return [
		"请使用已经安装并登录的 ChatCut 官方插件/MCP 执行下面的剪辑交接包。",
		"先读取并确认计划；需要上传素材前先征得我的确认；完成后导出 MP4，并说明实际执行的步骤。",
		"如果当前任务还没有对应视频附件，请按 media 中的文件名提醒我上传，不要创建虚假素材。",
		"",
		"交付目标：",
		`- 平台：${handoff.target.label}`,
		`- 画幅：${handoff.target.aspectRatio}`,
		handoff.target.targetDurationSeconds
			? `- 目标时长：${handoff.target.targetDurationSeconds} 秒`
			: "- 目标时长：按素材内容决定",
		`- 风格：${handoff.target.style}`,
		`- 开场：${handoff.plan.creativeDirection.hook}`,
		`- 叙事：${handoff.plan.creativeDirection.narrative}`,
		`- 字幕：${handoff.plan.creativeDirection.captionStyle}`,
		`- 动效：${handoff.plan.creativeDirection.motionStyle}`,
		`- 声音：${handoff.plan.creativeDirection.audioStrategy}`,
		`- 调色：${handoff.plan.creativeDirection.colorMood}`,
		`- 输出版本：${handoff.plan.creativeDirection.outputVariants
			.map((variant) => `${variant.label} ${variant.aspectRatio}`)
			.join("、")}`,
		"",
		"```json",
		JSON.stringify(handoff, null, 2),
		"```",
	].join("\n");
}
