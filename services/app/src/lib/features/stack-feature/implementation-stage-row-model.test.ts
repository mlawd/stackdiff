import { describe, expect, it } from 'vitest';

import type { FeatureStage } from '$lib/types/stack';

import { toImplementationStageRowModel } from './implementation-stage-row-model';

function createStage(input?: Partial<FeatureStage>): FeatureStage {
  return {
    id: 'stage-1',
    title: 'Stage 1',
    status: 'review',
    ...input,
  };
}

describe('toImplementationStageRowModel', () => {
  it('uses runtime values over stage fallback values', () => {
    const model = toImplementationStageRowModel({
      stage: createStage({
        status: 'not-started',
      }),
      runtime: {
        stageStatus: 'approved',
        runtimeState: 'idle',
        todoCompleted: 1,
        todoTotal: 1,
        pullRequest: {
          number: 15,
          title: 'Stage PR',
          state: 'OPEN',
          isDraft: false,
          url: 'https://example.com/pr/15',
          updatedAt: '2026-01-01T00:00:00.000Z',
          checks: {
            completed: 4,
            total: 4,
            passed: 4,
            failed: 0,
            items: [],
          },
        },
      },
      syncMetadata: {
        isOutOfSync: true,
        behindBy: 2,
        baseRef: 'main',
      },
    });

    expect(model.stageStatus).toBe('approved');
    expect(model.canOpenReview).toBe(true);
    expect(model.canApprove).toBe(false);
    expect(model.canMerge).toBe(true);
    expect(model.checksSummaryLabel).toBe('4/4');
    expect(model.outOfSyncTitle).toBe('Behind main by 2 commits');
  });

  it('marks stage working when in-progress runtime is busy', () => {
    const model = toImplementationStageRowModel({
      stage: createStage({ status: 'in-progress' }),
      runtime: {
        stageStatus: 'in-progress',
        runtimeState: 'busy',
        todoCompleted: 1,
        todoTotal: 3,
      },
      syncMetadata: {
        isOutOfSync: false,
        behindBy: 0,
      },
    });

    expect(model.stageWorking).toBe(true);
    expect(model.canOpenReview).toBe(false);
    expect(model.canMerge).toBe(false);
  });

  it('disables review controls when stage is done', () => {
    const model = toImplementationStageRowModel({
      stage: createStage({
        status: 'done',
        pullRequest: {
          number: 99,
          title: 'Merged PR',
          state: 'MERGED',
          isDraft: false,
          url: 'https://example.com/pr/99',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
      syncMetadata: {
        isOutOfSync: false,
        behindBy: 1,
      },
    });

    expect(model.canOpenReview).toBe(false);
    expect(model.canApprove).toBe(false);
    expect(model.canMerge).toBe(false);
    expect(model.outOfSyncTitle).toBe('Behind base by 1 commit');
  });
});
