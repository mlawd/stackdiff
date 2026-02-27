import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/implementation-status-service', () => ({
  reconcileImplementationStageStatus: vi.fn(),
}));

vi.mock('$lib/server/stack-store', () => ({
  getStackById: vi.fn(),
}));

import { reconcileImplementationStageStatus } from '$lib/server/implementation-status-service';
import { handleStackRuntimeStreamRequest } from '$lib/server/stack-runtime-stream-service';
import { getStackById } from '$lib/server/stack-store';

const getStackByIdMock = vi.mocked(getStackById);
const reconcileImplementationStageStatusMock = vi.mocked(
  reconcileImplementationStageStatus,
);

async function collectStreamText(input: {
  response: Response;
  abortController: AbortController;
  runMs: number;
}): Promise<string> {
  const reader = input.response.body?.getReader();
  if (!reader) {
    throw new Error('Expected response body reader.');
  }

  const decoder = new TextDecoder();
  const readPromise = (async () => {
    let output = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      output += decoder.decode(value);
    }

    return output;
  })();

  await vi.advanceTimersByTimeAsync(input.runMs);
  input.abortController.abort();
  await vi.advanceTimersByTimeAsync(1);

  return readPromise;
}

async function drainStream(response: Response): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    return;
  }

  while (true) {
    const { done } = await reader.read();
    if (done) {
      return;
    }
  }
}

describe('stack-runtime-stream-service', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    getStackByIdMock.mockResolvedValue({
      id: 'stack-1',
      projectId: 'project-1',
      name: 'Stack',
      type: 'feature',
      status: 'started',
      stages: [{ id: 'stage-1', title: 'Stage 1', status: 'in-progress' }],
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('emits snapshot, stage runtime updates, and review-ready transitions', async () => {
    reconcileImplementationStageStatusMock
      .mockResolvedValueOnce({
        stageStatus: 'in-progress',
        runtimeState: 'busy',
        todoCompleted: 1,
        todoTotal: 3,
      })
      .mockResolvedValueOnce({
        stageStatus: 'review',
        runtimeState: 'idle',
        todoCompleted: 3,
        todoTotal: 3,
      });

    const abortController = new AbortController();
    const response = await handleStackRuntimeStreamRequest({
      stackId: 'stack-1',
      request: new Request('http://localhost', {
        signal: abortController.signal,
      }),
    });

    const body = await collectStreamText({
      response,
      abortController,
      runMs: 2200,
    });

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(body).toContain('event: snapshot');
    expect(body).toContain('event: stage-runtime');
    expect(body).toContain('"stageStatus":"in-progress"');
    expect(body).toContain('"stageStatus":"review"');
    expect(body).toContain('event: review-ready');
    expect(body).toContain('"stageTitle":"Stage 1"');
  });

  it('shares one poller across multiple subscribers for a stack', async () => {
    reconcileImplementationStageStatusMock.mockResolvedValue({
      stageStatus: 'in-progress',
      runtimeState: 'busy',
      todoCompleted: 1,
      todoTotal: 2,
    });

    const firstAbortController = new AbortController();
    const secondAbortController = new AbortController();

    const firstResponse = await handleStackRuntimeStreamRequest({
      stackId: 'stack-1',
      request: new Request('http://localhost', {
        signal: firstAbortController.signal,
      }),
    });

    const secondResponse = await handleStackRuntimeStreamRequest({
      stackId: 'stack-1',
      request: new Request('http://localhost', {
        signal: secondAbortController.signal,
      }),
    });

    await vi.advanceTimersByTimeAsync(2200);
    firstAbortController.abort();
    secondAbortController.abort();
    await vi.advanceTimersByTimeAsync(1);

    await Promise.all([
      drainStream(firstResponse),
      drainStream(secondResponse),
    ]);

    expect(reconcileImplementationStageStatusMock).toHaveBeenCalledTimes(2);
  });
});
