import type {
	EditMode,
	EditPlan,
	EditPlanStep,
	EditStepAvailability,
	EditStepExecutor,
	PlannerInput,
} from "./types";

function stepId(kind: EditPlanStep["kind"]): string {
	return `${kind}-${crypto.randomUUID()}`;
}

function executionFor({
	mode,
	localCapable,
}: {
	mode: EditMode;
	localCapable: boolean;
}): {
	executor: EditStepExecutor;
	availability: EditStepAvailability;
} {
	if (localCapable && mode !== "chatcut") {
		return { executor: "local", availability: "ready" };
	}
	return { executor: "chatcut", availability: "handoff" };
}

function detectAspectRatio(prompt: string): "16:9" | "9:16" | "1:1" | null {
	if (/(9\s*:\s*16|竖屏|抖音|shorts|reels)/i.test(prompt)) return "9:16";
	if (/(1\s*:\s*1|方形|正方形)/i.test(prompt)) return "1:1";
	if (/(16\s*:\s*9|横屏|宽屏)/i.test(prompt)) return "16:9";
	return null;
}

function hasAny(prompt: string, pattern: RegExp): boolean {
	return pattern.test(prompt);
}

export function createEditPlan(input: PlannerInput): EditPlan {
	const prompt = input.prompt.trim();
	const steps: EditPlanStep[] = [];

	if (input.assetCount === 0 && input.timelineElementCount === 0) {
		steps.push({
			id: stepId("import-media"),
			kind: "import-media",
			title: "导入素材",
			description: "当前项目没有可分析的素材。",
			executor: "local",
			availability: "blocked",
			enabled: true,
		});
	}

	if (input.unusedAssetCount > 0) {
		const execution = executionFor({ mode: input.mode, localCapable: true });
		steps.push({
			id: stepId("arrange-media"),
			kind: "arrange-media",
			title: `顺排 ${input.unusedAssetCount} 个未使用素材`,
			description: "视频和图片依次追加，音频从时间线起点放入独立轨道。",
			...execution,
			enabled: true,
		});
	}

	const wantsTighterCut =
		input.videoClipCount > 0 &&
		(hasAny(prompt, /(节奏|紧凑|片头|片尾|空白|trim|tight|rough cut|粗剪)/i) ||
			!hasAny(prompt, /(字幕|转录|高光|精彩|静音|silence|caption|transcri)/i));
	if (wantsTighterCut) {
		const execution = executionFor({ mode: input.mode, localCapable: true });
		steps.push({
			id: stepId("tighten-clips"),
			kind: "tighten-clips",
			title: "收紧片段首尾",
			description: "每个主视频片段收紧 0.25 秒，并自动闭合产生的间隙。",
			...execution,
			enabled: true,
		});
	}

	const aspectRatio = detectAspectRatio(prompt);
	if (aspectRatio) {
		const execution = executionFor({ mode: input.mode, localCapable: true });
		steps.push({
			id: stepId("set-aspect-ratio"),
			kind: "set-aspect-ratio",
			title: `调整画幅为 ${aspectRatio}`,
			description: "修改项目画布，不删除原始素材。",
			...execution,
			enabled: true,
			params: { aspectRatio },
		});
	}

	if (hasAny(prompt, /(静音|停顿|silence|pause)/i)) {
		steps.push({
			id: stepId("remove-silence"),
			kind: "remove-silence",
			title: "检测并移除静音停顿",
			description: "需要 ChatCut 分析音频后生成可核对的剪切点。",
			executor: "chatcut",
			availability: "handoff",
			enabled: input.mode !== "local",
		});
	}

	if (hasAny(prompt, /(字幕|转录|caption|subtitle|transcri)/i)) {
		steps.push({
			id: stepId("transcribe-captions"),
			kind: "transcribe-captions",
			title: "转录并生成字幕",
			description: "通过 ChatCut 完成语音识别、分段和字幕时间轴。",
			executor: "chatcut",
			availability: "handoff",
			enabled: input.mode !== "local",
		});
	}

	if (
		hasAny(
			prompt,
			/(高光|精彩|重点|语义|精华|\d+\s*(秒|分钟)|highlight|best|summary)/i,
		)
	) {
		steps.push({
			id: stepId("semantic-highlights"),
			kind: "semantic-highlights",
			title: "按语义筛选重点片段",
			description: "通过 ChatCut 根据内容、目标时长和提示词生成精选版本。",
			executor: "chatcut",
			availability: "handoff",
			enabled: input.mode !== "local",
		});
	}

	return {
		id: crypto.randomUUID(),
		formatVersion: "flowcut.edit-plan/v1",
		prompt,
		mode: input.mode,
		createdAt: new Date().toISOString(),
		source: {
			assetCount: input.assetCount,
			unusedAssetCount: input.unusedAssetCount,
			timelineElementCount: input.timelineElementCount,
			videoClipCount: input.videoClipCount,
			durationSeconds: input.durationSeconds,
		},
		steps,
	};
}
