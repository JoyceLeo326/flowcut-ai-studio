import type {
	DeliveryPlatform,
	EditMode,
	EditPlan,
	EditPlanStep,
	EditStepAvailability,
	EditStepExecutor,
	EditTarget,
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

function hasAny({ prompt, pattern }: { prompt: string; pattern: RegExp }): boolean {
	return pattern.test(prompt);
}

function detectPlatform({ prompt }: { prompt: string }): DeliveryPlatform {
	if (hasAny({ prompt, pattern: /(抖音|快手|tiktok|reels|shorts)/i }))
		return "douyin";
	if (hasAny({ prompt, pattern: /(小红书|rednote|xiaohongshu)/i }))
		return "xiaohongshu";
	if (hasAny({ prompt, pattern: /(b站|哔哩|bilibili)/i })) return "bilibili";
	if (hasAny({ prompt, pattern: /(youtube|油管)/i })) return "youtube";
	if (hasAny({ prompt, pattern: /(播客|访谈|podcast)/i })) return "podcast";
	return "generic";
}

function detectAspectRatio({
	prompt,
	platform,
}: {
	prompt: string;
	platform: DeliveryPlatform;
}) {
	if (/(9\s*:\s*16|竖屏|抖音|快手|tiktok|shorts|reels)/i.test(prompt)) {
		return "9:16" as const;
	}
	if (/(1\s*:\s*1|方形|正方形|小红书)/i.test(prompt)) return "1:1" as const;
	if (/(16\s*:\s*9|横屏|宽屏|b站|哔哩|bilibili|youtube)/i.test(prompt)) {
		return "16:9" as const;
	}
	if (platform === "douyin") return "9:16" as const;
	if (platform === "xiaohongshu") return "1:1" as const;
	return "16:9" as const;
}

function detectTargetDurationSeconds(prompt: string): number | undefined {
	const secondsMatch = prompt.match(/(\d{1,3})\s*(秒|s|sec|second)/i);
	if (secondsMatch?.[1]) return Number(secondsMatch[1]);

	const minuteMatch = prompt.match(/(\d{1,2})\s*(分钟|分|min|minute)/i);
	if (minuteMatch?.[1]) return Number(minuteMatch[1]) * 60;

	return undefined;
}

function buildTarget(prompt: string): EditTarget {
	const platform = detectPlatform({ prompt });
	const aspectRatio = detectAspectRatio({ prompt, platform });
	const targetDurationSeconds = detectTargetDurationSeconds(prompt);
	const labelByPlatform: Record<DeliveryPlatform, string> = {
		generic: "通用成片",
		douyin: "抖音 / 竖屏短视频",
		xiaohongshu: "小红书 / 方形成片",
		bilibili: "Bilibili / 横屏视频",
		youtube: "YouTube / 横屏视频",
		podcast: "播客 / 访谈精选",
	};

	const style = hasAny({ prompt, pattern: /(比赛|赛后|高光|精彩)/i })
		? "高光节奏"
		: hasAny({ prompt, pattern: /(教程|讲解|课程)/i })
			? "清晰讲解"
			: hasAny({ prompt, pattern: /(vlog|日常|记录)/i })
				? "自然记录"
				: "干净精简";

	return {
		platform,
		label: labelByPlatform[platform],
		aspectRatio,
		...(targetDurationSeconds ? { targetDurationSeconds } : {}),
		style,
	};
}

function buildSummary({
	input,
	target,
}: {
	input: PlannerInput;
	target: EditTarget;
}): string {
	const duration =
		target.targetDurationSeconds != null
			? `，目标约 ${target.targetDurationSeconds} 秒`
			: "";
	return `${target.label}，${target.aspectRatio} 画幅${duration}。当前有 ${input.assetCount} 个素材、${input.timelineElementCount} 个时间线片段，将先做可撤销本地整理，再把需要语义/字幕/静音分析的部分交给 ChatCut。`;
}

function buildChecklist(target: EditTarget): string[] {
	const checklist = [
		`画幅确认：${target.aspectRatio}`,
		"预览检查：开头不空、结尾不突兀、主要人物或画面不被裁掉",
		"声音检查：人声清楚，背景音不过载",
		"导出检查：导出后重新导入确认可以播放",
	];
	if (target.targetDurationSeconds != null) {
		checklist.splice(1, 0, `时长确认：接近 ${target.targetDurationSeconds} 秒`);
	}
	if (target.platform === "douyin" || target.platform === "xiaohongshu") {
		checklist.push("移动端检查：标题、字幕和关键画面不要贴近上下安全区");
	}
	return checklist;
}

function buildRiskNotes(input: PlannerInput): string[] {
	const notes = [
		"FlowCut 默认只在浏览器本地处理素材；ChatCut 步骤需要你单独确认上传。",
	];
	if (input.assetCount === 0) notes.push("项目还没有素材，必须先导入视频或音频。");
	if (input.durationSeconds > 0 && input.durationSeconds > 900) {
		notes.push("素材较长，浏览器本地预览和导出会更吃内存，建议分段处理。");
	}
	return notes;
}

export function createEditPlan(input: PlannerInput): EditPlan {
	const prompt = input.prompt.trim();
	const target = buildTarget(prompt);
	const steps: EditPlanStep[] = [];

	if (input.assetCount === 0 && input.timelineElementCount === 0) {
		steps.push({
			id: stepId("import-media"),
			kind: "import-media",
			title: "导入素材",
			description: "当前项目没有可分析的素材。先导入视频、图片或音频后再生成剪辑方案。",
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
			description: "视频和图片依次追加到主轨，音频从时间线起点放入独立音频轨道。",
			...execution,
			enabled: true,
		});
	}

	const wantsTighterCut =
		input.videoClipCount > 0 &&
		(hasAny({
			prompt,
			pattern: /(节奏|紧凑|紧剪|片头|片尾|空白|粗剪|trim|tight|rough cut)/i,
		}) ||
			!hasAny({
				prompt,
				pattern: /(字幕|转录|高光|精彩|静音|停顿|silence|caption|transcri)/i,
			}));
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

	if (input.assetCount > 0 || input.timelineElementCount > 0) {
		const execution = executionFor({ mode: input.mode, localCapable: true });
		steps.push({
			id: stepId("set-aspect-ratio"),
			kind: "set-aspect-ratio",
			title: `调整画幅为 ${target.aspectRatio}`,
			description: `按“${target.label}”目标设置项目画布，不删除原始素材。`,
			...execution,
			enabled: true,
			params: { aspectRatio: target.aspectRatio },
		});
	}

	if (hasAny({ prompt, pattern: /(静音|停顿|停顿口癖|silence|pause)/i })) {
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

	if (hasAny({ prompt, pattern: /(字幕|转录|caption|subtitle|transcri)/i })) {
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
		hasAny({
			prompt,
			pattern:
				/(高光|精彩|重点|语义|精华|\d+\s*(秒|分钟)|highlight|best|summary)/i,
		})
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
		target,
		summary: buildSummary({ input, target }),
		reviewChecklist: buildChecklist(target),
		riskNotes: buildRiskNotes(input),
		steps,
	};
}
