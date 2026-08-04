import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildDownloads,
  buildEditDecision,
  createEditRevision,
  generateEditPlans,
  normalizeEditMission,
} from "./experience.js";

const material =
  "开场是主理人把失败样品放到桌上。中段展示三次调整配方的过程。最后顾客盲测说终于喝到了想要的酸度。";

describe("FlowCut static edit engine", () => {
  test("personal constraints reorder three material-grounded plans", () => {
    const retention = generateEditPlans(normalizeEditMission({ priority: "前3秒留存", platform: "抖音", seconds: 30, material }));
    const story = generateEditPlans(normalizeEditMission({ priority: "叙事完整", platform: "B站", seconds: 60, material }));

    assert.equal(retention.length, 3);
    assert.equal(new Set(retention.map((plan) => plan.id)).size, 3);
    assert.equal(retention.every((plan) => plan.tradeoff && plan.materialAnchors.length >= 2), true);
    assert.notEqual(retention[0].id, story[0].id);
  });

  test("confirmed timeline is contiguous and covers the requested duration", () => {
    const mission = normalizeEditMission({ creator: "周屿", seconds: 30, material });
    const decision = buildEditDecision(mission, generateEditPlans(mission)[0]);

    assert.equal(decision.timeline[0].start, 0);
    assert.equal(decision.timeline.at(-1).end, 30);
    assert.equal(decision.timeline.every((clip, index) => index === 0 || clip.start === decision.timeline[index - 1].end), true);
    assert.equal(decision.timeline.every((clip) => clip.materialAnchor), true);
  });

  test("exports real Markdown/JSON and feeds review evidence into revision", () => {
    const mission = normalizeEditMission({ creator: "周屿", role: "剪辑师", seconds: 30, material });
    const decision = buildEditDecision(mission, generateEditPlans(mission)[0]);
    const revision = createEditRevision(decision, { score: 2, outcome: "开场不够抓人", note: "测试者在第 2 秒仍不知道冲突是什么" });
    decision.revisions.push(revision);
    const downloads = buildDownloads(decision);

    assert.match(downloads.markdown, new RegExp(decision.plan.title));
    assert.match(downloads.markdown, /第 2 版/);
    assert.equal(JSON.parse(downloads.json).timeline.length, decision.timeline.length);
    assert.match(revision.action, /开场/);
  });
});
