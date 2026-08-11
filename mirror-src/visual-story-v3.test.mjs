import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { describe, test } from "node:test";

const manifestPath = "mirror-src/assets/story-v3/manifest.json";

function webpDimensions(bytes) {
  assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP");
  assert.equal(bytes.subarray(12, 16).toString("ascii"), "VP8 ");
  assert.equal(bytes.subarray(23, 26).toString("hex"), "9d012a");
  return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
}

describe("FlowCut visual story v3", () => {
  test("ships fifty unique generated scenes with a complete runtime manifest", async () => {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(manifest.project, "flowcut-ai-studio");
    assert.equal(manifest.version, 3);
    assert.equal(manifest.assets.length, 50);
    assert.equal(new Set(manifest.assets.map((asset) => asset.id)).size, 50);
    assert.equal(new Set(manifest.assets.map((asset) => asset.file)).size, 50);
    assert.equal(new Set(manifest.assets.map((asset) => asset.prompt)).size, 50);
    const runtime = await readFile("mirror-src/visual-story-v3.js", "utf8");
    for (const asset of manifest.assets) {
      assert.match(runtime, new RegExp(asset.file.split("/").at(-1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.deepEqual(asset.usedIn, ["mirror-src/visual-story-v3.js"]);
      const bytes = await readFile(asset.file);
      assert.deepEqual(webpDimensions(bytes), { width: 768, height: 512 });
      assert.ok((await stat(asset.file)).size > 20_000);
    }
    const validation = spawnSync(process.execPath, ["qa/validate-visual-story.mjs", "--root", ".", "--manifest", manifestPath], { encoding: "utf8" });
    assert.equal(validation.status, 0, validation.stderr || validation.stdout);
    assert.deepEqual(JSON.parse(validation.stdout), { project: "flowcut-ai-studio", assetCount: 50, uniqueHashes: 50, runtimeReachable: 50 });
  });

  test("mounts twenty scenes in the core editing journey and all fifty by phase", async () => {
    const [html, css, app, runtime, build] = await Promise.all([
      readFile("mirror-src/index.html", "utf8"), readFile("mirror-src/styles.css", "utf8"), readFile("mirror-src/app.js", "utf8"),
      readFile("mirror-src/visual-story-v3.js", "utf8"), readFile("scripts/build-public-mirror.mjs", "utf8"),
    ]);
    for (const marker of ["field-story-v3", "field-story-v3-filters", "field-story-v3-grid", "field-story-v3-more"]) assert.match(html, new RegExp(marker));
    assert.match(app, /renderFieldStoryV3/);
    assert.match(app, /VISUAL_STORIES_V3/);
    assert.ok((runtime.match(/coreReachable:\s*true/g) ?? []).length >= 20);
    assert.match(app, /loading="lazy"/);
    assert.match(app, /width="768" height="512"/);
    assert.match(css, /\.field-story-v3-control[^{]*\{[^}]*min-height:\s*44px/s);
    assert.match(css, /@media \(max-width: 390px\)[\s\S]*\.field-story-v3-grid/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(build, /visual-story-v3\.js/);
  });
});
