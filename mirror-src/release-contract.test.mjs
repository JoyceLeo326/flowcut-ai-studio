import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

describe("FlowCut mainland-first static release", () => {
  test("the runtime starts at the task and blocks outbound connections", async () => {
    const [html, css, app, vercelText] = await Promise.all([
      readFile("mirror-src/index.html", "utf8"),
      readFile("mirror-src/styles.css", "utf8"),
      readFile("mirror-src/app.js", "utf8"),
      readFile("vercel.json", "utf8"),
    ]);
    const vercel = JSON.parse(vercelText);

    assert.match(html, /直接定义任务/);
    assert.doesNotMatch(`${html}\n${css}\n${app}`, /https?:\/\//i);
    assert.doesNotMatch(`${html}\n${css}\n${app}`, /google|gstatic|cdn|analytics/i);
    assert.match(html, /http-equiv="Content-Security-Policy"[^>]*connect-src 'none'/);
    assert.match(html, /http-equiv="Content-Security-Policy"[^>]*object-src 'none'/);
    assert.equal(vercel.outputDirectory, "public-mirror");
    assert.equal(vercel.buildCommand, "node scripts/build-public-mirror.mjs");
    assert.equal(vercel.framework, null);
    const headers = vercel.headers.flatMap((entry) => entry.headers).map((header) => `${header.key}: ${header.value}`).join("\n");
    assert.match(headers, /Content-Security-Policy:.*connect-src 'none'/);
    assert.match(headers, /media-src 'self' blob:/);
    assert.match(headers, /frame-ancestors 'none'/);
    assert.match(headers, /Permissions-Policy:/);
  });

  test("320, 390, and 430 layouts declare safe-area and keyboard-safe behavior", async () => {
    const [html, css] = await Promise.all([
      readFile("mirror-src/index.html", "utf8"),
      readFile("mirror-src/styles.css", "utf8"),
    ]);
    assert.match(html, /viewport-fit=cover/);
    assert.match(css, /overflow-x:\s*clip/);
    assert.match(css, /env\(safe-area-inset-top\)/);
    assert.match(css, /env\(safe-area-inset-bottom\)/);
    assert.match(css, /100dvh|100svh/);
    assert.match(css, /@media \(max-width: 430px\)/);
    assert.match(css, /@media \(max-width: 390px\)/);
    assert.match(css, /@media \(max-width: 320px\)/);
    assert.match(css, /input, select, textarea[^}]*font-size:\s*16px/s);
    assert.match(css, /min-height:\s*44px/);
  });

  test("a single Node command covers product tests, build, smoke, and secret scan", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8"));
    assert.equal(
      pkg.scripts["quality:mirror"],
      "node --test mirror-src/*.test.mjs && node --check mirror-src/app.js && node --check mirror-src/experience.js && node --check mirror-src/story-scenes.js && node scripts/build-public-mirror.mjs && node --experimental-vm-modules scripts/http-mirror-smoke.mjs && node scripts/secret-guard.mjs public-mirror",
    );
  });
});
