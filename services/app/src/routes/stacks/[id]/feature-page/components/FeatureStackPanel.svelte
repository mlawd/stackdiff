<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Button } from 'flowbite-svelte';

  import {
    canStartFeature as canStartFeatureWithRuntime,
    formatStartSuccessMessage,
    formatSyncSuccessMessage,
    shouldInvalidateFromRuntimeUpdates,
    stageIdsForRuntimePolling,
    startButtonLabel as startButtonLabelWithRuntime,
  } from '../behavior';
  import {
    getImplementationStatus,
    startFeatureRequest,
    syncStackRequest,
  } from '../api-client';
  import {
    fetchRuntimeUpdateEntries,
    mergeRuntimeByStageId,
  } from '../runtime-polling';
  import type {
    FeatureActionState,
    ImplementationStageRuntime,
  } from '../contracts';
  import type { StackViewModel } from '$lib/types/stack';
  import FeatureActionAlerts from './FeatureActionAlerts.svelte';
  import ImplementationStageList from './ImplementationStageList.svelte';
  import StackPullRequestCard from './StackPullRequestCard.svelte';

  let { stack }: { stack: StackViewModel } = $props();

  function createIdleActionState(): FeatureActionState {
    return {
      pending: false,
      error: null,
      success: null,
    };
  }

  let startAction = $state<FeatureActionState>(createIdleActionState());
  let syncAction = $state<FeatureActionState>(createIdleActionState());
  let implementationRuntimeByStageId = $state<
    Record<string, ImplementationStageRuntime>
  >({});
  let runtimeInvalidating = false;

  function hasOutOfSyncStages(): boolean {
    return (stack.stages ?? []).some((stage) => stack.stageSyncById?.[stage.id]?.isOutOfSync);
  }

  function canSyncStack(): boolean {
    return hasOutOfSyncStages() && !syncAction.pending && !startAction.pending;
  }

  function canStartFeature(): boolean {
    return (
      canStartFeatureWithRuntime({
        stages: stack.stages ?? [],
        implementationRuntimeByStageId,
        startPending: startAction.pending,
      }) && !syncAction.pending
    );
  }

  function startButtonLabel(): string {
    return startButtonLabelWithRuntime({
      stages: stack.stages ?? [],
      implementationRuntimeByStageId,
      startPending: startAction.pending,
    });
  }

  async function refreshImplementationRuntime(): Promise<void> {
    const stages = stack.stages ?? [];
    if (
      stageIdsForRuntimePolling({
        stages,
        implementationRuntimeByStageId,
      }).length === 0
    ) {
      return;
    }

    const entries = await fetchRuntimeUpdateEntries({
      stackId: stack.id,
      stages,
      implementationRuntimeByStageId,
      fetchStatus: getImplementationStatus,
    });

    implementationRuntimeByStageId = mergeRuntimeByStageId(
      implementationRuntimeByStageId,
      entries,
    );

    const shouldInvalidate = shouldInvalidateFromRuntimeUpdates({
      stages,
      updates: entries,
    });
    if (shouldInvalidate && !runtimeInvalidating) {
      runtimeInvalidating = true;
      try {
        await invalidateAll();
      } finally {
        runtimeInvalidating = false;
      }
    }
  }

  $effect(() => {
    const stageIds = stageIdsForRuntimePolling({
      stages: stack.stages ?? [],
      implementationRuntimeByStageId,
    });
    if (stageIds.length === 0) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      await refreshImplementationRuntime();
      if (cancelled) {
        return;
      }

      timer = setTimeout(poll, 2000);
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  });

  async function startFeature(): Promise<void> {
    if (!canStartFeature()) {
      return;
    }

    startAction = {
      pending: true,
      error: null,
      success: null,
    };
    syncAction = {
      ...syncAction,
      error: null,
    };

    try {
      const response = await startFeatureRequest(stack.id);
      startAction = {
        pending: false,
        error: null,
        success: formatStartSuccessMessage(response),
      };
      await invalidateAll();
    } catch (error) {
      startAction = {
        pending: false,
        error:
          error instanceof Error ? error.message : 'Unable to start feature.',
        success: null,
      };
    }
  }

  async function syncStack(): Promise<void> {
    if (!canSyncStack()) {
      return;
    }

    syncAction = {
      pending: true,
      error: null,
      success: null,
    };
    startAction = {
      ...startAction,
      error: null,
    };

    try {
      const response = await syncStackRequest(stack.id);
      syncAction = {
        pending: false,
        error: null,
        success: formatSyncSuccessMessage(response),
      };
      await invalidateAll();
    } catch (error) {
      syncAction = {
        pending: false,
        error: error instanceof Error ? error.message : 'Unable to sync stack.',
        success: null,
      };
    }
  }
</script>

<div class="space-y-4">
  <FeatureActionAlerts
    syncError={syncAction.error}
    syncSuccess={syncAction.success}
    startError={startAction.error}
    startSuccess={startAction.success}
  />

  <div>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p
        class="text-xs font-semibold uppercase tracking-[0.16em] stacked-subtle"
      >
        Implementation stages
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          color="alternative"
          onclick={syncStack}
          disabled={!canSyncStack()}
          loading={syncAction.pending}
        >
          Sync Stack
        </Button>
        <Button
          type="button"
          size="sm"
          color="primary"
          onclick={startFeature}
          disabled={!canStartFeature()}
          loading={startAction.pending}
        >
          {startButtonLabel()}
        </Button>
      </div>
    </div>

    <ImplementationStageList
      stages={stack.stages ?? []}
      stageSyncById={stack.stageSyncById}
      {implementationRuntimeByStageId}
    />
  </div>

  <div>
    <StackPullRequestCard pullRequest={stack.pullRequest} />
  </div>
</div>
