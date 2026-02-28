import type { ImplementationStageRuntime } from './contracts';

export type RuntimeStreamConnectionState =
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

export interface RuntimeStreamLike {
  addEventListener(type: string, listener: (event: Event) => void): void;
  close(): void;
}

interface RuntimeSnapshotPayload {
  runtimeByStageId?: Record<string, ImplementationStageRuntime>;
}

interface RuntimeStagePayload {
  stageId?: string;
  runtime?: ImplementationStageRuntime;
}

interface ReviewReadyPayload {
  stageId?: string;
  stageTitle?: string;
}

export interface RuntimeStreamControllerOptions {
  stackId: string;
  onSnapshot: (
    runtimeByStageId: Record<string, ImplementationStageRuntime>,
  ) => void;
  onStageRuntime: (
    stageId: string,
    runtime: ImplementationStageRuntime,
  ) => void;
  onReviewReady: (stageId: string, stageTitle: string) => void;
  onConnectionStateChange: (
    state: RuntimeStreamConnectionState,
    reconnectAttempt: number,
  ) => void;
  baseRetryMs?: number;
  maxRetryMs?: number;
  maxReconnectAttempts?: number;
  createEventSource?: (url: string) => RuntimeStreamLike;
  setTimer?: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

function parseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function createRuntimeStreamController(
  options: RuntimeStreamControllerOptions,
): {
  start: () => void;
  stop: () => void;
} {
  const baseRetryMs = options.baseRetryMs ?? 1_000;
  const maxRetryMs = options.maxRetryMs ?? 15_000;
  const maxReconnectAttempts = options.maxReconnectAttempts ?? 8;
  const createEventSource =
    options.createEventSource ??
    ((url: string) => new EventSource(url) as unknown as RuntimeStreamLike);
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;

  let disposed = false;
  let reconnectAttempt = 0;
  let stream: RuntimeStreamLike | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function closeStream(): void {
    stream?.close();
    stream = null;
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer !== null) {
      clearTimer(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function reconnectWithBackoff(): void {
    if (disposed) {
      return;
    }

    clearReconnectTimer();
    closeStream();

    const nextAttempt = reconnectAttempt + 1;
    if (nextAttempt > maxReconnectAttempts) {
      options.onConnectionStateChange('disconnected', reconnectAttempt);
      return;
    }

    reconnectAttempt = nextAttempt;
    options.onConnectionStateChange('reconnecting', reconnectAttempt);
    const delayMs = Math.min(baseRetryMs * 2 ** (nextAttempt - 1), maxRetryMs);

    reconnectTimer = setTimer(() => {
      reconnectTimer = null;
      connect();
    }, delayMs);
  }

  function connect(): void {
    if (disposed) {
      return;
    }

    clearReconnectTimer();
    closeStream();

    const nextStream = createEventSource(
      `/api/stacks/${options.stackId}/runtime/stream`,
    );
    stream = nextStream;

    nextStream.addEventListener('open', () => {
      if (disposed || stream !== nextStream) {
        return;
      }

      reconnectAttempt = 0;
      options.onConnectionStateChange('connected', reconnectAttempt);
    });

    nextStream.addEventListener('snapshot', (event) => {
      const payload = parseJson<RuntimeSnapshotPayload>(
        (event as MessageEvent<string>).data,
      );
      if (!payload?.runtimeByStageId) {
        return;
      }

      options.onSnapshot(payload.runtimeByStageId);
    });

    nextStream.addEventListener('stage-runtime', (event) => {
      const payload = parseJson<RuntimeStagePayload>(
        (event as MessageEvent<string>).data,
      );
      if (!payload?.stageId || !payload.runtime) {
        return;
      }

      options.onStageRuntime(payload.stageId, payload.runtime);
    });

    nextStream.addEventListener('review-ready', (event) => {
      const payload = parseJson<ReviewReadyPayload>(
        (event as MessageEvent<string>).data,
      );
      if (!payload?.stageId) {
        return;
      }

      options.onReviewReady(payload.stageId, payload.stageTitle ?? 'Stage');
    });

    nextStream.addEventListener('error', () => {
      if (disposed || stream !== nextStream) {
        return;
      }

      reconnectWithBackoff();
    });
  }

  function start(): void {
    disposed = false;
    connect();
  }

  function stop(): void {
    disposed = true;
    clearReconnectTimer();
    closeStream();
  }

  return {
    start,
    stop,
  };
}
