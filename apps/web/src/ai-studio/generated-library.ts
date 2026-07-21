export const VISIONCUT_ORIGINAL_AI_LICENSE = "VisionCut Original AI" as const;

export const VISIONCUT_LIBRARY_CATEGORIES = [
	{
		id: "talking-head",
		label: "口播人物",
		description: "可信、自然、可直接承接口播叙事的人物镜头",
	},
	{
		id: "product-detail",
		label: "产品细节",
		description: "材质、结构与使用瞬间的商业产品镜头",
	},
	{
		id: "city-night",
		label: "城市夜景",
		description: "夜色、交通与城市能量的情绪化补镜",
	},
	{
		id: "travel-place",
		label: "旅行地点",
		description: "具有空间感与到达感的目的地画面",
	},
	{
		id: "food-life",
		label: "食物生活",
		description: "真实食物质感与人与生活的温度",
	},
	{
		id: "sports-action",
		label: "运动动作",
		description: "速度、力量与决定性瞬间的动作镜头",
	},
	{
		id: "event-crowd",
		label: "活动人群",
		description: "现场氛围、共同参与和群体情绪",
	},
	{
		id: "tech-device",
		label: "科技设备",
		description: "可信的设备、工程细节与未来生产场景",
	},
	{
		id: "documentary-human",
		label: "纪实人物",
		description: "带有时间痕迹与真实职业语境的人物故事",
	},
	{
		id: "architecture-space",
		label: "建筑空间",
		description: "光、材料、尺度与人在空间中的关系",
	},
] as const;

export type VisionCutLibraryCategoryId =
	(typeof VISIONCUT_LIBRARY_CATEGORIES)[number]["id"];

export type VisionCutAspectRatio = "16:9" | "9:16" | "4:5" | "1:1";

export interface VisionCutGeneratedAsset {
	id: string;
	slug: string;
	path: `/visioncut/generated-library/${string}.webp`;
	title: string;
	categoryId: VisionCutLibraryCategoryId;
	category: string;
	scene: string;
	shotScale: string;
	useCase: string;
	styleWorld: string;
	aspectRatio: VisionCutAspectRatio;
	prompt: string;
	alt: string;
	license: typeof VISIONCUT_ORIGINAL_AI_LICENSE;
}

type AssetSeed = Omit<
	VisionCutGeneratedAsset,
	"id" | "path" | "categoryId" | "category" | "license" | "prompt"
> & {
	prompt: string;
};

const PROMPT_SUFFIX =
	"Photorealistic editorial still, believable materials and skin texture, production-ready lighting, clean composition, no text, no logo, no watermark.";

function createCategoryAssets({
	categoryId,
	seeds,
}: {
	categoryId: VisionCutLibraryCategoryId;
	seeds: readonly AssetSeed[];
}): VisionCutGeneratedAsset[] {
	const category = VISIONCUT_LIBRARY_CATEGORIES.find(
		(item) => item.id === categoryId,
	);

	if (!category) {
		throw new Error(`Unknown VisionCut library category: ${categoryId}`);
	}

	return seeds.map((seed) => ({
		...seed,
		id: `visioncut-${seed.slug}`,
		path: `/visioncut/generated-library/${seed.slug}.webp` as VisionCutGeneratedAsset["path"],
		categoryId,
		category: category.label,
		prompt: `${seed.prompt} ${PROMPT_SUFFIX}`,
		license: VISIONCUT_ORIGINAL_AI_LICENSE,
	}));
}

const TALKING_HEAD_ASSETS = [
	{
		slug: "founder-window-keylight",
		title: "窗边创业者",
		scene: "清晨办公室窗边陈述产品愿景",
		shotScale: "中近景",
		useCase: "创始人开场",
		styleWorld: "Human Daylight",
		aspectRatio: "16:9",
		prompt:
			"A composed Asian startup founder speaking beside a tall office window at early morning, medium close-up, soft directional daylight, generous negative space for editorial captions.",
		alt: "创业者在清晨窗边自然口播",
	},
	{
		slug: "creator-desk-lavmic",
		title: "桌前创作者",
		scene: "家庭工作室内对镜分享经验",
		shotScale: "近景",
		useCase: "知识口播",
		styleWorld: "Creator Neutral",
		aspectRatio: "9:16",
		prompt:
			"A young content creator speaking directly to camera at a compact home studio desk, visible lavalier microphone, close shot, warm practical lamp and neutral daylight, vertical safe framing.",
		alt: "创作者在桌前佩戴领夹麦口播",
	},
	{
		slug: "expert-bookshelf-answer",
		title: "书架前专家",
		scene: "安静书房中回答专业问题",
		shotScale: "中景",
		useCase: "专家访谈",
		styleWorld: "Editorial Paper",
		aspectRatio: "16:9",
		prompt:
			"A thoughtful middle-aged expert answering an interview question in front of a restrained bookshelf, medium shot, soft side key light, documentary credibility and uncluttered background.",
		alt: "专家在书架前接受采访",
	},
	{
		slug: "chef-kitchen-address",
		title: "主厨厨房讲解",
		scene: "营业前厨房内介绍一道菜",
		shotScale: "中近景",
		useCase: "餐饮品牌故事",
		styleWorld: "Warm Craft",
		aspectRatio: "4:5",
		prompt:
			"A professional chef addressing the camera in a real restaurant kitchen before service, medium close-up, stainless steel surfaces, soft steam in the background, calm confident expression.",
		alt: "主厨在真实厨房内讲解菜品",
	},
	{
		slug: "teacher-board-explainer",
		title: "白板讲师",
		scene: "明亮教室内拆解复杂概念",
		shotScale: "中全景",
		useCase: "课程讲解",
		styleWorld: "Clean Knowledge",
		aspectRatio: "16:9",
		prompt:
			"An approachable teacher explaining a concept beside a clean whiteboard in a bright classroom, medium wide shot, natural hand gesture, readable blank drawing area without any written text.",
		alt: "讲师站在白板旁进行课程讲解",
	},
	{
		slug: "fitness-coach-gym-tip",
		title: "训练前教练",
		scene: "空旷训练馆内讲解动作要领",
		shotScale: "中景",
		useCase: "运动教学",
		styleWorld: "Sport Impact",
		aspectRatio: "9:16",
		prompt:
			"An athletic fitness coach giving a concise training tip inside a modern functional gym, medium shot, directional overhead light, authentic equipment, energetic but controlled vertical composition.",
		alt: "健身教练在训练馆内讲动作要领",
	},
	{
		slug: "beauty-creator-mirror",
		title: "镜前美妆分享",
		scene: "自然光梳妆台前展示护肤步骤",
		shotScale: "近景",
		useCase: "美妆教程",
		styleWorld: "Soft Editorial",
		aspectRatio: "9:16",
		prompt:
			"A beauty creator speaking beside a daylight vanity mirror while holding a simple skincare bottle, close shot, natural skin texture, pale neutral room, clear hand and product visibility.",
		alt: "美妆创作者在镜前展示护肤产品",
	},
	{
		slug: "podcast-host-side-angle",
		title: "播客主持侧机位",
		scene: "声学工作室内推进深度对谈",
		shotScale: "中近景",
		useCase: "播客补机位",
		styleWorld: "Documentary Grain",
		aspectRatio: "16:9",
		prompt:
			"A podcast host listening and responding in a treated audio studio, three-quarter side angle, medium close-up, broadcast microphone in frame, low-key practical lighting and cinematic depth.",
		alt: "播客主持人在侧机位前对谈",
	},
	{
		slug: "artisan-workshop-story",
		title: "工坊手艺人",
		scene: "木作工坊内讲述制作理念",
		shotScale: "中景",
		useCase: "品牌人物片",
		styleWorld: "Tactile Craft",
		aspectRatio: "4:5",
		prompt:
			"A skilled woodworker speaking to camera inside an active timber workshop, medium shot, workbench and hand tools behind, textured window light, honest hands and clothing details.",
		alt: "木工手艺人在工坊讲述制作理念",
	},
	{
		slug: "doctor-clinic-explainer",
		title: "诊室医生科普",
		scene: "整洁诊室内进行健康知识说明",
		shotScale: "中近景",
		useCase: "专业科普",
		styleWorld: "Clinical Calm",
		aspectRatio: "16:9",
		prompt:
			"A reassuring doctor explaining a health topic in a clean contemporary clinic, medium close-up, soft balanced daylight, subtle medical context, respectful and trustworthy visual tone.",
		alt: "医生在明亮诊室内进行健康科普",
	},
] as const satisfies readonly AssetSeed[];

const PRODUCT_DETAIL_ASSETS = [
	{
		slug: "watch-crown-macro",
		title: "腕表表冠微距",
		scene: "黑色工作台上的精密机械腕表",
		shotScale: "大特写",
		useCase: "奢品细节",
		styleWorld: "Chrome Future",
		aspectRatio: "16:9",
		prompt:
			"Extreme macro of a precision mechanical watch crown and brushed steel case on a matte black watchmaker bench, narrow rim light revealing machining marks and tiny reflections.",
		alt: "机械腕表表冠与金属拉丝微距",
	},
	{
		slug: "skincare-droplet-glass",
		title: "精华液滴落",
		scene: "透明玻璃瓶上凝结一滴精华",
		shotScale: "大特写",
		useCase: "护肤广告",
		styleWorld: "Botanical Luxury",
		aspectRatio: "4:5",
		prompt:
			"A clear skincare serum droplet settling on the shoulder of a minimal glass bottle, extreme close-up, soft botanical daylight, translucent liquid detail and clean commercial background.",
		alt: "透明精华液滴落在玻璃瓶上",
	},
	{
		slug: "coffee-bag-roast-texture",
		title: "咖啡烘焙质感",
		scene: "烘焙台上的咖啡袋与新鲜豆粒",
		shotScale: "特写",
		useCase: "食品产品片",
		styleWorld: "Warm Craft",
		aspectRatio: "4:5",
		prompt:
			"Close product still of an unbranded kraft coffee bag surrounded by freshly roasted beans on a dark roasting table, tactile paper fibers, warm side light and rich brown texture.",
		alt: "咖啡袋和烘焙豆粒的材质特写",
	},
	{
		slug: "sneaker-sole-motion",
		title: "跑鞋中底结构",
		scene: "跑鞋悬停于运动轨迹上方",
		shotScale: "特写",
		useCase: "运动产品卖点",
		styleWorld: "Sport Impact",
		aspectRatio: "16:9",
		prompt:
			"A modern unbranded running shoe suspended just above a textured track, close side profile emphasizing sculpted foam midsole and outsole geometry, crisp hard light and subtle motion particles.",
		alt: "跑鞋中底与外底结构特写",
	},
	{
		slug: "headphones-metal-hinge",
		title: "耳机金属转轴",
		scene: "深色声学桌面上的头戴耳机",
		shotScale: "大特写",
		useCase: "科技商业片",
		styleWorld: "Electric Noir",
		aspectRatio: "16:9",
		prompt:
			"Extreme close-up of an unbranded premium headphone hinge, anodized metal meeting soft ear-cup fabric on a dark acoustic desk, precise cyan edge light without interface graphics.",
		alt: "头戴耳机金属转轴与织物细节",
	},
	{
		slug: "perfume-glass-caustic",
		title: "香水玻璃光影",
		scene: "日光穿过无标识香水瓶形成焦散",
		shotScale: "特写",
		useCase: "美妆氛围镜头",
		styleWorld: "Glass Daylight",
		aspectRatio: "4:5",
		prompt:
			"An unbranded sculptural perfume bottle on pale limestone, close product shot, direct afternoon sun creating elegant glass caustics and a restrained luxury composition.",
		alt: "香水瓶在石材表面形成玻璃焦散",
	},
	{
		slug: "ceramic-cup-steam",
		title: "手作杯沿蒸汽",
		scene: "清晨木桌上的手作陶杯",
		shotScale: "特写",
		useCase: "生活方式补镜",
		styleWorld: "Warm Memory",
		aspectRatio: "1:1",
		prompt:
			"Close view of a handmade ceramic cup on a worn oak table, delicate morning steam curling above an imperfect glazed rim, soft window light and tactile domestic calm.",
		alt: "手作陶杯杯沿与晨间蒸汽",
	},
	{
		slug: "camera-lens-aperture",
		title: "镜头光圈叶片",
		scene: "摄影工作台上的电影镜头内部",
		shotScale: "大特写",
		useCase: "影像科技介绍",
		styleWorld: "Chrome Future",
		aspectRatio: "16:9",
		prompt:
			"Extreme macro looking into a professional cinema lens as the aperture blades form a precise polygon, subtle coated glass colors, dark technical bench and controlled highlights.",
		alt: "电影镜头内部光圈叶片微距",
	},
	{
		slug: "jewelry-gem-facet",
		title: "宝石切面火彩",
		scene: "深灰首饰台上的单颗宝石",
		shotScale: "大特写",
		useCase: "珠宝广告",
		styleWorld: "Midnight Jewel",
		aspectRatio: "4:5",
		prompt:
			"Extreme macro of a single faceted gemstone held in a minimal dark gray setting, precise spectral highlights, visible cut geometry and refined high-jewelry lighting.",
		alt: "宝石切面与火彩的超近距离细节",
	},
	{
		slug: "smart-speaker-fabric",
		title: "音箱织物表面",
		scene: "现代客厅内智能音箱的材质细节",
		shotScale: "特写",
		useCase: "家居科技展示",
		styleWorld: "Quiet Tech",
		aspectRatio: "16:9",
		prompt:
			"Close product detail of an unbranded smart speaker with woven acoustic fabric in a calm contemporary living room, grazing daylight revealing fiber texture and a precise control surface.",
		alt: "智能音箱织物与控制面的细节",
	},
] as const satisfies readonly AssetSeed[];

const CITY_NIGHT_ASSETS = [
	{
		slug: "neon-crosswalk-rain",
		title: "雨夜霓虹路口",
		scene: "细雨中的繁忙城市斑马线",
		shotScale: "全景",
		useCase: "城市开场",
		styleWorld: "Electric Noir",
		aspectRatio: "16:9",
		prompt:
			"Wide cinematic view of pedestrians crossing a rain-soaked metropolitan intersection at night, authentic neon reflections on asphalt, varied umbrellas and layered traffic depth.",
		alt: "雨夜城市斑马线上的霓虹倒影与行人",
	},
	{
		slug: "rooftop-traffic-river",
		title: "天台车流长河",
		scene: "高楼天台俯瞰晚高峰道路",
		shotScale: "大全景",
		useCase: "节奏转场",
		styleWorld: "Urban Pulse",
		aspectRatio: "16:9",
		prompt:
			"Very wide rooftop view over dense evening traffic flowing between high-rise blocks, blue-hour sky meeting warm vehicle lights, crisp realistic city atmosphere.",
		alt: "从天台俯瞰城市晚高峰车流",
	},
	{
		slug: "subway-platform-arrival",
		title: "末班地铁进站",
		scene: "深夜站台等待列车抵达",
		shotScale: "中全景",
		useCase: "叙事过场",
		styleWorld: "Documentary Grain",
		aspectRatio: "16:9",
		prompt:
			"A late-night subway train arriving beside a nearly empty platform, medium wide angle, wind lifting one commuter's coat, fluorescent realism and restrained motion blur.",
		alt: "深夜地铁进站时站台上的通勤者",
	},
	{
		slug: "night-market-steam",
		title: "夜市蒸汽",
		scene: "拥挤夜市摊位升起白色热气",
		shotScale: "中景",
		useCase: "城市生活补镜",
		styleWorld: "Warm Street",
		aspectRatio: "9:16",
		prompt:
			"A busy Asian night market food stall with white steam rising around the vendor and customers, medium vertical composition, mixed tungsten and sign light, candid street realism.",
		alt: "夜市摊位蒸汽与排队人群",
	},
	{
		slug: "taxi-window-reflection",
		title: "出租车窗倒影",
		scene: "乘客从行驶车内看向夜色街道",
		shotScale: "近景",
		useCase: "情绪连接镜头",
		styleWorld: "Electric Noir",
		aspectRatio: "16:9",
		prompt:
			"Close profile of a passenger seen through a moving taxi window, layered night-city reflections crossing the glass, natural contemplative expression and cinematic shallow depth.",
		alt: "出租车乘客侧脸与城市夜景倒影",
	},
	{
		slug: "alley-bicycle-neon",
		title: "小巷单车",
		scene: "湿润老巷里靠墙停放的自行车",
		shotScale: "中全景",
		useCase: "地点建立",
		styleWorld: "Neon Documentary",
		aspectRatio: "4:5",
		prompt:
			"A solitary bicycle leaning against textured walls in a narrow wet alley at night, medium wide view, one distant neon source, realistic puddles and quiet lived-in detail.",
		alt: "夜间湿润小巷里的一辆自行车",
	},
	{
		slug: "bridge-light-trails",
		title: "跨江大桥流光",
		scene: "夜间大桥连接两岸城市",
		shotScale: "航拍",
		useCase: "章节转场",
		styleWorld: "Chrome Future",
		aspectRatio: "16:9",
		prompt:
			"High aerial view of a long illuminated bridge crossing a dark river between two city districts, controlled vehicle light trails, detailed road structure and clean nocturnal scale.",
		alt: "夜间跨江大桥与两岸城市灯光",
	},
	{
		slug: "convenience-store-late",
		title: "深夜便利店",
		scene: "街角便利店内一位独自购物的人",
		shotScale: "全景",
		useCase: "孤独情绪镜头",
		styleWorld: "Quiet Cinema",
		aspectRatio: "16:9",
		prompt:
			"Wide exterior of a small corner convenience store glowing at midnight, one shopper visible through clear glass, dark quiet street, observational film still with believable fluorescent light.",
		alt: "深夜街角便利店与独自购物的人",
	},
	{
		slug: "skyline-blue-hour",
		title: "蓝调天际线",
		scene: "日落后城市建筑逐渐亮灯",
		shotScale: "大全景",
		useCase: "片头建立镜头",
		styleWorld: "Blue Hour",
		aspectRatio: "16:9",
		prompt:
			"Very wide metropolitan skyline just after sunset as office windows begin to illuminate, deep blue natural sky, clean atmospheric perspective and realistic building detail.",
		alt: "蓝调时刻逐渐亮灯的城市天际线",
	},
	{
		slug: "arcade-entrance-crowd",
		title: "街机厅入口",
		scene: "年轻人从明亮街机厅涌入夜街",
		shotScale: "中全景",
		useCase: "青春氛围补镜",
		styleWorld: "Pop Signal",
		aspectRatio: "9:16",
		prompt:
			"A group of friends stepping from a bright retro arcade into a night street, medium wide vertical frame, candid laughter, saturated practical lights balanced with realistic skin tones.",
		alt: "年轻人从街机厅入口走向夜街",
	},
] as const satisfies readonly AssetSeed[];

const TRAVEL_PLACE_ASSETS = [
	{
		slug: "mountain-sunrise-hiker",
		title: "山脊日出",
		scene: "徒步者抵达高山山脊迎接日出",
		shotScale: "大全景",
		useCase: "旅行高潮",
		styleWorld: "Epic Natural",
		aspectRatio: "16:9",
		prompt:
			"A lone hiker reaching a high mountain ridge at sunrise, very wide landscape, layered valleys and wind-shaped jacket, natural golden light without exaggerated fantasy effects.",
		alt: "徒步者站在日出时分的高山山脊",
	},
	{
		slug: "coastal-road-convertible",
		title: "海岸公路",
		scene: "敞篷车沿悬崖海岸线前进",
		shotScale: "航拍",
		useCase: "旅途推进",
		styleWorld: "Coastal Cinema",
		aspectRatio: "16:9",
		prompt:
			"Oblique aerial view of an unbranded convertible driving along a dramatic coastal road, turquoise water and rugged cliffs, bright natural midday clarity and strong directional composition.",
		alt: "敞篷车沿着海岸公路行驶",
	},
	{
		slug: "old-town-morning",
		title: "古城清晨",
		scene: "店铺开门前的石板老街",
		shotScale: "全景",
		useCase: "地点建立",
		styleWorld: "Warm Memory",
		aspectRatio: "4:5",
		prompt:
			"A quiet old-town stone street at early morning before shops open, wide view, one resident sweeping a doorway, soft low sun and authentic weathered facades.",
		alt: "清晨古城石板街与正在打扫的居民",
	},
	{
		slug: "desert-camp-dusk",
		title: "沙漠营地暮色",
		scene: "暮色中的帐篷与远处沙丘",
		shotScale: "大全景",
		useCase: "旅行章节收束",
		styleWorld: "Desert Quiet",
		aspectRatio: "16:9",
		prompt:
			"A small desert camp at dusk with canvas tents and a low warm lantern, very wide frame, cool sand shadows, distant dunes and an expansive natural sky.",
		alt: "暮色沙漠中的帐篷营地与沙丘",
	},
	{
		slug: "tropical-waterfall-swimmer",
		title: "雨林瀑布抵达",
		scene: "旅行者游向热带雨林瀑布",
		shotScale: "全景",
		useCase: "目的地揭晓",
		styleWorld: "Botanical Luxury",
		aspectRatio: "9:16",
		prompt:
			"A traveler swimming through a clear tropical pool toward a tall rainforest waterfall, wide vertical composition, humid natural light, detailed foliage and realistic water spray.",
		alt: "旅行者游向热带雨林瀑布",
	},
	{
		slug: "alpine-train-window",
		title: "高山列车窗景",
		scene: "乘客隔窗观看雪山与湖泊",
		shotScale: "中景",
		useCase: "移动叙事",
		styleWorld: "Quiet Journey",
		aspectRatio: "16:9",
		prompt:
			"A train passenger seen in profile beside a large window as alpine mountains and a cold blue lake pass outside, medium shot, subtle glass reflections and calm travel mood.",
		alt: "乘客从高山列车窗边观看雪山湖泊",
	},
	{
		slug: "island-boat-aerial",
		title: "离岛小船",
		scene: "白色小船穿过清澈浅海",
		shotScale: "航拍",
		useCase: "目的地转场",
		styleWorld: "Ocean Clear",
		aspectRatio: "16:9",
		prompt:
			"Top-down aerial of a small white boat crossing transparent shallow island water, visible reef textures and a restrained wake line, clean geographic composition.",
		alt: "小船从清澈的离岛浅海上驶过",
	},
	{
		slug: "forest-cabin-mist",
		title: "雾中森林木屋",
		scene: "薄雾包围松林里的小木屋",
		shotScale: "大全景",
		useCase: "静谧空镜",
		styleWorld: "Documentary Grain",
		aspectRatio: "16:9",
		prompt:
			"A modest timber cabin among tall pine trees in early morning mist, very wide frame, one warm interior window, damp forest textures and quiet realistic atmosphere.",
		alt: "晨雾松林中的一座小木屋",
	},
	{
		slug: "snow-village-evening",
		title: "雪村傍晚",
		scene: "降雪中的山村亮起室内灯光",
		shotScale: "大全景",
		useCase: "冬季旅行开场",
		styleWorld: "Winter Story",
		aspectRatio: "4:5",
		prompt:
			"A compact mountain village during gentle evening snowfall, very wide view, warm windows against blue snow, realistic roofs, pathways and distant residents.",
		alt: "傍晚降雪时亮起灯光的山村",
	},
	{
		slug: "rice-terrace-farmer",
		title: "梯田清晨",
		scene: "农人在晨光中走过层叠水田",
		shotScale: "全景",
		useCase: "人文旅行补镜",
		styleWorld: "Human Daylight",
		aspectRatio: "16:9",
		prompt:
			"A farmer walking along narrow paths through layered rice terraces at sunrise, wide landscape, reflected sky in water fields, humid atmosphere and respectful documentary distance.",
		alt: "农人在清晨的层叠梯田间行走",
	},
] as const satisfies readonly AssetSeed[];

const FOOD_LIFE_ASSETS = [
	{
		slug: "pasta-toss-kitchen",
		title: "热锅翻面",
		scene: "开放厨房内主厨将意面翻起",
		shotScale: "近景",
		useCase: "餐饮节奏镜头",
		styleWorld: "Warm Craft",
		aspectRatio: "16:9",
		prompt:
			"A chef tossing fresh pasta in a steel pan inside an open kitchen, close action shot, controlled flame, suspended noodles and authentic service-time energy.",
		alt: "主厨在开放厨房中翻炒意面",
	},
	{
		slug: "brunch-table-overhead",
		title: "周末早午餐",
		scene: "多人分享的彩色早午餐桌",
		shotScale: "俯拍",
		useCase: "生活方式拼贴",
		styleWorld: "Human Daylight",
		aspectRatio: "4:5",
		prompt:
			"Top-down view of friends sharing a vibrant weekend brunch on a natural wood table, reaching hands, varied plates, linen textures and bright honest daylight.",
		alt: "朋友们围坐分享早午餐的俯拍画面",
	},
	{
		slug: "street-dumpling-steam",
		title: "街边蒸饺",
		scene: "摊主掀开竹蒸笼释放热气",
		shotScale: "特写",
		useCase: "食物揭晓",
		styleWorld: "Warm Street",
		aspectRatio: "9:16",
		prompt:
			"Close vertical shot of a street vendor lifting a bamboo steamer lid to reveal fresh dumplings, dense natural steam, quick hand movement and textured night-market light.",
		alt: "街边摊主掀开竹蒸笼展示饺子",
	},
	{
		slug: "coffee-pour-macro",
		title: "手冲咖啡注水",
		scene: "细水流注入滤杯形成咖啡粉膨胀",
		shotScale: "大特写",
		useCase: "工艺细节",
		styleWorld: "Tactile Craft",
		aspectRatio: "16:9",
		prompt:
			"Extreme close-up of a steady kettle stream blooming freshly ground coffee in a pour-over dripper, visible bubbles and steam, soft workshop morning light.",
		alt: "手冲咖啡注水与咖啡粉膨胀微距",
	},
	{
		slug: "bakery-croissant-tray",
		title: "清晨可颂出炉",
		scene: "烘焙师将金黄可颂端出烤箱",
		shotScale: "中近景",
		useCase: "品牌日常",
		styleWorld: "Warm Memory",
		aspectRatio: "4:5",
		prompt:
			"A baker carrying a tray of freshly baked croissants from a deck oven before sunrise, medium close-up, flaky texture, warm oven light and real bakery workspace.",
		alt: "烘焙师端出一盘刚出炉的可颂",
	},
	{
		slug: "family-dinner-laugh",
		title: "家宴笑声",
		scene: "三代家人在晚餐桌上自然交谈",
		shotScale: "中全景",
		useCase: "情感叙事",
		styleWorld: "Human Daylight",
		aspectRatio: "16:9",
		prompt:
			"Three generations of a family laughing naturally around a home dinner table, medium wide frame, shared dishes, warm practical light and candid overlapping gestures.",
		alt: "三代家人在家庭晚餐中自然欢笑",
	},
	{
		slug: "cocktail-citrus-splash",
		title: "柑橘入杯",
		scene: "调酒台上一片柑橘落入透明饮品",
		shotScale: "大特写",
		useCase: "饮品广告",
		styleWorld: "Electric Noir",
		aspectRatio: "16:9",
		prompt:
			"Extreme close-up of a fresh citrus wheel dropping into a clear sparkling cocktail above a dark bar, crisp droplets frozen in motion, precise amber and cyan practical light.",
		alt: "柑橘片落入透明鸡尾酒溅起水花",
	},
	{
		slug: "sushi-chef-slice",
		title: "寿司刀工",
		scene: "寿司师傅在木台切分新鲜鱼肉",
		shotScale: "特写",
		useCase: "手艺过程",
		styleWorld: "Quiet Craft",
		aspectRatio: "16:9",
		prompt:
			"Close view of a sushi chef's hands making one precise slice through fresh fish on a clean wooden counter, soft restaurant light, authentic knife and ingredient texture.",
		alt: "寿司师傅在木台上进行精细刀工",
	},
	{
		slug: "picnic-fruit-sun",
		title: "草地水果野餐",
		scene: "午后草地上的水果与亚麻餐布",
		shotScale: "中景",
		useCase: "轻生活补镜",
		styleWorld: "Botanical Luxury",
		aspectRatio: "4:5",
		prompt:
			"A relaxed fruit picnic on green grass in late afternoon, medium view, hands passing sliced peaches over linen cloth, natural backlight and unstyled seasonal abundance.",
		alt: "午后草地野餐中的水果和双手",
	},
	{
		slug: "chocolate-cake-cut",
		title: "巧克力蛋糕切面",
		scene: "餐刀切开湿润巧克力蛋糕",
		shotScale: "大特写",
		useCase: "甜品卖点",
		styleWorld: "Midnight Jewel",
		aspectRatio: "1:1",
		prompt:
			"Extreme close-up as a dessert knife reveals the moist interior of a dark chocolate cake, fine crumbs, glossy ganache and controlled side light on a minimal plate.",
		alt: "巧克力蛋糕被切开后露出的湿润切面",
	},
] as const satisfies readonly AssetSeed[];

const SPORTS_ACTION_ASSETS = [
	{
		slug: "sprinter-block-start",
		title: "起跑器爆发",
		scene: "短跑运动员在发令瞬间冲出起跑器",
		shotScale: "近景",
		useCase: "速度高潮",
		styleWorld: "Sport Impact",
		aspectRatio: "16:9",
		prompt:
			"Low close action frame of a sprinter exploding from starting blocks on a professional track, sharp face and front foot, flying granules and strong morning side light.",
		alt: "短跑运动员从起跑器爆发冲出",
	},
	{
		slug: "boxer-heavy-bag",
		title: "拳击重击",
		scene: "拳手在旧训练馆击中重沙袋",
		shotScale: "中景",
		useCase: "力量蒙太奇",
		styleWorld: "Documentary Grain",
		aspectRatio: "9:16",
		prompt:
			"A focused boxer landing a heavy hook on a worn training bag in an old gym, medium vertical shot, chalk and sweat particles, hard window light and authentic motion.",
		alt: "拳手在旧训练馆重击沙袋",
	},
	{
		slug: "basketball-dunk-low",
		title: "篮下腾空",
		scene: "室内球馆中球员完成强力扣篮",
		shotScale: "中全景",
		useCase: "赛事高光",
		styleWorld: "Sport Impact",
		aspectRatio: "9:16",
		prompt:
			"Low-angle medium wide view of a basketball player airborne for a powerful dunk in an indoor arena, realistic anatomy, rim and backboard visible, dramatic but credible stadium light.",
		alt: "篮球运动员从篮下腾空完成扣篮",
	},
	{
		slug: "cyclist-corner-speed",
		title: "弯道压车",
		scene: "公路车手高速通过山路弯道",
		shotScale: "全景",
		useCase: "速度转场",
		styleWorld: "Kinetic Road",
		aspectRatio: "16:9",
		prompt:
			"A road cyclist leaning aggressively through a mountain switchback, wide tracking perspective, textured asphalt, blurred background edges and crisp rider detail in natural daylight.",
		alt: "公路车手高速压过山路弯道",
	},
	{
		slug: "swimmer-butterfly-water",
		title: "蝶泳破水",
		scene: "泳者双臂破开水面进入呼吸节奏",
		shotScale: "近景",
		useCase: "训练高光",
		styleWorld: "Ocean Clear",
		aspectRatio: "16:9",
		prompt:
			"Head-on close action shot of a competitive swimmer breaking the surface during butterfly stroke, symmetrical water arcs, detailed droplets and cool indoor pool light.",
		alt: "蝶泳运动员正面破开水面",
	},
	{
		slug: "skateboard-stair-ollie",
		title: "阶梯跃板",
		scene: "滑板手从城市台阶上方腾跃",
		shotScale: "中全景",
		useCase: "街头动作",
		styleWorld: "Urban Pulse",
		aspectRatio: "4:5",
		prompt:
			"A skateboarder captured mid-ollie above a concrete city stair set, medium wide frame, board fully visible, late afternoon side light and realistic street architecture.",
		alt: "滑板手从城市台阶上方腾跃",
	},
	{
		slug: "tennis-serve-sunset",
		title: "落日发球",
		scene: "室外球场上球员全力发球",
		shotScale: "全景",
		useCase: "运动片头",
		styleWorld: "Golden Motion",
		aspectRatio: "16:9",
		prompt:
			"A tennis player at full extension during a serve on an outdoor court at sunset, wide side view, ball visible, long shadows and clean athletic silhouette.",
		alt: "网球运动员在落日球场全力发球",
	},
	{
		slug: "climber-chalk-hands",
		title: "攀岩镁粉",
		scene: "攀岩者出发前双手拍散镁粉",
		shotScale: "特写",
		useCase: "动作准备",
		styleWorld: "Tactile Craft",
		aspectRatio: "16:9",
		prompt:
			"Close view of a climber clapping chalked hands before a difficult route, fine white powder suspended in side light, taped fingers and rough climbing wall behind.",
		alt: "攀岩者拍散镁粉准备出发",
	},
	{
		slug: "football-goal-rain",
		title: "雨战进球",
		scene: "大雨中球员滑跪庆祝关键进球",
		shotScale: "中全景",
		useCase: "情绪顶点",
		styleWorld: "Sport Impact",
		aspectRatio: "16:9",
		prompt:
			"A football player knee-sliding in celebration after a goal during heavy rain, medium wide stadium frame, teammates approaching, spray from the pitch and believable floodlights.",
		alt: "球员在大雨中滑跪庆祝进球",
	},
	{
		slug: "yoga-balance-rooftop",
		title: "天台平衡",
		scene: "清晨城市天台上的单腿瑜伽动作",
		shotScale: "全景",
		useCase: "身心生活方式",
		styleWorld: "Human Daylight",
		aspectRatio: "9:16",
		prompt:
			"A yoga practitioner holding a stable single-leg balance on a quiet city rooftop at dawn, full-body vertical frame, soft skyline, natural posture and calm neutral palette.",
		alt: "练习者在清晨城市天台保持瑜伽平衡",
	},
] as const satisfies readonly AssetSeed[];

const EVENT_CROWD_ASSETS = [
	{
		slug: "concert-hands-stage",
		title: "音乐节合唱",
		scene: "舞台前观众举手跟唱副歌",
		shotScale: "大全景",
		useCase: "活动高潮",
		styleWorld: "Electric Noir",
		aspectRatio: "16:9",
		prompt:
			"Very wide view from within a concert crowd as hundreds of hands rise toward a live stage during the chorus, realistic beams, faces in foreground and energetic depth.",
		alt: "音乐节观众举手面向舞台合唱",
	},
	{
		slug: "conference-keynote-wide",
		title: "大会主题演讲",
		scene: "大型会场内主讲人站在极简舞台中央",
		shotScale: "大全景",
		useCase: "企业活动建立",
		styleWorld: "Chrome Future",
		aspectRatio: "16:9",
		prompt:
			"Very wide architectural view of a keynote speaker centered on a minimal conference stage before a large attentive audience, clean lighting, blank presentation wall and professional scale.",
		alt: "大型会议现场的主题演讲与观众",
	},
	{
		slug: "wedding-confetti-exit",
		title: "婚礼彩纸退场",
		scene: "新人穿过亲友队列离开仪式现场",
		shotScale: "中全景",
		useCase: "婚礼高光",
		styleWorld: "Warm Memory",
		aspectRatio: "4:5",
		prompt:
			"A newly married couple walking through friends as paper confetti fills the air, medium wide portrait frame, candid expressions, late afternoon natural light and authentic celebration.",
		alt: "新人在亲友和彩纸中从婚礼现场退场",
	},
	{
		slug: "festival-food-lights",
		title: "市集灯下人群",
		scene: "露天市集里人们围绕餐车交流",
		shotScale: "全景",
		useCase: "活动氛围",
		styleWorld: "Warm Street",
		aspectRatio: "16:9",
		prompt:
			"Wide evening view of a lively outdoor food festival with small groups gathering around food trucks, strings of practical lights, visible steam and natural social interactions.",
		alt: "露天美食市集灯光下交流的人群",
	},
	{
		slug: "product-launch-applause",
		title: "发布会掌声",
		scene: "产品揭晓后前排观众起身鼓掌",
		shotScale: "中全景",
		useCase: "品牌发布高光",
		styleWorld: "Editorial Signal",
		aspectRatio: "16:9",
		prompt:
			"Medium wide view across the front rows of a product launch as the audience stands and applauds a newly revealed unbranded object, crisp stage light and genuine reactions.",
		alt: "产品发布会揭晓时起身鼓掌的观众",
	},
	{
		slug: "graduation-cap-toss",
		title: "毕业帽升空",
		scene: "毕业生在校园草坪共同抛帽",
		shotScale: "大全景",
		useCase: "成长叙事结尾",
		styleWorld: "Human Daylight",
		aspectRatio: "16:9",
		prompt:
			"Very wide campus lawn filled with graduates tossing caps into a bright sky, varied candid poses, clear airborne caps and natural celebratory daylight.",
		alt: "毕业生在校园草坪共同抛起学士帽",
	},
	{
		slug: "gallery-opening-guests",
		title: "画展开幕夜",
		scene: "白色展厅内来宾观看大型作品",
		shotScale: "全景",
		useCase: "文化活动补镜",
		styleWorld: "Editorial Paper",
		aspectRatio: "4:5",
		prompt:
			"Wide portrait view of guests moving through a contemporary gallery opening, white walls, large abstract artworks without readable text, restrained social gestures and accurate museum light.",
		alt: "画展开幕夜在白色展厅观展的来宾",
	},
	{
		slug: "esports-arena-cheer",
		title: "电竞决胜欢呼",
		scene: "比赛结束瞬间观众席爆发庆祝",
		shotScale: "大全景",
		useCase: "赛事情绪峰值",
		styleWorld: "Electric Noir",
		aspectRatio: "16:9",
		prompt:
			"Very wide esports arena at the decisive final moment, audience erupting in celebration, players visible at stage desks, vivid practical light balanced with realistic crowd detail.",
		alt: "电竞比赛决胜瞬间欢呼的现场观众",
	},
	{
		slug: "community-workshop-table",
		title: "社区共创桌",
		scene: "参与者围绕长桌共同制作原型",
		shotScale: "中全景",
		useCase: "协作故事",
		styleWorld: "Human Daylight",
		aspectRatio: "16:9",
		prompt:
			"A diverse community group collaborating around a long workshop table covered with paper prototypes and simple tools, medium wide frame, daylight studio and active hand gestures.",
		alt: "社区工作坊中围绕长桌协作的人们",
	},
	{
		slug: "fashion-backstage-lineup",
		title: "秀场后台列队",
		scene: "模特在登台前的狭长后台依次等待",
		shotScale: "中全景",
		useCase: "时尚活动过程",
		styleWorld: "Midnight Jewel",
		aspectRatio: "9:16",
		prompt:
			"Models waiting in a narrow backstage line moments before a runway show, medium wide vertical frame, garment textures, focused expressions and practical work lights.",
		alt: "时装秀开始前在后台列队等待的模特",
	},
] as const satisfies readonly AssetSeed[];

const TECH_DEVICE_ASSETS = [
	{
		slug: "laptop-code-reflection",
		title: "深夜开发屏幕",
		scene: "工程师眼镜中映出代码编辑器光线",
		shotScale: "近景",
		useCase: "科技团队叙事",
		styleWorld: "Electric Noir",
		aspectRatio: "16:9",
		prompt:
			"Close profile of a software engineer working on an unbranded laptop at night, abstract code-like light reflected in glasses without readable text, realistic desk and focused expression.",
		alt: "开发者眼镜中映出深夜电脑屏幕光线",
	},
	{
		slug: "robot-arm-calibration",
		title: "机械臂校准",
		scene: "明亮实验室内工程师校准工业机械臂",
		shotScale: "中全景",
		useCase: "工业科技展示",
		styleWorld: "Chrome Future",
		aspectRatio: "16:9",
		prompt:
			"An engineer carefully calibrating a compact industrial robotic arm in a bright research lab, medium wide frame, precise joints and tools, clean credible engineering environment.",
		alt: "工程师在实验室校准工业机械臂",
	},
	{
		slug: "smartphone-camera-rig",
		title: "手机影像套件",
		scene: "无标识手机安装在专业拍摄支架上",
		shotScale: "特写",
		useCase: "移动创作产品",
		styleWorld: "Quiet Tech",
		aspectRatio: "4:5",
		prompt:
			"Close product view of an unbranded smartphone mounted in a compact professional camera cage with small light and microphone, neutral studio bench and precise hardware detail.",
		alt: "安装在专业拍摄支架上的无标识手机",
	},
	{
		slug: "vr-headset-user",
		title: "虚拟空间体验",
		scene: "设计师在开放工作室佩戴头显交互",
		shotScale: "中景",
		useCase: "未来体验叙事",
		styleWorld: "Chrome Future",
		aspectRatio: "16:9",
		prompt:
			"A product designer using an unbranded VR headset in an open creative studio, medium shot, natural hand interaction, real furniture and subtle cyan task lighting.",
		alt: "设计师在工作室佩戴虚拟现实头显",
	},
	{
		slug: "server-rack-technician",
		title: "数据中心巡检",
		scene: "技术人员检查整齐排列的服务器机架",
		shotScale: "中全景",
		useCase: "基础设施说明",
		styleWorld: "Blue Systems",
		aspectRatio: "16:9",
		prompt:
			"A data-center technician inspecting one server rack in a long orderly aisle, medium wide frame, realistic cable management, cool practical light and accurate scale.",
		alt: "技术人员在数据中心检查服务器机架",
	},
	{
		slug: "drone-folding-propeller",
		title: "折叠无人机结构",
		scene: "户外装备桌上的无人机展开旋翼",
		shotScale: "特写",
		useCase: "硬件功能展示",
		styleWorld: "Outdoor Tech",
		aspectRatio: "16:9",
		prompt:
			"Close detail of hands unfolding the propeller arms of an unbranded compact drone on an outdoor equipment table, visible joints, matte materials and mountain daylight.",
		alt: "双手展开小型无人机旋翼结构",
	},
	{
		slug: "mechanical-keyboard-build",
		title: "机械键盘组装",
		scene: "工作台上安装最后一颗键帽",
		shotScale: "大特写",
		useCase: "创客过程补镜",
		styleWorld: "Tactile Tech",
		aspectRatio: "16:9",
		prompt:
			"Extreme close-up of hands placing the final blank keycap on a custom mechanical keyboard, visible switches and aluminum plate, soft bench light and crisp tactile detail.",
		alt: "双手在工作台安装机械键盘键帽",
	},
	{
		slug: "smart-ring-sensor",
		title: "智能戒指传感器",
		scene: "深色台面上的智能戒指内侧结构",
		shotScale: "大特写",
		useCase: "可穿戴产品卖点",
		styleWorld: "Chrome Future",
		aspectRatio: "1:1",
		prompt:
			"Extreme macro of an unbranded smart ring resting on a dark mineral surface, inner health sensors and polished edge visible, controlled technical highlights and square composition.",
		alt: "智能戒指内侧传感器与金属边缘微距",
	},
	{
		slug: "audio-console-faders",
		title: "调音台推子",
		scene: "录音棚中手指推动一组专业推子",
		shotScale: "特写",
		useCase: "声音制作过程",
		styleWorld: "Electric Noir",
		aspectRatio: "16:9",
		prompt:
			"Close view of a sound engineer's hand moving one fader on a professional mixing console, rows of physical controls receding into depth, warm and cyan studio practicals.",
		alt: "声音工程师调节专业调音台推子",
	},
	{
		slug: "3d-printer-prototype",
		title: "原型正在打印",
		scene: "桌面3D打印机逐层制作白色原型",
		shotScale: "近景",
		useCase: "创新过程展示",
		styleWorld: "Clean Knowledge",
		aspectRatio: "4:5",
		prompt:
			"Close portrait view inside a desktop 3D printer as a white product prototype is built layer by layer, moving print head, clean workshop and believable machine detail.",
		alt: "桌面3D打印机正在制作白色产品原型",
	},
] as const satisfies readonly AssetSeed[];

const DOCUMENTARY_HUMAN_ASSETS = [
	{
		slug: "fisherman-dawn-portrait",
		title: "黎明渔人",
		scene: "老渔人在出海前整理船上的绳索",
		shotScale: "中景",
		useCase: "人物故事开场",
		styleWorld: "Documentary Grain",
		aspectRatio: "4:5",
		prompt:
			"An older fisherman arranging heavy ropes on a small working boat before dawn, medium portrait, weathered hands and face, cool harbor light and respectful documentary distance.",
		alt: "老渔人在黎明港口整理船绳",
	},
	{
		slug: "tailor-window-work",
		title: "窗下裁缝",
		scene: "老裁缝在自然光下精细缝制衣料",
		shotScale: "中近景",
		useCase: "工艺人物叙事",
		styleWorld: "Warm Memory",
		aspectRatio: "16:9",
		prompt:
			"An experienced tailor sewing a detailed garment beside a tall workshop window, medium close-up, worn measuring tools, soft daylight and authentic concentration.",
		alt: "老裁缝在窗边自然光下缝制服装",
	},
	{
		slug: "nurse-night-shift",
		title: "夜班护士",
		scene: "安静医院走廊中护士短暂停留",
		shotScale: "中全景",
		useCase: "职业纪实",
		styleWorld: "Clinical Calm",
		aspectRatio: "16:9",
		prompt:
			"A night-shift nurse pausing briefly in a quiet hospital corridor, medium wide frame, gentle fluorescent light, realistic fatigue and dignity without staged drama.",
		alt: "夜班护士在安静医院走廊短暂停留",
	},
	{
		slug: "farmer-soil-hands",
		title: "土壤与双手",
		scene: "农人捧起湿润土壤观察作物状态",
		shotScale: "特写",
		useCase: "农业故事细节",
		styleWorld: "Human Daylight",
		aspectRatio: "16:9",
		prompt:
			"Close documentary view of a farmer lifting dark moist soil between practiced hands in a field, visible roots and texture, overcast natural light and honest working detail.",
		alt: "农人用双手捧起湿润土壤观察",
	},
	{
		slug: "musician-empty-theater",
		title: "空剧场排练",
		scene: "独奏者面向空座席进行最后排练",
		shotScale: "大全景",
		useCase: "艺术人物建立",
		styleWorld: "Midnight Jewel",
		aspectRatio: "16:9",
		prompt:
			"Very wide view from an empty theater balcony of a lone musician rehearsing under one work light on stage, rows of vacant seats and restrained cinematic scale.",
		alt: "独奏者在空剧场舞台上进行排练",
	},
	{
		slug: "mechanic-garage-portrait",
		title: "车库技师",
		scene: "修理完成后技师站在打开的引擎盖旁",
		shotScale: "中景",
		useCase: "本地商业人物",
		styleWorld: "Tactile Craft",
		aspectRatio: "4:5",
		prompt:
			"A skilled mechanic standing beside an open engine bay after completing a repair, medium portrait, real grease marks, practical garage light and direct calm expression.",
		alt: "汽车技师站在打开的引擎盖旁",
	},
	{
		slug: "elder-family-archive",
		title: "家庭旧照片",
		scene: "老人坐在餐桌前翻看家庭相册",
		shotScale: "中近景",
		useCase: "记忆叙事",
		styleWorld: "Warm Memory",
		aspectRatio: "16:9",
		prompt:
			"An elderly person quietly turning pages of a family photo album at a dining table, medium close-up, photographs not readable, soft afternoon window light and intimate documentary tone.",
		alt: "老人坐在餐桌前翻看家庭旧相册",
	},
	{
		slug: "student-late-library",
		title: "闭馆前自习",
		scene: "学生在深夜图书馆完成最后一页笔记",
		shotScale: "中全景",
		useCase: "成长过程补镜",
		styleWorld: "Editorial Paper",
		aspectRatio: "16:9",
		prompt:
			"A university student finishing handwritten notes alone in a library near closing time, medium wide frame, pools of desk light, tall shelves and realistic late-night focus.",
		alt: "学生在闭馆前的图书馆独自完成笔记",
	},
	{
		slug: "baker-before-sunrise",
		title: "日出前的面包师",
		scene: "城市尚未醒来时面包师开始揉面",
		shotScale: "中景",
		useCase: "品牌幕后故事",
		styleWorld: "Warm Craft",
		aspectRatio: "16:9",
		prompt:
			"A baker kneading a large batch of dough in a working bakery before sunrise, medium shot, flour on apron and bench, warm task light against cool exterior darkness.",
		alt: "面包师在日出前的工作台揉面",
	},
	{
		slug: "volunteer-flood-relief",
		title: "雨后物资接力",
		scene: "志愿者在积水街道传递救援物资",
		shotScale: "全景",
		useCase: "社会纪实",
		styleWorld: "Documentary Grain",
		aspectRatio: "16:9",
		prompt:
			"Volunteers forming a careful human chain to pass relief supplies along a shallow flooded street after rain, wide documentary frame, practical clothing and respectful realism.",
		alt: "志愿者在积水街道接力传递救援物资",
	},
] as const satisfies readonly AssetSeed[];

const ARCHITECTURE_SPACE_ASSETS = [
	{
		slug: "concrete-house-courtyard",
		title: "清水混凝土庭院",
		scene: "晨光进入安静住宅的内向庭院",
		shotScale: "全景",
		useCase: "住宅项目建立",
		styleWorld: "Concrete Calm",
		aspectRatio: "16:9",
		prompt:
			"Wide architectural view into a quiet board-formed concrete house courtyard at morning, one small tree, precise shadow lines, realistic material variation and human scale.",
		alt: "晨光照进清水混凝土住宅庭院",
	},
	{
		slug: "glass-office-atrium",
		title: "玻璃办公中庭",
		scene: "员工穿过多层办公楼的通高中庭",
		shotScale: "大全景",
		useCase: "企业空间展示",
		styleWorld: "Chrome Future",
		aspectRatio: "16:9",
		prompt:
			"Very wide view through a multistory glass office atrium with bridges and a few employees in motion, clean daylight, accurate reflections and clear structural rhythm.",
		alt: "员工穿过现代玻璃办公楼中庭",
	},
	{
		slug: "compact-apartment-transform",
		title: "小户型变形家具",
		scene: "住户展开墙面隐藏的工作桌",
		shotScale: "中全景",
		useCase: "空间功能说明",
		styleWorld: "Quiet Tech",
		aspectRatio: "16:9",
		prompt:
			"A resident unfolding a concealed work desk from a fitted wall in a compact apartment, medium wide interior, clear mechanism, warm natural materials and realistic dimensions.",
		alt: "住户展开小户型墙面隐藏工作桌",
	},
	{
		slug: "museum-staircase-curve",
		title: "博物馆旋转楼梯",
		scene: "参观者沿白色曲线楼梯缓慢上行",
		shotScale: "大全景",
		useCase: "空间情绪转场",
		styleWorld: "Editorial Paper",
		aspectRatio: "4:5",
		prompt:
			"Very wide portrait view of visitors ascending a sculptural white curved staircase inside a contemporary museum, diffuse skylight, clean geometry and measured human scale.",
		alt: "参观者沿博物馆白色曲线楼梯上行",
	},
	{
		slug: "hotel-lobby-symmetry",
		title: "酒店大堂轴线",
		scene: "旅客从对称大堂中央走向前台",
		shotScale: "大全景",
		useCase: "酒店商业片",
		styleWorld: "Botanical Luxury",
		aspectRatio: "16:9",
		prompt:
			"Symmetrical very wide view of a refined hotel lobby as one traveler approaches reception, stone, timber and planted elements, soft daylight and understated luxury.",
		alt: "旅客穿过对称构图的现代酒店大堂",
	},
	{
		slug: "wood-cabin-interior",
		title: "木屋窗景",
		scene: "木结构起居室面向雾气山谷",
		shotScale: "全景",
		useCase: "度假空间展示",
		styleWorld: "Warm Memory",
		aspectRatio: "16:9",
		prompt:
			"Wide interior of a timber cabin living room opening toward a misty mountain valley through large windows, tactile wood grain, simple furniture and soft overcast light.",
		alt: "木结构度假屋起居室与山谷窗景",
	},
	{
		slug: "brutalist-library-exterior",
		title: "粗野主义图书馆",
		scene: "行人穿过大型混凝土公共建筑前广场",
		shotScale: "大全景",
		useCase: "城市建筑建立",
		styleWorld: "Concrete Calm",
		aspectRatio: "16:9",
		prompt:
			"Very wide exterior of a monumental brutalist public library with people crossing the plaza, overcast sky, detailed concrete weathering and strong geometric massing.",
		alt: "行人穿过粗野主义图书馆前广场",
	},
	{
		slug: "kitchen-material-detail",
		title: "厨房材质交界",
		scene: "石材台面、木柜与金属水槽交汇",
		shotScale: "特写",
		useCase: "室内设计细节",
		styleWorld: "Tactile Craft",
		aspectRatio: "4:5",
		prompt:
			"Close architectural detail where honed stone countertop, oak cabinetry and brushed steel sink meet in a contemporary kitchen, grazing daylight and exact joinery.",
		alt: "现代厨房石材木材与金属交界细节",
	},
	{
		slug: "rooftop-garden-city",
		title: "城市屋顶花园",
		scene: "办公人群在高层屋顶绿地短暂休息",
		shotScale: "全景",
		useCase: "可持续空间叙事",
		styleWorld: "Botanical Luxury",
		aspectRatio: "16:9",
		prompt:
			"Wide view of office workers taking a break in a planted rooftop garden above a dense city, layered native greenery, seating and realistic afternoon daylight.",
		alt: "办公人群在城市高层屋顶花园休息",
	},
	{
		slug: "metro-station-vault",
		title: "拱顶地铁站",
		scene: "列车驶入具有连续拱顶的新地铁站",
		shotScale: "大全景",
		useCase: "公共空间展示",
		styleWorld: "Chrome Future",
		aspectRatio: "16:9",
		prompt:
			"Very wide architectural view of a modern metro train entering a station with repeating vaulted ceilings, clean wayfinding shapes without readable text, commuters and accurate scale.",
		alt: "列车驶入连续拱顶结构的现代地铁站",
	},
] as const satisfies readonly AssetSeed[];

export const VISIONCUT_GENERATED_LIBRARY: readonly VisionCutGeneratedAsset[] = [
	...createCategoryAssets({
		categoryId: "talking-head",
		seeds: TALKING_HEAD_ASSETS,
	}),
	...createCategoryAssets({
		categoryId: "product-detail",
		seeds: PRODUCT_DETAIL_ASSETS,
	}),
	...createCategoryAssets({
		categoryId: "city-night",
		seeds: CITY_NIGHT_ASSETS,
	}),
	...createCategoryAssets({
		categoryId: "travel-place",
		seeds: TRAVEL_PLACE_ASSETS,
	}),
	...createCategoryAssets({
		categoryId: "food-life",
		seeds: FOOD_LIFE_ASSETS,
	}),
	...createCategoryAssets({
		categoryId: "sports-action",
		seeds: SPORTS_ACTION_ASSETS,
	}),
	...createCategoryAssets({
		categoryId: "event-crowd",
		seeds: EVENT_CROWD_ASSETS,
	}),
	...createCategoryAssets({
		categoryId: "tech-device",
		seeds: TECH_DEVICE_ASSETS,
	}),
	...createCategoryAssets({
		categoryId: "documentary-human",
		seeds: DOCUMENTARY_HUMAN_ASSETS,
	}),
	...createCategoryAssets({
		categoryId: "architecture-space",
		seeds: ARCHITECTURE_SPACE_ASSETS,
	}),
];

const AVAILABLE_LIBRARY_SLUGS: ReadonlySet<string> = new Set([
	"alley-bicycle-neon",
	"audio-console-faders",
	"bakery-croissant-tray",
	"basketball-dunk-low",
	"beauty-creator-mirror",
	"boxer-heavy-bag",
	"brunch-table-overhead",
	"camera-lens-aperture",
	"ceramic-cup-steam",
	"chef-kitchen-address",
	"chocolate-cake-cut",
	"climber-chalk-hands",
	"cocktail-citrus-splash",
	"coffee-bag-roast-texture",
	"coffee-pour-macro",
	"community-workshop-table",
	"concert-hands-stage",
	"conference-keynote-wide",
	"creator-desk-lavmic",
	"cyclist-corner-speed",
	"doctor-clinic-explainer",
	"drone-folding-propeller",
	"expert-bookshelf-answer",
	"family-dinner-laugh",
	"fashion-backstage-lineup",
	"festival-food-lights",
	"fisherman-dawn-portrait",
	"fitness-coach-gym-tip",
	"football-goal-rain",
	"founder-window-keylight",
	"gallery-opening-guests",
	"graduation-cap-toss",
	"headphones-metal-hinge",
	"jewelry-gem-facet",
	"laptop-code-reflection",
	"mechanical-keyboard-build",
	"neon-crosswalk-rain",
	"night-market-steam",
	"pasta-toss-kitchen",
	"perfume-glass-caustic",
	"picnic-fruit-sun",
	"podcast-host-side-angle",
	"product-launch-applause",
	"robot-arm-calibration",
	"rooftop-traffic-river",
	"server-rack-technician",
	"skincare-droplet-glass",
	"smartphone-camera-rig",
	"smart-ring-sensor",
	"smart-speaker-fabric",
	"sneaker-sole-motion",
	"sprinter-block-start",
	"street-dumpling-steam",
	"sushi-chef-slice",
	"swimmer-butterfly-water",
	"taxi-window-reflection",
	"teacher-board-explainer",
	"tennis-serve-sunset",
	"vr-headset-user",
	"watch-crown-macro",
	"yoga-balance-rooftop",
]);

export const VISIONCUT_AVAILABLE_GENERATED_LIBRARY =
	VISIONCUT_GENERATED_LIBRARY.filter((asset) =>
		AVAILABLE_LIBRARY_SLUGS.has(asset.slug),
	);

export function getVisionCutCategoryCount(
	categoryId: VisionCutLibraryCategoryId,
): number {
	return VISIONCUT_GENERATED_LIBRARY.filter(
		(asset) => asset.categoryId === categoryId,
	).length;
}
