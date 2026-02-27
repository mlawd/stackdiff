import { notFound } from '$lib/server/api-errors';
import {
  reconcileImplementationStageStatus,
  type ImplementationStageStatusSummary,
} from '$lib/server/implementation-status-service';
import { loadProjectConfig } from '$lib/server/project-config';
import { getStackById } from '$lib/server/stack-store';

const STREAM_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
};

const HEARTBEAT_INTERVAL_MS = 25000;
const DEFAULT_POLL_INTERVAL_MS = 15_000;

interface RuntimeSnapshotEventData {
  runtimeByStageId: Record<string, ImplementationStageStatusSummary>;
}

interface StageRuntimeEventData {
  stageId: string;
  runtime: ImplementationStageStatusSummary;
}

interface ReviewReadyEventData {
  stageId: string;
  stageTitle: string;
}

interface PollerEntry {
  stackId: string;
  subscribers: Map<number, ReadableStreamDefaultController<Uint8Array>>;
  runtimeByStageId: Record<string, ImplementationStageStatusSummary>;
  pollTimer: ReturnType<typeof setInterval>;
  heartbeatTimer: ReturnType<typeof setInterval>;
  nextSubscriberId: number;
  polling: boolean;
}

const pollersByStackId = new Map<string, PollerEntry>();

function encodeSse(event: string, data: unknown): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown request failure';
}

function statusNeedsPolling(status: string): boolean {
  return (
    status === 'in-progress' || status === 'review' || status === 'approved'
  );
}

function runtimesEqual(
  left: ImplementationStageStatusSummary | undefined,
  right: ImplementationStageStatusSummary,
): boolean {
  if (!left) {
    return false;
  }

  return JSON.stringify(left) === JSON.stringify(right);
}

function broadcast(entry: PollerEntry, event: string, data: unknown): void {
  const payload = encodeSse(event, data);
  for (const [subscriberId, controller] of entry.subscribers.entries()) {
    try {
      controller.enqueue(payload);
    } catch {
      entry.subscribers.delete(subscriberId);
    }
  }
}

async function runPoll(entry: PollerEntry): Promise<void> {
  if (entry.polling) {
    return;
  }

  entry.polling = true;
  try {
    const stack = await getStackById(entry.stackId);
    if (!stack) {
      broadcast(entry, 'error', { message: 'Stack not found.' });
      return;
    }

    const stages = stack.stages ?? [];
    const activeStages = stages.filter((stage) => {
      const runtime = entry.runtimeByStageId[stage.id];
      const effectiveStatus = runtime?.stageStatus ?? stage.status;
      return statusNeedsPolling(effectiveStatus);
    });

    const nextRuntimeByStageId: Record<
      string,
      ImplementationStageStatusSummary
    > = {};

    for (const stage of activeStages) {
      try {
        const runtime = await reconcileImplementationStageStatus(
          entry.stackId,
          stage.id,
        );
        nextRuntimeByStageId[stage.id] = runtime;
      } catch (error) {
        console.error('[stack-runtime-stream] Failed to reconcile stage', {
          stackId: entry.stackId,
          stageId: stage.id,
          error: toErrorMessage(error),
        });
      }
    }

    for (const stage of activeStages) {
      const runtime = nextRuntimeByStageId[stage.id];
      if (!runtime) {
        continue;
      }

      const previousRuntime = entry.runtimeByStageId[stage.id];
      if (runtimesEqual(previousRuntime, runtime)) {
        continue;
      }

      broadcast(entry, 'stage-runtime', {
        stageId: stage.id,
        runtime,
      } satisfies StageRuntimeEventData);

      if (
        previousRuntime?.stageStatus === 'in-progress' &&
        runtime.stageStatus === 'review'
      ) {
        broadcast(entry, 'review-ready', {
          stageId: stage.id,
          stageTitle: stage.title,
        } satisfies ReviewReadyEventData);
      }
    }

    entry.runtimeByStageId = nextRuntimeByStageId;
  } finally {
    entry.polling = false;
  }
}

function stopPollerIfUnused(stackId: string): void {
  const entry = pollersByStackId.get(stackId);
  if (!entry || entry.subscribers.size > 0) {
    return;
  }

  clearInterval(entry.pollTimer);
  clearInterval(entry.heartbeatTimer);
  pollersByStackId.delete(stackId);
}

async function resolvePollIntervalMs(): Promise<number> {
  try {
    const config = await loadProjectConfig();
    return config.runtime.pollIntervalMs;
  } catch (error) {
    console.error('[stack-runtime-stream] Failed to read runtime poll config', {
      error: toErrorMessage(error),
      fallbackPollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
    });
    return DEFAULT_POLL_INTERVAL_MS;
  }
}

async function getOrCreatePoller(stackId: string): Promise<PollerEntry> {
  const existing = pollersByStackId.get(stackId);
  if (existing) {
    return existing;
  }

  const pollIntervalMs = await resolvePollIntervalMs();

  const entry: PollerEntry = {
    stackId,
    subscribers: new Map(),
    runtimeByStageId: {},
    pollTimer: setInterval(() => {
      void runPoll(entry);
    }, pollIntervalMs),
    heartbeatTimer: setInterval(() => {
      broadcast(entry, 'heartbeat', { now: new Date().toISOString() });
    }, HEARTBEAT_INTERVAL_MS),
    nextSubscriberId: 1,
    polling: false,
  };

  pollersByStackId.set(stackId, entry);
  void runPoll(entry);
  return entry;
}

export async function handleStackRuntimeStreamRequest(input: {
  stackId: string;
  request: Request;
}): Promise<Response> {
  const stack = await getStackById(input.stackId);
  if (!stack) {
    throw notFound('Stack not found.');
  }

  const poller = await getOrCreatePoller(input.stackId);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const subscriberId = poller.nextSubscriberId++;
      poller.subscribers.set(subscriberId, controller);

      controller.enqueue(
        encodeSse('snapshot', {
          runtimeByStageId: poller.runtimeByStageId,
        } satisfies RuntimeSnapshotEventData),
      );

      const abort = () => {
        poller.subscribers.delete(subscriberId);
        stopPollerIfUnused(input.stackId);
        try {
          controller.close();
        } catch {
          // Stream may already be closed.
        }
      };

      if (input.request.signal.aborted) {
        abort();
        return;
      }

      input.request.signal.addEventListener('abort', abort, { once: true });
    },
    cancel() {
      stopPollerIfUnused(input.stackId);
    },
  });

  return new Response(stream, {
    headers: STREAM_HEADERS,
  });
}
