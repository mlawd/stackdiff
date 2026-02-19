# Branch creation start flow implementation plan

## Goal
Implement a UI-triggered "Start feature" workflow that, for a planned feature with defined stages, creates or reuses the stage 1 git branch and worktree, creates or reuses an implementation agent session in that worktree, auto-sends a stage 1 implementation prompt, and updates feature/stage runtime status with idempotent behavior.

## Scope
- Add server-side orchestration for start flow in `services/app`.
- Add persistence for implementation sessions (separate from planning sessions) in `data/stacks.json` through `stack-store` interfaces.
- Add git worktree and branch management utilities with deterministic naming and safe resume behavior.
- Extend OpenCode server utilities to support per-session working directory.
- Add a new API endpoint for start action and integrate it into the feature detail UI.
- Add validation coverage for success, resume, and failure scenarios.

Out of scope:
- Multi-stage start/advance orchestration beyond stage 1.
- Per-stack repository path storage.
- New external dependencies.
- CLI entrypoint for start (UI only in this iteration).

## Constraints
- Local-first architecture only.
- GitHub and git communication must remain server-side via local CLI.
- Runtime repository model remains the repo containing the running server process.
- Do not store per-stack repository paths or branch hierarchy metadata.
- Keep storage behind typed interfaces in `stack-store` for future SQLite replacement.
- Preserve idempotency: if branch/worktree/session already exists, resume instead of failing when safe.
- Use deterministic naming convention: `<feature type>/<feature name>/<stage-number>-<stage name>` with git-safe sanitization.
- Base branch for stage 1 must resolve from current default base branch.

## Proposed changes
1. **Type system and storage model updates**
   - Extend stack domain types with implementation session metadata.
   - Extend stack file schema with `implementationSessions` collection.
   - Add typed store helpers to create/get/update implementation sessions by `stackId + stageId`.
   - Add typed helper for atomic feature + stage status transitions.

2. **Git worktree service**
   - Add a focused server service for branch and worktree lifecycle.
   - Implement deterministic naming and sanitization.
   - Resolve default base branch dynamically.
   - Implement idempotent ensure logic for branch/worktree combinations.

3. **OpenCode directory-aware implementation sessions**
   - Extend OpenCode calls to accept a target directory per session operation.
   - Add implementation bootstrap service that creates/reuses session and auto-runs stage 1 prompt.
   - Persist seeded state to avoid duplicate bootstrap on retries.

4. **Start API orchestration**
   - Add `POST /api/stacks/[id]/start` endpoint.
   - Validate prerequisites, orchestrate worktree/session setup, and persist statuses.
   - Return structured resume/create flags for UI messaging.

5. **Feature detail UI integration**
   - Add "Start feature" action in feature detail page.
   - Add loading, success, and actionable error states.
   - Refresh/reload stack data to reflect `started` and stage 1 `in-progress` state.

6. **Validation and hardening**
   - Validate first-run and idempotent rerun paths.
   - Validate partial existing resource recovery.
   - Validate failure paths with clear user-safe errors.
   - Run type checks and build.

## Execution steps
1. Define implementation session domain model and storage interfaces.
   - Add types for implementation session records (id, stackId, stageId, branchName, worktreePathKey, opencodeSessionId, seededAt, createdAt, updatedAt).
   - Extend stack file parsing/normalization and validators.
   - Add store methods for lookup/create/update and a combined status transition helper.

2. Implement naming and base-branch resolution primitives.
   - Build reusable slug/sanitization utility for feature type/name/stage tokens.
   - Resolve default base branch using repo metadata with stable fallback behavior.
   - Add error mapping for missing/invalid base branch scenarios.

3. Implement idempotent git worktree orchestration service.
   - Detect branch existence, worktree existence, and attachment state.
   - Handle flows: create fresh, reuse existing, recover partial existing.
   - Return normalized result payload (`created` vs `reused`) and canonical branch/worktree values.

4. Make OpenCode session operations directory-aware and add implementation bootstrap.
   - Allow create/status/messages/prompt operations to target a provided working directory.
   - Add implementation prompt builder for stage 1 context.
   - Implement ensure-session bootstrap that reuses existing session and avoids duplicate initial prompt.

5. Add start endpoint orchestration with transactional sequencing.
   - Validate feature exists, has stages, and stage 1 can be started.
   - Ensure branch/worktree, ensure implementation session, then persist status updates.
   - Return API response with `reusedWorktree`, `reusedSession`, `startedNow`, and updated stack/session summary.

6. Integrate UI action and state feedback.
   - Add "Start feature" button to feature detail stack tab.
   - Enforce disabled states (missing stages, already-starting).
   - Show progress, success, and error banners; refresh data post-success.

7. Validate behavior and ship quality gate.
   - Run scenario matrix for fresh start, repeat start, partial recovery, and failures.
   - Verify no destructive git operations are used.
   - Run `npm run check` and `npm run build`.

## Risks and mitigations
- **Risk: OpenCode sessions currently bound to process cwd may execute in wrong repository context.**
  - Mitigation: introduce explicit directory parameter across all OpenCode session operations used by implementation flow; add tests/assertions on directory propagation.

- **Risk: Base branch detection may fail in repos without configured remote HEAD.**
  - Mitigation: implement ordered fallback strategy and explicit user-safe error when unresolved.

- **Risk: Branch/worktree collisions due to naming or existing local state.**
  - Mitigation: strict sanitization, deterministic path derivation, and idempotent ensure logic that reuses recoverable resources.

- **Risk: Partial failure after git setup but before session persistence.**
  - Mitigation: sequence persistence after successful ensure calls and return resumable state on retry.

- **Risk: Inconsistent feature and stage status updates on retries.**
  - Mitigation: implement atomic status update helper and guard transitions to idempotent target states.

- **Risk: UI confusion for resumed vs newly started flow.**
  - Mitigation: return explicit flags in API response and map to clear success messages.

## Validation checklist
- [ ] Creating a planned feature with stages and clicking "Start feature" creates stage 1 branch/worktree and implementation session.
- [ ] Re-clicking "Start feature" reuses existing branch/worktree/session without duplication.
- [ ] If branch exists but worktree is missing, start flow repairs by attaching/creating required worktree.
- [ ] If implementation session exists and is seeded, no duplicate bootstrap prompt is sent.
- [ ] Feature status transitions to `started` and stage 1 transitions to `in-progress`.
- [ ] UI shows clear loading, success, and error states for start action.
- [ ] Error responses are actionable and safe for UI display.
- [ ] `npm run check` passes.
- [ ] `npm run build` passes.
