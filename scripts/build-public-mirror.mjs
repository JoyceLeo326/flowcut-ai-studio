import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

const root = process.cwd();
const sourceDir = resolve(root, "mirror-src");
const outputDir = resolve(root, "public-mirror");
const publicPath = "/liujiarui-product-lab/mirrors/flowcut-ai-studio/";
const runtimeFiles = ["index.html", "styles.css", "app.js", "experience.js"];

if (dirname(outputDir) !== root || basename(outputDir) !== "public-mirror") {
  throw new Error("Refusing to replace an unexpected public mirror directory.");
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
for (const file of runtimeFiles) await copyFile(resolve(sourceDir, file), resolve(outputDir, file));

const files = [];
for (const file of runtimeFiles) {
  const pathname = resolve(outputDir, file);
  const [content, info] = await Promise.all([readFile(pathname), stat(pathname)]);
  files.push({ path: file, bytes: info.size, sha256: createHash("sha256").update(content).digest("hex") });
}

const manifest = {
  schemaVersion: 1,
  kind: "interactive-static-compatibility-mode",
  entry: "index.html",
  assetBase: "./",
  publicPath,
  capabilities: [
    "personalized edit mission",
    "three material-grounded plans with trade-offs",
    "confirmed contiguous timeline",
    "Markdown edit sheet and JSON timeline downloads",
    "local review backflow",
  ],
  excludes: ["environment files", "server routes", "AI provider credentials", "private user media"],
  files,
};

await writeFile(resolve(outputDir, "mirror-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`FlowCut public mirror built with ${files.length} verified runtime files.`);
