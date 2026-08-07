import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

import {
  applyReviewFeedback,
  buildDownloads,
  confirmEditDecision,
  generateEditPlans,
  normalizeEditMission,
} from "./experience.js";

const MATERIAL = "开场主理人把失败样品放到桌上。中段展示三次调整配方的过程。结尾顾客盲测说终于喝到了想要的酸度。";

function mission(overrides = {}) {
  return normalizeEditMission({
    creator: "林澄",
    role: "剪辑师",
    audience: "第一次刷到",
    platform: "抖音",
    priority: "前3秒留存",
    seconds: 30,
    deadline: "今天 20:00",
    material: MATERIAL,
    ...overrides,
  });
}

describe("FlowCut product v2 causal journey", () => {
  test("all personal constraints are visible causes in exactly three comparable routes", () => {
    const editorPlans = generateEditPlans(mission({ role: "剪辑师" }));
    const operatorPlans = generateEditPlans(mission({ role: "内容运营" }));

    assert.equal(editorPlans.length, 3);
    assert.deepEqual(new Set(editorPlans.map((plan) => plan.id)).size, 3);
    for (const plan of editorPlans) {
      assert.deepEqual(Object.keys(plan.criteria).sort(), ["continuity", "evidence", "retention"]);
      assert.equal(plan.fitReasons.length, 6);
      assert.match(plan.constraintTrace, /剪辑师.*第一次刷到.*抖音.*30 秒.*前3秒留存.*今天 20:00/);
      assert.ok(plan.gain.length > 10);
      assert.ok(plan.tradeoff.length > 10);
    }

    assert.notDeepEqual(
      editorPlans.map((plan) => plan.score),
      operatorPlans.map((plan) => plan.score),
      "changing the creator role must change the recommendation scores",
    );
    assert.notEqual(editorPlans[0].resultPromise, operatorPlans[0].resultPromise);
  });

  test("a route cannot be confirmed until its trade-off is explicitly accepted", () => {
    const currentMission = mission();
    const plans = generateEditPlans(currentMission);

    assert.throws(
      () => confirmEditDecision(currentMission, plans, plans[0].id, { acceptedTradeoff: false }),
      /accept the selected trade-off/i,
    );

    const decision = confirmEditDecision(currentMission, plans, plans[0].id, {
      acceptedTradeoff: true,
      statement: "我接受这条路线主动放弃的部分，并确认生成第一版。",
    });
    assert.equal(decision.confirmation.acceptedTradeoff, true);
    assert.equal(decision.candidateComparison.length, 3);
    assert.equal(decision.timeline[0].start, 0);
    assert.equal(decision.timeline.at(-1).end, currentMission.seconds);
    assert.equal(decision.delivery.status, "ready");

    const downloads = buildDownloads(decision);
    assert.match(downloads.markdown, /三条候选对照/);
    assert.match(downloads.markdown, /明确确认/);
    assert.equal(JSON.parse(downloads.json).delivery.status, "ready");
  });

  test("structured evidence changes the next recommendation and the next edit experiment", () => {
    const currentMission = mission();
    const plans = generateEditPlans(currentMission);
    const decision = confirmEditDecision(currentMission, plans, "hook-cut", { acceptedTradeoff: true });
    const revised = applyReviewFeedback(decision, {
      score: 2,
      outcome: "证据不够可信",
      confidence: "明确看到",
      note: "测试者听到了结论，却没有看到主张对应的动作。",
    });

    assert.equal(revised.revisions.length, 1);
    assert.equal(revised.nextRound.recommendedPlanId, "proof-chain");
    assert.equal(revised.nextRound.candidates[0].id, "proof-chain");
    assert.notEqual(revised.nextRound.recommendedPlanId, decision.plan.id);
    assert.match(revised.nextRound.firstExperiment, /主张.*动作/);
    assert.match(revised.nextRound.changedBecause, /证据不够可信/);
    assert.match(buildDownloads(revised).markdown, /下一轮已改变/);
  });

  test("feedback wins the next-round recommendation even when the old route had a large score lead", () => {
    const currentMission = mission({ role: "内容运营", audience: "准备购买", platform: "B站", seconds: 60, priority: "转化证据", deadline: "明天 10:00" });
    const plans = generateEditPlans(currentMission);
    assert.equal(plans[0].id, "proof-chain");
    const decision = confirmEditDecision(currentMission, plans, "proof-chain", { acceptedTradeoff: true });
    const revised = applyReviewFeedback(decision, {
      score: 2,
      outcome: "开场不够抓人",
      confidence: "明确看到",
      note: "测试者在第 3 秒仍无法复述冲突。",
    });
    assert.equal(revised.nextRound.recommendedPlanId, "hook-cut");
    assert.equal(revised.nextRound.candidates[0].id, "hook-cut");
    assert.notEqual(revised.nextRound.recommendedPlanId, decision.plan.id);
  });
});

describe("FlowCut owned brand contract", () => {
  test("the public shell uses the owned mark and outcome-first language", async () => {
    const [html, mark, system] = await Promise.all([
      readFile(new URL("./index.html", import.meta.url), "utf8"),
      readFile(new URL("./assets/brand/flowcut-mark.svg", import.meta.url), "utf8"),
      readFile(new URL("./assets/brand/BRAND_SYSTEM.md", import.meta.url), "utf8"),
    ]);

    assert.match(html, /\.\/assets\/brand\/flowcut-mark\.svg/);
    assert.match(html, /id="accept-tradeoff"/);
    assert.match(html, /id="confirm-route"[^>]*disabled/);
    const visibleCopy = html.replace(/<[^>]+>/g, " ");
    assert.doesNotMatch(visibleCopy, /NEW CUT|DEMO|比赛|兼容模式|示意/i);
    assert.match(mark, /<title[^>]*>FlowCut evidence loop mark<\/title>/);
    assert.match(mark, /aria-labelledby="flowcut-mark-title(?:\s+flowcut-mark-desc)?"/);
    assert.match(system, /cut point.*evidence loop/i);
  });

  test("the interface exposes causal scoring and a visibly changed next round", async () => {
    const [html, app, css] = await Promise.all([
      readFile(new URL("./index.html", import.meta.url), "utf8"),
      readFile(new URL("./app.js", import.meta.url), "utf8"),
      readFile(new URL("./styles.css", import.meta.url), "utf8"),
    ]);
    assert.match(html, /id="conflict-statement"/);
    assert.match(html, /name="confidence"/);
    assert.match(html, /id="next-recommendation"/);
    assert.match(app, /plan\.criteria\.retention/);
    assert.match(app, /plan\.fitReasons/);
    assert.match(app, /decision\.nextRound/);
    assert.match(app, /next-candidates/);
    assert.match(css, /\.route-grid[^}]*grid-auto-rows:\s*1fr/s);
    assert.match(css, /\.route-card[^}]*height:\s*100%/s);
  });
});
