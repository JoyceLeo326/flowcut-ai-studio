# Integration Architecture

## Components

1. **FlowCut web editor**
   - Derived from OpenCut Classic under MIT.
   - Owns browser-local media, timeline state, preview, manual editing, undo, and export.
2. **Neutral EditPlan contract**
   - `flowcut.edit-plan/v1` describes intent without depending on either editor's internal schema.
   - Local commands are applied through the existing command history as one reversible batch.
3. **ChatCut handoff adapter**
   - `flowcut.chatcut-handoff/v1` contains project metadata, selected media names, the original prompt, and enabled cloud steps.
   - It is designed for the official ChatCut agent plugin/MCP workflow.

## Data Flow

```text
User-selected media
        |
        v
FlowCut local project -> reviewable EditPlan -> local command batch -> preview/export
                              |
                              v (explicit confirmation)
                     ChatCut handoff JSON
                              |
                              v
                 ChatCut transcription/semantic edit
                              |
                              v
                    rendered media back to FlowCut
```

## Why The Bridge Is Explicit

OpenCut and ChatCut use different project and timeline schemas. ChatCut also has
its own hosted account, storage, and credit boundaries. A neutral, versioned
handoff prevents hidden uploads and avoids copying GPL plugin code into this MIT
repository. A future direct connector can implement the same contract after an
official OAuth/API flow is available for the deployed application.
