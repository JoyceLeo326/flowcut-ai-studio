import {
  applyReviewFeedback,
  buildEditingConflict,
  buildDownloads,
  confirmEditDecision,
  generateEditPlans,
  normalizeEditMission,
} from "./experience.js";
import { STORY_CHAPTERS, STORY_SCENES, storyChapterForStage } from "./story-scenes.js";

const STORAGE_KEY = "flowcut-evidence-session-v2";
const byId = (id) => document.getElementById(id);
const missionForm = byId("mission-form");
const reviewForm = byId("review-form");
const materialField = missionForm.elements.material;
const sourceInput = byId("source-files");

const ROUTE_VISUALS = {
  "hook-cut": { src: "./assets/story/flowcut-story-10.webp", alt: "结果先行路线：先亮出失败样品与最终结果，再回切解释过程。" },
  "story-arc": { src: "./assets/story/flowcut-story-11.webp", alt: "故事先行路线：从失败、尝试到兑现保持完整的情绪回环。" },
  "proof-chain": { src: "./assets/story/flowcut-story-12.webp", alt: "证据先行路线：让每个主张紧跟一个可核对的素材动作。" },
};

let state = { mission: null, plans: [], selectedId: null, decision: null, activeClipId: null, zoom: 100, mediaAssets: [] };
let activeStoryChapter = "intake";
let selectedSourceFiles = [];
let sourcePreviewUrl = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(message) {
  const node = byId("toast");
  node.textContent = message;
  node.classList.add("is-visible");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => node.classList.remove("is-visible"), 2300);
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast("当前浏览器未允许本机保存，请先下载剪辑单。");
  }
}

function readMission() {
  return normalizeEditMission({
    ...Object.fromEntries(new FormData(missionForm).entries()),
    sourceAssets: state.mediaAssets,
  });
}

function syncMaterialCount() {
  byId("material-count").textContent = String(materialField.value.length);
}

function setProgressStatus(label) {
  byId("progress-status").textContent = label;
}

function formatFileSize(bytes) {
  if (bytes < 1_048_576) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function sourceKind(file) {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "image";
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (["mp4", "mov", "m4v", "webm", "mkv"].includes(extension)) return "video";
  if (["mp3", "wav", "m4a", "aac", "ogg", "flac"].includes(extension)) return "audio";
  if (["jpg", "jpeg", "png", "webp", "avif", "gif"].includes(extension)) return "image";
  return null;
}

function sourceMetadata(file) {
  const kind = sourceKind(file);
  return {
    name: file.name,
    type: file.type || `${kind || "application"}/unknown`,
    size: file.size,
    lastModified: file.lastModified,
  };
}

function renderSourcePreview() {
  const preview = byId("source-preview");
  if (sourcePreviewUrl) URL.revokeObjectURL(sourcePreviewUrl);
  sourcePreviewUrl = null;
  preview.replaceChildren();
  const file = selectedSourceFiles[0];
  if (!file) {
    const placeholder = document.createElement("div");
    placeholder.innerHTML = `<b>${state.mediaAssets.length ? "素材清单已就绪" : "素材预览区"}</b><span>${state.mediaAssets.length ? "重新选择文件即可继续预览" : "选择文件后可直接播放或查看"}</span>`;
    preview.append(placeholder);
    return;
  }

  sourcePreviewUrl = URL.createObjectURL(file);
  let media;
  const kind = sourceKind(file);
  if (kind === "video") {
    media = document.createElement("video");
    media.controls = true;
    media.muted = true;
    media.playsInline = true;
    media.preload = "metadata";
  } else if (kind === "audio") {
    media = document.createElement("audio");
    media.controls = true;
    media.preload = "metadata";
  } else if (kind === "image") {
    media = document.createElement("img");
    media.alt = `${file.name} 的本地预览`;
  }
  if (media) {
    media.src = sourcePreviewUrl;
    preview.append(media);
  } else {
    const placeholder = document.createElement("div");
    placeholder.innerHTML = `<b>${escapeHtml(file.name)}</b><span>已加入素材清单</span>`;
    preview.append(placeholder);
  }
}

function renderSourceFiles() {
  const list = byId("source-file-list");
  list.innerHTML = state.mediaAssets.length
    ? state.mediaAssets
        .map(
          (asset, index) => `<article><span><b>${escapeHtml(asset.name)}</b><small>${escapeHtml(asset.type || "未知格式")} · ${formatFileSize(asset.size)}</small></span><button type="button" data-remove-source="${index}" aria-label="移除素材 ${escapeHtml(asset.name)}">×</button></article>`,
        )
        .join("")
    : "<p>可先用文字定义任务，也可把真实素材一起装入剪辑单。</p>";
  list.querySelectorAll("[data-remove-source]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.removeSource);
      state.mediaAssets.splice(index, 1);
      selectedSourceFiles.splice(index, 1);
      renderSourceFiles();
      renderSourcePreview();
      persist();
      setProgressStatus(state.mediaAssets.length ? `${state.mediaAssets.length} 个素材待剪` : "新剪辑待定义");
    });
  });
  renderSourcePreview();
}

function acceptSourceFiles(files) {
  const accepted = [...files]
    .filter((file) => sourceKind(file))
    .slice(0, 8);
  selectedSourceFiles = accepted;
  state.mediaAssets = accepted.map(sourceMetadata);
  renderSourceFiles();
  persist();
  setProgressStatus(state.mediaAssets.length ? `${state.mediaAssets.length} 个素材待剪` : "新剪辑待定义");
  if (accepted.length) renderStoryChapter("conflict");
}

export function renderStoryChapter(stage, { scroll = false } = {}) {
  const chapterId = storyChapterForStage(stage);
  const chapter = STORY_CHAPTERS.find((item) => item.id === chapterId) ?? STORY_CHAPTERS[0];
  const scenes = STORY_SCENES.filter((scene) => scene.chapter === chapter.id);
  activeStoryChapter = chapter.id;
  byId("story-progress").innerHTML = STORY_CHAPTERS.map(
    (item) => `<button type="button" data-story-chapter="${item.id}" aria-current="${item.id === chapter.id ? "step" : "false"}"><span>${item.number}</span>${item.label}</button>`,
  ).join("");
  byId("story-progress").querySelectorAll("[data-story-chapter]").forEach((button) => {
    button.addEventListener("click", () => renderStoryChapter(button.dataset.storyChapter));
  });
  byId("story-frames").innerHTML = scenes
    .map(
      (scene, index) => `<figure class="story-frame ${index === 0 ? "is-lead" : ""}"><img src="${scene.src}" width="${scene.width}" height="${scene.height}" alt="${escapeHtml(scene.alt)}" loading="${index === 0 ? "eager" : "lazy"}" decoding="async" /><figcaption><span>${String(scene.flowPosition).padStart(2, "0")}</span><p>${escapeHtml(scene.storyPurpose)}</p></figcaption></figure>`,
    )
    .join("");
  byId("story-number").textContent = `${chapter.number} / 06`;
  byId("story-label").textContent = chapter.label;
  byId("story-chapter-title").textContent = chapter.title;
  byId("story-purpose").textContent = scenes.map((scene) => scene.storyPurpose).join(" ");
  byId("story-summary").textContent = `四个连续画面让“${chapter.label}”的关键判断保持可追溯，并把下一步操作接回同一条故事线。`;
  if (scroll) byId("story-stage").scrollIntoView({ behavior: "smooth", block: "start" });
}

function routeMarkup(plan, index) {
  const selected = state.selectedId === plan.id;
  const visual = ROUTE_VISUALS[plan.id] ?? ROUTE_VISUALS["hook-cut"];
  return `<button class="route-card" type="button" data-route="${escapeHtml(plan.id)}" aria-pressed="${selected}">
    <span class="route-top"><small>${String(index + 1).padStart(2, "0")} / ${escapeHtml(plan.badge)}</small><b>${plan.score}<i>/100</i></b></span>
    <span class="route-visual"><img src="${visual.src}" width="1200" height="800" loading="lazy" decoding="async" alt="${escapeHtml(visual.alt)}" /><small>${selected ? "已选择" : "路线画面"}</small></span>
    <h3>${escapeHtml(plan.title)}</h3>
    <p>${escapeHtml(plan.thesis)}</p>
    <span class="first-frame"><small>FIRST FRAME</small><p>${escapeHtml(plan.firstFrame)}</p></span>
    <span class="criteria" aria-label="路线三项标准"><span><b>留存</b><i style="--value:${plan.criteria.retention}%"></i><em>${plan.criteria.retention}</em></span><span><b>证据</b><i style="--value:${plan.criteria.evidence}%"></i><em>${plan.criteria.evidence}</em></span><span><b>连续</b><i style="--value:${plan.criteria.continuity}%"></i><em>${plan.criteria.continuity}</em></span></span>
    <span class="gain-loss"><span><b>获得</b><span>${escapeHtml(plan.gain)}</span></span><span><b>代价</b><span>${escapeHtml(plan.tradeoff)}</span></span></span>
    <span class="causal-explain"><small>为什么这样排</small><span>${escapeHtml(plan.resultPromise)}</span><span>${escapeHtml(plan.fitReasons.join("·"))}</span></span>
    <span class="check" aria-hidden="true">${selected ? "✓" : ""}</span>
  </button>`;
}

function renderRoutes({ scroll = false } = {}) {
  if (!state.mission || !state.plans.length) return;
  byId("routes").classList.remove("is-hidden");
  const conflict = buildEditingConflict(state.mission);
  const isNextRound = Boolean(state.decision?.nextRound);
  const sourceContext = state.mission.sourceAssets.length ? `，已装入 ${state.mission.sourceAssets.length} 个真实素材` : "";
  byId("route-context").textContent = isNextRound
    ? `复看证据已重排候选；${state.decision.nextRound.candidates[0].title}成为下一轮首选。`
    : `${state.mission.creator}正在剪一条 ${state.mission.seconds} 秒${state.mission.platform}内容${sourceContext}；推荐顺序优先守住“${state.mission.priority}”。`;
  byId("conflict-statement").textContent = conflict.statement;
  byId("conflict-tension").textContent = conflict.tension;
  byId("conflict-evidence").innerHTML = conflict.evidence.map((item, index) => `<span><b>0${index + 1}</b>${escapeHtml(item)}</span>`).join("");
  byId("route-grid").innerHTML = state.plans.map(routeMarkup).join("");
  byId("route-grid").querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.route;
      byId("accept-tradeoff").checked = false;
      persist();
      renderRoutes();
      renderStoryChapter("choice");
      setProgressStatus("待确认取舍");
      byId("accept-tradeoff").focus();
    });
  });
  const selected = state.plans.find((plan) => plan.id === state.selectedId);
  byId("selected-route").textContent = selected ? `${selected.title} · ${selected.score} 分` : "尚未选择";
  byId("accept-tradeoff").disabled = !selected;
  byId("confirm-route").disabled = !selected || !byId("accept-tradeoff").checked;
  byId("confirm-route").innerHTML = isNextRound
    ? `明确确认并生成第 ${state.decision.nextRound.round} 版 <span>→</span>`
    : "明确确认并生成第一版 <span>→</span>";
  if (scroll) byId("routes").scrollIntoView({ behavior: "smooth", block: "start" });
}

function clipMarkup(clip, total) {
  const width = (clip.duration / total) * 100;
  return `<button class="real-clip" type="button" data-clip="${escapeHtml(clip.id)}" aria-pressed="${state.activeClipId === clip.id}" style="flex: 0 1 ${width}%"><strong>${escapeHtml(clip.name)}</strong><small>${clip.start.toFixed(1)}–${clip.end.toFixed(1)}s</small></button>`;
}

function renderClipDetail() {
  const clip = state.decision?.timeline.find((item) => item.id === state.activeClipId);
  if (!clip) {
    byId("timeline-detail").innerHTML = "<p>选择一个片段，查看剪辑指令和素材锚点。</p>";
    return;
  }
  byId("timeline-detail").innerHTML = `<div class="clip-detail"><time>${clip.start.toFixed(1)}s → ${clip.end.toFixed(1)}s</time><div><small>剪辑与声音</small><p>${escapeHtml(clip.instruction)}<br />${escapeHtml(clip.audio)}</p></div><div><small>素材锚点</small><p>${escapeHtml(clip.materialAnchor)}</p></div></div>`;
}

function renderRevision() {
  const revisions = state.decision?.revisions ?? [];
  const latest = revisions.at(-1);
  const nextRound = state.decision?.nextRound;
  byId("revision-empty").classList.toggle("is-hidden", Boolean(latest));
  byId("revision-result").classList.toggle("is-hidden", !latest);
  if (latest) {
    const applied = state.decision?.appliedFeedback;
    byId("revision-version").textContent = applied
      ? `V${state.decision.version} / 已应用上一轮反馈`
      : `V${latest.version} / 评分 ${latest.score} / 5`;
    byId("revision-action").textContent = latest.action;
    byId("revision-evidence").textContent = `复看证据：${latest.evidence}`;
    byId("next-recommendation").textContent = nextRound
      ? `新推荐：${nextRound.candidates[0].title}`
      : `已应用：${state.decision.plan.title}`;
    byId("next-because").textContent = nextRound?.changedBecause ?? applied?.changedBecause ?? "上一轮观察已经进入当前版。";
    byId("next-experiment").textContent = nextRound?.firstExperiment ?? applied?.firstExperiment ?? state.decision.nextCheck;
    const candidates = nextRound?.candidates ?? state.decision.candidateComparison;
    byId("next-candidates").innerHTML = candidates
      .map((plan, index) => `<span><b>${index + 1}</b>${escapeHtml(plan.title)}<em>${plan.score}</em></span>`)
      .join("");
  }
  byId("revision-history").innerHTML = revisions.map((item) => `<span>V${item.version} · ${escapeHtml(item.outcome)}</span>`).join("");
}

function renderTimeline({ scroll = false } = {}) {
  const decision = state.decision;
  if (!decision) return;
  byId("timeline").classList.remove("is-hidden");
  byId("review").classList.remove("is-hidden");
  byId("decision-title").textContent = decision.plan.title;
  byId("decision-thesis").textContent = decision.plan.thesis;
  byId("decision-score").textContent = String(decision.plan.score);
  byId("decision-ratio").textContent = decision.exportSpec.aspectRatio;
  byId("decision-duration").textContent = String(decision.exportSpec.durationSeconds);
  byId("decision-gain").textContent = decision.plan.gain;
  byId("decision-tradeoff").textContent = decision.plan.tradeoff;
  byId("decision-check").textContent = decision.nextCheck;
  byId("timeline-version").textContent = `FIRST CUT / V${decision.version}`;

  const total = decision.exportSpec.durationSeconds;
  byId("timeline-ruler").innerHTML = Array.from({ length: 6 }, (_, index) => `<span>${Math.round((total * index) / 5)}s</span>`).join("");
  const clips = decision.timeline.map((clip) => clipMarkup(clip, total)).join("");
  byId("timeline-tracks").innerHTML = `<div class="real-track"><b>V1 / T1</b><div class="clip-row">${clips}</div></div><div class="real-track"><b>A1</b><div class="clip-row audio-row">${clips}</div></div>`;
  byId("timeline-tracks").querySelectorAll("[data-clip]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeClipId = button.dataset.clip;
      persist();
      renderTimeline();
      renderClipDetail();
    });
  });
  applyTimelineZoom();
  renderClipDetail();
  renderRevision();
  setProgressStatus(`第 ${decision.version} 版已成形`);
  if (scroll) byId("timeline").scrollIntoView({ behavior: "smooth", block: "start" });
}

function applyTimelineZoom() {
  const zoom = Math.max(100, Math.min(180, Number(state.zoom) || 100));
  state.zoom = zoom;
  byId("timeline-zoom-value").textContent = `${zoom}%`;
  byId("timeline-tracks").querySelectorAll(".real-track").forEach((track) => {
    track.style.width = `${zoom}%`;
  });
  byId("timeline-zoom-out").disabled = zoom === 100;
  byId("timeline-zoom-in").disabled = zoom === 180;
}

function restoreForm(mission) {
  if (!mission) return;
  for (const [name, value] of Object.entries(mission)) {
    if (missionForm.elements[name]) missionForm.elements[name].value = String(value);
  }
  syncMaterialCount();
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`${filename} 已生成并开始下载。`);
}

missionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.mission = readMission();
  state.mediaAssets = state.mission.sourceAssets;
  state.plans = generateEditPlans(state.mission);
  state.selectedId = null;
  state.decision = null;
  state.activeClipId = null;
  byId("accept-tradeoff").checked = false;
  byId("accept-tradeoff").disabled = true;
  byId("confirm-route").disabled = true;
  byId("timeline").classList.add("is-hidden");
  byId("review").classList.add("is-hidden");
  persist();
  renderStoryChapter("compare");
  renderRoutes({ scroll: true });
  setProgressStatus("3 路可比较");
});

sourceInput.addEventListener("change", () => acceptSourceFiles(sourceInput.files));

for (const eventName of ["dragenter", "dragover"]) {
  byId("source-drop").addEventListener(eventName, (event) => {
    event.preventDefault();
    byId("source-drop").classList.add("is-dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  byId("source-drop").addEventListener(eventName, (event) => {
    event.preventDefault();
    byId("source-drop").classList.remove("is-dragging");
    if (eventName === "drop" && event.dataTransfer?.files?.length) acceptSourceFiles(event.dataTransfer.files);
  });
}

materialField.addEventListener("input", () => {
  syncMaterialCount();
  if (activeStoryChapter === "intake") renderStoryChapter("conflict");
});

missionForm.addEventListener("change", () => {
  if (!state.plans.length) renderStoryChapter("conflict");
});

byId("accept-tradeoff").addEventListener("change", () => {
  byId("confirm-route").disabled = !state.selectedId || !byId("accept-tradeoff").checked;
});

byId("confirm-route").addEventListener("click", () => {
  if (!state.selectedId || !state.mission || !byId("accept-tradeoff").checked) return;
  state.decision = confirmEditDecision(state.mission, state.plans, state.selectedId, {
    acceptedTradeoff: true,
    previousDecision: state.decision?.nextRound ? state.decision : null,
    statement: state.decision?.nextRound
      ? `我接受这条路线主动放弃的部分，并确认生成第 ${state.decision.nextRound.round} 版。`
      : "我接受这条路线主动放弃的部分，并确认生成第一版。",
  });
  state.activeClipId = state.decision.timeline[0].id;
  persist();
  renderStoryChapter("confirm");
  renderTimeline({ scroll: true });
  toast("路线已确认，真实时间线已经铺开。");
});

byId("timeline-zoom-out").addEventListener("click", () => {
  state.zoom = Math.max(100, state.zoom - 20);
  persist();
  applyTimelineZoom();
});

byId("timeline-zoom-in").addEventListener("click", () => {
  state.zoom = Math.min(180, state.zoom + 20);
  persist();
  applyTimelineZoom();
});

byId("download-md").addEventListener("click", () => {
  if (!state.decision) return;
  download(`${state.decision.delivery.filenameStem}.md`, buildDownloads(state.decision).markdown, "text/markdown;charset=utf-8");
});
byId("download-json").addEventListener("click", () => {
  if (!state.decision) return;
  download(`${state.decision.delivery.filenameStem}.json`, buildDownloads(state.decision).json, "application/json;charset=utf-8");
});

reviewForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!state.decision) return;
  state.decision = applyReviewFeedback(state.decision, Object.fromEntries(new FormData(reviewForm).entries()));
  const revision = state.decision.revisions.at(-1);
  state.plans = state.decision.nextRound.candidates;
  state.selectedId = null;
  byId("accept-tradeoff").checked = false;
  byId("accept-tradeoff").disabled = true;
  byId("confirm-route").disabled = true;
  reviewForm.elements.note.value = "";
  persist();
  renderStoryChapter("feedback");
  renderRoutes();
  renderRevision();
  setProgressStatus("下一刀已更新");
  byId("revision-result").scrollIntoView({ behavior: "smooth", block: "nearest" });
  toast(`V${revision.version} 修订动作已写回剪辑单。`);
});

try {
  const restored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  if (restored?.mission) {
    state = {
      mission: normalizeEditMission(restored.mission),
      plans: Array.isArray(restored.plans) ? restored.plans : [],
      selectedId: restored.selectedId || null,
      decision: restored.decision || null,
      activeClipId: restored.activeClipId || null,
      zoom: Number(restored.zoom) || 100,
      mediaAssets: Array.isArray(restored.mediaAssets)
        ? restored.mediaAssets
        : normalizeEditMission(restored.mission).sourceAssets,
    };
    restoreForm(state.mission);
    renderRoutes();
    renderTimeline();
  }
} catch {
  localStorage.removeItem(STORAGE_KEY);
}

syncMaterialCount();
renderSourceFiles();
renderStoryChapter(state.decision?.revisions?.length ? "feedback" : state.decision ? "confirm" : state.plans.length ? "compare" : "intake");
setProgressStatus(
  state.decision?.nextRound
    ? "下一刀已更新"
    : state.decision
      ? `第 ${state.decision.version} 版已成形`
      : state.plans.length
        ? "3 路可比较"
        : state.mediaAssets.length
          ? `${state.mediaAssets.length} 个素材待剪`
          : "新剪辑待定义",
);
