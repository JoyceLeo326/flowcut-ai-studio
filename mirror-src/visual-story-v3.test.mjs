import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("keeps the reviewed scene archive outside the primary runtime and release", async () => {
  const [html, app, build] = await Promise.all([
    readFile("mirror-src/index.html", "utf8"),
    readFile("mirror-src/app.js", "utf8"),
    readFile("scripts/build-public-mirror.mjs", "utf8"),
  ]);
  assert.doesNotMatch(html, /field-story-v3|50 REAL EDITING MOMENTS/);
  assert.doesNotMatch(app, /renderFieldStoryV3|VISUAL_STORIES_V3/);
  assert.doesNotMatch(build, /visual-story-v3|story-v3/);
});
