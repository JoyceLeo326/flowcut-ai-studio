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
- Use a near-black neutral canvas and a four-step surface ladder. Hierarchy comes from surface lift and hairline dividers, not heavy boxes.
- Keep cyan for the active AI signal, emerald for completed work, amber for attention, and rose for destructive states. White remains the primary action color.
- Avoid generic purple gradients, decorative blobs, and marketing-style hero sections inside the editor.
- Cards should represent real choices, plans, repeated items, or status. Do not nest cards for decoration.
- Do not use interface gradients or drop shadows. Media in the preview supplies the cinematic color and depth.

## Director Console

- Treat the AI panel as an editorial control surface: one dominant intent choice, one tunable creative brief, then one reviewable blueprint.
- Use 1px hairlines, 4-8px radii, and a neutral surface ladder. Selected choices lift one surface level and gain a single cyan state marker.
- Keep interface typography between 11px and 15px with 400-600 weights and letter spacing fixed at 0.
- Prefer divided rows and rails to containers inside containers. A section may frame a workflow; its children should usually be flat rows.
- Show ratios, durations, execution ownership, and output variants as compact visual data, not explanatory prose.
- Keep one visually dominant action per viewport. Secondary actions remain quiet until the plan is reviewed.
- On touch layouts, all primary controls must be at least 40px high and the bottom workspace switcher must never be covered by guidance overlays.

## Motion

- Motion should clarify state, hierarchy, or progress.
- Prefer transform and opacity, 140-220ms for control feedback.
- Selected intent changes may use a restrained 1-2px lift; generated blueprint sections enter once with opacity and a 4px vertical offset.
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
