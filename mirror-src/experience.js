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
    criteria: { retention: 94, evidence: 68, continuity: 61 },
    roleBoost: { "剪辑师": 3, "内容导演": 0, "内容运营": 10 },
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
    criteria: { retention: 65, evidence: 72, continuity: 96 },
    roleBoost: { "剪辑师": 5, "内容导演": 12, "内容运营": 0 },
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
    criteria: { retention: 76, evidence: 97, continuity: 70 },
    roleBoost: { "剪辑师": 10, "内容导演": 3, "内容运营": 7 },
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
  return [...sentences, ...fragments, normalized]
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, 12);
}

function at(items, index) {
  return items[index % items.length] ?? items[0];
}

function scorePlan(template, mission) {
  const factors = {
    role: template.roleBoost[mission.role],
    audience:
      mission.audience === "准备购买" && template.id === "proof-chain"
        ? 9
        : mission.audience === "已经关注" && template.id === "story-arc"
          ? 8
          : mission.audience === "第一次刷到" && template.id === "hook-cut"
            ? 9
            : 0,
    platform: template.platforms.includes(mission.platform) ? 8 : -2,
    duration: Math.max(-2, 8 - Math.abs(template.preferredSeconds - mission.seconds) / 5),
    priority: template.priority === mission.priority ? 19 : 0,
    deadline: /今天|小时|马上/u.test(mission.deadline) && template.id === "hook-cut" ? 3 : 1,
  };
  const score = Math.min(99, Math.round(45 + Object.values(factors).reduce((sum, value) => sum + value, 0)));
  return { score, factors };
}

function fitReasons(template, mission, factors) {
  return [
    `${mission.role}视角为“${template.title}”贡献 ${factors.role >= 0 ? "+" : ""}${factors.role} 分`,
    `${mission.audience}观众贡献 ${factors.audience >= 0 ? "+" : ""}${factors.audience} 分`,
    `${mission.platform}发布环境贡献 ${factors.platform >= 0 ? "+" : ""}${factors.platform} 分`,
    `${mission.seconds} 秒时长贡献 ${factors.duration >= 0 ? "+" : ""}${Math.round(factors.duration)} 分`,
    `${mission.priority}优先级贡献 ${factors.priority >= 0 ? "+" : ""}${factors.priority} 分`,
    `${mission.deadline}交付约束贡献 +${factors.deadline} 分`,
  ];
}

function rolePromise(template, mission) {
  const outcomes = {
    "剪辑师": `让${template.title}直接落到可执行轨道与切点`,
    "内容导演": `让${template.title}守住人物动机与叙事回报`,
    "内容运营": `让${template.title}对应${mission.platform}的观看动作与复盘指标`,
  };
  return outcomes[mission.role];
}

export function buildEditingConflict(input = {}) {
  const mission = normalizeEditMission(input);
  const anchors = splitMaterial(mission.material);
  return {
    statement: `${mission.creator}需要在${mission.deadline}前，把“${at(anchors, 0)}”剪成一条面向${mission.audience}的${mission.seconds}秒${mission.platform}视频。`,
    tension: `既要守住${mission.priority}，又不能让“${at(anchors, 2)}”失去素材依据。`,
    evidence: anchors.slice(0, 3),
  };
}

export function generateEditPlans(input = {}) {
  const mission = normalizeEditMission(input);
  const materialNodes = splitMaterial(mission.material);

  return PLAN_TEMPLATES.map((template, templateIndex) => {
    const order = template.id === "hook-cut" ? [2, 0, 1] : template.id === "story-arc" ? [0, 1, 2] : [1, 2, 0];
    const materialAnchors = order.map((index) => at(materialNodes, index));
    const { score, factors } = scorePlan(template, mission);
    const firstFrame =
      template.id === "hook-cut"
        ? `0.0 秒先看结果：“${materialAnchors[0]}”`
        : template.id === "story-arc"
          ? `从起因动作进入：“${materialAnchors[0]}”`
          : `用第一组可核对证据开场：“${materialAnchors[0]}”`;

    return {
      ...template,
      templateIndex,
      score,
      criteria: { ...template.criteria },
      materialAnchors,
      firstFrame,
      fitReasons: fitReasons(template, mission, factors),
      constraintTrace: `${mission.role}；${mission.audience}；${mission.platform}；${mission.seconds} 秒；${mission.priority}；${mission.deadline}`,
      resultPromise: rolePromise(template, mission),
      ownerFit: `${mission.creator}以${mission.role}视角优先检查${mission.priority}。`,
    };
  }).sort((left, right) => right.score - left.score || left.templateIndex - right.templateIndex);
}

function timelineClip(index, name, start, end, instruction, anchor, plan, mission) {
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
    ownerCheck: mission.role === "剪辑师" ? "检查切点与声画连续" : mission.role === "内容导演" ? "检查动机与回报" : "检查观看动作与证据",
    audio: index === 0 ? "原声硬切进入，音乐延后 0.6 秒" : index === 4 ? "尾音保留 0.4 秒，不抢行动字幕" : plan.rhythm,
  };
}

function createTimeline(mission, plan) {
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
  return names.map((name, index) =>
    timelineClip(index, name, marks[index], marks[index + 1], instructions[index], at(anchors, index), plan, mission),
  );
}

export function confirmEditDecision(input, plans, selectedId, confirmation = {}) {
  const mission = normalizeEditMission(input);
  const candidates = Array.isArray(plans) && plans.length === 3 ? plans : generateEditPlans(mission);
  const plan = candidates.find((candidate) => candidate.id === selectedId);
  if (!plan) throw new Error("Select one of the three edit routes before confirmation.");
  if (confirmation.acceptedTradeoff !== true) throw new Error("You must accept the selected trade-off before confirmation.");

  return {
    schemaVersion: 2,
    version: 1,
    project: "FlowCut evidence-led edit decision",
    createdAt: new Date().toISOString(),
    mission,
    conflict: buildEditingConflict(mission),
    candidateComparison: candidates.map(({ id, title, score, gain, tradeoff, criteria, resultPromise, fitReasons }) => ({
      id,
      title,
      score,
      gain,
      tradeoff,
      criteria,
      resultPromise,
      fitReasons,
      selected: id === selectedId,
    })),
    plan: {
      id: plan.id,
      title: plan.title,
      badge: plan.badge,
      score: plan.score,
      thesis: plan.thesis,
      gain: plan.gain,
      tradeoff: plan.tradeoff,
      rhythm: plan.rhythm,
      resultPromise: plan.resultPromise,
      confirmedBy: `${mission.creator} · ${mission.role}`,
    },
    confirmation: {
      acceptedTradeoff: true,
      statement: clean(confirmation.statement, "我接受这条路线主动放弃的部分，并确认生成第一版。", 120),
    },
    timeline: createTimeline(mission, plan),
    exportSpec: {
      aspectRatio: mission.platform === "B站" ? "16:9" : "9:16",
      durationSeconds: mission.seconds,
      captionSafeArea: mission.platform === "抖音" ? "下方 22% 避让交互区" : "下方 14% 保持两行以内",
      filenameStem: `flowcut-${plan.id}-${mission.seconds}s`,
    },
    delivery: {
      status: "ready",
      formats: ["Markdown edit sheet", "JSON timeline"],
      privacy: "generated locally from the current browser session",
    },
    nextCheck: `在${mission.deadline}前进行一次静音首看：测试者应能在 3 秒内说出冲突，并在结尾复述一个结果。`,
    revisions: [],
    nextRound: null,
  };
}

export function buildEditDecision(input, plan) {
  const mission = normalizeEditMission(input);
  const generated = generateEditPlans(mission);
  const candidates = generated.map((candidate) => (candidate.id === plan.id ? { ...candidate, ...plan } : candidate));
  return confirmEditDecision(mission, candidates, plan.id, { acceptedTradeoff: true });
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
    `- 冲突：${decision.conflict.statement}`,
    `- 张力：${decision.conflict.tension}`,
    "",
    "## 三条候选对照",
    "",
    ...decision.candidateComparison.flatMap((candidate) => [
      `### ${candidate.selected ? "✓ " : ""}${candidate.title} · ${candidate.score} 分`,
      `- 获得：${candidate.gain}`,
      `- 放弃：${candidate.tradeoff}`,
      `- 结果承诺：${candidate.resultPromise}`,
      "",
    ]),
    "## 明确确认",
    "",
    `- ${decision.confirmation.statement}`,
    `- 接受的代价：${decision.plan.tradeoff}`,
    "",
    "## 时间线",
    "",
    ...decision.timeline.flatMap((clip) => [
      `### ${clip.id} ${clip.name} · ${clip.start.toFixed(1)}s–${clip.end.toFixed(1)}s`,
      `- 轨道：${clip.layer}`,
      `- 剪辑：${clip.instruction}`,
      `- 声音：${clip.audio}`,
      `- 素材锚点：${clip.materialAnchor}`,
      `- 角色检查：${clip.ownerCheck}`,
      "",
    ]),
    "## 导出与验证",
    "",
    `- 交付状态：${decision.delivery.status}`,
    `- 字幕安全区：${decision.exportSpec.captionSafeArea}`,
    `- 下一次验证：${decision.nextCheck}`,
  ];

  if (decision.revisions.length) {
    lines.push("", "## 本地反馈回流", "");
    for (const revision of decision.revisions) {
      lines.push(`- V${revision.version}：${revision.action}`, `  - 观察：${revision.evidence}`);
    }
  }
  if (decision.nextRound) {
    const first = decision.nextRound.candidates[0];
    lines.push(
      "",
      "## 下一轮已改变",
      "",
      `- 新推荐：${first.title}`,
      `- 改变原因：${decision.nextRound.changedBecause}`,
      `- 第一项实验：${decision.nextRound.firstExperiment}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function buildDownloads(decision) {
  return {
    markdown: markdown(decision),
    json: `${JSON.stringify(decision, null, 2)}\n`,
  };
}

const FEEDBACK_RULES = {
  "开场不够抓人": {
    planId: "hook-cut",
    action: "重做开场：把最强结果前移到 0.0 秒，并在 3 秒内交出冲突。",
    experiment: "只替换 C1，用静音首看验证测试者能否在 3 秒内复述冲突。",
  },
  "过程看不明白": {
    planId: "story-arc",
    action: "重排过程：保留一次起因、尝试和选择，删除不改变选择的重复镜头。",
    experiment: "只重排 C2–C3，让测试者按顺序复述起因、尝试和选择。",
  },
  "证据不够可信": {
    planId: "proof-chain",
    action: "补齐证据：每个口头主张后立刻接对应动作或结果。",
    experiment: "逐条配对主张与动作，只替换 C3，再测试观众能否指出证据来自哪一帧。",
  },
  "节奏太赶": {
    planId: "story-arc",
    action: "放慢兑现段：把 C4 的关键动作延长，并从 C2 删除一条重复信息。",
    experiment: "将 C4 延长 15%，用一次完整观看验证情绪回报是否更清楚。",
  },
  "可以交付": {
    planId: null,
    action: "冻结结构：只做字幕安全区、响度和导出文件名检查。",
    experiment: "不改结构，完成一次静音首看与一次耳机响度检查。",
  },
};

export function createEditRevision(decision, feedback = {}) {
  const score = Math.max(1, Math.min(5, Number(feedback.score) || 3));
  const outcome = clean(feedback.outcome, "过程看不明白", 40);
  const evidence = clean(feedback.note, "本轮没有补充文字观察", 240);
  const confidence = clean(feedback.confidence, "需要再看", 24);
  const rule = FEEDBACK_RULES[outcome] ?? FEEDBACK_RULES["过程看不明白"];
  return {
    version: (decision.revisions?.length ?? 0) + 2,
    score,
    outcome,
    confidence,
    evidence,
    action: rule.action,
  };
}

export function applyReviewFeedback(decision, feedback = {}) {
  const revision = createEditRevision(decision, feedback);
  const rule = FEEDBACK_RULES[revision.outcome] ?? FEEDBACK_RULES["过程看不明白"];
  const preferredId = rule.planId ?? decision.plan.id;
  const candidates = generateEditPlans(decision.mission)
    .map((candidate) => ({
      ...candidate,
      previousScore: candidate.score,
      score: Math.min(99, candidate.score + (candidate.id === preferredId ? 36 : 0)),
      feedbackFit: candidate.id === preferredId ? `回应“${revision.outcome}”` : "保留为对照路线",
    }))
    .sort((left, right) => right.score - left.score || left.templateIndex - right.templateIndex);
  const recommended = candidates[0];
  return {
    ...decision,
    revisions: [...(decision.revisions ?? []), revision],
    nextRound: {
      round: (decision.revisions?.length ?? 0) + 2,
      recommendedPlanId: recommended.id,
      candidates,
      changedBecause: `“${revision.outcome}”被记录为${revision.confidence}的观察，因而提高了${recommended.title}的证据权重。`,
      firstExperiment: rule.experiment,
      timelinePreview: createTimeline(decision.mission, recommended),
    },
  };
}
