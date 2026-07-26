import type {
	ChatCutImportTargetState,
	PlaybackRate,
} from "@/ai-studio/chatcut-result";
import { fingerprintJson } from "@/ai-studio/chatcut-fingerprint";
import type { ChatCutHandoff, EditPlan, HandoffMediaItem } from "./types";

export function createChatCutHandoff({
	project,
	media,
	plan,
	targetState,
	timebase,
}: {
	project: { id: string; name: string };
	media: HandoffMediaItem[];
	plan: EditPlan;
	targetState: ChatCutImportTargetState;
	timebase: { unit: "frame"; fps: PlaybackRate };
}): ChatCutHandoff {
	const handoffId = `handoff-${fingerprintJson({
		projectId: targetState.projectId,
		versionId: targetState.versionId,
		planId: plan.id,
	}).slice("sha256:".length, 34)}`;
	return {
		formatVersion: "visioncut.chatcut-handoff/v2",
		handoffId,
		createdAt: new Date().toISOString(),
		project,
		timebase,
		baseline: {
			projectId: targetState.projectId,
			projectVersion: targetState.projectVersion,
			versionId: targetState.versionId,
			timelineId: targetState.timelineId,
			timelineSnapshotId: targetState.timelineSnapshotId,
			timelineFingerprint: targetState.timelineFingerprint,
			assets: [...targetState.assets],
			items: [...targetState.items],
			transcripts: [...targetState.transcripts],
			transcriptWords: [...targetState.transcriptWords],
			silenceAnalyses: [...targetState.silenceAnalyses],
		},
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
		resultContract: {
			kind: "visioncut.chatcut-result",
			schemaVersion: 1,
			coordinateSystem: "frame",
			atomicImport: true,
			revalidateBeforeApply: true,
			requiresExplicitApproval: true,
			freeTextCommandsAllowed: false,
		},
		capabilityBoundary: {
			transcriptEvidenceProvided: targetState.transcripts.length > 0,
			silenceEvidenceProvided: targetState.silenceAnalyses.length > 0,
			binaryMediaIncluded: false,
		},
	};
}

export function formatChatCutTask(handoff: ChatCutHandoff): string {
	return [
		"请使用已安装并登录的 ChatCut 官方插件/MCP 执行下面的 VisionCut v2 剪辑交接包。",
		"先核对 baseline 的素材、片段和时间线指纹；需要上传素材前先征得我的确认。",
		"完成后不要只描述结果：请导出一个符合 resultContract 的 visioncut.chatcut-result JSON 文件。VisionCut 会再次校验指纹、展示逐项差异并要求人工批准后才原子应用。",
		"如果当前任务还没有对应视频附件，请按 media 中的文件名提醒我上传，不要创建虚假素材。",
		"只返回有证据支持的 frame 操作。没有 transcriptEvidenceProvided 时，不要生成 caption-fix；没有 silenceEvidenceProvided 时，不要声称使用了 VisionCut 本地静音证据。",
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
		`- 交接 ID：${handoff.handoffId}`,
		`- VisionCut 基线：${handoff.baseline.versionId}`,
		"",
		"```json",
		JSON.stringify(handoff, null, 2),
		"```",
	].join("\n");
}
