import type {
	AspectRatio,
	CreativeDirection,
	DeliveryPlatform,
	EditMode,
	EditOutputVariant,
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

function hasAny({
	prompt,
	pattern,
}: {
	prompt: string;
	pattern: RegExp;
}): boolean {
	return pattern.test(prompt);
}

function detectPlatform({ prompt }: { prompt: string }): DeliveryPlatform {
	if (hasAny({ prompt, pattern: /(小红书|rednote|xiaohongshu)/i })) {
		return "xiaohongshu";
	}
	if (hasAny({ prompt, pattern: /(抖音|快手|tiktok|reels|shorts)/i })) {
		return "douyin";
	}
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
}): AspectRatio {
	if (/(4\s*:\s*5|四比五)/i.test(prompt)) return "4:5";
	if (/(9\s*:\s*16|竖屏|抖音|快手|tiktok|shorts|reels)/i.test(prompt)) {
		return "9:16";
	}
	if (/(1\s*:\s*1|方形|正方形)/i.test(prompt)) return "1:1";
	if (/(16\s*:\s*9|横屏|宽屏|b站|哔哩|bilibili|youtube)/i.test(prompt)) {
		return "16:9";
	}
	if (platform === "douyin") return "9:16";
	if (platform === "xiaohongshu") return "4:5";
	return "16:9";
}

function detectTargetDurationSeconds(prompt: string): number | undefined {
	const secondsMatch = prompt.match(/(\d{1,3})\s*(秒|s|sec|second)/i);
	if (secondsMatch?.[1]) return Number(secondsMatch[1]);

	const minuteMatch = prompt.match(/(\d{1,2})\s*(分钟|分|min|minute)/i);
	if (minuteMatch?.[1]) return Number(minuteMatch[1]) * 60;

	return undefined;
}

function detectStyle(prompt: string): string {
	if (/(高级纪录片|纪录片|观察式纪录|真实记录)/i.test(prompt)) {
		return "高级纪录片";
	}
	if (/(赛事高光|比赛高光|关键回放|体育集锦)/i.test(prompt)) {
		return "赛事高光";
	}
	if (/(热血燃剪|燃剪|高燃|鼓点快切|节拍驱动)/i.test(prompt)) {
		return "热血燃剪";
	}
	if (/(清爽知识|知识口播|清晰口播|教程|讲解|课程)/i.test(prompt)) {
		return "清爽知识感";
	}
	if (/(社媒精致|种草|封面感|小红书风格)/i.test(prompt)) {
		return "社媒精致感";
	}
	if (/(科技发布|数据标签|界面动效|产品发布)/i.test(prompt)) {
		return "科技发布感";
	}
	if (/(电影情绪|情绪短片|电影化|氛围短片)/i.test(prompt)) {
		return "电影情绪感";
	}
	if (/(比赛|赛后|高光|精彩)/i.test(prompt)) return "高光节奏";
	if (/(vlog|日常|记录)/i.test(prompt)) return "自然记录";
	return "干净精简";
}

function buildTarget(prompt: string): EditTarget {
	const platform = detectPlatform({ prompt });
	const aspectRatio = detectAspectRatio({ prompt, platform });
	const targetDurationSeconds = detectTargetDurationSeconds(prompt);
	const labelByPlatform: Record<DeliveryPlatform, string> = {
		generic: "通用成片",
		douyin: "抖音 / 竖屏短视频",
		xiaohongshu: "小红书 / 4:5 成片",
		bilibili: "Bilibili / 横屏视频",
		youtube: "YouTube / 横屏视频",
		podcast: "播客 / 访谈精选",
	};

	return {
		platform,
		label: labelByPlatform[platform],
		aspectRatio,
		...(targetDurationSeconds ? { targetDurationSeconds } : {}),
		style: detectStyle(prompt),
	};
}

function detectHook(prompt: string): string {
	if (/(最强画面|最精彩结果|前\s*3\s*秒|强开场|第一秒)/i.test(prompt)) {
		return "前 3 秒直接给最强画面和结果，让观众立刻知道为什么要继续看";
	}
	if (/(活动复盘|比赛|赛后|最终亮点|结果先行)/i.test(prompt)) {
		return "先给结果和最高光瞬间，再回到过程建立期待";
	}
	if (/(产品展示|核心价值|功能演示|痛点)/i.test(prompt)) {
		return "先亮出核心价值和最终效果，再解释它如何做到";
	}
	if (/(口播|知识|教程|观点)/i.test(prompt)) {
		return "用一句结论或最有反差的观点开场，快速建立问题";
	}
	return "从素材中选择信息最清楚、情绪最明确的镜头作为开场";
}

function detectNarrative(prompt: string): string {
	if (/(高级纪录片|纪录片|真实记录)/i.test(prompt)) {
		return "观察式纪录叙事：环境建立、人物行动、关键变化、余韵收尾";
	}
	if (/(活动复盘|比赛|赛后|关键回放)/i.test(prompt)) {
		return "结果先行的复盘叙事：亮点、过程、高潮回放、人物反应、结果收束";
	}
	if (/(口播|知识|教程|讲解|观点)/i.test(prompt)) {
		return "观点分段叙事：问题、结论、证据或示例、行动总结";
	}
	if (/(产品展示|功能演示|痛点|核心价值)/i.test(prompt)) {
		return "价值证明叙事：痛点、核心能力、实际演示、结果证据、行动信息";
	}
	if (/(社媒|种草|小红书)/i.test(prompt)) {
		return "轻量社媒叙事：结果吸引、细节展示、关键信息、自然推荐";
	}
	if (/(情绪短片|电影情绪|氛围)/i.test(prompt)) {
		return "情绪递进叙事：空间与细节、人物状态、情绪高潮、留白收尾";
	}
	return "清楚的四段结构：开场钩子、主体推进、最高点、记忆点结尾";
}

function detectCaptionStyle(prompt: string): string {
	if (/(极简电影字幕|电影字幕)/i.test(prompt)) {
		return "极简电影字幕，只在必要处出现并保留画面呼吸";
	}
	if (/(双语精致字幕|双语字幕|中英字幕)/i.test(prompt)) {
		return "双语精致字幕，中文为主、英文为辅，术语保持一致";
	}
	if (/(信息卡片字幕|观点卡片|小标题)/i.test(prompt)) {
		return "信息卡片字幕，用小标题、观点卡片和一句总结建立层级";
	}
	if (/(大字高能字幕|关键词放大|高能字幕)/i.test(prompt)) {
		return "大字高能字幕，短句分行、关键词放大并避开移动端安全区";
	}
	if (/(关键词字幕|突出关键词)/i.test(prompt)) {
		return "清爽关键词字幕，用字重或颜色突出重点";
	}
	if (/(字幕|caption|subtitle)/i.test(prompt)) {
		return "清楚易读的智能字幕，按语义分行且不遮挡主体";
	}
	return "只在理解内容所必需的位置使用少量说明文字";
}

function detectMotionStyle(prompt: string): string {
	if (/(慢动作回放|慢镜回放|关键回放|慢动作)/i.test(prompt)) {
		return "慢动作回放，关键动作前后留出呼吸并穿插人物反应";
	}
	if (/(鼓点快切|音乐卡点|按鼓点|节拍驱动)/i.test(prompt)) {
		return "鼓点快切，高潮用短促推拉和速度变化提升能量";
	}
	if (/(轻滑动效|轻滑|卡片入场)/i.test(prompt)) {
		return "轻滑动效，搭配微缩放和克制的信息卡片入场";
	}
	if (/(电影转场|动作匹配|声音桥)/i.test(prompt)) {
		return "电影化动作匹配与声音桥，少量淡化，避免模板感";
	}
	if (/(干净硬切|硬切|少转场|转场克制)/i.test(prompt)) {
		return "干净硬切为主，段落之间只做轻微淡入淡出";
	}
	return "自然硬切为主，只在层级变化时加入短促、易理解的动效";
}

function detectAudioStrategy(prompt: string): string {
	if (/(电影氛围|声音桥|环境声.*递进|保留环境声)/i.test(prompt)) {
		return "环境声与声音桥主导的电影氛围混音，配乐克制并跟随情绪递进";
	}
	if (/(节拍驱动|音乐卡点|按音乐卡点|鼓点)/i.test(prompt)) {
		return "音乐卡点与节拍驱动，高潮抬升能量，人声出现时自动闪避";
	}
	if (/(人声优先|降噪|音乐不能压过人声|背景音乐.*降低)/i.test(prompt)) {
		return "人声优先，适度降噪和停顿压缩，背景音乐自动闪避";
	}
	if (/(现场原声|欢呼|掌声|保留现场声音)/i.test(prompt)) {
		return "现场原声优先，保留欢呼、掌声和空间氛围";
	}
	return "自动平衡人声、音乐和环境声，内容清晰度优先";
}

function detectColorMood(prompt: string): string {
	if (/(高级纪录片|纪录片|克制调色|自然调色)/i.test(prompt)) {
		return "克制自然的纪录片色彩，保留肤色和环境层次";
	}
	if (/(热血燃剪|高燃|高对比)/i.test(prompt)) {
		return "高对比、高能量色彩，保护高光并保持人物肤色自然";
	}
	if (/(社媒精致|种草|封面感)/i.test(prompt)) {
		return "明亮干净的社媒色彩，细节清楚且不过度磨皮";
	}
	if (/(科技发布|冷静专业|数据标签)/i.test(prompt)) {
		return "中性偏冷的科技色彩，用局部高亮强调信息";
	}
	if (/(电影情绪|情绪短片|光影)/i.test(prompt)) {
		return "保留光影层次的电影色彩，让情绪而不是滤镜主导画面";
	}
	return "统一曝光、白平衡和肤色，保持干净但不过度风格化";
}

function buildOutputVariants({
	prompt,
	target,
}: {
	prompt: string;
	target: EditTarget;
}): EditOutputVariant[] {
	const variants: EditOutputVariant[] = [
		{
			label: "主版本",
			aspectRatio: target.aspectRatio,
			...(target.targetDurationSeconds
				? { targetDurationSeconds: target.targetDurationSeconds }
				: {}),
		},
	];

	if (/(横竖双版本|横屏和竖屏双版本|同时交付横屏和竖屏|多版本)/i.test(prompt)) {
		for (const variant of [
			{ label: "竖屏发布版", aspectRatio: "9:16" as const },
			{ label: "横屏完整版", aspectRatio: "16:9" as const },
		]) {
			if (!variants.some((item) => item.aspectRatio === variant.aspectRatio)) {
				variants.push({
					...variant,
					...(target.targetDurationSeconds
						? { targetDurationSeconds: target.targetDurationSeconds }
						: {}),
				});
			}
		}
	}

	return variants;
}

function buildCreativeDirection({
	prompt,
	target,
}: {
	prompt: string;
	target: EditTarget;
}): CreativeDirection {
	return {
		hook: detectHook(prompt),
		narrative: detectNarrative(prompt),
		captionStyle: detectCaptionStyle(prompt),
		motionStyle: detectMotionStyle(prompt),
		audioStrategy: detectAudioStrategy(prompt),
		colorMood: detectColorMood(prompt),
		outputVariants: buildOutputVariants({ prompt, target }),
	};
}

function buildSummary({
	input,
	target,
	creativeDirection,
}: {
	input: PlannerInput;
	target: EditTarget;
	creativeDirection: CreativeDirection;
}): string {
	const duration =
		target.targetDurationSeconds != null
			? `，目标约 ${target.targetDurationSeconds} 秒`
			: "";
	const versions =
		creativeDirection.outputVariants.length > 1
			? `，交付 ${creativeDirection.outputVariants.length} 个画幅版本`
			: "";
	return `${target.label}，${target.aspectRatio} 画幅${duration}，采用“${target.style}”${versions}。已读取 ${input.assetCount} 个素材和 ${input.timelineElementCount} 个时间线片段，将先做可撤销本地整理，再完成内容识别与创意包装。`;
}

function buildChecklist({
	target,
	creativeDirection,
}: {
	target: EditTarget;
	creativeDirection: CreativeDirection;
}): string[] {
	const checklist = [
		`画幅确认：${target.aspectRatio}，人物、字幕和关键物体没有被裁掉`,
		`风格确认：${target.style} 与素材情绪一致，没有为了动效牺牲内容`,
		`字幕确认：${creativeDirection.captionStyle}`,
		"声音检查：人声清楚，背景音乐不过载，段落切换没有突兀爆音",
		"导出检查：开头无黑帧、结尾不截断，导出文件可以完整播放",
	];
	if (target.targetDurationSeconds != null) {
		checklist.splice(1, 0, `时长确认：接近 ${target.targetDurationSeconds} 秒`);
	}
	if (target.platform === "douyin" || target.platform === "xiaohongshu") {
		checklist.push("移动端安全区：标题、字幕、人物脸和 LOGO 不被平台按钮遮挡");
	}
	if (creativeDirection.outputVariants.length > 1) {
		checklist.push("多版本检查：每个画幅都重新检查构图、字幕换行和封面画面");
	}
	return checklist;
}

function buildRiskNotes(input: PlannerInput): string[] {
	const notes = [
		"VisionCut 默认只在浏览器本地处理素材；外部步骤需要你单独确认并交接原文件。",
	];
	if (input.assetCount === 0)
		notes.push("项目还没有素材，必须先导入视频或音频。");
	if (input.durationSeconds > 900) {
		notes.push("素材较长，浏览器本地预览和导出会更吃内存，建议分段处理。");
	}
	return notes;
}

export function createEditPlan(input: PlannerInput): EditPlan {
	const prompt = input.prompt.trim();
	const target = buildTarget(prompt);
	const creativeDirection = buildCreativeDirection({ prompt, target });
	const steps: EditPlanStep[] = [];
	const hasMedia = input.assetCount > 0 || input.timelineElementCount > 0;

	if (!hasMedia) {
		steps.push({
			id: stepId("import-media"),
			kind: "import-media",
			title: "导入素材",
			description:
				"当前项目没有可分析的素材。先导入视频、图片或音频后再生成剪辑方案。",
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
			description:
				"视频和图片依次追加到主轨，音频从时间线起点放入独立音频轨道。",
			...execution,
			enabled: true,
		});
	}

	const wantsTighterCut =
		input.videoClipCount > 0 &&
		(hasAny({
			prompt,
			pattern:
				/(节奏|紧凑|紧剪|片头|片尾|空白|粗剪|快速高光|热血燃剪|口播|trim|tight|rough cut)/i,
		}) ||
			!hasAny({
				prompt,
				pattern: /(字幕|转录|高光|精彩|静音|停顿|silence|caption|transcri)/i,
			}));
	if (wantsTighterCut) {
		steps.push({
			id: stepId("tighten-clips"),
			kind: "tighten-clips",
			title: "基于内容收紧片段",
			description:
				"需要真实语音、动作或空白边界作为切点证据；不会在本机盲目固定裁掉片段首尾。",
			executor: "chatcut",
			availability: "handoff",
			enabled: input.mode !== "local",
		});
	}

	if (hasMedia) {
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

	if (
		hasMedia &&
		hasAny({ prompt, pattern: /(静音|停顿|口癖|silence|pause)/i })
	) {
		steps.push({
			id: stepId("remove-silence"),
			kind: "remove-silence",
			title: "检测并压缩静音停顿",
			description: "由 ChatCut 分析音频，生成可核对的停顿与口癖剪切点。",
			executor: "chatcut",
			availability: "handoff",
			enabled: input.mode !== "local",
		});
	}

	if (
		hasMedia &&
		hasAny({ prompt, pattern: /(字幕|转录|caption|subtitle|transcri)/i })
	) {
		steps.push({
			id: stepId("transcribe-captions"),
			kind: "transcribe-captions",
			title: "转录并生成字幕",
			description: `由 ChatCut 完成语音识别、语义分行和字幕时间轴，采用“${creativeDirection.captionStyle}”。`,
			executor: "chatcut",
			availability: "handoff",
			enabled: input.mode !== "local",
		});
	}

	if (
		hasMedia &&
		hasAny({
			prompt,
			pattern:
				/(高光|精彩|重点|语义|精华|自动筛掉|自动找|最终亮点|\d+\s*(秒|分钟)|highlight|best|summary)/i,
		})
	) {
		steps.push({
			id: stepId("semantic-highlights"),
			kind: "semantic-highlights",
			title: "按内容筛选重点片段",
			description: `由 ChatCut 根据“${creativeDirection.narrative}”筛选、排序并生成精选版本。`,
			executor: "chatcut",
			availability: "handoff",
			enabled: input.mode !== "local",
		});
	}

	if (
		hasMedia &&
		hasAny({
			prompt,
			pattern:
				/(高级纪录片|热血燃剪|赛事高光|社媒精致|科技发布|电影情绪|清爽知识|极简电影字幕|大字高能字幕|信息卡片字幕|双语精致字幕|鼓点快切|轻滑动效|慢动作回放|电影转场|克制调色|高对比|B-roll)/i,
		})
	) {
		steps.push({
			id: stepId("creative-polish"),
			kind: "creative-polish",
			title: `完成“${target.style}”创意包装`,
			description: `按蓝图统一字幕、动效和色彩：${creativeDirection.captionStyle}；${creativeDirection.motionStyle}；${creativeDirection.colorMood}。`,
			executor: "chatcut",
			availability: "handoff",
			enabled: input.mode !== "local",
		});
	}

	if (
		hasMedia &&
		hasAny({
			prompt,
			pattern:
				/(声音设计|混音|环境声|现场原声|欢呼|掌声|配乐|背景音乐|音乐卡点|节拍驱动|声音桥|人声优先|降噪)/i,
		})
	) {
		steps.push({
			id: stepId("audio-design"),
			kind: "audio-design",
			title: "设计声音层次与混音",
			description: creativeDirection.audioStrategy,
			executor: "chatcut",
			availability: "handoff",
			enabled: input.mode !== "local",
		});
	}

	if (hasMedia && creativeDirection.outputVariants.length > 1) {
		steps.push({
			id: stepId("create-versions"),
			kind: "create-versions",
			title: `生成 ${creativeDirection.outputVariants.length} 个发布版本`,
			description: creativeDirection.outputVariants
				.map((variant) => `${variant.label} ${variant.aspectRatio}`)
				.join("，"),
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
		creativeDirection,
		summary: buildSummary({ input, target, creativeDirection }),
		reviewChecklist: buildChecklist({ target, creativeDirection }),
		riskNotes: buildRiskNotes(input),
		steps,
	};
}
