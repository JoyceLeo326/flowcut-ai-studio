<p align="center">
  <img src="mirror-src/assets/brand/flowcut-share-card.svg" alt="FlowCut — Make the next cut accountable" width="100%" />
</p>

# FlowCut

从真实素材、观看目标与交付约束出发，把“为什么这样剪”变成可比较、可确认、可下载、可复盘的时间线决策。

[在线使用（GitHub Pages）](https://joyceleo326.github.io/flowcut-ai-studio/) · [备用入口（Vercel）](https://flowcut-ai-studio.vercel.app/) · [中文完整使用指南](docs/USAGE.zh-CN.md)

FlowCut is an evidence-led editing decision product. A creator can preview local video, audio, or image sources, combine their metadata with concrete material observations and delivery constraints, compare exactly three routes, explicitly accept one route's trade-off, confirm a contiguous timeline, download a Markdown edit sheet and JSON timeline, and feed structured review evidence into a visibly changed next version.

The public product is self-contained under `mirror-src/`: system fonts, local scripts, an original FlowCut mark, and 24 independently generated local WebP narrative frames. It makes no runtime request to Google, a CDN, analytics, or an AI provider. The larger local-first editor architecture remains in `apps/web` and `rust` and is based on the MIT-licensed OpenCut Classic editor.

## Choose the right product surface

This repository contains two related but deliberately separate surfaces:

| Surface | Location | Best for | Runtime boundary |
| --- | --- | --- | --- |
| Public FlowCut decision product | `mirror-src/` | Trying the complete evidence loop in a browser and deploying a static site | No server, account, analytics, model request, external font, or CDN |
| Full local editor architecture | `apps/web/` + `rust/` | Local media analysis, Story Graph, reversible edit operations, project versions, integrations, and local export | Runs as a local development application; optional integrations must be configured explicitly |

The two public links above serve the first surface. They do not pretend to expose every capability of the larger editor.

## Use the public product

1. **Define the delivery context.** Enter the creator role, audience, platform, target duration, deadline, and the result the edit must protect.
2. **Add real source material when useful.** Select up to eight local video, audio, or image files. The browser creates previews and records file metadata; the static product does not upload the files.
3. **Write material observations.** Describe what visibly or audibly happens in shot order. FlowCut uses these observations with the delivery constraints instead of claiming scene understanding it did not perform.
4. **Compare exactly three routes.** Each route exposes a different opening, structure, gain, trade-off, evidence basis, timeline proportion, and review question.
5. **Accept a trade-off and confirm.** Selecting a card is not approval. A route becomes V1 only after the creator explicitly accepts its stated cost and confirms the choice.
6. **Inspect the contiguous timeline.** Review the ordered segments, time ranges, retained evidence, captions, aspect ratio, and delivery checklist before export.
7. **Download real files.** Export the Markdown edit sheet and JSON timeline. Both files include the mission, selected route, trade-off, segments, evidence, and confirmation version.
8. **Run the evidence loop.** Record reviewer outcome and a concrete note. FlowCut keeps V1, shows the proposed differences, requires confirmation again, and then creates V2 in the decision history.

### A useful first run

The default coffee-product example is intentionally complete. Change the audience from “第一次刷到” to “准备购买”, change the protected goal, and submit the mission. Compare how route order, opening evidence and timeline proportions change. Confirm one route, download V1, add review feedback, then confirm V2 and compare the two downloaded records.

## Product capabilities

- Start with a natural-language intent, import multiple media files, and switch
  between Guided and Pro controls without leaving the project.
- Validate every file-selection, paste, and timeline drop through one media
  preflight path covering size, file header, MIME, container, codec, corruption,
  and browser-storage capacity.
- Build timestamped local `MediaIndex` evidence from frame difference,
  luminance, RMS, peak, audio activity, and segment-level transcripts.
- Review each proposed cut before an atomic multi-asset rough cut is applied;
  undo or redo the whole operation without leaving partial edits.
- Run Director, Story, Camera, Editor, Color, Sound, and Growth as a versioned
  evidence DAG in rule-based local mode or with an optional session-only BYOK model.
- Plan narrative structure in a draggable, connectable, persistent Story Graph
  and apply reviewed story-order changes to the timeline.
- Exchange strict ChatCut v2 handoff/result envelopes with baseline
  fingerprints, schema validation, atomic import, undo/redo, and receipts.
- Keep project, timeline, intent, blueprint, Story Graph, Agent, and transcript
  sidecars in integrity-checked project versions that can be restored.
- Manage an opt-in, explainable Creator DNA from explicit decisions only.
- Edit with a real preview canvas, multi-track timeline, properties, effects,
  transitions, captions, and local MP4/WebM export.
- Build honest multi-platform delivery manifests that distinguish planning,
  queueing, rendering, download, and upload states.

## Important Boundaries

- Local mode does not upload media. Projects and selected files stay in the
  browser's IndexedDB/OPFS storage.
- IndexedDB/OPFS follows the active browser profile. On Windows, use
  `start-web.ps1` to open VisionCut in its dedicated D-drive browser profile;
  opening the URL in a normal browser may use that browser's default C-drive
  profile instead.
- The browser cannot scan a disk. It can only read files selected by the user.
- ChatCut runs through its official external plugin/MCP workflow. This
  repository does not copy or distribute ChatCut GPL source code.
- ChatCut cloud work requires explicit user confirmation and the external
  service's own authorization. VisionCut does not silently upload media or claim direct
  two-way timeline synchronization.
- OpenCut and ChatCut project formats differ. The bridge transfers a neutral,
  versioned operation contract; imported results are revalidated against the
  current project before any timeline change.
- Local frame/audio signals are not presented as person, object, speaker,
  emotion, or retention understanding. Those claims require dedicated evidence
  and model versions that remain outside the current browser workspace.
- PostgreSQL schema, migration, constraints, and RLS exist for the cloud stage,
  while IndexedDB/OPFS remains the runtime source of truth in the public workspace.

## Run On This Windows Computer

Run VisionCut from a repository located on `D:`:

```powershell
cd "<D:\path\to\flowcut-product-studio>"
.\start-web.ps1
```

The script starts or safely reuses the service, then opens Chrome or Edge with
an isolated profile under `D:\VisionCut-Data`. Browser OPFS/IndexedDB, browser
cache, suggested downloads, process temp files, and runtime logs therefore stay
under that D-drive root. The user's normal Chrome/Edge profile is never opened
or modified.

When an already-running service is reused, its process environment cannot be
changed retroactively. The launcher reports this boundary; the dedicated
browser storage still uses D:. A service started by this launcher receives the
D-drive temp and cache environment from its first process.

Useful options:

```powershell
.\start-web.ps1 -Browser Edge
.\start-web.ps1 -DataRoot ".\.tmp\visioncut-data"
.\start-web.ps1 -ExactPort -Port 3200
.\start-web.ps1 -ValidateOnly
.\scripts\windows\Stop-VisionCutLocal.ps1 -Port 3200
.\scripts\windows\Test-VisionCutLocal.ps1
```

`-NoBrowser` starts or reuses only the web service. It does not provide the
D-drive browser-storage guarantee because the storage location then depends on
whichever browser profile opens the URL.

The web app cannot move OPFS belonging to an arbitrary browser profile. The
launcher only redirects the dedicated profile it creates. Browser binaries,
Windows page files, crash reporting, or other operating-system facilities can
still live on `C:`; the guarantee concerns VisionCut project media and the
launcher-managed browser data.

## Basic Workflow

1. Describe the intended video in Home Studio, add source files, and click
   **开始设计**.
2. In **理解**, run local analysis on the selected video and review its evidence
   limits.
3. In **AI 配方**, choose a workflow, tune Pro controls when needed, and review
   every proposed operation.
4. Create a reversible assembly or apply only approved cuts. Use **故事图** for
   narrative order and the timeline for detailed finishing.
5. In **制作组**, approve the roles to run. Rule-based local mode makes no model
   request; BYOK mode uses the provider configured for the current tab.
6. For external work, use **协作** to export the ChatCut v2 handoff and later
   import its validated result.
7. Check **项目版本** before major changes and use **交付** to resolve blockers,
   prepare variants, and open the real local video exporter.

The current browser workspace and the production target architecture are separated explicitly
in [docs/architecture/visioncut-system.md](docs/architecture/visioncut-system.md).

More detail is available in [docs/USAGE.zh-CN.md](docs/USAGE.zh-CN.md) and
[docs/INTEGRATION.md](docs/INTEGRATION.md). Windows D-drive storage behavior is
documented in
[docs/windows-d-drive-local.zh-CN.md](docs/windows-d-drive-local.zh-CN.md).

## Development

Use Bun 1.3.11 or newer:

```bash
bun install
bun run dev:web
bun test apps/web/src/ai-edit
bun run build:web
```

### Public product

`mirror-src/` is the deployable, server-free FlowCut product. Its causal loop is local source preview → conflict → three visual candidates → human choice → explicit confirmation → real download → structured feedback → changed next recommendation → confirmed V2 with preserved decision history.

Recommended public entry: [joyceleo326.github.io/flowcut-ai-studio](https://joyceleo326.github.io/flowcut-ai-studio/). Static Vercel backup: [flowcut-ai-studio.vercel.app](https://flowcut-ai-studio.vercel.app/). The recommended entry is verified from the current mainland China network used for release checks; reachability can still vary by region, operator, and third-party hosting policy, so it is not presented as a permanent 100% availability guarantee.

```bash
npm run quality:mirror
```

The publishable output is `public-mirror/`. Its HTML, CSS, JavaScript, SVG, and WebP assets use relative local paths; `mirror-manifest.json` records the public capability boundary and SHA-256 for every runtime file. `mirror-src/assets/story/GENERATION_MANIFEST.md` records source-call provenance and story purpose for all 24 frames. The output contains no environment files, server routes, provider credentials, analytics SDKs, or private user media.

To preview only the public product without installing the full editor dependencies:

```bash
git clone https://github.com/JoyceLeo326/flowcut-ai-studio.git
cd flowcut-ai-studio
python -m http.server 4173 --directory mirror-src
```

Open <http://localhost:4173>. To test the exact publishable output instead, run `node scripts/build-public-mirror.mjs` and serve `public-mirror/`.

## Test and release

The focused public-product gate can run with Node.js alone:

```bash
node --test mirror-src/experience.test.mjs mirror-src/public-mirror.test.mjs
node --check mirror-src/app.js
node --check mirror-src/experience.js
node --check mirror-src/story-scenes.js
node scripts/build-public-mirror.mjs
node --experimental-vm-modules scripts/http-mirror-smoke.mjs
node scripts/secret-guard.mjs public-mirror
```

`npm run quality:mirror` runs the same sequence. The full editor uses the Bun commands documented above; `bun run quality` additionally runs lint, the complete test suite, the web build, public-mirror build, HTTP smoke tests, and source/build secret guards.

Deployment is intentionally static:

- `.github/workflows/pages.yml` builds `public-mirror/` and publishes it to GitHub Pages;
- `vercel.json` serves the same public mirror as a root-path backup;
- `mirror-manifest.json` records every public runtime file and SHA-256 digest;
- no server route, environment file, provider key, user project, or local media file is copied into the public artifact.

## Repository map

```text
.
├── mirror-src/                 # Public evidence-led decision product
│   ├── index.html
│   ├── app.js                  # Mission, routes, confirmation, export, review
│   ├── experience.js           # Decision state and version history
│   └── assets/                 # Original mark and 24 local story frames
├── apps/web/                   # Full Next.js editor shell
├── rust/                       # Platform-neutral editing and media core
├── scripts/                    # Build, HTTP smoke and secret guards
├── docs/                       # Usage, architecture and integration guides
├── public-mirror/              # Generated deploy artifact; do not edit by hand
├── package.json                # Bun workspace and quality commands
└── .github/workflows/          # CI and Pages release
```

## Data, privacy, and credential handling

- The public product reads only files the user selects. Preview object URLs and file metadata remain in the active browser session; selected media is not embedded in the Markdown or JSON export.
- Public decision state and version history use browser storage. Clearing site data or switching browser profiles removes that local state, so exported files remain the durable handoff.
- The static product has `connect-src 'none'` in its Content Security Policy and cannot send analytics or model requests.
- The full local editor stores projects in the active browser profile's IndexedDB/OPFS. Storage location therefore follows the profile that opened the app.
- Optional BYOK configuration belongs only to the explicitly selected integration flow. Never commit `.env` files or paste a provider key into source, issues, screenshots, fixtures, or exported project files.

## Known limitations

- The public product converts user-entered observations and file metadata into an accountable edit plan; it does not decode media frames or infer people, objects, speakers, emotion, or audience retention.
- Browser previews depend on codecs supported by the current browser. An unsupported file can still be described manually but may not play in the preview panel.
- Markdown and JSON exports are decision documents and timeline contracts, not rendered video files or project files for a specific NLE.
- Public browser storage is local to one origin and profile; the static deployment has no account or cross-device synchronization.
- The full editor remains a larger local architecture with capabilities and integration boundaries that differ from the public mirror. Read the linked architecture and integration documents before extending it.

The web app is in `apps/web`, shared core work is in `rust`, and the VisionCut
edit-plan adapter is in `apps/web/src/ai-edit`.

## License And Attribution

VisionCut AI is distributed under the MIT License. See [LICENSE](LICENSE)
and [NOTICE](NOTICE). OpenCut attribution is preserved. ChatCut remains an
external service and trademark of its respective owner.
