export interface CreativeBriefOption {
	id: string;
	label: string;
	meta: string;
	prompt: string;
	tone?: "cyan" | "emerald" | "amber" | "rose" | "violet" | "zinc";
}

export const CREATIVE_BRIEF_CATALOG = {
	recipes: [
		{
			id: "quick-highlight",
			label: "快速高光",
			meta: "自动找重点，60 秒内直接出片",
			prompt:
				"成片类型：快速高光。自动筛掉无效片段，前 3 秒给最精彩结果，主体紧凑，结尾保留记忆点，控制在 60 秒以内。",
			tone: "cyan",
		},
		{
			id: "event-recap",
			label: "活动复盘",
			meta: "结果先行，过程完整，高潮回放",
			prompt:
				"成片类型：活动复盘。开头先给最终亮点，中间按时间线讲清关键过程，穿插人物反应和关键回放，结尾落到结果与记忆点。",
			tone: "amber",
		},
		{
			id: "talking-head",
			label: "口播知识",
			meta: "压缩停顿，观点分段，字幕优先",
			prompt:
				"成片类型：口播知识。压缩停顿和口癖，按观点分段，保留逻辑完整，用 B-roll 遮挡跳切并突出关键词。",
			tone: "emerald",
		},
		{
			id: "social-story",
			label: "社媒种草",
			meta: "第一眼见结果，画面精致可截图",
			prompt:
				"成片类型：社媒种草。第一屏先展示结果或最有吸引力的画面，内容短句化，保留细节特写和可截图的信息画面。",
			tone: "rose",
		},
		{
			id: "cinematic-story",
			label: "情绪短片",
			meta: "氛围铺垫，情绪递进，收尾留白",
			prompt:
				"成片类型：情绪短片。用环境和细节镜头建立氛围，情绪逐步递进，高潮克制，结尾保留余韵和画面留白。",
			tone: "violet",
		},
		{
			id: "product-showcase",
			label: "产品展示",
			meta: "痛点、演示、证据、行动一步到位",
			prompt:
				"成片类型：产品展示。开头给核心价值，中间按痛点、功能演示和效果证据推进，结尾给清楚的行动信息。",
			tone: "zinc",
		},
	],
	platforms: [
		{
			id: "auto",
			label: "AI 自动匹配",
			meta: "按素材内容判断画幅和时长",
			prompt: "发布平台：请根据素材内容自动判断最合适的平台、画幅和目标时长。",
		},
		{
			id: "douyin",
			label: "抖音 / Reels",
			meta: "9:16，25-60 秒，强开场",
			prompt:
				"发布平台：抖音、Reels 或 Shorts，使用 9:16 竖屏，前 3 秒必须建立吸引力。",
		},
		{
			id: "xiaohongshu",
			label: "小红书",
			meta: "4:5，30-90 秒，信息清楚",
			prompt:
				"发布平台：小红书，使用 4:5 画幅，保留精致细节和可截图的信息排版。",
		},
		{
			id: "wide",
			label: "B 站 / YouTube",
			meta: "16:9，叙事完整，适合长内容",
			prompt:
				"发布平台：B 站或 YouTube，使用 16:9 横屏，保留完整铺垫、过程、高潮和总结。",
		},
		{
			id: "dual",
			label: "横竖双版本",
			meta: "同一内容同时适配 16:9 与 9:16",
			prompt:
				"发布平台：同时交付横屏和竖屏双版本，主版 9:16，并额外生成 16:9 版本。",
		},
	],
	styles: [
		{
			id: "auto",
			label: "AI 判断风格",
			meta: "让内容本身决定视觉性格",
			prompt:
				"视觉风格：先判断素材情绪、镜头质量和内容类型，再选择最自然的视觉风格。",
			tone: "cyan",
		},
		{
			id: "documentary",
			label: "高级纪录片",
			meta: "克制调色，真实环境声，少量字幕",
			prompt:
				"视觉风格：高级纪录片，调色克制自然，保留真实环境声和呼吸感，避免花哨包装。",
			tone: "zinc",
		},
		{
			id: "energetic",
			label: "热血燃剪",
			meta: "高对比，快速切点，高潮爆发",
			prompt:
				"视觉风格：热血燃剪，高对比、快节奏，高潮使用速度变化和强切点，开场直接给最强画面。",
			tone: "rose",
		},
		{
			id: "clean-knowledge",
			label: "清爽知识感",
			meta: "信息有层级，画面干净，逻辑优先",
			prompt:
				"视觉风格：清爽知识口播，画面干净，观点层级明确，B-roll 与信息图只服务于理解。",
			tone: "emerald",
		},
		{
			id: "social-polish",
			label: "社媒精致感",
			meta: "封面感构图，轻盈排版，细节特写",
			prompt:
				"视觉风格：社媒精致感，保留封面感构图、细节特写和轻盈信息排版，整体舒适不拥挤。",
			tone: "rose",
		},
		{
			id: "tech-launch",
			label: "科技发布感",
			meta: "数据标签，界面节奏，冷静专业",
			prompt:
				"视觉风格：科技发布感，使用克制的数据标签和界面动效，节奏清晰，整体冷静专业。",
			tone: "cyan",
		},
		{
			id: "sports-highlight",
			label: "赛事高光",
			meta: "关键动作，慢镜回放，人物反应",
			prompt:
				"视觉风格：赛事高光，关键动作慢镜回放，穿插观众或队友反应，高潮保留现场声音。",
			tone: "amber",
		},
		{
			id: "cinematic-emotion",
			label: "电影情绪感",
			meta: "光影层次，细节叙事，节奏留白",
			prompt:
				"视觉风格：电影情绪感，强调光影、空间和细节叙事，镜头节奏留白，避免过度解释。",
			tone: "violet",
		},
	],
	captions: [
		{
			id: "smart",
			label: "AI 智能字幕",
			meta: "按内容密度自动选择",
			prompt:
				"字幕包装：根据内容密度自动选择字幕样式，保证清楚、简洁且不遮挡主体。",
		},
		{
			id: "high-energy",
			label: "大字高能字幕",
			meta: "短句分行，关键词放大",
			prompt: "字幕包装：大字高能字幕，短句分行，关键词放大，适配竖屏安全区。",
		},
		{
			id: "keyword",
			label: "关键词字幕",
			meta: "口播清楚，重点一眼可见",
			prompt:
				"字幕包装：清爽关键词字幕，完整表达观点，并用颜色或字重突出关键词。",
		},
		{
			id: "info-card",
			label: "信息卡片字幕",
			meta: "小标题、观点卡片、结尾总结",
			prompt:
				"字幕包装：信息卡片字幕，每段给小标题，关键观点做卡片，结尾保留一句总结。",
		},
		{
			id: "bilingual",
			label: "双语精致字幕",
			meta: "中英层级清楚，术语一致",
			prompt: "字幕包装：双语精致字幕，中文为主、英文为辅，术语翻译前后一致。",
		},
		{
			id: "minimal-film",
			label: "极简电影字幕",
			meta: "只在必要处出现，保留呼吸感",
			prompt:
				"字幕包装：极简电影字幕，只在必要处出现，字号克制，保留画面呼吸感。",
		},
	],
	motions: [
		{
			id: "clean-cut",
			label: "干净硬切",
			meta: "少转场，段落间轻淡化",
			prompt: "转场动效：以干净硬切为主，只在段落切换处使用轻微淡入淡出。",
		},
		{
			id: "beat-cut",
			label: "鼓点快切",
			meta: "音乐卡点，短促推拉，速度变化",
			prompt:
				"转场动效：鼓点快切，按音乐卡点切镜头，高潮使用短促推拉和速度变化。",
		},
		{
			id: "light-slide",
			label: "轻滑动效",
			meta: "轻滑、缩放、卡片入场",
			prompt:
				"转场动效：轻滑动效，使用轻滑、微缩放和信息卡片入场，保持精致克制。",
		},
		{
			id: "slow-replay",
			label: "慢动作回放",
			meta: "关键动作慢放，回放前后留呼吸",
			prompt:
				"转场动效：关键动作使用慢动作回放，回放前后保留短暂停顿和人物反应。",
		},
		{
			id: "cinematic",
			label: "电影转场",
			meta: "动作匹配，声音桥，克制淡化",
			prompt:
				"转场动效：电影化动作匹配和声音桥为主，少量克制淡化，不使用模板感强的转场。",
		},
	],
	audio: [
		{
			id: "balanced",
			label: "AI 自动混音",
			meta: "人声、音乐、环境声自动平衡",
			prompt: "声音设计：自动平衡人声、音乐和环境声，优先保证内容清楚。",
		},
		{
			id: "voice-first",
			label: "人声优先",
			meta: "降噪、压停顿、音乐自动闪避",
			prompt:
				"声音设计：人声优先，适度降噪和压缩停顿，背景音乐在人声出现时自动降低。",
		},
		{
			id: "cinematic",
			label: "电影氛围",
			meta: "环境声、声音桥、克制配乐",
			prompt:
				"声音设计：电影氛围，保留环境声，用声音桥衔接段落，配乐克制并跟随情绪递进。",
		},
		{
			id: "beat-driven",
			label: "节拍驱动",
			meta: "鼓点卡切，高潮抬升，结尾收束",
			prompt:
				"声音设计：节拍驱动，镜头按音乐卡点，高潮抬升能量，结尾自然收束。",
		},
		{
			id: "natural-ambience",
			label: "现场原声",
			meta: "保留欢呼、掌声、空间氛围",
			prompt:
				"声音设计：现场原声优先，保留欢呼、掌声和空间氛围，音乐只做轻度支撑。",
		},
	],
	delivery: [
		{
			id: "safe-zone",
			label: "移动端安全区",
			meta: "人物、字幕、LOGO 不贴边",
			prompt:
				"交付要求：检查移动端安全区，人物、字幕和 LOGO 不得被平台界面遮挡。",
		},
		{
			id: "dual-version",
			label: "横竖双版本",
			meta: "额外交付 16:9 与 9:16",
			prompt: "交付要求：同时生成横屏和竖屏双版本，分别检查构图和字幕安全区。",
		},
		{
			id: "cover-frame",
			label: "封面候选",
			meta: "保留 3 个可做封面的画面",
			prompt: "交付要求：保留 3 个清楚、有主体、可加标题的封面候选画面。",
		},
		{
			id: "accessibility",
			label: "无声可读",
			meta: "静音播放也能看懂",
			prompt: "交付要求：确保静音播放时仍能通过字幕和信息卡片理解主要内容。",
		},
		{
			id: "export-check",
			label: "导出复检",
			meta: "检查黑帧、截断、峰值和可播放性",
			prompt: "交付要求：导出后复检黑帧、结尾截断、声音峰值和文件可播放性。",
		},
	],
} as const satisfies Record<string, readonly CreativeBriefOption[]>;

export interface CreativeBriefSelection {
	recipeId: string | null;
	platformId: string | null;
	styleId: string | null;
	captionId: string | null;
	motionId: string | null;
	audioId: string | null;
	deliveryIds: string[];
}

export function createDefaultCreativeBrief(): CreativeBriefSelection {
	return {
		recipeId: "quick-highlight",
		platformId: "auto",
		styleId: "auto",
		captionId: "smart",
		motionId: "clean-cut",
		audioId: "balanced",
		deliveryIds: ["safe-zone", "export-check"],
	};
}

function findOption({
	options,
	id,
}: {
	options: readonly CreativeBriefOption[];
	id: string | null;
}): CreativeBriefOption | undefined {
	return id ? options.find((option) => option.id === id) : undefined;
}

export function composeCreativeBriefPrompt({
	brief,
	extraRequest,
}: {
	brief: CreativeBriefSelection;
	extraRequest?: string;
}): string {
	const selected = [
		findOption({ options: CREATIVE_BRIEF_CATALOG.recipes, id: brief.recipeId }),
		findOption({
			options: CREATIVE_BRIEF_CATALOG.platforms,
			id: brief.platformId,
		}),
		findOption({ options: CREATIVE_BRIEF_CATALOG.styles, id: brief.styleId }),
		findOption({
			options: CREATIVE_BRIEF_CATALOG.captions,
			id: brief.captionId,
		}),
		findOption({ options: CREATIVE_BRIEF_CATALOG.motions, id: brief.motionId }),
		findOption({ options: CREATIVE_BRIEF_CATALOG.audio, id: brief.audioId }),
		...brief.deliveryIds.map((id) =>
			findOption({ options: CREATIVE_BRIEF_CATALOG.delivery, id }),
		),
	].filter((option): option is CreativeBriefOption => option != null);

	const lines = selected.map((option) => option.prompt);
	const trimmedExtra = extraRequest?.trim();
	if (trimmedExtra) lines.push(`补充要求：${trimmedExtra}`);
	return lines.join("\n");
}

export function getCreativeBriefProgress(brief: CreativeBriefSelection): {
	completed: number;
	total: number;
} {
	const required = [
		brief.recipeId,
		brief.platformId,
		brief.styleId,
		brief.captionId,
		brief.motionId,
		brief.audioId,
	];
	return {
		completed: required.filter(Boolean).length,
		total: required.length,
	};
}

export function getSelectedCreativeBriefOptions(
	brief: CreativeBriefSelection,
): CreativeBriefOption[] {
	return [
		findOption({ options: CREATIVE_BRIEF_CATALOG.recipes, id: brief.recipeId }),
		findOption({
			options: CREATIVE_BRIEF_CATALOG.platforms,
			id: brief.platformId,
		}),
		findOption({ options: CREATIVE_BRIEF_CATALOG.styles, id: brief.styleId }),
		findOption({
			options: CREATIVE_BRIEF_CATALOG.captions,
			id: brief.captionId,
		}),
		findOption({ options: CREATIVE_BRIEF_CATALOG.motions, id: brief.motionId }),
		findOption({ options: CREATIVE_BRIEF_CATALOG.audio, id: brief.audioId }),
	].filter((option): option is CreativeBriefOption => option != null);
}
