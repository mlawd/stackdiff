import { describe, expect, it, vi } from 'vitest';

import type { StackViewModel } from '$lib/types/stack';

import {
  createFeatureActionsController,
  createInitialFeatureActionStateGroup,
  type FeatureActionStateGroup,
} from './feature-actions-controller';
import type { ImplementationStageRuntime } from './contracts';

function createStack(): StackViewModel {
  return {
    id: 'stack-1',
    projectId: 'repo-1',
    name: 'Feature',
    type: 'feature',
    status: 'started',
    stages: [
      {
        id: 'stage-1',
        title: 'Stage 1',
        status: 'not-started',
      },
    ],
    stageSyncById: {
      'stage-1': {
        isOutOfSync: true,
        behindBy: 1,
      },
    },
    repositoryAbsolutePath: '/repo',
    currentBranch: 'main',
    syncState: 'clean',
    workingTreeDirty: false,
  };
}

describe('feature actions controller', () => {
  it('derives action gating from stack/runtime/action state', () => {
    const stack = createStack();
    let actionState = createInitialFeatureActionStateGroup();
    let runtimeByStageId: Record<string, ImplementationStageRuntime> = {};

    const controller = createFeatureActionsController({
      getStack: () => stack,
      getImplementationRuntimeByStageId: () => runtimeByStageId,
      setImplementationRuntimeByStageId: (next) => {
        runtimeByStageId = next;
      },
      getActionState: () => actionState,
      setActionState: (nextState) => {
        actionState = nextState;
      },
      invalidate: async () => {
        // noop
      },
      confirmMergeDown: () => true,
    });

    expect(controller.canStartFeature()).toBe(true);
    expect(controller.canSyncStack()).toBe(true);
    expect(controller.canMergeDown()).toBe(false);

    actionState = {
      ...actionState,
      startAction: {
        ...actionState.startAction,
        pending: true,
      },
    };
    expect(controller.canStartFeature()).toBe(false);
    expect(controller.canSyncStack()).toBe(false);
  });

  it('runs start feature flow and writes success state', async () => {
    const stack = createStack();
    let actionState = createInitialFeatureActionStateGroup();
    let runtimeByStageId: Record<string, ImplementationStageRuntime> = {};
    const invalidate = vi.fn(async () => undefined);

    const controller = createFeatureActionsController({
      getStack: () => stack,
      getImplementationRuntimeByStageId: () => runtimeByStageId,
      setImplementationRuntimeByStageId: (next) => {
        runtimeByStageId = next;
      },
      getActionState: () => actionState,
      setActionState: (nextState) => {
        actionState = nextState;
      },
      invalidate,
      confirmMergeDown: () => true,
      requests: {
        startFeatureRequest: async () => ({
          stageNumber: 1,
          stageTitle: 'Stage 1',
          startedNow: true,
          reusedWorktree: false,
          reusedSession: false,
        }),
      },
    });

    await controller.startFeature();

    expect(actionState.startAction.pending).toBe(false);
    expect(actionState.startAction.error).toBeNull();
    expect(actionState.startAction.success).toContain(
      'Started stage 1: Stage 1',
    );
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('runs approve stage flow and updates runtime map', async () => {
    const stack = createStack();
    let actionState: FeatureActionStateGroup =
      createInitialFeatureActionStateGroup();
    let runtimeByStageId: Record<string, ImplementationStageRuntime> = {};
    const invalidate = vi.fn(async () => undefined);

    const controller = createFeatureActionsController({
      getStack: () => stack,
      getImplementationRuntimeByStageId: () => runtimeByStageId,
      setImplementationRuntimeByStageId: (next) => {
        runtimeByStageId = next;
      },
      getActionState: () => actionState,
      setActionState: (nextState) => {
        actionState = nextState;
      },
      invalidate,
      confirmMergeDown: () => true,
      requests: {
        approveStageRequest: async () => ({
          stageStatus: 'approved',
          runtimeState: 'idle',
          todoCompleted: 1,
          todoTotal: 1,
        }),
      },
    });

    await controller.approveStage('stage-1');

    expect(runtimeByStageId['stage-1']?.stageStatus).toBe('approved');
    expect(actionState.mergeDownAction.success).toBe(
      'Stage approved for merge.',
    );
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});
