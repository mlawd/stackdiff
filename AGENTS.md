# AGENTS

## Mission

Build and maintain `stacked`, a local-first tool for reviewing and editing stacked PR flows hosted on GitHub.

## Project structure

- Monorepo managed with npm workspaces.
- Services live under `services/*`.
- Current service:
  - `services/app`: SvelteKit frontend/server app.

## Core constraints

- Local-first only for now.
- GitHub communication must happen server-side through local `git` and `gh` CLI.
- Never require users to paste tokens into the UI.
- Prefer deterministic, typed server utilities for shell execution.

## Storage strategy

- Source of truth for stack hierarchy is JSON (`services/app/data/stacks.json`).
- Runtime page load enriches each stack with live git/gh status.
- Keep storage behind an interface so SQLite can replace JSON later.

## Coding guidelines

- Keep modules small and focused.
- Use explicit TypeScript types for stack domain objects.
- Handle CLI failures gracefully and return actionable errors in UI-safe shape.
- Avoid adding dependencies unless they provide clear value.

## Operational commands

- Install: `npm install`
- Dev: `npm run dev`
- Type checks: `npm run check`
- Build: `npm run build`
