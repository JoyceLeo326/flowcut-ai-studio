export const STORY_CHAPTERS = [
  { id: "intake", number: "01", label: "素材进入", title: "先看见，真实发生了什么。", accent: "lime" },
  { id: "conflict", number: "02", label: "冲突定位", title: "约束碰撞，才有这一刀。", accent: "coral" },
  { id: "compare", number: "03", label: "三路对照", title: "三种获得，三种主动放弃。", accent: "cyan" },
  { id: "choice", number: "04", label: "人的选择", title: "推荐不替你做决定。", accent: "coral" },
  { id: "confirm", number: "05", label: "确认交付", title: "选择变成可带走的时间线。", accent: "lime" },
  { id: "feedback", number: "06", label: "证据回环", title: "观察真正改变下一轮。", accent: "cyan" },
];

export const SHARED_STORY_ANCHOR =
  "Lin Cheng, Chinese woman editor with short black bob, coral overshirt and silver ear cuff; A-Ye, Chinese male creator with wavy black hair, round glasses and sage work jacket; same compact night editing studio, black desk, dual monitors, ceramic cup, red failed sample, memory card, lime/cyan/coral practical light.";

const RAW_SCENES = [
  ["intake", "exec-96f8cd1f-b3de-44cc-b1a2-384572240d7c.png", "阿野把存储卡与红色失败样品放到桌上，林澄打开空白笔记本，真实剪辑任务开始。", "建立连续角色、空间、素材证据与尚未解决的任务。", "Material handoff begins; memory card and failed sample reach the editor."],
  ["intake", "exec-67ff616c-5726-45d1-9c32-ee9945f76fc7.png", "林澄把存储卡插入本地读卡器，两人一起查看无文字的素材波形与片段块。", "说明素材在当前设备进入工作流，不依赖登录或上传。", "Local ingest begins while both creators inspect abstract clips."],
  ["intake", "exec-23691abd-cb40-408c-bc2a-b0e136ceee80.png", "失败样品、杯子与存储卡在桌面构成证据三角，阿野向林澄指出素材里的真实动作。", "把原始文件转译为可观察、可引用的素材证据。", "Physical evidence forms a triangle as the creator recounts what happened."],
  ["intake", "exec-fe136cf9-a3c7-4e7c-9b43-564e5cac28b0.png", "林澄暂停一个具体画面并指向屏幕，阿野第一次看见素材中真正的矛盾。", "从素材锚点发现第一条可描述的冲突。", "A paused frame reveals the first concrete conflict."],
  ["conflict", "exec-c86cfc41-8944-4029-bd11-37a2809b963c.png", "一个屏幕是纠缠的时间线，另一个是清晰结果，林澄与阿野在速度和意义之间权衡。", "在推荐出现前，先把核心编辑冲突外化。", "Dense process and clear result confront each other across two screens."],
  ["conflict", "exec-dcb6b713-3a6a-49b0-ad99-17bdadb8f7da.png", "失败样品与成功杯子分居双屏，林澄用手指出结果与过程之间缺失的一段。", "暴露结果和因果过程之间的叙事缺口。", "The editor traces the missing causal middle between failure and result."],
  ["conflict", "exec-910ba6ff-97d4-4e87-924d-226a5173408d.png", "阿野指向竖屏观看框和桌面时钟，林澄拿着三张彩色证据卡记录交付约束。", "让观众、平台、时长与截止时间成为推荐的可见原因。", "Audience, platform, duration and deadline become physical constraints."],
  ["conflict", "exec-d800cc87-b8a2-46e6-bf6f-58e10bc5d212.png", "两双手把时钟、素材卡、失败样品和杯子排列在一条珊瑚色切线上。", "把分散约束收束成一个可行动的剪辑冲突。", "All constraints collapse around one visible cut line."],
  ["compare", "exec-d54a46c4-a1a4-42c8-96fc-324dbe04a53c.png", "林澄铺开三条完全等大的分镜路线，阿野站在对面以相同距离审视它们。", "以同等视觉权重介绍恰好三条候选路线。", "Three equally sized storyboard routes enter comparison."],
  ["compare", "exec-11c41b7f-0cfe-40f8-aa11-961815659a9a.png", "结果先行的分镜以失败样品开场，快速片段之后留下一段被遮住的情绪铺垫。", "同时显示留存路线的收益与被压缩的情绪代价。", "The retention route gains speed and sacrifices emotional setup."],
  ["compare", "exec-d677dddf-e6a6-4878-a65b-dbea78bd42bb.png", "故事路线从失败样品流向多次尝试和最终杯子，旁边的时钟弧线明显更长。", "同时显示叙事完整的收益与开场耐心代价。", "The story route gains continuity and asks for more opening patience."],
  ["compare", "exec-a9731d71-d6d2-47de-a056-4282449e7e0e.png", "林澄把每个主张图块与一张动作证据配对，阿野留意到氛围被信息密度让位。", "同时显示证据路线的可信度收益与情绪氛围代价。", "The proof route pairs every claim with action and quiets the mood."],
  ["choice", "exec-78d5cffb-4059-4bcf-b66a-5236069fee63.png", "三条候选以相同高度并排立在桌上，林澄退开双手，阿野独自向前选择。", "明确系统负责比较，创作者负责决定。", "The system steps back so the creator can own the choice."],
  ["choice", "exec-a6dfcdca-925b-4b0e-8f69-560b28391b32.png", "阿野把其中一条路线向前移动几厘米，林澄没有触碰这张被选中的卡。", "记录用户而非系统完成的候选选择。", "A-Ye physically advances one route while Lin Cheng observes."],
  ["choice", "exec-e206f344-1d6f-4be8-af1a-4dc456142604.png", "阿野一手拿被选路线，一手拿珊瑚色代价卡，林澄指出被牺牲的情绪段落。", "在确认前迫使选择者正视明确取舍。", "The chosen route and its coral trade-off are weighed together."],
  ["choice", "exec-6467a4a6-6640-4273-ace6-1260a1a9be39.png", "阿野把黑色确认标记放到珊瑚切线之上，另外两条候选仍完整留在后方。", "把接受代价变成不可跳过的明确确认动作。", "A physical token records explicit acceptance of the trade-off."],
  ["confirm", "exec-715d42d1-926b-4c7c-85a9-4cd6e8c91d37.png", "被确认的路线展开为从零到结束的五个连续时间线片段，两人对照分镜检查。", "让人的确认产生一条真正连续的第一版时间线。", "The confirmed route becomes five contiguous timeline segments."],
  ["confirm", "exec-4d3fb724-4766-4382-8579-81a2f8162e53.png", "林澄选中第三个时间线片段，阿野在屏幕片段和桌面证据卡之间来回指认。", "证明时间码指令仍然锚定真实素材。", "A selected timeline segment points back to physical evidence."],
  ["confirm", "exec-840a4902-7fc3-48cc-8a53-a172135fdeb8.png", "林澄触发本地向下导出，纸面剪辑单和数据网格卡出现在设备旁。", "表现 Markdown 与 JSON 是实际生成的本地交付物。", "A local export produces a sheet and structured data card."],
  ["confirm", "exec-5cddde31-27dc-4fe5-bda3-8ccc26c3dedd.png", "林澄把夹好的剪辑单和深色存储设备交给阿野，完成时间线仍在背后发光。", "让结果可下载、可携带并归创作者所有。", "The creator receives portable deliverables while the cut remains visible."],
  ["feedback", "exec-2638f379-0f0b-49b1-ab88-766ff8af0d83.png", "两人肩并肩在手机上复看片子，结果已经出现，但他们的表情仍带着具体疑问。", "把交付后的真实观看作为反馈回环起点。", "A real phone review begins after delivery."],
  ["feedback", "exec-9f8e3080-bac7-4b2b-aaa3-eaf2aad687a1.png", "阿野点选五个评分点中的第二个，并把青色证据标记放到缺失动作旁。", "收集评分、问题、确信程度与观察证据。", "Structured review records a low score and a missing action."],
  ["feedback", "exec-84e486f3-91a6-4dff-9718-b3202e94bec9.png", "证据路线因青色反馈标记移到最前，旧路线仍在后方作为可见历史。", "证明反馈重新排序候选并改变下一轮推荐。", "Evidence feedback moves a different route into the lead."],
  ["feedback", "exec-111a83dc-ebe0-41dc-8816-6f3d61d1a3b5.png", "屏幕显示证据成对的新版时间线，阿野把杯子放回失败样品旁，林澄安静确认结果。", "以已改变的新剪辑闭环，同时保留下一次复看的入口。", "A revised evidence-led cut completes the loop without closing it forever."],
];

export const STORY_SCENES = RAW_SCENES.map(([chapter, sourceFile, alt, storyPurpose, prompt], index) => ({
  id: `frame-${String(index + 1).padStart(2, "0")}`,
  chapter,
  flowPosition: (index % 4) + 1,
  src: `./assets/story/flowcut-story-${String(index + 1).padStart(2, "0")}.webp`,
  width: 1200,
  height: 800,
  alt,
  storyPurpose,
  prompt: `${SHARED_STORY_ANCHOR} ${prompt}`,
  continuityAnchor: SHARED_STORY_ANCHOR,
  generator: "OpenAI built-in ImageGen",
  sourceFile,
  generationCallId: sourceFile.slice(5, -4),
}));

export function storyChapterForStage(stage) {
  const mapping = {
    intake: "intake",
    conflict: "conflict",
    compare: "compare",
    choice: "choice",
    confirm: "confirm",
    feedback: "feedback",
  };
  return mapping[stage] ?? "intake";
}
