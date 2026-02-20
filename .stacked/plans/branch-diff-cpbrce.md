# Branch diff implementation plan

## Goal
Implement a stage-level branch diff experience on the feature page so that clicking a diffable stage opens a slide-out panel with a side-by-side git diff of changes introduced by that stage, using committed changes only and a baseline of previous stage branch (or repo default base branch for stage 1). The implementation should be selection-ready for immediate v2 work that enables line selection and AI chat over selected diff ranges.

## Scope
- In scope (v1):
  - Server-side stage diff resolution and parsing.
  - New API endpoint for stage diffs.
  - Feature page updates to enable/disable stage click behavior.
  - Slide-out panel with side-by-side diff rendering.
  - UX states for loading, empty diff, errors, and non-diffable stages.
  - Type-safe payloads and error mapping.
- In scope (immediate v2 follow-on):
  - Line selection model and selection payload structure.
  - Chat endpoint accepting diff-based selection context.
- Out of scope for this item:
  - Uncommitted worktree/index diffing.
  - Monaco editor integration.
  - Persisted annotations/thread history unless explicitly requested later.

## Constraints
- Baseline rule: compare current stage branch to previous stage branch; for stage 1 use default base branch resolution already used by worktree service.
- Diff source: committed history only.
- Stage interaction rule: stages without implementation worktree/branch are not clickable.
- Architecture constraints:
  - Local-first operation only.
  - Git/GitHub interactions must remain server-side via local CLI execution.
  - Keep storage JSON-backed (`data/stacks.json`) behind existing store interface.
  - Avoid adding heavy dependencies without clear value.
- UI/UX constraints:
  - Preserve existing app visual language and layout patterns.
  - Ensure panel and diff are usable on desktop and mobile.
- Engineering constraints:
  - Strong TypeScript typing for new domain objects.
  - UI-safe actionable error messages.

## Proposed changes
1. Introduce structured diff domain types in `src/lib/types/stack.ts`:
   - `StageDiffPayload`, `StageDiffSummary`, `StageDiffFile`, `StageDiffHunk`, `StageDiffLine`.
   - Include stable `lineId` per render row for v2 selection.
   - Include metadata fields: `stackId`, `stageId`, `baseRef`, `targetRef`, `isTruncated`.
2. Add server module `src/lib/server/stage-diff-service.ts`:
   - Resolve stack and stage.
   - Resolve implementation session branch for target stage.
   - Resolve base ref from previous stage implementation branch, fallback to default base branch for stage 1.
   - Validate refs exist and produce deterministic errors.
   - Execute git diff command(s) with rename detection and parse output into structured model.
   - Map failures to typed UI-safe error categories (`not-found`, `not-diffable`, `command-failed`, `parse-failed`).
3. Add API route `src/routes/api/stacks/[id]/stages/[stageId]/diff/+server.ts`:
   - `GET` returns structured payload.
   - Status mapping: `200`, `404`, `409`, `500`.
4. Extend feature page server load in `src/routes/stacks/[id]/+page.server.ts`:
   - Add per-stage runtime metadata (`isDiffable`, `branchName`, optional `reasonIfNotDiffable`).
5. Update feature page UI in `src/routes/stacks/[id]/+page.svelte`:
   - Make only diffable stages interactive.
   - Add slide-out panel state and fetch lifecycle.
   - Show panel loading/error/empty states.
6. Implement side-by-side renderer components:
   - Add diff components under `src/lib/components/diff/`.
   - Render file list + hunk blocks + paired left/right lines keyed by `lineId`.
   - Optional syntax highlighting via `highlight.js`.
7. Add large-diff guardrails:
   - Max files/lines rendering threshold.
   - Truncation notice in payload/UI.
   - File collapse and basic navigation for usability.
8. Prepare immediate v2 extension:
   - Add client selection state model built on existing `lineId`.
   - Add `POST /api/stacks/[id]/stages/[stageId]/diff/chat` with selection payload contract.
   - Reuse stage implementation session context for AI prompt grounding.

## Execution steps
### Stack 1: Diff domain and API contract
- Add new diff types to `src/lib/types/stack.ts`.
- Implement `stage-diff-service` with baseline resolution and git command orchestration.
- Add diff parsing dependency (`parse-diff`) and parser adapter.
- Implement `GET /api/stacks/[id]/stages/[stageId]/diff` route with status mapping.
- Verify endpoint responses for diffable and non-diffable stages.

### Stack 2: Stage diffability metadata
- Extend stack page server load payload with per-stage diffability metadata from implementation sessions.
- Ensure metadata does not mutate persistence schema and is runtime-enriched only.

### Stack 3: Panel shell and interaction
- Add stage click handling only for diffable stages.
- Add right slide-out panel shell with open/close behavior.
- Wire lazy fetch to diff endpoint and handle request lifecycle states.

### Stack 4: Structured side-by-side renderer
- Build reusable diff UI components (`file list`, `hunk`, `paired line row`).
- Render side-by-side view from structured payload, including rename/add/delete presentations.
- Add stable `data-line-id` hooks for future selection.

### Stack 5: UX polish and performance guardrails
- Add truncation UI if payload exceeds limits.
- Add file collapse/expand and quick file navigation.
- Improve keyboard/escape handling and mobile panel behavior.
- Optionally add syntax highlighting (`highlight.js`) behind a utility boundary.

### Stack 6: Hardening and validation
- Add unit tests for ref resolution, error mapping, and parsing edge cases.
- Add route-level tests for status and response shape.
- Run `npm run check` and `npm run build` and resolve findings.

### Stack 7 (immediate v2): Line selection and AI chat
- Add multi-line selection state keyed by `lineId`.
- Define `DiffSelection` payload (`refs`, `filePath`, `selectedLineIds`, `snippet`).
- Add chat endpoint consuming selection payload and forwarding focused context to stage implementation agent/session.
- Add UI action in panel to open/send chat with selected lines.

## Risks and mitigations
- Baseline branch missing for previous stage:
  - Mitigation: return `409 not-diffable` with clear reason; do not crash panel.
- Large diffs degrade client performance:
  - Mitigation: enforce server-side truncation thresholds and file collapse defaults.
- Parser edge cases for binary/rename/empty hunks:
  - Mitigation: parser adapter fallback handling and explicit unsupported markers in payload.
- Inconsistent line identity across refreshes:
  - Mitigation: deterministic `lineId` generation from file path, hunk index, side, and line numbers/index.
- Future v2 rework risk:
  - Mitigation: keep structured payload as source of truth and avoid HTML-only rendering dependency.

## Validation checklist
- Functional
  - Clicking a diffable stage opens the panel and displays side-by-side diff.
  - Non-diffable stages are visibly disabled and non-clickable.
  - Stage 1 compares against default base branch; later stages compare against previous stage branch.
  - Diff shows committed changes only.
- API
  - Endpoint returns expected shape and status codes (`200/404/409/500`).
  - Error payloads are actionable and UI-safe.
- UX
  - Panel works with keyboard close and overlay close.
  - Mobile layout remains usable.
  - Large diffs display truncation/fallback behavior gracefully.
- Quality
  - Unit and route tests pass.
  - `npm run check` and `npm run build` pass.
- V2 readiness
  - Every rendered line exposes stable `lineId` and can be targeted for selection.
