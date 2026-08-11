import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { createContext, SourceTextModule } from "node:vm";

const outputDir = resolve("public-mirror");
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  const relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
  const filePath = resolve(outputDir, relativePath);
  if (filePath !== outputDir && !filePath.startsWith(`${outputDir}${sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    response.writeHead(200, { "Content-Type": mime[extname(filePath)] ?? "application/octet-stream" });
    response.end(await readFile(filePath));
  } catch {
    response.writeHead(404).end("Not found");
  }
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const address = server.address();
assert(address && typeof address === "object");
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const [htmlResponse, appResponse, engineResponse, storyModuleResponse, visualStoryResponse, storyFrameResponse, visualStoryFrameResponse] = await Promise.all([
    fetch(`${baseUrl}/index.html`),
    fetch(`${baseUrl}/app.js`),
    fetch(`${baseUrl}/experience.js`),
    fetch(`${baseUrl}/story-scenes.js`),
    fetch(`${baseUrl}/visual-story-v3.js`),
    fetch(`${baseUrl}/assets/story/flowcut-story-24.webp`),
    fetch(`${baseUrl}/assets/story-v3/flowcut-v3-50-revise.webp`),
  ]);
  assert.match(htmlResponse.headers.get("content-type") ?? "", /^text\/html/);
  assert.match(appResponse.headers.get("content-type") ?? "", /^text\/javascript/);
  assert.match(engineResponse.headers.get("content-type") ?? "", /^text\/javascript/);
  assert.match(storyModuleResponse.headers.get("content-type") ?? "", /^text\/javascript/);
  assert.match(visualStoryResponse.headers.get("content-type") ?? "", /^text\/javascript/);
  assert.match(storyFrameResponse.headers.get("content-type") ?? "", /^image\/webp/);
  assert.match(visualStoryFrameResponse.headers.get("content-type") ?? "", /^image\/webp/);

  const [html, appSource, engineSource, storySource, visualStorySource] = await Promise.all([
    htmlResponse.text(),
    appResponse.text(),
    engineResponse.text(),
    storyModuleResponse.text(),
    visualStoryResponse.text(),
  ]);
  assert.match(html, /type="module" src="\.\/app\.js\?v=\d+[a-z]?"/);

  const context = createContext({ console });
  const engineModule = new SourceTextModule(engineSource, { context, identifier: `${baseUrl}/experience.js` });
  const storyModule = new SourceTextModule(storySource, { context, identifier: `${baseUrl}/story-scenes.js` });
  const visualStoryModule = new SourceTextModule(visualStorySource, { context, identifier: `${baseUrl}/visual-story-v3.js` });
  const appModule = new SourceTextModule(appSource, { context, identifier: `${baseUrl}/app.js` });
  await appModule.link(async (specifier) => {
    if (specifier === "./experience.js") return engineModule;
    if (specifier === "./story-scenes.js") return storyModule;
    if (specifier === "./visual-story-v3.js") return visualStoryModule;
    assert.fail(`Unexpected application module: ${specifier}`);
  });
  await engineModule.evaluate();
  await storyModule.evaluate();
  await visualStoryModule.evaluate();
  assert.equal(storyModule.namespace.STORY_SCENES.length, 24);
  assert.equal(visualStoryModule.namespace.VISUAL_STORIES_V3.length, 50);
  assert.equal(visualStoryModule.namespace.VISUAL_STORIES_V3.filter((scene) => scene.coreReachable).length, 20);

  const mission = engineModule.namespace.normalizeEditMission({
    creator: "周屿",
    priority: "转化证据",
    audience: "准备购买",
    seconds: 30,
    material: "开场摆出失败样品。中段展示三次调整。结尾顾客完成盲测。",
  });
  const plans = engineModule.namespace.generateEditPlans(mission);
  assert.equal(plans.length, 3);
  const decision = engineModule.namespace.buildEditDecision(mission, plans[0]);
  assert.equal(decision.timeline[0].start, 0);
  assert.equal(decision.timeline.at(-1).end, 30);
  decision.revisions.push(engineModule.namespace.createEditRevision(decision, {
    score: 2,
    outcome: "证据不够可信",
    note: "测试者没有看到主张对应的动作。",
  }));
  const reviewedMarkdown = engineModule.namespace.buildDownloads(decision).markdown;
  assert.match(reviewedMarkdown, /^# .*第 1 版/m);
  assert.match(reviewedMarkdown, /下一版提案 V2/);

  console.log("HTTP product smoke passed: module graph, 24 chapter frames, 50 field scenes, candidate pipeline, timeline and review backflow.");
} finally {
  await new Promise((resolveClose, rejectClose) => server.close((error) => (error ? rejectClose(error) : resolveClose())));
}
