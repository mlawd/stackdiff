import { describe, expect, it } from 'vitest';

import {
  canStartFeature,
  formatStartSuccessMessage,
  formatSyncSuccessMessage,
  implementationStageColor,
  implementationStageLabel,
  shouldInvalidateFromRuntimeUpdates,
  stageIdsTransitionedToReviewReady,
  stageIdsForRuntimePolling,
  startButtonLabel,
  stagePullRequest,
  stageStatus,
} from './behavior';
import type {
  ImplementationStageRuntime,
  StartResponse,
  SyncStackResponse,
} from './contracts';

describe('feature page behavior contracts', () => {
  it('maps stage statuses to labels', () => {
    expect(implementationStageLabel('not-started')).toBe('Not started');
    expect(implementationStageLabel('in-progress')).toBe('In progress');
    expect(implementationStageLabel('review-ready')).toBe('Review ready');
    expect(implementationStageLabel('done')).toBe('Done');

    expect(implementationStageColor('not-started')).toBe('gray');
    expect(implementationStageColor('in-progress')).toBe('yellow');
    expect(implementationStageColor('review-ready')).toBe('purple');
    expect(implementationStageColor('done')).toBe('green');
  });

  it('resolves runtime stage status and pull request with fallback values', () => {
    const runtimeByStageId: Record<string, ImplementationStageRuntime> = {
      '1': {
        stageStatus: 'review-ready',
        runtimeState: 'idle',
        todoCompleted: 5,
        todoTotal: 5,
        pullRequest: {
          number: 12,
          title: 'Ship stage 1',
          state: 'OPEN',
          isDraft: false,
          url: 'https://example.com',
          updatedAt: '2026-02-20T00:00:00.000Z',
        },
      },
    };

    expect(stageStatus(runtimeByStageId, '1', 'in-progress')).toBe(
      'review-ready',
    );
    expect(stageStatus(runtimeByStageId, 'missing', 'in-progress')).toBe(
      'in-progress',
    );
    expect(stagePullRequest(runtimeByStageId, '1', undefined)?.number).toBe(12);
    expect(
      stagePullRequest(runtimeByStageId, 'missing', undefined),
    ).toBeUndefined();
  });

  it('keeps start action gating parity with page behavior', () => {
    const stages = [
      { id: 's-1', title: 'Stage 1', status: 'not-started' },
      { id: 's-2', title: 'Stage 2', status: 'done' },
    ] as const;

    expect(
      canStartFeature({
        stages: [...stages],
        implementationRuntimeByStageId: {},
        startPending: false,
      }),
    ).toBe(true);
    expect(
      startButtonLabel({
        stages: [...stages],
        implementationRuntimeByStageId: {},
        startPending: false,
      }),
    ).toBe('Next stage');

    expect(
      canStartFeature({
        stages: [...stages],
        implementationRuntimeByStageId: {},
        startPending: true,
      }),
    ).toBe(false);
    expect(
      startButtonLabel({
        stages: [...stages],
        implementationRuntimeByStageId: {},
        startPending: true,
      }),
    ).toBe('Starting...');

    expect(
      canStartFeature({
        stages: [...stages],
        implementationRuntimeByStageId: {
          's-1': {
            stageStatus: 'in-progress',
            runtimeState: 'busy',
            todoCompleted: 1,
            todoTotal: 3,
          },
        },
        startPending: false,
      }),
    ).toBe(false);
    expect(
      startButtonLabel({
        stages: [...stages],
        implementationRuntimeByStageId: {
          's-1': {
            stageStatus: 'in-progress',
            runtimeState: 'busy',
            todoCompleted: 1,
            todoTotal: 3,
          },
        },
        startPending: false,
      }),
    ).toBe('Start feature');
  });

  it('selects in-progress and all review-ready stages for polling', () => {
    const stages = [
      { id: 's-1', title: 'Stage 1', status: 'in-progress' },
      {
        id: 's-2',
        title: 'Stage 2',
        status: 'review-ready',
      },
      {
        id: 's-3',
        title: 'Stage 3',
        status: 'review-ready',
        pullRequest: {
          number: 33,
          title: 'Review ready stage',
          state: 'OPEN',
          isDraft: false,
          url: 'https://example.com/33',
          updatedAt: '2026-02-20T00:00:00.000Z',
        },
      },
      {
        id: 's-4',
        title: 'Stage 4',
        status: 'review-ready',
        pullRequest: {
          number: 34,
          title: 'Closed stage PR',
          state: 'CLOSED',
          isDraft: false,
          url: 'https://example.com/34',
          updatedAt: '2026-02-20T00:00:00.000Z',
        },
      },
      { id: 's-5', title: 'Stage 5', status: 'done' },
    ] as const;

    expect(
      stageIdsForRuntimePolling({
        stages: [...stages],
        implementationRuntimeByStageId: {},
      }),
    ).toEqual(['s-1', 's-2', 's-3', 's-4']);
  });

  it('invalidates when runtime promotes stage or attaches pull request', () => {
    const stages = [
      { id: 's-1', title: 'Stage 1', status: 'in-progress' },
      { id: 's-2', title: 'Stage 2', status: 'review-ready' },
    ] as const;

    expect(
      shouldInvalidateFromRuntimeUpdates({
        stages: [...stages],
        updates: [
          [
            's-1',
            {
              stageStatus: 'review-ready',
              runtimeState: 'idle',
              todoCompleted: 4,
              todoTotal: 4,
            },
          ],
        ],
      }),
    ).toBe(true);

    expect(
      shouldInvalidateFromRuntimeUpdates({
        stages: [...stages],
        updates: [
          [
            's-2',
            {
              stageStatus: 'review-ready',
              runtimeState: 'idle',
              todoCompleted: 4,
              todoTotal: 4,
              pullRequest: {
                number: 44,
                title: 'Stage PR',
                state: 'OPEN',
                isDraft: false,
                url: 'https://example.com/44',
                updatedAt: '2026-02-20T00:00:00.000Z',
              },
            },
          ],
        ],
      }),
    ).toBe(true);

    expect(
      shouldInvalidateFromRuntimeUpdates({
        stages: [...stages],
        updates: [
          [
            's-2',
            {
              stageStatus: 'review-ready',
              runtimeState: 'idle',
              todoCompleted: 4,
              todoTotal: 4,
            },
          ],
        ],
      }),
    ).toBe(false);
  });

  it('formats start and sync success messages', () => {
    const startResponse: StartResponse = {
      stageNumber: 2,
      stageTitle: 'Implement auth',
      startedNow: true,
      reusedWorktree: true,
      reusedSession: false,
    };
    const syncResponse: SyncStackResponse = {
      result: {
        totalStages: 3,
        rebasedStages: 2,
        skippedStages: 1,
      },
    };

    expect(formatStartSuccessMessage(startResponse)).toBe(
      'Started stage 2: Implement auth. Reused existing worktree. Created implementation session.',
    );
    expect(formatSyncSuccessMessage(syncResponse)).toBe(
      'Stack sync complete. Rebases: 2. Skipped: 1.',
    );
  });

  it('detects in-progress to review-ready runtime transitions', () => {
    const stages = [
      { id: 's-1', title: 'Stage 1', status: 'in-progress' },
      { id: 's-2', title: 'Stage 2', status: 'review-ready' },
      { id: 's-3', title: 'Stage 3', status: 'not-started' },
    ] as const;

    expect(
      stageIdsTransitionedToReviewReady({
        stages: [...stages],
        implementationRuntimeByStageId: {},
        updates: [
          [
            's-1',
            {
              stageStatus: 'review-ready',
              runtimeState: 'idle',
              todoCompleted: 4,
              todoTotal: 4,
            },
          ],
          [
            's-2',
            {
              stageStatus: 'review-ready',
              runtimeState: 'idle',
              todoCompleted: 4,
              todoTotal: 4,
            },
          ],
          [
            's-3',
            {
              stageStatus: 'review-ready',
              runtimeState: 'idle',
              todoCompleted: 1,
              todoTotal: 1,
            },
          ],
          [
            'missing',
            {
              stageStatus: 'review-ready',
              runtimeState: 'idle',
              todoCompleted: 1,
              todoTotal: 1,
            },
          ],
        ],
      }),
    ).toEqual(['s-1']);
  });

  it('uses runtime fallback status when detecting review-ready transitions', () => {
    const stages = [
      { id: 's-1', title: 'Stage 1', status: 'not-started' },
    ] as const;

    expect(
      stageIdsTransitionedToReviewReady({
        stages: [...stages],
        implementationRuntimeByStageId: {
          's-1': {
            stageStatus: 'in-progress',
            runtimeState: 'busy',
            todoCompleted: 1,
            todoTotal: 3,
          },
        },
        updates: [
          [
            's-1',
            {
              stageStatus: 'review-ready',
              runtimeState: 'idle',
              todoCompleted: 3,
              todoTotal: 3,
            },
          ],
        ],
      }),
    ).toEqual(['s-1']);
  });
});
