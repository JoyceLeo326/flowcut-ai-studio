import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("Vercel deploys the complete Next.js editor", async () => {
  const config = JSON.parse(await readFile("vercel.json", "utf8"));

  assert.equal(config.framework, "nextjs");
  assert.equal(config.installCommand, "bun install --frozen-lockfile");
  assert.equal(config.buildCommand, "bun run build:web");
  assert.equal(config.outputDirectory, "apps/web/.next");
  assert.equal(config.headers, undefined);
  assert.notEqual(config.outputDirectory, "public-mirror");
});
