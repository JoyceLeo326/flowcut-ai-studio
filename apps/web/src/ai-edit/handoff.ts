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
		requestedSteps: plan.steps.filter(
			(step) => step.enabled && step.executor === "chatcut",
		),
		privacy: {
			requiresExplicitUpload: true,
			provider: "ChatCut",
		},
	};
}

export function formatChatCutTask(handoff: ChatCutHandoff): string {
	return [
		"请使用已经安装并登录的 ChatCut 官方插件/MCP 执行下面的剪辑交接包。",
		"先读取并确认计划；需要上传素材前先征得我的确认；完成后导出 MP4，并说明实际执行的步骤。",
		"如果当前任务还没有对应视频附件，请按 media 中的文件名提醒我上传，不要创建虚假素材。",
		"",
		"```json",
		JSON.stringify(handoff, null, 2),
		"```",
	].join("\n");
}
