# AGENTS.md

## Project

This repository implements Object VCS, a TypeScript monorepo that provides a lightweight Git-like abstraction for versioning a small graph of structured JSON objects.

The project is specified in:

- README.md
- docs/SPEC.md
- docs/BACKEND_HTTP_CONTRACT.md
- docs/EXAMPLE_APP_GOBLIN_TAVERN.md
- docs/IMPLEMENTATION_LOTS.md

These documents are authoritative. If implementation details are ambiguous, prefer the simplest implementation consistent with the spec and document the decision.

## Language and tooling

- Use TypeScript only.
- Do not use `any`.
- Prefer `unknown` plus narrowing when needed.
- Enable strict TypeScript.
- Use Zod as the primary runtime schema system.
- Use npm workspaces unless the repository already uses another package manager.
- Keep packages ESM-compatible.
- Public APIs must be explicitly typed.
- Avoid framework dependencies in `@object-vcs/core`.

## Architecture

Expected packages:

- `packages/core`
- `packages/firebase`
- `packages/react`
- `packages/vue`
- `packages/vanilla`
- `examples/goblin-tavern`

The core package must remain persistence-agnostic and framework-agnostic.

The Firebase package must depend on Firebase, not the core package.

The React package must depend on React and the core package.

The Vue package must depend on Vue and the core package.

The Vanilla package must expose a DOM-based API and optionally a Web Component.

## Versioning semantics

Respect these invariants:

- A revision is immutable.
- HEAD is mutable.
- HEAD belongs to a branch.
- A clean HEAD points to a committed revision.
- A dirty HEAD contains uncommitted state.
- Dirty HEAD intermediate states are not recoverable unless committed.
- Tags point to revision numbers, not directly to mutable HEAD.
- If HEAD is clean, tagging HEAD must not create a new revision.
- If HEAD is dirty, tagging HEAD may create a revision only when explicitly configured.
- Branches can be created from old revisions.
- No automatic merge is required for v1.

## Storage strategy

For the first implementation, prioritize snapshot storage.

Do not implement hybrid diff/checkpoint storage until the snapshot mode is complete and tested.

Keep the internal model compatible with future patch-based storage.

## Firebase

Implement Firebase as a persistence adapter.

Use Firestore transactions for strict commit operations.

Do not put Firebase-specific types in the core public API.

Keep Firestore paths and document shapes aligned with docs/SPEC.md.

## Example app

Implement the Goblin Tavern example app described in docs/EXAMPLE_APP_GOBLIN_TAVERN.md.

The example app must be deployable as a static app on GitHub Pages and use Firebase/Firestore as storage.

## Quality bar

Before completing a task:

- Run typecheck.
- Run tests.
- Run lint if configured.
- Update or add tests for changed behavior.
- Update documentation when public API changes.
- Do not leave TODOs unless they are explicitly documented as out-of-scope for the current lot.

## Output expectations

When finishing a task, summarize:

- what was implemented;
- files changed;
- tests run;
- known limitations;
- next recommended task.