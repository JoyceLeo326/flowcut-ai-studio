import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { describe, test } from "node:test";

import { STORY_CHAPTERS, STORY_SCENES } from "./story-scenes.js";

describe("FlowCut 24-frame causal story", () => {
  test("24 independently generated frames form six continuous product chapters", () => {
    assert.equal(STORY_SCENES.length, 24);
    assert.equal(STORY_CHAPTERS.length, 6);
    assert.deepEqual(STORY_SCENES.map((scene) => scene.id), Array.from({ length: 24 }, (_, index) => `frame-${String(index + 1).padStart(2, "0")}`));
    assert.equal(new Set(STORY_SCENES.map((scene) => scene.generationCallId)).size, 24);
    assert.deepEqual(
      STORY_CHAPTERS.map((chapter) => STORY_SCENES.filter((scene) => scene.chapter === chapter.id).length),
      [4, 4, 4, 4, 4, 4],
    );
    assert.ok(STORY_SCENES.every((scene) => scene.alt.length >= 18 && scene.storyPurpose.length >= 12));
    assert.ok(STORY_SCENES.every((scene) => /Lin Cheng|A-Ye/.test(scene.continuityAnchor)));
  });

  test("every story frame is a local WebP with recorded built-in ImageGen provenance", async () => {
    for (const scene of STORY_SCENES) {
      const url = new URL(scene.src.replace(/^\.\//, "./"), import.meta.url);
      const [content, info] = await Promise.all([readFile(url), stat(url)]);
      assert.equal(content.subarray(0, 4).toString("ascii"), "RIFF", scene.id);
      assert.equal(content.subarray(8, 12).toString("ascii"), "WEBP", scene.id);
      assert.ok(info.size > 30_000, `${scene.id} should be a substantive generated frame`);
      assert.equal(scene.generator, "OpenAI built-in ImageGen");
      assert.match(scene.sourceFile, /exec-[a-f0-9-]+\.png$/);
    }
  });

  test("the product shell mounts the active story chapter rather than a gallery", async () => {
    const [html, app, provenance] = await Promise.all([
      readFile(new URL("./index.html", import.meta.url), "utf8"),
      readFile(new URL("./app.js", import.meta.url), "utf8"),
      readFile(new URL("./assets/story/GENERATION_MANIFEST.md", import.meta.url), "utf8"),
    ]);
    assert.match(html, /id="story-stage"/);
    assert.match(html, /id="story-frames"/);
    assert.match(app, /from "\.\/story-scenes\.js"/);
    assert.match(app, /renderStoryChapter/);
    assert.doesNotMatch(html, /gallery|图库/i);
    assert.match(provenance, /24 independent built-in ImageGen calls/i);
  });
});
