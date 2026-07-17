# Contributing to FlowCut AI Studio

Please open an issue before starting a large feature. Small bug fixes and
documentation improvements can go directly to a pull request.

## Local setup

1. Install Bun 1.3.11 or newer.
2. Run `bun install --frozen-lockfile` from the repository root.
3. Run `bun run dev:web` and open `http://localhost:3000`.
4. Before submitting, run `bun test apps/web/src/ai-edit` and
   `bun run build:web`.

The local-first editor does not require a database or cloud credentials.
ChatCut remains an external optional workflow and its code is not part of this
repository.
