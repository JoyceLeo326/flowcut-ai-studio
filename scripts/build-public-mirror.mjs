import { createHash } from "node:crypto";
import { copyFile, cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";

const root = process.cwd();
const sourceDir = resolve(root, "mirror-src");
const outputDir = resolve(root, "public-mirror");
const runtimeFiles = ["index.html", "styles.css", "app.js", "experience.js", "story-scenes.js", "visual-story-v3.js"];

if (dirname(outputDir) !== root || basename(outputDir) !== "public-mirror") {
  throw new Error("Refusing to replace an unexpected public mirror directory.");
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const pathname = resolve(directory, entry.name);
      return entry.isDirectory() ? listFiles(pathname) : [pathname];
    }),
  );
  return nested.flat();
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
for (const file of runtimeFiles) await copyFile(resolve(sourceDir, file), resolve(outputDir, file));
await cp(resolve(sourceDir, "assets"), resolve(outputDir, "assets"), { recursive: true, force: true });

const files = [];
for (const pathname of (await listFiles(outputDir)).sort()) {
  const [content, info] = await Promise.all([readFile(pathname), stat(pathname)]);
  files.push({
    path: relative(outputDir, pathname).replaceAll("\\", "/"),
    bytes: info.size,
    sha256: createHash("sha256").update(content).digest("hex"),
  });
}

const storyFrames = files.filter((file) => /^assets\/story\/flowcut-story-\d{2}\.webp$/.test(file.path));
if (storyFrames.length !== 24) throw new Error(`Expected 24 story frames, found ${storyFrames.length}.`);
const visualStoryV3Frames = files.filter((file) => /^assets\/story-v3\/flowcut-v3-\d{2}-(?:intake|compare|confirm|deliver|revise)\.webp$/.test(file.path));
if (visualStoryV3Frames.length !== 50) throw new Error(`Expected 50 visual story v3 frames, found ${visualStoryV3Frames.length}.`);

const manifest = {
  schemaVersion: 2,
  kind: "self-contained-evidence-led-editor",
  entry: "index.html",
  assetBase: "./",
  capabilities: [
    "causal creator constraints and material conflict",
    "three equal candidates with explicit benefits and trade-offs",
    "human selection with explicit trade-off confirmation",
    "confirmed contiguous timeline",
    "real Markdown and JSON downloads",
    "structured review that changes the next recommendation",
    "six-chapter local narrative with 24 independently generated WebP frames",
    "phase-organized evidence index with 50 additional generated WebP scenes and 20 direct-path scenes",
  ],
  privacy: {
    accountRequired: false,
    networkRequiredAfterLoad: false,
    storage: "current browser localStorage",
  },
  excludes: ["environment files", "server routes", "AI provider credentials", "private user media", "analytics SDKs", "remote fonts", "CDN assets"],
  storyFrameCount: storyFrames.length,
  visualStoryV3FrameCount: visualStoryV3Frames.length,
  files,
};

await writeFile(resolve(outputDir, "mirror-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`FlowCut public product built with ${files.length} verified local files, including ${storyFrames.length} narrative frames and ${visualStoryV3Frames.length} visual story v3 scenes.`);
