import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("public mirror uses relative JavaScript resources and has a build contract", async () => {
  const [html, css, app, packageText, buildScript] = await Promise.all([
    readFile("mirror-src/index.html", "utf8"),
    readFile("mirror-src/styles.css", "utf8"),
    readFile("mirror-src/app.js", "utf8"),
    readFile("package.json", "utf8"),
    readFile("scripts/build-public-mirror.mjs", "utf8"),
  ]);

  assert.match(html, /href="\.\/styles\.css"/);
  assert.match(html, /type="module" src="\.\/app\.js"/);
  assert.doesNotMatch(html, /class="transport"><button/);
  assert.match(html, /id="timeline-zoom-out"/);
  assert.match(app, /timeline-zoom-out.*addEventListener/s);
  assert.match(css, /\.score-inputs label \{ position: relative;/);
  assert.match(css, /\.score-inputs input \{[\s\S]*?width: 1px;[\s\S]*?clip-path: inset\(50%\);/);
  assert.match(css, /footer > a \{ min-height: 44px; \}/);
  assert.doesNotMatch(`${html}\n${css}\n${app}`, /https?:\/\//);
  assert.ok(JSON.parse(packageText).scripts["build:public-mirror"]);
  assert.match(buildScript, /storyFrames\.length !== 24/);
  assert.match(buildScript, /await cp\(resolve\(sourceDir, "assets"\)/);
});
