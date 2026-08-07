# FlowCut product v2 execution plan

## Product contract

FlowCut turns one real editing conflict into a decision the creator can own and carry away. The public product must work without an account or network request and must complete this causal loop:

1. Creator role, audience, platform, duration, priority, deadline, and material observations establish the conflict.
2. FlowCut proposes exactly three equally weighted routes with distinct benefits, costs, evidence criteria, and constraint-fit explanations.
3. The creator selects one route and explicitly acknowledges its trade-off before confirmation.
4. Confirmation produces a contiguous timeline plus downloadable Markdown and JSON deliverables.
5. Structured review evidence produces a visibly changed next-round recommendation, candidate order, and first experiment.

## Brand contract

- Name: FlowCut.
- Core metaphor: a cut point that returns as an evidence loop.
- Mark: an original local SVG formed from an `F`, a diagonal cut, and a return stroke.
- Voice: precise, calm, and accountable; never competition, demo, or speculative capability language.
- Palette: ink `#080b0f`, paper `#eef4e9`, signal lime `#b9ff66`, proof cyan `#58e6ff`, and decision coral `#ff8d5c`.

## Narrative asset contract

Twenty-four independently generated local WebP frames form six chapters: intake, conflict, comparison, choice, confirmation/delivery, and feedback/next cut. Each frame keeps the same fictional cast and studio task state, has a specific UI story purpose, and is documented with source provenance, prompt, alt text, chapter, and flow position. The interface displays the active chapter, not a decorative gallery.

## Delivery contract

- Static, self-contained output from `mirror-src/` to `public-mirror/`.
- No login, external CDN, Google dependency, analytics request, provider key, or private media.
- CSP and relative local assets support mainland-first hosting and self-hosting.
- Mobile acceptance at 320, 390, and 430 CSS pixels with 44 px targets, keyboard-safe spacing, safe-area insets, and no horizontal overflow.
- Node tests, build, HTTP smoke, secret guard, and full-history gitleaks pass before merge.
- Merge via pull request, deploy the merged `main` to the existing Vercel project, then verify the production journey in Chrome including real downloads.

## Atomic work sequence

1. Add failing product, brand, causal-loop, asset, and deployment contract tests.
2. Implement the FlowCut mark and outcome-first shell.
3. Generate, convert, document, and wire the 24-frame narrative system.
4. Implement causal recommendations, explicit confirmation, portable deliverables, and feedback-driven next rounds.
5. Harden mobile, keyboard, safe-area, CSP, and static build behavior.
6. Run quality gates, merge, deploy, and complete production Chrome QA.
