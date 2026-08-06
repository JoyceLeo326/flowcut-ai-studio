import {
  applyReviewFeedback,
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

let state = { mission: null, plans: [], selectedId: null, decision: null, activeClipId: null, zoom: 100 };
let activeStoryChapter = "intake";

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
  return normalizeEditMission(Object.fromEntries(new FormData(missionForm).entries()));
}

function syncMaterialCount() {
  byId("material-count").textContent = String(materialField.value.length);
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
  byId("story-summary").textContent = `${chapter.label}不是装饰画面：这四帧对应当前任务状态，并为下一步操作保留因果依据。`;
  if (scroll) byId("story-stage").scrollIntoView({ behavior: "smooth", block: "start" });
}

function routeMarkup(plan, index) {
  const selected = state.selectedId === plan.id;
  return `<button class="route-card" type="button" data-route="${escapeHtml(plan.id)}" aria-pressed="${selected}">
    <span class="route-top"><small>${String(index + 1).padStart(2, "0")} / ${escapeHtml(plan.badge)}</small><b>${plan.score}<i>/100</i></b></span>
    <h3>${escapeHtml(plan.title)}</h3>
    <p>${escapeHtml(plan.thesis)}</p>
    <span class="first-frame"><small>FIRST FRAME</small><p>${escapeHtml(plan.firstFrame)}</p></span>
    <span class="gain-loss"><span><b>获得</b><span>${escapeHtml(plan.gain)}</span></span><span><b>代价</b><span>${escapeHtml(plan.tradeoff)}</span></span></span>
    <span class="check" aria-hidden="true">${selected ? "✓" : ""}</span>
  </button>`;
}

function renderRoutes({ scroll = false } = {}) {
  if (!state.mission || !state.plans.length) return;
  byId("routes").classList.remove("is-hidden");
  byId("route-context").textContent = `${state.mission.creator}正在剪一条 ${state.mission.seconds} 秒${state.mission.platform}内容；推荐顺序优先守住“${state.mission.priority}”。`;
  byId("route-grid").innerHTML = state.plans.map(routeMarkup).join("");
  byId("route-grid").querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.route;
      byId("accept-tradeoff").checked = false;
      persist();
      renderRoutes();
      renderStoryChapter("choice");
      byId("accept-tradeoff").focus();
    });
  });
  const selected = state.plans.find((plan) => plan.id === state.selectedId);
  byId("selected-route").textContent = selected ? `${selected.title} · ${selected.score} 分` : "尚未选择";
  byId("accept-tradeoff").disabled = !selected;
  byId("confirm-route").disabled = !selected || !byId("accept-tradeoff").checked;
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
  byId("revision-empty").classList.toggle("is-hidden", Boolean(latest));
  byId("revision-result").classList.toggle("is-hidden", !latest);
  if (latest) {
    byId("revision-version").textContent = `V${latest.version} / 评分 ${latest.score} / 5`;
    byId("revision-action").textContent = latest.action;
    byId("revision-evidence").textContent = `复看证据：${latest.evidence}`;
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
});

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
    statement: "我接受这条路线主动放弃的部分，并确认生成第一版。",
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
  download(`flowcut-${state.decision.plan.id}.md`, buildDownloads(state.decision).markdown, "text/markdown;charset=utf-8");
});
byId("download-json").addEventListener("click", () => {
  if (!state.decision) return;
  download(`flowcut-${state.decision.plan.id}.json`, buildDownloads(state.decision).json, "application/json;charset=utf-8");
});

reviewForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!state.decision) return;
  state.decision = applyReviewFeedback(state.decision, Object.fromEntries(new FormData(reviewForm).entries()));
  const revision = state.decision.revisions.at(-1);
  reviewForm.elements.note.value = "";
  persist();
  renderStoryChapter("feedback");
  renderRevision();
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
    };
    restoreForm(state.mission);
    renderRoutes();
    renderTimeline();
  }
} catch {
  localStorage.removeItem(STORAGE_KEY);
}

syncMaterialCount();
renderStoryChapter(state.decision?.revisions?.length ? "feedback" : state.decision ? "confirm" : state.plans.length ? "compare" : "intake");
