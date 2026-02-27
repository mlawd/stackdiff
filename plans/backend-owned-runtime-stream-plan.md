# Backend-Owned Runtime Stream Plan

## Goal

Move stack runtime status updates and review-ready notification detection to the backend so the frontend no longer polls implementation status endpoints.

## Scope

- Introduce a per-stack server-side poller that reconciles stage runtime/status.
- Stream runtime updates and notification events to clients over SSE.
- Replace frontend polling with EventSource subscription.
- Keep browser Notification permission/mute controls client-side.

## Architecture

### Transport

- Use SSE (`text/event-stream`) via a new GET route.
- Keep event payloads transport-agnostic so WebSocket migration remains possible.

### Per-Stack Poller (Recommended)

- One poll loop per `stackId` in-process.
- Multiple client subscribers fan out from the shared poller.
- Poll cadence: every 2s.
- Automatic cleanup when no subscribers remain.

### Event Contract

- `snapshot`: full runtime map after initial connection.
- `stage-runtime`: incremental stage runtime updates.
- `review-ready`: emitted when a stage transitions from `in-progress` to `review`.
- `heartbeat`: periodic keepalive.
- `error`: non-fatal stream-level issues.

## Backend Changes

### New Service

- Add `services/app/src/lib/server/stack-runtime-stream-service.ts`.
- Responsibilities:
  - Track subscribers by stack.
  - Run shared polling and call `reconcileImplementationStageStatus(stackId, stageId)`.
  - Diff previous/current runtime snapshots.
  - Emit `stage-runtime` and `review-ready` events.
  - Emit `snapshot` on subscribe.
  - Emit heartbeat on timer.
  - Handle abort/unsubscribe and teardown.

### New Route

- Add `services/app/src/routes/api/stacks/[id]/runtime/stream/+server.ts`.
- `GET` handler:
  - Validate stack id with `requireStackId`.
  - Delegate to stream service.
  - Use existing API error mapping.

## Frontend Changes

### Feature Panel Migration

- Update `services/app/src/lib/features/stack-feature/components/FeatureStackPanel.svelte`.
- Replace current client polling loop with `EventSource` connection to:
  - `/api/stacks/${stack.id}/runtime/stream`
- Handle stream events:
  - `snapshot` -> initialize `implementationRuntimeByStageId`.
  - `stage-runtime` -> merge runtime update for that stage.
  - `review-ready` -> dispatch browser notification if permission granted and app notifications enabled.
- Keep existing notification mute/permission checks.
- Keep local dedupe set for notification tags on the client.

### Cleanup

- Remove client polling usage from `FeatureStackPanel.svelte`.
- Remove now-unused `runtime-polling.ts` and `runtime-polling.test.ts` if no longer referenced.
- Keep `behavior.ts` state/label helpers that remain relevant.

## Testing Plan

### New Server Tests

- `services/app/src/lib/server/stack-runtime-stream-service.test.ts`
  - emits snapshot on connection
  - emits stage-runtime on changes
  - emits review-ready on `in-progress -> review`
  - does not duplicate review-ready events
  - keeps stream alive after recoverable reconcile failures
  - tears down poller when last subscriber disconnects

- `services/app/src/routes/api/stacks/[id]/runtime/stream/server.test.ts`
  - returns 400 for missing stack id
  - forwards successful stream response

### Updated/Removed Tests

- Remove or replace `services/app/src/lib/features/stack-feature/runtime-polling.test.ts`.

### Validation Commands

- `npm run check --workspace @stacked/app`
- `npm run test --workspace @stacked/app`

## Rollout Notes

- Start with SSE implementation and shared poller.
- Keep event schema stable to enable future WebSocket transport without frontend behavior changes.
