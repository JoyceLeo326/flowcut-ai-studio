import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("the public journey keeps mobile access to every primary stage", async () => {
  const [html, css] = await Promise.all([
    readFile("mirror-src/index.html", "utf8"),
    readFile("mirror-src/styles.css", "utf8"),
  ]);
  const navigation = html.match(/<nav aria-label="页面导航">[\s\S]*?<\/nav>/)?.[0] ?? "";

  for (const stage of ["#mission", "#routes", "#timeline", "#review"]) assert.match(navigation, new RegExp(`href="${stage}"`));
  assert.doesNotMatch(css, /@media \(max-width: 1000px\)[^{]*\{[^}]*\.topbar nav \{ display: none; \}/s);
  assert.match(css, /@media \(max-width: 1000px\)[\s\S]*\.topbar nav[^}]*overflow-x:\s*auto/);
});

test("the primary runtime and release are not gated by an image count", async () => {
  const [html, app, build, workflow, pkg] = await Promise.all([
    readFile("mirror-src/index.html", "utf8"),
    readFile("mirror-src/app.js", "utf8"),
    readFile("scripts/build-public-mirror.mjs", "utf8"),
    readFile(".github/workflows/bun-ci.yml", "utf8"),
    readFile("package.json", "utf8"),
  ]);

  assert.doesNotMatch(html, /field-story-v3|50 REAL EDITING MOMENTS|完整 50/);
  assert.doesNotMatch(app, /VISUAL_STORIES_V3|renderFieldStoryV3|setFieldStoryPhase/);
  assert.doesNotMatch(build, /visual-story-v3|story-v3|Expected 50/);
  assert.doesNotMatch(workflow, /validate-image-delta|fifty newly added/i);
  assert.doesNotMatch(JSON.parse(pkg).scripts["quality:mirror"], /visual-story-v3|validate-visual-story/);
});
