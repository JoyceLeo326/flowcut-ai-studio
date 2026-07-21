# VisionCut product studio plan

## Goal

Turn the editor into a complete AI creation product for both first-time creators and professional editors. The default path should explain work in outcome language, while pro controls expose thresholds, shot rules, execution ownership, and delivery details without creating a second disconnected interface.

## Product layers

1. **Guided create**: task-first recipes with one recommended path and a single primary action.
2. **Automation lab**: talking head cleanup, podcast multicam, long-to-short, event recap, product story, music sync, vlog, tutorial, interview, and trailer workflows.
3. **Visual lab**: original style worlds, moodboards, storyboard frames, B-roll concepts, cover candidates, and multi-ratio generation jobs.
4. **Director queue**: every analysis and edit node is reviewable, optional, and labelled as local or ChatCut execution.
5. **Professional controls**: silence threshold, filler handling, jump-cut smoothing, scene sensitivity, B-roll density, subtitle density, loudness, and output variants.

## Implementation tasks

### 1. Tested product catalog

- Write failing tests for recipe lookup, beginner recommendations, pro overrides, pipeline grouping, and visual generation jobs.
- Add a typed catalog with capability, executor, and availability metadata.
- Keep generated tasks deterministic so they can be reviewed and exported.

### 2. Visual asset reserve (non-critical path)

- Keep a small, coherent set of original cinematic style-world images for workflow previews, moodboards, and story references.
- Treat the 100-image catalog as optional material inventory, not a milestone, release gate, or primary product requirement.
- Reuse the strongest existing WebP assets first. Expand only after the intent-to-export workflow passes product acceptance and real usage identifies a gap.
- Use real raster assets in the studio, never decorative placeholder gradients; visual quality and relevance matter more than asset count.

### 3. Dual-layer creator experience

- Add Guided and Pro segmented modes.
- Add task categories, rich workflow cards, quick recommendations, and estimated outcomes.
- Expose pro controls progressively inside the same selected workflow.

### 4. Automation and visual lab

- Add a talking-head workflow covering transcription, silence/filler cleanup, jump-cut smoothing, B-roll, captions, voice cleanup, chapters, and delivery.
- Add visual generation controls for use case, style world, ratio, count, and prompt.
- Let users send a workflow into the existing creative brief and director plan.

### 5. QA and delivery

- Run focused tests, targeted lint, production build, and baseline regression checks.
- Verify desktop, tablet, and 320px phone layouts with real interactions.
- Commit, push to GitHub, deploy to Vercel, and verify production health.

## Source inspiration and boundary

The product model is informed by OpenCut, Auto-Editor, PySceneDetect, Whisper, Transformers.js, MediaPipe, OpenTimelineIO, Pexels, Unsplash, and Wikimedia/Openverse patterns. VisionCut will not copy third-party UI or bundled assets. External providers remain explicit connectors with attribution and key requirements; generated sample imagery is original.
