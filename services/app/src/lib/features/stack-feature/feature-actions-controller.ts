import {
  canMergeDownStack,
  canStartFeature as canStartFeatureWithRuntime,
  formatMergeDownSuccessMessage,
  formatStartSuccessMessage,
  formatSyncSuccessMessage,
  startButtonLabel as startButtonLabelWithRuntime,
} from './behavior';
import {
  approveStageRequest,
  mergeDownStackRequest,
  mergeStageRequest,
  startFeatureRequest,
  syncStackRequest,
} from './api-client';
import type {
  FeatureActionState,
  ImplementationStageRuntime,
  ImplementationStatusResponse,
  MergeDownStackResponse,
  StartResponse,
  SyncStackResponse,
} from './contracts';
import type { StackViewModel } from '$lib/types/stack';

export interface FeatureActionStateGroup {
  startAction: FeatureActionState;
  syncAction: FeatureActionState;
  mergeDownAction: FeatureActionState;
}

export interface FeatureActionsController {
  canSyncStack: () => boolean;
  canMergeDown: () => boolean;
  canStartFeature: () => boolean;
  startButtonLabel: () => string;
  startFeature: () => Promise<void>;
  syncStack: () => Promise<void>;
  mergeDownStack: () => Promise<void>;
  approveStage: (stageId: string) => Promise<void>;
  mergeStage: (stageId: string) => Promise<void>;
}

interface FeatureActionRequests {
  approveStageRequest: (
    stackId: string,
    stageId: string,
  ) => Promise<ImplementationStatusResponse>;
  mergeStageRequest: (
    stackId: string,
    stageId: string,
  ) => Promise<ImplementationStatusResponse>;
  startFeatureRequest: (stackId: string) => Promise<StartResponse>;
  syncStackRequest: (stackId: string) => Promise<SyncStackResponse>;
  mergeDownStackRequest: (stackId: string) => Promise<MergeDownStackResponse>;
}

function createIdleActionState(): FeatureActionState {
  return {
    pending: false,
    error: null,
    success: null,
  };
}

export function createInitialFeatureActionStateGroup(): FeatureActionStateGroup {
  return {
    startAction: createIdleActionState(),
    syncAction: createIdleActionState(),
    mergeDownAction: createIdleActionState(),
  };
}

function fallbackMessage(error: unknown, message: string): string {
  if (error instanceof Error) {
    return error.message;
  }

  return message;
}

export function createFeatureActionsController(input: {
  getStack: () => StackViewModel;
  getImplementationRuntimeByStageId: () => Record<
    string,
    ImplementationStageRuntime
  >;
  setImplementationRuntimeByStageId: (
    next: Record<string, ImplementationStageRuntime>,
  ) => void;
  getActionState: () => FeatureActionStateGroup;
  setActionState: (nextState: FeatureActionStateGroup) => void;
  invalidate: () => Promise<void>;
  confirmMergeDown: (message: string) => boolean;
  requests?: Partial<FeatureActionRequests>;
}): FeatureActionsController {
  const requests: FeatureActionRequests = {
    approveStageRequest,
    mergeStageRequest,
    startFeatureRequest,
    syncStackRequest,
    mergeDownStackRequest,
    ...input.requests,
  };

  function hasOutOfSyncStages(): boolean {
    const stack = input.getStack();
    return (stack.stages ?? []).some(
      (stage) => stack.stageSyncById?.[stage.id]?.isOutOfSync,
    );
  }

  function canSyncStack(): boolean {
    const state = input.getActionState();
    return (
      hasOutOfSyncStages() &&
      !state.syncAction.pending &&
      !state.startAction.pending &&
      !state.mergeDownAction.pending
    );
  }

  function canMergeDown(): boolean {
    const state = input.getActionState();
    const stack = input.getStack();
    return (
      canMergeDownStack({
        stages: stack.stages ?? [],
        implementationRuntimeByStageId:
          input.getImplementationRuntimeByStageId(),
      }) &&
      !state.mergeDownAction.pending &&
      !state.syncAction.pending &&
      !state.startAction.pending
    );
  }

  function canStartFeature(): boolean {
    const state = input.getActionState();
    const stack = input.getStack();
    return (
      canStartFeatureWithRuntime({
        stages: stack.stages ?? [],
        implementationRuntimeByStageId:
          input.getImplementationRuntimeByStageId(),
        startPending: state.startAction.pending,
      }) &&
      !state.syncAction.pending &&
      !state.mergeDownAction.pending
    );
  }

  function startButtonLabel(): string {
    const state = input.getActionState();
    const stack = input.getStack();
    return startButtonLabelWithRuntime({
      stages: stack.stages ?? [],
      implementationRuntimeByStageId: input.getImplementationRuntimeByStageId(),
      startPending: state.startAction.pending,
    });
  }

  async function approveStage(stageId: string): Promise<void> {
    const state = input.getActionState();
    if (
      state.mergeDownAction.pending ||
      state.syncAction.pending ||
      state.startAction.pending
    ) {
      return;
    }

    input.setActionState({
      ...state,
      mergeDownAction: {
        ...state.mergeDownAction,
        error: null,
        success: null,
      },
    });

    try {
      const stack = input.getStack();
      const runtime = await requests.approveStageRequest(stack.id, stageId);
      input.setImplementationRuntimeByStageId({
        ...input.getImplementationRuntimeByStageId(),
        [stageId]: runtime,
      });

      const next = input.getActionState();
      input.setActionState({
        ...next,
        mergeDownAction: {
          ...next.mergeDownAction,
          error: null,
          success: 'Stage approved for merge.',
        },
      });
      await input.invalidate();
    } catch (error) {
      const next = input.getActionState();
      input.setActionState({
        ...next,
        mergeDownAction: {
          ...next.mergeDownAction,
          error: fallbackMessage(error, 'Unable to approve stage for merge.'),
        },
      });
    }
  }

  async function mergeStage(stageId: string): Promise<void> {
    const state = input.getActionState();
    if (
      state.mergeDownAction.pending ||
      state.syncAction.pending ||
      state.startAction.pending
    ) {
      return;
    }

    input.setActionState({
      ...state,
      mergeDownAction: {
        ...state.mergeDownAction,
        error: null,
        success: null,
      },
    });

    try {
      const stack = input.getStack();
      const runtime = await requests.mergeStageRequest(stack.id, stageId);
      input.setImplementationRuntimeByStageId({
        ...input.getImplementationRuntimeByStageId(),
        [stageId]: runtime,
      });

      const next = input.getActionState();
      input.setActionState({
        ...next,
        mergeDownAction: {
          ...next.mergeDownAction,
          error: null,
          success: 'Stage merged with squash.',
        },
      });
      await input.invalidate();
    } catch (error) {
      const next = input.getActionState();
      input.setActionState({
        ...next,
        mergeDownAction: {
          ...next.mergeDownAction,
          error: fallbackMessage(error, 'Unable to merge stage PR.'),
        },
      });
    }
  }

  async function startFeature(): Promise<void> {
    if (!canStartFeature()) {
      return;
    }

    const state = input.getActionState();
    input.setActionState({
      ...state,
      startAction: {
        pending: true,
        error: null,
        success: null,
      },
      syncAction: {
        ...state.syncAction,
        error: null,
      },
    });

    try {
      const stack = input.getStack();
      const response = await requests.startFeatureRequest(stack.id);
      const next = input.getActionState();
      input.setActionState({
        ...next,
        startAction: {
          pending: false,
          error: null,
          success: formatStartSuccessMessage(response),
        },
      });
      await input.invalidate();
    } catch (error) {
      const next = input.getActionState();
      input.setActionState({
        ...next,
        startAction: {
          pending: false,
          error: fallbackMessage(error, 'Unable to start feature.'),
          success: null,
        },
      });
    }
  }

  async function syncStack(): Promise<void> {
    if (!canSyncStack()) {
      return;
    }

    const state = input.getActionState();
    input.setActionState({
      ...state,
      syncAction: {
        pending: true,
        error: null,
        success: null,
      },
      startAction: {
        ...state.startAction,
        error: null,
      },
      mergeDownAction: {
        ...state.mergeDownAction,
        error: null,
      },
    });

    try {
      const stack = input.getStack();
      const response = await requests.syncStackRequest(stack.id);
      const next = input.getActionState();
      input.setActionState({
        ...next,
        syncAction: {
          pending: false,
          error: null,
          success: formatSyncSuccessMessage(response),
        },
      });
      await input.invalidate();
    } catch (error) {
      const next = input.getActionState();
      input.setActionState({
        ...next,
        syncAction: {
          pending: false,
          error: fallbackMessage(error, 'Unable to sync stack.'),
          success: null,
        },
      });
    }
  }

  async function mergeDownStack(): Promise<void> {
    if (!canMergeDown()) {
      return;
    }

    const stack = input.getStack();
    const stageCount = (stack.stages ?? []).length;
    const confirmed = input.confirmMergeDown(
      `Merge down ${stageCount} stage PR${stageCount === 1 ? '' : 's'} into the default branch using squash? This updates and merges each PR from bottom to top.`,
    );
    if (!confirmed) {
      return;
    }

    const state = input.getActionState();
    input.setActionState({
      ...state,
      mergeDownAction: {
        pending: true,
        error: null,
        success: null,
      },
      startAction: {
        ...state.startAction,
        error: null,
      },
      syncAction: {
        ...state.syncAction,
        error: null,
      },
    });

    try {
      const response = await requests.mergeDownStackRequest(stack.id);
      const next = input.getActionState();
      input.setActionState({
        ...next,
        mergeDownAction: {
          pending: false,
          error: null,
          success: formatMergeDownSuccessMessage(response),
        },
      });
      await input.invalidate();
    } catch (error) {
      const next = input.getActionState();
      input.setActionState({
        ...next,
        mergeDownAction: {
          pending: false,
          error: fallbackMessage(error, 'Unable to merge down stack.'),
          success: null,
        },
      });
    }
  }

  return {
    canSyncStack,
    canMergeDown,
    canStartFeature,
    startButtonLabel,
    startFeature,
    syncStack,
    mergeDownStack,
    approveStage,
    mergeStage,
  };
}
