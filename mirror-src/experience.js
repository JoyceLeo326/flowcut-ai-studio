const DEFAULT_MATERIAL =
  "开场是主理人把失败样品放到桌上。中段展示三次调整配方的过程。最后顾客盲测说终于喝到了想要的酸度。";

const CHOICES = {
  role: ["剪辑师", "内容导演", "内容运营"],
  audience: ["第一次刷到", "已经关注", "准备购买"],
  platform: ["抖音", "视频号", "B站"],
  priority: ["前3秒留存", "叙事完整", "转化证据"],
  seconds: [15, 30, 60],
};

const PLAN_TEMPLATES = [
  {
    id: "hook-cut",
    title: "三秒破题",
    badge: "留存先行",
    priority: "前3秒留存",
    platforms: ["抖音", "视频号"],
    preferredSeconds: 15,
    thesis: "先交出最不寻常的结果，再用快速回切解释它为什么发生。",
    gain: "观众在前三秒就能说出冲突，信息承诺非常清楚。",
    tradeoff: "铺垫会被压缩，人物情绪需要依靠动作与字幕补足。",
    rhythm: "2–4 秒一切，关键证据停留更久",
  },
  {
    id: "story-arc",
    title: "情绪回环",
    badge: "故事先行",
    priority: "叙事完整",
    platforms: ["B站", "视频号"],
    preferredSeconds: 60,
    thesis: "保留一次完整的起因、尝试和选择，让结尾回应开场动作。",
    gain: "人物动机和过程更可信，评论区更容易讨论选择本身。",
    tradeoff: "开场需要耐心，必须用声音与画面细节维持前十秒注意力。",
    rhythm: "6–12 秒一段，转折处主动留白",
  },
  {
    id: "proof-chain",
    title: "证据节拍",
    badge: "证明先行",
    priority: "转化证据",
    platforms: ["抖音", "B站"],
    preferredSeconds: 30,
    thesis: "把主张拆成可看见的证据链，每个结论紧跟一个素材动作。",
    gain: "卖点不靠口号，观众能判断变化是否真的发生。",
    tradeoff: "情绪氛围会让位于信息密度，素材缺证据时必须明确留空。",
    rhythm: "主张与证据成对出现，字幕不越过素材",
  },
];

function clean(value, fallback, limit = 120) {
  const result = String(value ?? "").replace(/\s+/g, " ").trim();
  return result ? result.slice(0, limit) : fallback;
}

function choice(value, list, fallback) {
  return list.includes(value) ? value : fallback;
}

export function normalizeEditMission(input = {}) {
  return {
    creator: clean(input.creator, "周屿", 24),
    role: choice(input.role, CHOICES.role, "剪辑师"),
    audience: choice(input.audience, CHOICES.audience, "第一次刷到"),
    platform: choice(input.platform, CHOICES.platform, "抖音"),
    priority: choice(input.priority, CHOICES.priority, "前3秒留存"),
    seconds: choice(Number(input.seconds), CHOICES.seconds, 30),
    deadline: clean(input.deadline, "今天 20:00", 32),
    material: clean(input.material, DEFAULT_MATERIAL, 2400),
  };
}

export function splitMaterial(material) {
  const normalized = clean(material, DEFAULT_MATERIAL, 2400);
  const sentences = normalized
    .split(/(?<=[。！？!?；;])/u)
    .map((item) => item.trim())
    .filter(Boolean);
  if (sentences.length >= 3) return sentences.slice(0, 12);
  const fragments = normalized.split(/[，,、：:]/u).map((item) => item.trim()).filter(Boolean);
  return [...sentences, ...fragments, normalized].filter((item, index, items) => items.indexOf(item) === index).slice(0, 12);
}

function at(items, index) {
  return items[index % items.length] ?? items[0];
}

function fitScore(template, mission) {
  let score = 66;
  if (template.priority === mission.priority) score += 18;
  if (template.platforms.includes(mission.platform)) score += 8;
  score += Math.max(0, 8 - Math.abs(template.preferredSeconds - mission.seconds) / 5);
  if (mission.audience === "准备购买" && template.id === "proof-chain") score += 6;
  if (mission.audience === "已经关注" && template.id === "story-arc") score += 5;
  if (mission.audience === "第一次刷到" && template.id === "hook-cut") score += 5;
  return Math.min(98, Math.round(score));
}

export function generateEditPlans(input = {}) {
  const mission = normalizeEditMission(input);
  const materialNodes = splitMaterial(mission.material);

  return PLAN_TEMPLATES.map((template, templateIndex) => {
    const order = template.id === "hook-cut" ? [2, 0, 1] : template.id === "story-arc" ? [0, 1, 2] : [1, 2, 0];
    const materialAnchors = order.map((index) => at(materialNodes, index));
    const firstFrame =
      template.id === "hook-cut"
        ? `0.0 秒先看结果：“${materialAnchors[0]}”`
        : template.id === "story-arc"
          ? `从起因动作进入：“${materialAnchors[0]}”`
          : `用第一组可核对证据开场：“${materialAnchors[0]}”`;

    return {
      ...template,
      templateIndex,
      score: fitScore(template, mission),
      materialAnchors,
      firstFrame,
      ownerFit: `${mission.creator}以${mission.role}视角优先检查${mission.priority}。`,
    };
  }).sort((left, right) => right.score - left.score || left.templateIndex - right.templateIndex);
}

function timelineClip(index, name, start, end, instruction, anchor, plan) {
  const layerByIndex = ["V1 主画面 + T1 标题", "V1 主画面 + A1 人声", "V1/V2 对切 + T2 证据", "V1 主画面 + A2 环境", "V1 定帧 + T1 行动"];
  return {
    id: `C${index + 1}`,
    name,
    start,
    end,
    duration: end - start,
    layer: layerByIndex[index],
    instruction,
    materialAnchor: anchor,
    audio: index === 0 ? "原声硬切进入，音乐延后 0.6 秒" : index === 4 ? "尾音保留 0.4 秒，不抢行动字幕" : plan.rhythm,
  };
}

export function buildEditDecision(input, plan) {
  const mission = normalizeEditMission(input);
  const total = mission.seconds;
  const marks = [0, 0.1, 0.3, 0.56, 0.82, 1].map((ratio) => Math.round(total * ratio));
  const anchors = plan.materialAnchors;
  const instructions = [
    plan.firstFrame,
    `交代冲突，不解释结论；字幕只写${mission.audience}必须知道的一句话。`,
    plan.id === "proof-chain" ? "每个口头主张后立刻放对应动作或结果。" : "用动作推进过程，删除不改变选择的重复镜头。",
    `在“${anchors[2]}”处兑现这条路线的主要收益。`,
    plan.id === "story-arc" ? "回到开场动作，用人物变化完成闭环。" : "定格结果并留下一个可执行的下一步。",
  ];
  const names = ["首帧钩子", "冲突定位", "过程与证据", "结果兑现", "行动收束"];

  return {
    schemaVersion: 1,
    version: 1,
    project: "FlowCut 静态剪辑兼容模式",
    mission,
    plan: {
      id: plan.id,
      title: plan.title,
      badge: plan.badge,
      score: plan.score,
      thesis: plan.thesis,
      gain: plan.gain,
      tradeoff: plan.tradeoff,
      rhythm: plan.rhythm,
      confirmedBy: `${mission.creator} · ${mission.role}`,
    },
    timeline: names.map((name, index) =>
      timelineClip(index, name, marks[index], marks[index + 1], instructions[index], at(anchors, index), plan),
    ),
    exportSpec: {
      aspectRatio: mission.platform === "B站" ? "16:9" : "9:16",
      durationSeconds: total,
      captionSafeArea: mission.platform === "抖音" ? "下方 22% 避让交互区" : "下方 14% 保持两行以内",
    },
    nextCheck: `在${mission.deadline}前进行一次静音首看：测试者应能在 3 秒内说出冲突，并在结尾复述一个结果。`,
    revisions: [],
  };
}

function markdown(decision) {
  const version = decision.revisions.at(-1)?.version ?? decision.version;
  const lines = [
    `# ${decision.plan.title} · 第 ${version} 版剪辑单`,
    "",
    `- 确认人：${decision.plan.confirmedBy}`,
    `- 平台 / 画幅：${decision.mission.platform} / ${decision.exportSpec.aspectRatio}`,
    `- 时长：${decision.exportSpec.durationSeconds} 秒`,
    `- 目标观众：${decision.mission.audience}`,
    `- 优先目标：${decision.mission.priority}`,
    `- 收益：${decision.plan.gain}`,
    `- 代价：${decision.plan.tradeoff}`,
    "",
    "## 时间线",
    "",
    ...decision.timeline.flatMap((clip) => [
      `### ${clip.id} ${clip.name} · ${clip.start.toFixed(1)}s–${clip.end.toFixed(1)}s`,
      "",
      `- 轨道：${clip.layer}`,
      `- 剪辑：${clip.instruction}`,
      `- 声音：${clip.audio}`,
      `- 素材锚点：${clip.materialAnchor}`,
      "",
    ]),
    "## 导出与验证",
    "",
    `- 字幕安全区：${decision.exportSpec.captionSafeArea}`,
    `- 下一次验证：${decision.nextCheck}`,
  ];

  if (decision.revisions.length) {
    lines.push("", "## 本地反馈回流", "");
    for (const revision of decision.revisions) {
      lines.push(`- V${revision.version}：${revision.action}`, `  - 观察：${revision.evidence}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function buildDownloads(decision) {
  return {
    markdown: markdown(decision),
    json: `${JSON.stringify(decision, null, 2)}\n`,
  };
}

export function createEditRevision(decision, feedback = {}) {
  const score = Math.max(1, Math.min(5, Number(feedback.score) || 3));
  const outcome = clean(feedback.outcome, "需要继续验证", 40);
  const evidence = clean(feedback.note, "本轮没有补充文字观察", 240);
  const actions = {
    "开场不够抓人": "重做开场：把最强结果帧前移到 0.0 秒，并在 1.5 秒前落下冲突字幕。",
    "过程看不明白": "给过程段补一组前后对照，删除一个没有改变结论的过场镜头。",
    "证据不够可信": "把主张与对应素材紧邻排列；没有素材支持的句子改为待验证标记。",
    "节奏太赶": "从过程段释放两秒给关键动作，字幕每屏只保留一个意思。",
    "可以交付": "锁定当前剪辑点，只复核字幕安全区、尾音和导出时长。",
  };
  const base = actions[outcome] ?? "把观察定位到一个剪辑片段，只修改该片段后进行同条件复看。";
  return {
    version: decision.version + decision.revisions.length + 1,
    score,
    outcome,
    evidence,
    action: score <= 2 ? `${base} 评分偏低，本轮不同时修改其他变量。` : base,
  };
}
