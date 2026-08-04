# VisionCut AI

VisionCut AI is an intent-driven, local-first AI video creation system. It turns
creative goals into reviewable edit plans, local timeline actions, and optional
ChatCut cloud handoffs. It is a derivative project based on the MIT-licensed
OpenCut Classic editor.

Public preview: [flowcut-ai-studio.vercel.app](https://flowcut-ai-studio.vercel.app)

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
  evidence DAG in free local mode or with an optional session-only BYOK model.
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
- ChatCut cloud work requires explicit user confirmation and may require an
  account or credits. VisionCut does not silently upload media or claim direct
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
5. In **制作组**, approve the roles to run. Local mode is free and makes no model
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

The web app is in `apps/web`, shared core work is in `rust`, and the VisionCut
edit-plan adapter is in `apps/web/src/ai-edit`.

## License And Attribution

VisionCut AI is distributed under the MIT License. See [LICENSE](LICENSE)
and [NOTICE](NOTICE). OpenCut attribution is preserved. ChatCut remains an
external service and trademark of its respective owner.
