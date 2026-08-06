# FlowCut story generation manifest

## Authenticity statement

These 24 narrative frames were created for FlowCut through **24 independent built-in ImageGen calls** on 2026-08-07. Frame 01 established the fictional cast and production design; frames 02–24 were separate calls that referenced frame 01 to preserve identity and environment while changing composition and task state. No frame was duplicated, cropped from another frame, fetched from the web, or presented as a generated image without an underlying ImageGen call.

The fictional recurring cast is:

- Lin Cheng: Chinese woman editor, late 20s, precise short black bob, coral-red overshirt, charcoal T-shirt, silver ear cuff.
- A-Ye: Chinese male creator, early 30s, wavy black hair, round glasses, sage-green work jacket.

The continuous environment is a compact night editing studio with a matte black desk, dual monitors, a ceramic tasting cup, a red failed-product sample, a memory card, and lime/cyan/coral practical lighting. Generated images intentionally contain no FlowCut logo or readable interface text. The exact per-frame prompt summary, alt text, UI story purpose, source filename, chapter, and flow position are versioned in `../../story-scenes.js`.

## Processing

- Generator: OpenAI built-in ImageGen.
- Source format: individually generated PNG files retained in the Codex generated-image store outside the repository.
- Reference: frame 01 source image for visual continuity in frames 02–24.
- Published format: local 1200 × 800 WebP, converted with FFmpeg 8.1.2, libwebp picture preset, quality 82, compression level 6.
- Runtime behavior: only the four frames for the active product chapter are mounted; the assets are narrative state, not a decorative gallery.

## Call-to-frame provenance

| Frame | Chapter | Independent call/source | Story purpose |
| --- | --- | --- | --- |
| 01 | intake | `exec-96f8cd1f-b3de-44cc-b1a2-384572240d7c.png` | Establish cast, studio, evidence objects, and unresolved task. |
| 02 | intake | `exec-67ff616c-5726-45d1-9c32-ee9945f76fc7.png` | Show material entering the local workflow. |
| 03 | intake | `exec-23691abd-cb40-408c-bc2a-b0e136ceee80.png` | Convert raw files into observable evidence. |
| 04 | intake | `exec-fe136cf9-a3c7-4e7c-9b43-564e5cac28b0.png` | Find the first concrete conflict in source material. |
| 05 | conflict | `exec-c86cfc41-8944-4029-bd11-37a2809b963c.png` | Externalize the editing tension before recommendation. |
| 06 | conflict | `exec-dcb6b713-3a6a-49b0-ad99-17bdadb8f7da.png` | Expose the missing causal middle. |
| 07 | conflict | `exec-910ba6ff-97d4-4e87-924d-226a5173408d.png` | Make audience, platform, duration, and deadline visible. |
| 08 | conflict | `exec-d800cc87-b8a2-46e6-bf6f-58e10bc5d212.png` | Distill constraints into one actionable conflict. |
| 09 | compare | `exec-d54a46c4-a1a4-42c8-96fc-324dbe04a53c.png` | Introduce exactly three equal candidates. |
| 10 | compare | `exec-11c41b7f-0cfe-40f8-aa11-961815659a9a.png` | Show the retention route benefit and cost. |
| 11 | compare | `exec-d677dddf-e6a6-4878-a65b-dbea78bd42bb.png` | Show the story route benefit and cost. |
| 12 | compare | `exec-a9731d71-d6d2-47de-a056-4282449e7e0e.png` | Show the proof route benefit and cost. |
| 13 | choice | `exec-78d5cffb-4059-4bcf-b66a-5236069fee63.png` | Separate system comparison from creator ownership. |
| 14 | choice | `exec-a6dfcdca-925b-4b0e-8f69-560b28391b32.png` | Record the user's selected candidate. |
| 15 | choice | `exec-e206f344-1d6f-4be8-af1a-4dc456142604.png` | Confront the selected route's explicit cost. |
| 16 | choice | `exec-6467a4a6-6640-4273-ace6-1260a1a9be39.png` | Visualize explicit acknowledgment before confirmation. |
| 17 | confirm | `exec-715d42d1-926b-4c7c-85a9-4cd6e8c91d37.png` | Turn the confirmed route into a contiguous first cut. |
| 18 | confirm | `exec-4d3fb724-4766-4382-8579-81a2f8162e53.png` | Keep timeline instructions grounded in material. |
| 19 | confirm | `exec-840a4902-7fc3-48cc-8a53-a172135fdeb8.png` | Produce real local Markdown and JSON deliverables. |
| 20 | confirm | `exec-5cddde31-27dc-4fe5-bda3-8ccc26c3dedd.png` | Make the result portable and creator-owned. |
| 21 | feedback | `exec-2638f379-0f0b-49b1-ab88-766ff8af0d83.png` | Begin a real post-delivery review. |
| 22 | feedback | `exec-9f8e3080-bac7-4b2b-aaa3-eaf2aad687a1.png` | Capture structured score, outcome, confidence, and evidence. |
| 23 | feedback | `exec-84e486f3-91a6-4dff-9718-b3202e94bec9.png` | Reorder the next recommendation because of feedback. |
| 24 | feedback | `exec-111a83dc-ebe0-41dc-8816-6f3d61d1a3b5.png` | Close on a visibly revised cut and open evidence loop. |
