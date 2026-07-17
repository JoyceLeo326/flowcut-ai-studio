# FlowCut AI Studio

FlowCut AI Studio is a local-first video editor with reviewable AI edit plans
and an optional ChatCut cloud handoff. It is a new derivative project based on
the MIT-licensed OpenCut Classic editor.

Public preview: [flowcut-ai-studio-jrleo326-6617s-projects.vercel.app](https://flowcut-ai-studio-jrleo326-6617s-projects.vercel.app)

## Current MVP

- Import video, image, and audio files into browser-local project storage.
- Edit with a real preview canvas, multi-track timeline, properties, effects,
  transitions, captions, and MP4/WebM export.
- Generate a structured `flowcut.edit-plan/v1` before changing the timeline.
- Apply local steps as one undoable command: arrange unused media, tighten clip
  edges, and set 16:9, 9:16, or 1:1 canvas sizes.
- Produce a `flowcut.chatcut-handoff/v1` package for silence detection,
  transcription, captions, and semantic highlight selection.
- Work in Local, Hybrid, or ChatCut planning modes.

## Important Boundaries

- Local mode does not upload media. Projects and selected files stay in the
  browser's IndexedDB/OPFS storage.
- The browser cannot scan a disk. It can only read files selected by the user.
- ChatCut runs through its official external plugin/MCP workflow. This
  repository does not copy or distribute ChatCut GPL source code.
- ChatCut cloud work requires explicit user confirmation and may require an
  account or credits. The MVP creates a handoff package; it does not silently
  upload media or claim direct two-way timeline synchronization.
- OpenCut and ChatCut project formats differ. The current bridge transfers a
  neutral edit plan and can bring the rendered result back as normal media.

## Run On This Windows Computer

Everything used by the local installation is under this repository on drive
`D:`. Start it from PowerShell:

```powershell
cd "D:\整理后的文件_2026-05-24\04_比赛活动资料\workflow\FlowCut-AI-Studio"
.\start-web.ps1
```

Open [http://localhost:3200](http://localhost:3200). The start script keeps Bun,
package caches, temporary files, and Next.js output inside the project on `D:`.

## Basic Workflow

1. Create a project and click **Import** to select one or more media files.
2. Open **AI 方案**, choose Local, Hybrid, or ChatCut, then describe the target.
3. Review each generated step and uncheck anything you do not want.
4. Click **应用本地步骤** for local timeline changes. Use the adjacent undo
   button to revert the whole batch.
5. For cloud steps, click **复制 ChatCut 任务** and paste it into a Codex task
   where the official ChatCut plugin is enabled. Attach the named source files
   only after confirming the upload.
6. Return the rendered result to FlowCut if manual finishing is needed, then use
   **Export** to render MP4 or WebM.

More detail is available in [docs/USAGE.zh-CN.md](docs/USAGE.zh-CN.md) and
[docs/INTEGRATION.md](docs/INTEGRATION.md).

## Development

Use Bun 1.3.11 or newer:

```bash
bun install
bun run dev:web
bun test apps/web/src/ai-edit
bun run build:web
```

The web app is in `apps/web`, shared core work is in `rust`, and the FlowCut
edit-plan adapter is in `apps/web/src/ai-edit`.

## License And Attribution

FlowCut AI Studio is distributed under the MIT License. See [LICENSE](LICENSE)
and [NOTICE](NOTICE). OpenCut attribution is preserved. ChatCut remains an
external service and trademark of its respective owner.
