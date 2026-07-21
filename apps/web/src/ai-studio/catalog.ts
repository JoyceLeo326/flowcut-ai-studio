import type { CreativeBriefSelection } from "@/ai-edit";

export type StudioExperience = "guided" | "pro";
export type StudioPhase = "understand" | "structure" | "polish" | "deliver";
export type StudioExecutor = "local" | "chatcut";
export type StudioAvailability = "ready" | "handoff" | "blocked";

export interface StudioCapability {
	id: string;
	title: string;
	beginnerLabel: string;
	proDescription: string;
	phase: StudioPhase;
	executor: StudioExecutor;
	estimatedSeconds: number;
}

export const STUDIO_PHASES: ReadonlyArray<{
	id: StudioPhase;
	label: string;
	description: string;
}> = [
	{ id: "understand", label: "理解素材", description: "听懂内容并建立镜头索引" },
	{ id: "structure", label: "设计成片", description: "选择重点并重组叙事" },
	{ id: "polish", label: "精修包装", description: "处理画面、声音与信息层级" },
	{ id: "deliver", label: "版本交付", description: "生成平台版本并完成质检" },
];

export const STUDIO_CAPABILITIES = [
	{
		id: "ingest-media",
		title: "媒体体检",
		beginnerLabel: "检查素材是否完整",
		proDescription: "读取编解码、帧率、声道、分辨率与损坏风险",
		phase: "understand",
		executor: "local",
		estimatedSeconds: 4,
	},
	{
		id: "transcribe-speech",
		title: "逐字转写",
		beginnerLabel: "把说话内容变成文字",
		proDescription: "生成带词级时间码的转写稿并识别语种",
		phase: "understand",
		executor: "local",
		estimatedSeconds: 22,
	},
	{
		id: "diarize-speakers",
		title: "说话人分离",
		beginnerLabel: "分清每个人在说什么",
		proDescription: "按声纹聚类说话人并建立角色轨道",
		phase: "understand",
		executor: "chatcut",
		estimatedSeconds: 18,
	},
	{
		id: "detect-scenes",
		title: "镜头边界",
		beginnerLabel: "自动识别每次换镜头",
		proDescription: "结合内容差异、淡入淡出与运动自适应检测切点",
		phase: "understand",
		executor: "chatcut",
		estimatedSeconds: 16,
	},
	{
		id: "detect-silence",
		title: "停顿检测",
		beginnerLabel: "找出没有有效表达的停顿",
		proDescription: "按时长阈值、语音活动与句法边界标记可裁停顿",
		phase: "understand",
		executor: "chatcut",
		estimatedSeconds: 12,
	},
	{
		id: "remove-fillers",
		title: "口头禅清理",
		beginnerLabel: "处理嗯、啊、然后等口头禅",
		proDescription: "标记填充词并按上下文选择删除、保留或进入复核",
		phase: "understand",
		executor: "chatcut",
		estimatedSeconds: 10,
	},
	{
		id: "remove-retakes",
		title: "重录识别",
		beginnerLabel: "自动保留说得最好的一遍",
		proDescription: "识别重复开头、说错重来与相似语义片段，保留最佳 take",
		phase: "understand",
		executor: "chatcut",
		estimatedSeconds: 14,
	},
	{
		id: "find-highlights",
		title: "高光评分",
		beginnerLabel: "找出最值得保留的部分",
		proDescription: "综合语义完整度、情绪、动作、清晰度与传播钩子评分",
		phase: "understand",
		executor: "chatcut",
		estimatedSeconds: 18,
	},
	{
		id: "chapter-story",
		title: "叙事分章",
		beginnerLabel: "把内容整理成好理解的段落",
		proDescription: "建立钩子、铺垫、证据、转折、高潮和收束结构",
		phase: "structure",
		executor: "chatcut",
		estimatedSeconds: 14,
	},
	{
		id: "edit-by-transcript",
		title: "文本剪辑",
		beginnerLabel: "像改文章一样删改视频",
		proDescription: "将段落级文本决策映射为可回滚的时间线编辑",
		phase: "structure",
		executor: "chatcut",
		estimatedSeconds: 12,
	},
	{
		id: "select-best-takes",
		title: "最佳镜次",
		beginnerLabel: "同一内容自动选最好的一条",
		proDescription: "按表演、清晰度、构图、稳定度与连续性选择镜次",
		phase: "structure",
		executor: "chatcut",
		estimatedSeconds: 14,
	},
	{
		id: "multicam-switch",
		title: "多机位导播",
		beginnerLabel: "自动切换当前说话的人",
		proDescription: "结合说话人、视线、反应镜头与最短镜头长度切机位",
		phase: "structure",
		executor: "chatcut",
		estimatedSeconds: 20,
	},
	{
		id: "beat-map",
		title: "节拍地图",
		beginnerLabel: "让镜头跟着音乐节奏变化",
		proDescription: "分析 BPM、重拍、段落、drop 与能量曲线",
		phase: "structure",
		executor: "chatcut",
		estimatedSeconds: 12,
	},
	{
		id: "auto-reframe",
		title: "智能重构图",
		beginnerLabel: "横屏竖屏都能跟住主体",
		proDescription: "按人脸、物体、视线和字幕安全区生成构图关键帧",
		phase: "structure",
		executor: "chatcut",
		estimatedSeconds: 18,
	},
	{
		id: "smooth-jump-cuts",
		title: "跳切修复",
		beginnerLabel: "让删停顿后的画面不生硬",
		proDescription: "以 J/L cut、环境底噪、形变缓冲和替代镜头隐藏跳切",
		phase: "polish",
		executor: "chatcut",
		estimatedSeconds: 16,
	},
	{
		id: "dynamic-punch-in",
		title: "动态推近",
		beginnerLabel: "重点句自动拉近画面",
		proDescription: "按语义重音控制推近幅度、持续时间与回位节奏",
		phase: "polish",
		executor: "chatcut",
		estimatedSeconds: 10,
	},
	{
		id: "insert-broll",
		title: "B-roll 编排",
		beginnerLabel: "给抽象内容补上相关画面",
		proDescription: "根据实体、动作、地点与情绪生成检索词并设计覆盖点",
		phase: "polish",
		executor: "chatcut",
		estimatedSeconds: 18,
	},
	{
		id: "generate-broll",
		title: "生成式镜头",
		beginnerLabel: "缺少的镜头交给 AI 生成",
		proDescription: "按镜头功能、景别、运动、连续性和画幅生成视觉任务",
		phase: "polish",
		executor: "chatcut",
		estimatedSeconds: 24,
	},
	{
		id: "keyword-captions",
		title: "关键词字幕",
		beginnerLabel: "自动突出重点词",
		proDescription: "按语义重音分行，控制每行字数、强调层级和安全区",
		phase: "polish",
		executor: "local",
		estimatedSeconds: 8,
	},
	{
		id: "bilingual-captions",
		title: "双语字幕",
		beginnerLabel: "生成中英双语字幕",
		proDescription: "术语表约束翻译并保持双语断句、层级与时间码一致",
		phase: "polish",
		executor: "chatcut",
		estimatedSeconds: 16,
	},
	{
		id: "motion-callouts",
		title: "信息动效",
		beginnerLabel: "重点自动出现标注和图解",
		proDescription: "按信息密度生成 callout、步骤卡、数据卡和路径动画",
		phase: "polish",
		executor: "chatcut",
		estimatedSeconds: 16,
	},
	{
		id: "title-cards",
		title: "章节标题",
		beginnerLabel: "自动给每一段加小标题",
		proDescription: "从章节摘要生成一致的标题层级与进出场节奏",
		phase: "polish",
		executor: "chatcut",
		estimatedSeconds: 8,
	},
	{
		id: "voice-cleanup",
		title: "人声修复",
		beginnerLabel: "让人声更干净、更清楚",
		proDescription: "执行降噪、去混响、去齿音、动态控制和音色一致化",
		phase: "polish",
		executor: "chatcut",
		estimatedSeconds: 18,
	},
	{
		id: "audio-ducking",
		title: "音乐闪避",
		beginnerLabel: "说话时自动压低背景音乐",
		proDescription: "按对白包络控制音乐衰减、attack、release 与恢复曲线",
		phase: "polish",
		executor: "chatcut",
		estimatedSeconds: 8,
	},
	{
		id: "loudness-mastering",
		title: "响度母带",
		beginnerLabel: "统一声音大小并避免爆音",
		proDescription: "按 LUFS、true peak 与平台规范完成响度和峰值检查",
		phase: "polish",
		executor: "local",
		estimatedSeconds: 8,
	},
	{
		id: "color-match",
		title: "镜头匹配",
		beginnerLabel: "统一不同片段的颜色",
		proDescription: "按曝光、白平衡、肤色和色彩空间匹配镜头组",
		phase: "polish",
		executor: "chatcut",
		estimatedSeconds: 16,
	},
	{
		id: "music-sync",
		title: "音乐卡点",
		beginnerLabel: "让关键动作准确踩点",
		proDescription: "将动作峰值、切点和速度变化吸附到节拍结构",
		phase: "polish",
		executor: "chatcut",
		estimatedSeconds: 14,
	},
	{
		id: "generate-covers",
		title: "封面组",
		beginnerLabel: "自动做多张可选封面",
		proDescription: "从高辨识度画面生成标题留白、人物和产品多构图候选",
		phase: "deliver",
		executor: "chatcut",
		estimatedSeconds: 20,
	},
	{
		id: "create-versions",
		title: "平台版本",
		beginnerLabel: "一次生成横屏、竖屏和方形版本",
		proDescription: "按平台重排构图、字幕、安全区、CTA 与时长",
		phase: "deliver",
		executor: "chatcut",
		estimatedSeconds: 20,
	},
	{
		id: "delivery-qc",
		title: "交付质检",
		beginnerLabel: "导出前自动检查问题",
		proDescription: "检查黑帧、静音、峰值、字幕溢出、结尾截断与可播放性",
		phase: "deliver",
		executor: "local",
		estimatedSeconds: 8,
	},
	{
		id: "export-timeline",
		title: "时间线交接",
		beginnerLabel: "保留一份可继续编辑的工程",
		proDescription: "生成 FlowCut JSON，并预留 OTIO/EDL/FCPXML 交换节点",
		phase: "deliver",
		executor: "local",
		estimatedSeconds: 4,
	},
] as const satisfies readonly StudioCapability[];

export type StudioCapabilityId = (typeof STUDIO_CAPABILITIES)[number]["id"];

export type AutomationCategory =
	| "popular"
	| "speech"
	| "social"
	| "story"
	| "commerce"
	| "music";

export interface AutomationRecipe {
	id: string;
	title: string;
	kicker: string;
	description: string;
	beginnerOutcome: string;
	proOutcome: string;
	category: AutomationCategory;
	durationLabel: string;
	accent: "cyan" | "emerald" | "amber" | "rose" | "violet" | "blue";
	featured?: boolean;
	keywords: readonly string[];
	capabilityIds: readonly StudioCapabilityId[];
	briefPreset: Pick<
		CreativeBriefSelection,
		"recipeId" | "styleId" | "captionId" | "motionId" | "audioId"
	>;
	directorPrompt: string;
}

const DELIVERY_CAPABILITIES = [
	"generate-covers",
	"create-versions",
	"delivery-qc",
	"export-timeline",
] as const satisfies readonly StudioCapabilityId[];

export const AUTOMATION_RECIPES = [
	{
		id: "talking-head-cleanup",
		title: "口播智能精剪",
		kicker: "说完就能交片",
		description: "从逐字稿开始，清理停顿、口头禅和重录，再补 B-roll、重点字幕和声音精修。",
		beginnerOutcome: "把一段冗长口播变成自然、紧凑、能直接发布的口播成片。",
		proOutcome: "可控 VAD 阈值、填充词策略、cut margin、punch-in、B-roll 密度和 LUFS。",
		category: "speech",
		durationLabel: "10-25 分钟",
		accent: "emerald",
		featured: true,
		keywords: ["口播", "停顿", "口头禅", "嗯啊", "重录", "知识", "说错"],
		capabilityIds: [
			"ingest-media",
			"transcribe-speech",
			"detect-silence",
			"remove-fillers",
			"remove-retakes",
			"edit-by-transcript",
			"smooth-jump-cuts",
			"dynamic-punch-in",
			"insert-broll",
			"keyword-captions",
			"voice-cleanup",
			"audio-ducking",
			...DELIVERY_CAPABILITIES,
		],
		briefPreset: {
			recipeId: "talking-head",
			styleId: "clean-knowledge",
			captionId: "keyword",
			motionId: "clean-cut",
			audioId: "voice-first",
		},
		directorPrompt:
			"优先处理停顿、口头禅和说错重来的片段；保持语义自然，用 B-roll 和轻微推近隐藏跳切，字幕突出关键词，并交付横竖版本。",
	},
	{
		id: "long-to-shorts",
		title: "长视频拆爆款",
		kicker: "一次找出多条短视频",
		description: "分析完整长内容，筛出可独立成立的观点、故事与反差，自动生成多条短视频。",
		beginnerOutcome: "从长视频中得到多条有开场钩子、有结论的短内容。",
		proOutcome: "可控高光评分、上下文窗口、重复覆盖率、目标时长和平台版本。",
		category: "social",
		durationLabel: "20-45 分钟",
		accent: "cyan",
		featured: true,
		keywords: ["长视频", "切片", "短视频", "高光", "爆款", "播客切片"],
		capabilityIds: [
			"ingest-media",
			"transcribe-speech",
			"detect-scenes",
			"find-highlights",
			"chapter-story",
			"edit-by-transcript",
			"auto-reframe",
			"insert-broll",
			"keyword-captions",
			...DELIVERY_CAPABILITIES,
		],
		briefPreset: {
			recipeId: "quick-highlight",
			styleId: "social-polish",
			captionId: "high-energy",
			motionId: "light-slide",
			audioId: "voice-first",
		},
		directorPrompt:
			"从长内容中选择可以独立传播的完整观点，每条先给最强钩子，补足必要上下文，避免不同版本重复表达。",
	},
	{
		id: "podcast-multicam",
		title: "播客多机位导播",
		kicker: "识别人和话题自动切机",
		description: "分离说话人，跟随对话和反应镜头切换机位，同时生成章节、字幕与短切片。",
		beginnerOutcome: "像有现场导播一样自动完成多人播客剪辑。",
		proOutcome: "可控最短镜头、切机延迟、反应镜头权重、L-cut 与角色音轨。",
		category: "speech",
		durationLabel: "25-60 分钟",
		accent: "blue",
		featured: true,
		keywords: ["播客", "访谈", "多人", "多机位", "对谈", "采访"],
		capabilityIds: [
			"ingest-media",
			"transcribe-speech",
			"diarize-speakers",
			"detect-silence",
			"chapter-story",
			"multicam-switch",
			"smooth-jump-cuts",
			"bilingual-captions",
			"voice-cleanup",
			"loudness-mastering",
			...DELIVERY_CAPABILITIES,
		],
		briefPreset: {
			recipeId: "talking-head",
			styleId: "documentary",
			captionId: "bilingual",
			motionId: "clean-cut",
			audioId: "voice-first",
		},
		directorPrompt:
			"识别每位说话人并自然切换机位，保留有效反应镜头和对话呼吸感，输出完整播客与多条观点短视频。",
	},
	{
		id: "event-recap",
		title: "活动高光回顾",
		kicker: "从散乱素材到完整事件",
		description: "按到场、过程、高潮、结果和人物反应重组多机素材，并保留品牌与现场声。",
		beginnerOutcome: "把大量活动片段变成有开场、有高潮、有结果的回顾片。",
		proOutcome: "可控镜头去重、人物覆盖、节拍段落、赞助露出和现场声比例。",
		category: "story",
		durationLabel: "20-40 分钟",
		accent: "amber",
		featured: true,
		keywords: ["活动", "比赛", "会议", "年会", "回顾", "花絮", "现场"],
		capabilityIds: [
			"ingest-media",
			"detect-scenes",
			"find-highlights",
			"select-best-takes",
			"chapter-story",
			"beat-map",
			"music-sync",
			"color-match",
			"title-cards",
			"loudness-mastering",
			...DELIVERY_CAPABILITIES,
		],
		briefPreset: {
			recipeId: "event-recap",
			styleId: "energetic",
			captionId: "info-card",
			motionId: "beat-cut",
			audioId: "natural-ambience",
		},
		directorPrompt:
			"先给活动结果和最强现场反应，再按关键过程推进到高潮；保留现场声、人物情绪、品牌露出和结尾记忆点。",
	},
	{
		id: "product-story",
		title: "产品故事成片",
		kicker: "价值、演示、证据、行动",
		description: "从产品素材中提炼卖点，用演示、细节、证据和生成式补镜构成完整商业叙事。",
		beginnerOutcome: "自动做出清楚说明产品价值的种草或发布视频。",
		proOutcome: "可控 USP 顺序、证据镜头、产品安全构图、CTA 与渠道版本。",
		category: "commerce",
		durationLabel: "15-35 分钟",
		accent: "rose",
		featured: true,
		keywords: ["产品", "商品", "种草", "广告", "电商", "发布", "品牌"],
		capabilityIds: [
			"ingest-media",
			"detect-scenes",
			"find-highlights",
			"chapter-story",
			"select-best-takes",
			"generate-broll",
			"motion-callouts",
			"color-match",
			"audio-ducking",
			...DELIVERY_CAPABILITIES,
		],
		briefPreset: {
			recipeId: "product-showcase",
			styleId: "social-polish",
			captionId: "info-card",
			motionId: "light-slide",
			audioId: "balanced",
		},
		directorPrompt:
			"按痛点、核心价值、操作演示、效果证据和行动引导组织产品故事；缺少的细节镜头进入生成式 B-roll 队列。",
	},
	{
		id: "interview-story",
		title: "采访故事重构",
		kicker: "让答案组成一条故事线",
		description: "移除提问和重复答案，按主题重组内容，以 L-cut、档案和环境镜头建立纪录片叙事。",
		beginnerOutcome: "把零散采访回答整理成自然连贯的人物故事。",
		proOutcome: "可控问题保留、语义重排、连续性、L-cut 长度和档案镜头密度。",
		category: "story",
		durationLabel: "25-50 分钟",
		accent: "violet",
		keywords: ["采访", "人物", "故事", "纪录片", "口述", "专题"],
		capabilityIds: [
			"ingest-media",
			"transcribe-speech",
			"diarize-speakers",
			"remove-retakes",
			"chapter-story",
			"edit-by-transcript",
			"insert-broll",
			"smooth-jump-cuts",
			"bilingual-captions",
			"voice-cleanup",
			...DELIVERY_CAPABILITIES,
		],
		briefPreset: {
			recipeId: "cinematic-story",
			styleId: "documentary",
			captionId: "minimal-film",
			motionId: "cinematic",
			audioId: "cinematic",
		},
		directorPrompt:
			"去除无必要的提问和重复回答，按人物动机、冲突、转变和结论重组故事，用环境与档案镜头保持叙事连续。",
	},
	{
		id: "course-tutorial",
		title: "教程课程精简",
		kicker: "知识点清楚，操作跟得上",
		description: "删除等待和重复解释，按知识点分章，自动放大操作区域并生成步骤卡。",
		beginnerOutcome: "把录屏或课程变成节奏清楚、容易跟做的教程。",
		proOutcome: "可控章节粒度、鼠标聚焦、屏幕缩放、步骤卡密度和术语表。",
		category: "speech",
		durationLabel: "20-50 分钟",
		accent: "blue",
		keywords: ["教程", "课程", "录屏", "教学", "知识", "操作"],
		capabilityIds: [
			"ingest-media",
			"transcribe-speech",
			"detect-silence",
			"remove-retakes",
			"chapter-story",
			"edit-by-transcript",
			"motion-callouts",
			"title-cards",
			"keyword-captions",
			"voice-cleanup",
			...DELIVERY_CAPABILITIES,
		],
		briefPreset: {
			recipeId: "talking-head",
			styleId: "clean-knowledge",
			captionId: "info-card",
			motionId: "light-slide",
			audioId: "voice-first",
		},
		directorPrompt:
			"按知识点分章，删除等待和重复解释；操作步骤用局部放大、指示和步骤卡表达，确保字幕与屏幕内容不互相遮挡。",
	},
	{
		id: "travel-vlog",
		title: "旅行 Vlog 叙事",
		kicker: "地点、体验和情绪自然推进",
		description: "按地点和时间整理素材，保留环境声与人物反应，用节奏变化串起完整旅程。",
		beginnerOutcome: "把旅行碎片整理成有路线、有体验、有情绪的 Vlog。",
		proOutcome: "可控地点聚类、时间跳跃、环境声桥、蒙太奇密度与速度变化。",
		category: "story",
		durationLabel: "20-45 分钟",
		accent: "cyan",
		keywords: ["旅行", "vlog", "日常", "城市", "探店", "路线"],
		capabilityIds: [
			"ingest-media",
			"detect-scenes",
			"find-highlights",
			"select-best-takes",
			"chapter-story",
			"beat-map",
			"music-sync",
			"color-match",
			"title-cards",
			...DELIVERY_CAPABILITIES,
		],
		briefPreset: {
			recipeId: "cinematic-story",
			styleId: "cinematic-emotion",
			captionId: "minimal-film",
			motionId: "cinematic",
			audioId: "natural-ambience",
		},
		directorPrompt:
			"按地点、时间与体验推进旅程，保留关键环境声、人物反应和建立镜头；高潮提高节奏，结尾回到安静的记忆点。",
	},
	{
		id: "music-beat-cut",
		title: "音乐节奏燃剪",
		kicker: "让动作和镜头踩准每个重拍",
		description: "建立音乐能量与节拍地图，匹配动作峰值、镜头长度和速度变化。",
		beginnerOutcome: "自动完成有节奏、有高潮的卡点视频。",
		proOutcome: "可控 BPM 网格、切点偏移、drop 预留、speed ramp 与能量曲线。",
		category: "music",
		durationLabel: "12-30 分钟",
		accent: "rose",
		keywords: ["音乐", "卡点", "燃剪", "节奏", "MV", "舞蹈"],
		capabilityIds: [
			"ingest-media",
			"detect-scenes",
			"find-highlights",
			"beat-map",
			"select-best-takes",
			"music-sync",
			"color-match",
			"loudness-mastering",
			...DELIVERY_CAPABILITIES,
		],
		briefPreset: {
			recipeId: "quick-highlight",
			styleId: "energetic",
			captionId: "smart",
			motionId: "beat-cut",
			audioId: "beat-driven",
		},
		directorPrompt:
			"先分析音乐段落和能量曲线，再把动作峰值、切点与速度变化对齐重拍；drop 前保留蓄力，高潮集中最强镜头。",
	},
	{
		id: "sports-highlight",
		title: "赛事高光集锦",
		kicker: "动作、比分、反应一个不少",
		description: "识别关键动作与现场情绪，以重放、比分信息和观众反应构成赛事叙事。",
		beginnerOutcome: "从比赛素材中快速得到有高潮的高光集锦。",
		proOutcome: "可控事件窗口、慢放范围、反应镜头、现场声和比分安全区。",
		category: "popular",
		durationLabel: "20-45 分钟",
		accent: "amber",
		keywords: ["比赛", "体育", "赛事", "进球", "高光", "运动"],
		capabilityIds: [
			"ingest-media",
			"detect-scenes",
			"find-highlights",
			"select-best-takes",
			"beat-map",
			"music-sync",
			"motion-callouts",
			"color-match",
			"loudness-mastering",
			...DELIVERY_CAPABILITIES,
		],
		briefPreset: {
			recipeId: "event-recap",
			styleId: "sports-highlight",
			captionId: "info-card",
			motionId: "slow-replay",
			audioId: "natural-ambience",
		},
		directorPrompt:
			"围绕关键动作建立前因、瞬间、慢放和人物反应，保留现场欢呼与比分信息，并把最强结果放在开场。",
	},
	{
		id: "ugc-ad",
		title: "UGC 转化广告",
		kicker: "原生表达，清晰转化",
		description: "从真人体验中提取痛点、转折和证据，补充产品细节、字幕与多个 CTA 版本。",
		beginnerOutcome: "把真人分享变成自然但有说服力的短广告。",
		proOutcome: "可控 hook 变量、证据顺序、异议处理、CTA 和 A/B 版本。",
		category: "commerce",
		durationLabel: "15-30 分钟",
		accent: "emerald",
		keywords: ["UGC", "投流", "转化", "广告", "真人", "测评"],
		capabilityIds: [
			"ingest-media",
			"transcribe-speech",
			"detect-silence",
			"remove-fillers",
			"find-highlights",
			"chapter-story",
			"dynamic-punch-in",
			"insert-broll",
			"keyword-captions",
			"voice-cleanup",
			...DELIVERY_CAPABILITIES,
		],
		briefPreset: {
			recipeId: "social-story",
			styleId: "social-polish",
			captionId: "high-energy",
			motionId: "light-slide",
			audioId: "voice-first",
		},
		directorPrompt:
			"保留真人表达的可信感，按痛点、使用过程、结果证据和 CTA 推进；生成多个开场钩子和行动版本用于 A/B 测试。",
	},
	{
		id: "cinematic-trailer",
		title: "电影感预告",
		kicker: "一句话、一种情绪、一次爆发",
		description: "提炼故事冲突和高辨识度对白，以声音桥、标题卡和克制留白构成预告节奏。",
		beginnerOutcome: "把长故事浓缩成有悬念、有情绪、有高潮的预告片。",
		proOutcome: "可控 reveal 顺序、对白密度、标题节奏、声音桥和高潮蒙太奇。",
		category: "story",
		durationLabel: "25-50 分钟",
		accent: "violet",
		keywords: ["预告", "电影", "情绪", "短片", "宣传片", "故事"],
		capabilityIds: [
			"ingest-media",
			"transcribe-speech",
			"detect-scenes",
			"find-highlights",
			"chapter-story",
			"select-best-takes",
			"title-cards",
			"color-match",
			"voice-cleanup",
			"loudness-mastering",
			...DELIVERY_CAPABILITIES,
		],
		briefPreset: {
			recipeId: "cinematic-story",
			styleId: "cinematic-emotion",
			captionId: "minimal-film",
			motionId: "cinematic",
			audioId: "cinematic",
		},
		directorPrompt:
			"围绕一个核心冲突提炼对白和画面，逐步揭示信息；用声音桥、标题卡与留白蓄力，在最后集中释放最强镜头。",
	},
	{
		id: "real-estate-tour",
		title: "空间看房导览",
		kicker: "路线清晰，卖点可视化",
		description: "按空间动线整理广角、细节与口播，突出采光、尺度、材质和生活场景。",
		beginnerOutcome: "把房屋素材变成路线自然、卖点清楚的空间导览。",
		proOutcome: "可控空间顺序、广角畸变、动线连续、信息卡和房源安全区。",
		category: "commerce",
		durationLabel: "15-35 分钟",
		accent: "blue",
		keywords: ["看房", "房产", "空间", "建筑", "室内", "导览"],
		capabilityIds: [
			"ingest-media",
			"transcribe-speech",
			"detect-scenes",
			"detect-silence",
			"chapter-story",
			"select-best-takes",
			"motion-callouts",
			"color-match",
			"voice-cleanup",
			...DELIVERY_CAPABILITIES,
		],
		briefPreset: {
			recipeId: "product-showcase",
			styleId: "clean-knowledge",
			captionId: "info-card",
			motionId: "light-slide",
			audioId: "voice-first",
		},
		directorPrompt:
			"按真实行走动线组织空间，交替使用建立镜头、尺度参照与材质细节；用简洁信息卡说明核心卖点。",
	},
] as const satisfies readonly AutomationRecipe[];

export type AutomationRecipeId = (typeof AUTOMATION_RECIPES)[number]["id"];

export interface StudioProSettings {
	silenceThresholdMs: number;
	cutPaddingMs: number;
	sceneSensitivity: number;
	brollDensity: number;
	captionDensity: number;
	punchInIntensity: number;
	targetLufs: number;
	outputCount: number;
	fillerHandling: "review" | "remove" | "keep";
}

export const DEFAULT_STUDIO_PRO_SETTINGS: StudioProSettings = {
	silenceThresholdMs: 420,
	cutPaddingMs: 160,
	sceneSensitivity: 58,
	brollDensity: 36,
	captionDensity: 68,
	punchInIntensity: 8,
	targetLufs: -14,
	outputCount: 3,
	fillerHandling: "review",
};

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}): number {
	return Math.min(max, Math.max(min, value));
}

function normalizeSettings(
	settings: Partial<StudioProSettings> = {},
): StudioProSettings {
	return {
		silenceThresholdMs: clamp({
			value:
				settings.silenceThresholdMs ??
				DEFAULT_STUDIO_PRO_SETTINGS.silenceThresholdMs,
			min: 150,
			max: 2000,
		}),
		cutPaddingMs: clamp({
			value:
				settings.cutPaddingMs ?? DEFAULT_STUDIO_PRO_SETTINGS.cutPaddingMs,
			min: 0,
			max: 800,
		}),
		sceneSensitivity: clamp({
			value:
				settings.sceneSensitivity ??
				DEFAULT_STUDIO_PRO_SETTINGS.sceneSensitivity,
			min: 0,
			max: 100,
		}),
		brollDensity: clamp({
			value:
				settings.brollDensity ?? DEFAULT_STUDIO_PRO_SETTINGS.brollDensity,
			min: 0,
			max: 100,
		}),
		captionDensity: clamp({
			value:
				settings.captionDensity ?? DEFAULT_STUDIO_PRO_SETTINGS.captionDensity,
			min: 0,
			max: 100,
		}),
		punchInIntensity: clamp({
			value:
				settings.punchInIntensity ??
				DEFAULT_STUDIO_PRO_SETTINGS.punchInIntensity,
			min: 0,
			max: 24,
		}),
		targetLufs: clamp({
			value: settings.targetLufs ?? DEFAULT_STUDIO_PRO_SETTINGS.targetLufs,
			min: -24,
			max: -6,
		}),
		outputCount: Math.round(
			clamp({
				value:
					settings.outputCount ?? DEFAULT_STUDIO_PRO_SETTINGS.outputCount,
				min: 1,
				max: 6,
			}),
		),
		fillerHandling:
			settings.fillerHandling ?? DEFAULT_STUDIO_PRO_SETTINGS.fillerHandling,
	};
}

export interface AutomationRunNode extends StudioCapability {
	availability: StudioAvailability;
	enabled: boolean;
	settingLabel?: string;
}

export interface AutomationRun {
	recipe: AutomationRecipe;
	experience: StudioExperience;
	settings: StudioProSettings;
	nodes: AutomationRunNode[];
	groups: Array<{
		id: StudioPhase;
		label: string;
		description: string;
		nodes: AutomationRunNode[];
	}>;
	summary: {
		total: number;
		localCount: number;
		chatCutCount: number;
		blockedCount: number;
		estimatedSeconds: number;
	};
}

function getNodeSettingLabel({
	id,
	settings,
}: {
	id: StudioCapabilityId;
	settings: StudioProSettings;
}): string | undefined {
	switch (id) {
		case "detect-silence":
			return `停顿 ${settings.silenceThresholdMs}ms / 边距 ${settings.cutPaddingMs}ms`;
		case "remove-fillers":
			return `口头禅：${
				settings.fillerHandling === "review"
					? "先复核"
					: settings.fillerHandling === "remove"
						? "自动删除"
						: "保留"
			}`;
		case "detect-scenes":
			return `灵敏度 ${settings.sceneSensitivity}%`;
		case "insert-broll":
		case "generate-broll":
			return `覆盖密度 ${settings.brollDensity}%`;
		case "keyword-captions":
		case "bilingual-captions":
			return `字幕密度 ${settings.captionDensity}%`;
		case "dynamic-punch-in":
			return `推近 ${settings.punchInIntensity}%`;
		case "loudness-mastering":
			return `${settings.targetLufs} LUFS`;
		case "create-versions":
			return `${settings.outputCount} 个版本`;
		default:
			return undefined;
	}
}

export function createAutomationRun({
	recipeId,
	experience,
	assetCount,
	settings,
}: {
	recipeId: AutomationRecipeId;
	experience: StudioExperience;
	assetCount: number;
	settings?: Partial<StudioProSettings>;
}): AutomationRun {
	const recipe = AUTOMATION_RECIPES.find((item) => item.id === recipeId);
	if (!recipe) throw new Error(`Unknown automation recipe: ${recipeId}`);

	const normalizedSettings = normalizeSettings(settings);
	const nodes = recipe.capabilityIds.map((capabilityId) => {
		const capability = STUDIO_CAPABILITIES.find(
			(item) => item.id === capabilityId,
		);
		if (!capability) {
			throw new Error(`Unknown studio capability: ${capabilityId}`);
		}
		return {
			...capability,
			availability:
				assetCount <= 0
					? ("blocked" as const)
					: capability.executor === "local"
						? ("ready" as const)
						: ("handoff" as const),
			enabled: true,
			settingLabel: getNodeSettingLabel({
				id: capabilityId,
				settings: normalizedSettings,
			}),
		};
	});

	const groups = STUDIO_PHASES.map((phase) => ({
		...phase,
		nodes: nodes.filter((node) => node.phase === phase.id),
	})).filter((group) => group.nodes.length > 0);

	return {
		recipe,
		experience,
		settings: normalizedSettings,
		nodes,
		groups,
		summary: {
			total: nodes.length,
			localCount: nodes.filter((node) => node.executor === "local").length,
			chatCutCount: nodes.filter((node) => node.executor === "chatcut").length,
			blockedCount: nodes.filter(
				(node) => node.availability === "blocked",
			).length,
			estimatedSeconds: nodes.reduce(
				(total, node) => total + node.estimatedSeconds,
				0,
			),
		},
	};
}

export function recommendAutomationRecipes(
	intent: string,
): AutomationRecipe[] {
	const normalized = intent.toLocaleLowerCase();
	return [...AUTOMATION_RECIPES]
		.map((recipe, index) => ({
			recipe,
			index,
			score: recipe.keywords.reduce(
				(total, keyword) =>
					total + (normalized.includes(keyword.toLocaleLowerCase()) ? 3 : 0),
				0,
			),
		}))
		.sort((a, b) => {
			if (a.score !== b.score) return b.score - a.score;
			if (a.recipe.featured !== b.recipe.featured) {
				return a.recipe.featured ? -1 : 1;
			}
			return a.index - b.index;
		})
		.map(({ recipe }) => recipe);
}

export function getRecipeBriefPatch(
	recipeId: AutomationRecipeId,
): AutomationRecipe["briefPreset"] & { extraRequest: string } {
	const recipe = AUTOMATION_RECIPES.find((item) => item.id === recipeId);
	if (!recipe) throw new Error(`Unknown automation recipe: ${recipeId}`);
	return {
		...recipe.briefPreset,
		extraRequest: recipe.directorPrompt,
	};
}

export type VisualUseCase =
	| "storyboard"
	| "broll"
	| "cover"
	| "background"
	| "product-shot"
	| "transition";
export type VisualAspectRatio = "16:9" | "9:16" | "4:5" | "1:1";

export interface VisualWorld {
	id: string;
	title: string;
	label: string;
	description: string;
	image: string;
	palette: readonly string[];
	promptSuffix: string;
}

export const VISUAL_WORLDS = [
	{
		id: "human-daylight",
		title: "Human Daylight",
		label: "自然人文",
		description: "真实肤质、柔和日光、生活化构图",
		image: "/flowcut/style-worlds/human-daylight.webp",
		palette: ["#d8b89f", "#f3eee5", "#718071"],
		promptSuffix:
			"natural window light, authentic skin texture, calm editorial framing, lived-in detail",
	},
	{
		id: "electric-noir",
		title: "Electric Noir",
		label: "电光黑色",
		description: "夜色霓虹、硬朗轮廓、电影级反差",
		image: "/flowcut/style-worlds/electric-noir.webp",
		palette: ["#07111c", "#28d9ff", "#ff3b73"],
		promptSuffix:
			"electric noir cinematography, cyan and red practical light, deep blacks, crisp silhouettes",
	},
	{
		id: "editorial-paper",
		title: "Editorial Paper",
		label: "纸感编辑",
		description: "杂志排版、纸张质感、克制的图形语言",
		image: "/flowcut/style-worlds/editorial-paper.webp",
		palette: ["#f1eee6", "#121212", "#e84b35"],
		promptSuffix:
			"contemporary editorial photography, tactile paper detail, graphic negative space, restrained red accent",
	},
	{
		id: "chrome-future",
		title: "Chrome Future",
		label: "铬感未来",
		description: "精密材质、冷白空间、产品发布质感",
		image: "/flowcut/style-worlds/chrome-future.webp",
		palette: ["#eff4f6", "#8ea1ad", "#1d242a"],
		promptSuffix:
			"precision chrome materials, cool white studio, high-end technology launch, controlled reflections",
	},
	{
		id: "warm-memory",
		title: "Warm Memory",
		label: "暖色记忆",
		description: "低饱和暖光、颗粒、亲密叙事",
		image: "/flowcut/style-worlds/warm-memory.webp",
		palette: ["#8f4737", "#e7b87f", "#61706b"],
		promptSuffix:
			"warm late-afternoon light, subtle film grain, intimate documentary memory, muted color",
	},
	{
		id: "sport-impact",
		title: "Sport Impact",
		label: "运动冲击",
		description: "高速凝固、强方向光、动作爆发",
		image: "/flowcut/style-worlds/sport-impact.webp",
		palette: ["#121316", "#f4f4ef", "#ffcc00"],
		promptSuffix:
			"high-speed sports photography, directional arena light, frozen kinetic energy, graphic yellow accent",
	},
	{
		id: "botanical-luxury",
		title: "Botanical Luxury",
		label: "植物奢感",
		description: "自然材质、深绿与珠光、精致产品特写",
		image: "/flowcut/style-worlds/botanical-luxury.webp",
		palette: ["#102f29", "#d8cbb3", "#7e9b73"],
		promptSuffix:
			"botanical luxury product photography, deep green natural materials, pearl highlights, macro detail",
	},
	{
		id: "documentary-grain",
		title: "Documentary Grain",
		label: "纪实颗粒",
		description: "现场光、真实空间、克制的纪录片观察",
		image: "/flowcut/style-worlds/documentary-grain.webp",
		palette: ["#292d2b", "#9c8f7c", "#dad6cd"],
		promptSuffix:
			"observational documentary frame, available light, honest environment, restrained cinematic grain",
	},
] as const satisfies readonly VisualWorld[];

export type VisualWorldId = (typeof VISUAL_WORLDS)[number]["id"];

const VISUAL_USE_CASE_PROMPTS: Record<VisualUseCase, string> = {
	storyboard: "storyboard keyframe with clear subject blocking and camera intent",
	broll: "usable cinematic B-roll insert with one readable action and no text",
	cover: "high-recognition cover frame with clean title-safe negative space",
	background: "layerable visual background with restrained detail and subject-safe center",
	"product-shot": "premium product detail shot with legible material and controlled light",
	transition: "visual bridge frame designed to connect two scenes through shape or motion",
};

export interface VisualGenerationJob {
	id: string;
	worldId: VisualWorldId;
	useCase: VisualUseCase;
	aspectRatio: VisualAspectRatio;
	prompt: string;
	status: "draft";
	provider: "image-model";
}

export function createVisualGenerationJobs({
	prompt,
	worldId,
	useCases,
	aspectRatios,
	count,
}: {
	prompt: string;
	worldId: VisualWorldId;
	useCases: readonly VisualUseCase[];
	aspectRatios: readonly VisualAspectRatio[];
	count: number;
}): VisualGenerationJob[] {
	const world = VISUAL_WORLDS.find((item) => item.id === worldId);
	if (!world) throw new Error(`Unknown visual world: ${worldId}`);
	const safeUseCases = useCases.length > 0 ? useCases : (["broll"] as const);
	const safeRatios =
		aspectRatios.length > 0 ? aspectRatios : (["9:16"] as const);
	const safeCount = Math.round(clamp({ value: count, min: 1, max: 100 }));
	const combinations = safeUseCases.flatMap((useCase) =>
		safeRatios.map((aspectRatio) => ({ useCase, aspectRatio })),
	);

	return Array.from({ length: safeCount }, (_, index) => {
		const combination = combinations[index % combinations.length];
		if (!combination) throw new Error("Visual generation requires a target");
		return {
			id: `${worldId}-${combination.useCase}-${combination.aspectRatio.replace(":", "x")}-${index + 1}`,
			worldId,
			useCase: combination.useCase,
			aspectRatio: combination.aspectRatio,
			prompt: `${prompt.trim() || "Create a coherent supporting shot"}. ${VISUAL_USE_CASE_PROMPTS[combination.useCase]}. Style world: ${world.title}; ${world.promptSuffix}. Aspect ratio ${combination.aspectRatio}. No watermark.`,
			status: "draft" as const,
			provider: "image-model" as const,
		};
	});
}
