# VisionCut Part 1-8 Completion Matrix

Updated: 2026-07-23

This document is the release truth source for the eight-part VisionCut product specification.
UI presence is not implementation evidence. A capability is complete only when its user path,
state transition, persistence, failure behavior, tests, and delivery evidence are all present.

## Status Rules

- **Implemented**: real end-to-end behavior exists and is covered by automated or browser tests.
- **Prototype**: a truthful interaction or domain contract exists, but a production dependency or execution path is incomplete.
- **Missing**: the required behavior is not present.

## Part 1 - Product Strategy

| Requirement                         | Status      | Current evidence                                                                   | Completion gate                                                                |
| ----------------------------------- | ----------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Intent-first creation               | Implemented | Home intent entry, project-scoped `IntentSpec`, editor recovery                    | Browser test covering create, refresh, and edit revision                       |
| Human direction before AI execution | Implemented | Review gate, step selection, explicit local apply, batch undo                      | Per-operation preview and evidence before all destructive edits                |
| AI creative partner                 | Prototype   | Local director rules and optional BYOK director review                             | Real media-grounded recommendations with evidence citations                    |
| Creator DNA                         | Prototype   | Explicit confirmation only, pause/edit/export/delete, local IndexedDB              | Apply learned preferences to new plans with user-visible provenance            |
| AI production team                  | Prototype   | Six-role DAG, evidence gates, human approval, failure/retry and reviewable outputs | Persist runs, connect model/media executors, resolve conflicts and expose logs |

## Part 2 - Product Requirements

| Requirement            | Status      | Current evidence                                                                       | Completion gate                                                   |
| ---------------------- | ----------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Home Studio            | Implemented | Intent, starter flows, direct multi-file drop, project creation                        | Large-file recovery and browser compatibility testing             |
| Project Intelligence   | Implemented | Real metadata, timeline counts, unused media, project warnings                         | Codec-level validation and render readiness checks                |
| Chat Cut               | Prototype   | Natural-language plan, BYOK advice, explicit external handoff                          | Transcript-linked edit operations and result import protocol      |
| Open Cut / Story Graph | Prototype   | Evidence-derived nodes, full local editing, IndexedDB history and conflict protection  | Synchronize graph selection and edits with preview/timeline       |
| Automatic rough cut    | Prototype   | Local arrange and aspect operations are real; unsafe fixed trim removed                | ASR/VAD/scene evidence and per-cut comparison before conform      |
| Style Studio           | Prototype   | Visual worlds and professional controls                                                | Parameters must drive real render or plan fields                  |
| Viral Intelligence     | Missing     | No evidence-backed retention or distribution model                                     | Platform-specific analysis with model version and confidence      |
| Export Center          | Prototype   | Browser renderer plus multi-variant manifest, platform profiles and evidence preflight | Render every planned variant; add captions, thumbnails and resume |
| Collaboration          | Missing     | Local single-user project model                                                        | Shared project, comments, permissions, conflict strategy          |

## Part 3 - UI and UX

| Requirement                   | Status      | Current evidence                                                | Completion gate                                                    |
| ----------------------------- | ----------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| Guided and Pro modes          | Implemented | Experience switch and progressive controls                      | User testing with first-time and professional editors              |
| Modern product language       | Implemented | Quiet surfaces, hairline borders, max 8px radii, icon controls  | Cross-browser visual regression suite                              |
| Story Graph as a real surface | Prototype   | Evidence graph replaces fictional scores and canned story nodes | Make graph the central desktop canvas and timeline optional        |
| Mobile and tablet             | Prototype   | Responsive navigation and 44px primary controls                 | Real-device large media, background recovery, weak network, export |
| Accessibility                 | Prototype   | Labels, live plan region, keyboard buttons                      | Automated audit plus full keyboard and screen-reader verification  |

## Part 4 - Multi-Agent System

| Requirement            | Status    | Current evidence                                                                                      | Completion gate                                                    |
| ---------------------- | --------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Director orchestration | Prototype | Deterministic six-role DAG, dependencies, evidence blockers, approvals, retries and output references | Persist runs and connect independent executors with a merge policy |
| Editor agent           | Prototype | Real local arrange/aspect executor                                                                    | Evidence-based cuts, transcript edits, preview diff                |
| Story agent            | Prototype | Story Graph domain and local intent planning                                                          | Media-grounded story proposals with citations                      |
| Color agent            | Prototype | Evidence-gated color task, approval flow and plan output boundary                                     | Shot matching and reversible grade operations                      |
| Sound agent            | Prototype | Evidence-gated sound task, approval flow and plan output boundary                                     | VAD, cleanup, ducking, loudness and evidence report                |
| Growth agent           | Prototype | Publication/performance evidence gate and reviewable packaging task                                   | Real packaging execution and measurable recommendation output      |
| Agent memory           | Prototype | IntentSpec, Creator DNA, project versions and Story Graph history                                     | Persistent orchestration/session traces and preference provenance  |

## Part 5 - Technical Architecture

| Requirement                 | Status      | Current evidence                                                     | Completion gate                                                     |
| --------------------------- | ----------- | -------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Next.js web application     | Implemented | Next 16 application, local editor and deployed web build             | Continued build and browser regression coverage                     |
| Secure BYOK                 | Implemented | Session-only keys, fixed official upstreams, SSRF protection, limits | Production route verification and key-lifecycle browser test        |
| Local free mode             | Implemented | Default local mode, no automatic paid calls                          | Clean-profile network trace from import through 1080p export        |
| Video intelligence pipeline | Missing     | Metadata extraction only                                             | Timestamped ASR, scenes, speakers, people, quality and confidence   |
| API and worker services     | Missing     | Route handlers only                                                  | Queue, worker isolation, retry, observability and cancellation      |
| Cloud storage and render    | Missing     | Browser IndexedDB/OPFS and local render                              | Object storage, resumable upload, cloud render and lifecycle policy |
| Security and observability  | Prototype   | Headers, validation, no-store, normalized provider errors            | Authz, audit trail, rate limits, metrics, traces and alerts         |

## Part 6 - Data and Engineering

| Requirement                    | Status      | Current evidence                                                                      | Completion gate                                                    |
| ------------------------------ | ----------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Modular frontend               | Implemented | Separate AI edit, AI studio, timeline and storage domains                             | Maintain dependency boundaries in CI                               |
| Project-scoped intent versions | Implemented | Validated IndexedDB `IntentSpec` revision history                                     | Editable target fields and migration policy                        |
| Reviewable edit plan           | Prototype   | Immutable operation review, project version references, apply and undo ledger entries | Bind every approved operation to a real editor command             |
| Automation run records         | Prototype   | Validated lifecycle, retry, failure, result and approval contract                     | Persistent project run ledger and UI logs                          |
| Project database schema        | Missing     | Server DB does not yet model Project/Asset/Scene/Version/AgentRun/DNA                 | Migrations, repository layer, tenancy and deletion semantics       |
| Required monorepo services     | Missing     | Current repo remains web/desktop focused                                              | Add API/worker/packages only when their real execution paths exist |
| Evaluation                     | Missing     | Unit and browser tests, no AI evaluation harness                                      | Golden media set, quality metrics and regression thresholds        |

## Part 7 - Business and Growth

| Requirement           | Status      | Current evidence                                   | Completion gate                                               |
| --------------------- | ----------- | -------------------------------------------------- | ------------------------------------------------------------- |
| Free acquisition path | Implemented | Local default without account, key or paid service | Public onboarding and privacy documentation                   |
| BYOK creator path     | Implemented | OpenAI, Anthropic and Gemini session connections   | Usage visibility and provider-specific troubleshooting        |
| Paid plans            | Deferred    | Intentionally excluded from the initial product    | Revisit only after the free creation loop is reliable         |
| Team and enterprise   | Missing     | No collaboration or private deployment product     | Permissions, billing boundary, admin, audit and support model |
| Marketplace/community | Missing     | No marketplace runtime                             | Trust, licensing, moderation, versioning and revenue rules    |

## Part 8 - Execution and Acceptance

| MVP acceptance item | Status      | Evidence still required                                                |
| ------------------- | ----------- | ---------------------------------------------------------------------- |
| User system         | Prototype   | Complete sign-up/sign-in/recovery/profile UI and tenancy tests         |
| Video upload        | Implemented | Stress and recovery tests for large inputs                             |
| AI analysis         | Missing     | Real timestamped MediaIndex output                                     |
| Chat Cut            | Prototype   | Transcript-driven edit execution and result conform                    |
| Automatic rough cut | Prototype   | Evidence-based cuts with operation-level review                        |
| Creative Canvas     | Prototype   | Central graph workspace, persisted versions and conflict-safe recovery |
| Story Graph         | Prototype   | Preview/timeline synchronization and richer evidence inspection        |
| Video export        | Implemented | Delivery QC, multi-version and resume behavior                         |

## Release Policy

The product must not be described as fully compliant with Part 1-8 while any P0 execution
dependency remains in Prototype or Missing. Each release should update this matrix, link the
relevant tests, and include browser evidence for desktop, tablet, and mobile.
