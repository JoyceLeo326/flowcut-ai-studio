# FlowCut AI Studio Design Direction

FlowCut should feel like an AI editing partner, not a traditional timeline-first editor.

## Product Shape

- Start from user intent: quick output, review cut, styled edit, platform version.
- Keep timeline controls available, but do not make users understand them before they can create.
- Use direct choices over abstract settings. Prefer "I want a short highlight" to "set target aspect ratio".
- Every advanced option should write into a clear AI goal instead of exposing a dead configuration panel.

## Interface Voice

- Keep labels short, practical, and action-led.
- Avoid explaining internal implementation in the UI.
- Use beginner-friendly language without sounding childish.
- Default to one recommended path, then offer richer style choices underneath.

## Visual System

- The editor can be bold, but controls must remain predictable.
- Use a dark-neutral operational base with restrained cinematic accents: cyan, emerald, amber, rose.
- Avoid generic purple gradients, decorative blobs, and marketing-style hero sections inside the editor.
- Cards should represent real choices, plans, repeated items, or status. Do not nest cards for decoration.

## Motion

- Motion should clarify state, hierarchy, or progress.
- Prefer transform and opacity, 140-220ms for control feedback.
- Looped motion is only allowed when it communicates scanning, progress, or active AI work.
- Always respect `prefers-reduced-motion`.

## AI Editing Flow

1. User imports material.
2. User picks a natural outcome or style recipe.
3. AI generates a reviewable plan.
4. Local reversible steps can be applied.
5. Semantic, caption, silence, and highlight work can be handed to ChatCut.
6. User previews and exports.

## Quality Bar

- First screen must answer: "What do I do next?"
- Mobile and tablet must expose the same workflow through fewer, clearer surfaces.
- Empty states must be useful, not decorative.
- The UI should feel distinctive because the workflow is different, not because the visuals are noisy.
