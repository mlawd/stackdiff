import { describe, expect, it } from 'vitest';

import {
  canStartFeature,
  hasInProgressStage,
  hasRemainingNotStartedStage,
  implementationStageClass,
  implementationStageLabel,
  startButtonLabel,
  stagePullRequest,
  stageStatus,
} from './behavior';
import type { ImplementationStageRuntime } from './contracts';

describe('feature page behavior contracts', () => {
  it('maps stage statuses to legacy labels and class names', () => {
    expect(implementationStageLabel('not-started')).toBe('Not started');
    expect(implementationStageLabel('in-progress')).toBe('In progress');
    expect(implementationStageLabel('review-ready')).toBe('Review ready');
    expect(implementationStageLabel('done')).toBe('Done');

    expect(implementationStageClass('not-started')).toBe('stacked-chip');
    expect(implementationStageClass('in-progress')).toBe(
      'stacked-chip stacked-chip-warning',
    );
    expect(implementationStageClass('review-ready')).toBe(
      'stacked-chip stacked-chip-review',
    );
    expect(implementationStageClass('done')).toBe(
      'stacked-chip stacked-chip-success',
    );
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

    expect(hasRemainingNotStartedStage([...stages], {})).toBe(true);
    expect(hasInProgressStage([...stages], {})).toBe(false);
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
});
