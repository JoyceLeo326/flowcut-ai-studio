# AI-first completion plan

## Goal

Turn the current collection of AI prompt cards into a complete, reviewable editing flow that works across desktop, tablet, and phone:

1. Import material.
2. Build a structured creative brief from natural choices.
3. Generate a plan that understands platform, style, captions, motion, sound, and output variants.
4. Review a concrete finished-video blueprint.
5. Apply reversible local changes once, hand semantic work to ChatCut, preview, and export.

## Tasks

### 1. Creative planning model

- Add tests for 4:5 output, style/caption/motion/audio detection, and dual-version delivery.
- Add a structured creative direction to every edit plan.
- Add explicit ChatCut steps for visual polish, sound design, and multi-version delivery.

### 2. Creative brief builder

- Add a pure, tested brief catalog and prompt composer.
- Replace append-only prompt cards with visible selected states.
- Keep one recommended path and put advanced controls in compact expandable sections.

### 3. Review and execution usability

- Render hook, narrative, captions, motion, sound, color, and output variants as a reviewable blueprint.
- Prevent the same local plan from being applied repeatedly.
- Add a direct mobile/tablet route from an empty AI panel to the Assets tab.

### 4. QA and delivery

- Run focused unit tests, full Bun tests, lint, and production build.
- Exercise the editor at desktop, tablet, and phone sizes in a browser.
- Merge to main, push GitHub, and verify the Vercel production deployment.
