import { describe, expect, it } from 'vitest';

import type { ReviewSessionResponse } from './contracts';
import {
  createInitialReviewSessionState,
  createReviewSessionController,
} from './review-session-controller';

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolver: (value: T) => void = () => {
    throw new Error('Deferred resolver not initialized.');
  };
  const promise = new Promise<T>((resolve) => {
    resolver = resolve;
  });

  return {
    promise,
    resolve: resolver,
  };
}

function createSessionResponse(id: string): ReviewSessionResponse {
  return {
    session: {
      id: `session-${id}`,
      stackId: 'stack-1',
      stageId: id,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    messages: [],
    awaitingResponse: false,
  };
}

describe('review session controller', () => {
  it('loads and applies review session state', async () => {
    const states: ReturnType<typeof createInitialReviewSessionState>[] = [];
    const controller = createReviewSessionController({
      loadSession: async (_stackId, stageId) => createSessionResponse(stageId),
      setState: (nextState) => {
        states.push(nextState);
      },
    });

    await controller.open({ stackId: 'stack-1', stageId: 'stage-1' });

    expect(states).toHaveLength(2);
    expect(states[0]).toEqual({
      selectedReviewStageId: 'stage-1',
      reviewLoading: true,
      reviewError: null,
      reviewSession: null,
    });
    expect(states[1]).toEqual({
      selectedReviewStageId: 'stage-1',
      reviewLoading: false,
      reviewError: null,
      reviewSession: createSessionResponse('stage-1'),
    });
  });

  it('ignores stale responses when a newer open request wins', async () => {
    const states: ReturnType<typeof createInitialReviewSessionState>[] = [];

    const firstRequest = createDeferred<ReviewSessionResponse>();

    const controller = createReviewSessionController({
      loadSession: async (_stackId, stageId) => {
        if (stageId === 'stage-1') {
          return firstRequest.promise;
        }

        return createSessionResponse(stageId);
      },
      setState: (nextState) => {
        states.push(nextState);
      },
    });

    const firstOpen = controller.open({
      stackId: 'stack-1',
      stageId: 'stage-1',
    });
    await controller.open({ stackId: 'stack-1', stageId: 'stage-2' });
    firstRequest.resolve(createSessionResponse('stage-1'));
    await firstOpen;

    expect(states.at(-1)).toEqual({
      selectedReviewStageId: 'stage-2',
      reviewLoading: false,
      reviewError: null,
      reviewSession: createSessionResponse('stage-2'),
    });
  });

  it('resets state on close and cancels pending request updates', async () => {
    const states: ReturnType<typeof createInitialReviewSessionState>[] = [];

    const pendingRequest = createDeferred<ReviewSessionResponse>();
    const controller = createReviewSessionController({
      loadSession: async () => pendingRequest.promise,
      setState: (nextState) => {
        states.push(nextState);
      },
    });

    const openPromise = controller.open({
      stackId: 'stack-1',
      stageId: 'stage-1',
    });
    controller.close();
    pendingRequest.resolve(createSessionResponse('stage-1'));
    await openPromise;

    expect(states.at(-1)).toEqual(createInitialReviewSessionState());
  });
});
