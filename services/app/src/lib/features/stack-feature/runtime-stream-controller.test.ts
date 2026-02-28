import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRuntimeStreamController } from './runtime-stream-controller';

class FakeEventSource {
  private listeners = new Map<string, Array<(event: Event) => void>>();

  addEventListener(type: string, listener: (event: Event) => void): void {
    const existing = this.listeners.get(type) ?? [];
    this.listeners.set(type, [...existing, listener]);
  }

  emit(type: string, payload?: unknown): void {
    const message = {
      data: payload === undefined ? '' : JSON.stringify(payload),
    } as MessageEvent<string>;
    const listeners = this.listeners.get(type) ?? [];
    for (const listener of listeners) {
      listener(message as unknown as Event);
    }
  }

  close(): void {
    // noop for tests
  }
}

describe('createRuntimeStreamController', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('forwards snapshot, stage-runtime and review-ready payloads', () => {
    const streams: FakeEventSource[] = [];
    const snapshots: Array<Record<string, unknown>> = [];
    const stageRuntimeEvents: Array<{ stageId: string; runtimeState: string }> =
      [];
    const reviewReadyEvents: Array<{ stageId: string; title: string }> = [];
    const connectionStates: Array<{ state: string; attempt: number }> = [];

    const controller = createRuntimeStreamController({
      stackId: 'stack-1',
      createEventSource: () => {
        const stream = new FakeEventSource();
        streams.push(stream);
        return stream;
      },
      onSnapshot: (runtimeByStageId) => {
        snapshots.push(runtimeByStageId as Record<string, unknown>);
      },
      onStageRuntime: (stageId, runtime) => {
        stageRuntimeEvents.push({
          stageId,
          runtimeState: runtime.runtimeState,
        });
      },
      onReviewReady: (stageId, stageTitle) => {
        reviewReadyEvents.push({ stageId, title: stageTitle });
      },
      onConnectionStateChange: (state, reconnectAttempt) => {
        connectionStates.push({ state, attempt: reconnectAttempt });
      },
    });

    controller.start();
    const stream = streams[0] as FakeEventSource;
    stream.emit('open');
    stream.emit('snapshot', {
      runtimeByStageId: {
        'stage-1': {
          stageStatus: 'in-progress',
          runtimeState: 'busy',
          todoCompleted: 1,
          todoTotal: 2,
        },
      },
    });
    stream.emit('stage-runtime', {
      stageId: 'stage-2',
      runtime: {
        stageStatus: 'review',
        runtimeState: 'idle',
        todoCompleted: 2,
        todoTotal: 2,
      },
    });
    stream.emit('review-ready', {
      stageId: 'stage-2',
      stageTitle: 'Stage 2',
    });

    expect(connectionStates).toEqual([{ state: 'connected', attempt: 0 }]);
    expect(snapshots).toHaveLength(1);
    expect(stageRuntimeEvents).toEqual([
      { stageId: 'stage-2', runtimeState: 'idle' },
    ]);
    expect(reviewReadyEvents).toEqual([
      { stageId: 'stage-2', title: 'Stage 2' },
    ]);
  });

  it('retries with backoff and eventually disconnects after max attempts', () => {
    vi.useFakeTimers();

    const streams: FakeEventSource[] = [];
    const connectionStates: Array<{ state: string; attempt: number }> = [];

    const controller = createRuntimeStreamController({
      stackId: 'stack-1',
      baseRetryMs: 10,
      maxRetryMs: 20,
      maxReconnectAttempts: 2,
      createEventSource: () => {
        const stream = new FakeEventSource();
        streams.push(stream);
        return stream;
      },
      onSnapshot: () => {
        // noop
      },
      onStageRuntime: () => {
        // noop
      },
      onReviewReady: () => {
        // noop
      },
      onConnectionStateChange: (state, reconnectAttempt) => {
        connectionStates.push({ state, attempt: reconnectAttempt });
      },
    });

    controller.start();
    (streams[0] as FakeEventSource).emit('error');
    vi.advanceTimersByTime(10);
    (streams[1] as FakeEventSource).emit('error');
    vi.advanceTimersByTime(20);
    (streams[2] as FakeEventSource).emit('error');

    expect(connectionStates).toEqual([
      { state: 'reconnecting', attempt: 1 },
      { state: 'reconnecting', attempt: 2 },
      { state: 'disconnected', attempt: 2 },
    ]);
  });
});
