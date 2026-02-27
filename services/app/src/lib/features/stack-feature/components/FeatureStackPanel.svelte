<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';

  import { readAppNotificationsEnabled } from '$lib/client/notifications';
  import type { StackViewModel } from '$lib/types/stack';
  import {
    canMergeDownStack,
    canStartFeature as canStartFeatureWithRuntime,
    formatMergeDownSuccessMessage,
    formatStartSuccessMessage,
    formatSyncSuccessMessage,
    stageIdsTransitionedToReview,
    shouldInvalidateFromRuntimeUpdates,
    stageIdsForRuntimePolling,
    startButtonLabel as startButtonLabelWithRuntime,
  } from '../behavior';
  import {
    approveStageRequest,
    getImplementationStatus,
    loadStageReviewSession,
    mergeDownStackRequest,
    mergeStageRequest,
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
    ReviewSessionResponse,
  } from '../contracts';
  import FeatureActionAlerts from './FeatureActionAlerts.svelte';
  import FeatureImplementationSection from './FeatureImplementationSection.svelte';
  import FeatureReviewDialog from './FeatureReviewDialog.svelte';

  let {
    stack,
    hasSavedPlan,
    onOpenPlanningChat,
  }: {
    stack: StackViewModel;
    hasSavedPlan: boolean;
    onOpenPlanningChat: () => void;
  } = $props();

  function createIdleActionState(): FeatureActionState {
    return {
      pending: false,
      error: null,
      success: null,
    };
  }

  let startAction = $state<FeatureActionState>(createIdleActionState());
  let syncAction = $state<FeatureActionState>(createIdleActionState());
  let mergeDownAction = $state<FeatureActionState>(createIdleActionState());
  let implementationRuntimeByStageId = $state<
    Record<string, ImplementationStageRuntime>
  >({});
  let reviewLoading = $state(false);
  let reviewError = $state<string | null>(null);
  let selectedReviewStageId = $state<string | null>(null);
  let reviewSession = $state<ReviewSessionResponse | null>(null);
  let runtimeInvalidating = false;
  let reviewRequestToken = 0;
  const notifiedReviewStageIds = new SvelteSet<string>();

  function notifyReviewTransitions(
    entries: ReadonlyArray<readonly [string, ImplementationStageRuntime]>,
  ): void {
    if (typeof Notification === 'undefined') {
      return;
    }

    if (Notification.permission !== 'granted') {
      return;
    }

    if (!readAppNotificationsEnabled()) {
      return;
    }

    const transitionedStageIds = stageIdsTransitionedToReview({
      stages: stack.stages ?? [],
      implementationRuntimeByStageId,
      updates: entries,
    });

    for (const stageId of transitionedStageIds) {
      if (notifiedReviewStageIds.has(stageId)) {
        continue;
      }

      const stageTitle =
        (stack.stages ?? []).find((stage) => stage.id === stageId)?.title ??
        'Stage';
      notifiedReviewStageIds.add(stageId);
      new Notification('Review', {
        body: `${stageTitle} is ready for review.`,
        tag: `review:${stack.id}:${stageId}`,
      });
    }
  }

  let selectedReviewStage = $derived(
    selectedReviewStageId
      ? ((stack.stages ?? []).find(
          (stage) => stage.id === selectedReviewStageId,
        ) ?? null)
      : null,
  );

  function hasOutOfSyncStages(): boolean {
    return (stack.stages ?? []).some(
      (stage) => stack.stageSyncById?.[stage.id]?.isOutOfSync,
    );
  }

  function canSyncStack(): boolean {
    return (
      hasOutOfSyncStages() &&
      !syncAction.pending &&
      !startAction.pending &&
      !mergeDownAction.pending
    );
  }

  function canMergeDown(): boolean {
    return (
      canMergeDownStack({
        stages: stack.stages ?? [],
        implementationRuntimeByStageId,
      }) &&
      !mergeDownAction.pending &&
      !syncAction.pending &&
      !startAction.pending
    );
  }

  async function approveStage(stageId: string): Promise<void> {
    if (mergeDownAction.pending || syncAction.pending || startAction.pending) {
      return;
    }

    mergeDownAction = {
      ...mergeDownAction,
      error: null,
      success: null,
    };

    try {
      const runtime = await approveStageRequest(stack.id, stageId);
      implementationRuntimeByStageId = {
        ...implementationRuntimeByStageId,
        [stageId]: runtime,
      };
      mergeDownAction = {
        ...mergeDownAction,
        error: null,
        success: 'Stage approved for merge.',
      };
      await invalidateAll();
    } catch (error) {
      mergeDownAction = {
        ...mergeDownAction,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to approve stage for merge.',
      };
    }
  }

  async function mergeStage(stageId: string): Promise<void> {
    if (mergeDownAction.pending || syncAction.pending || startAction.pending) {
      return;
    }

    mergeDownAction = {
      ...mergeDownAction,
      error: null,
      success: null,
    };

    try {
      const runtime = await mergeStageRequest(stack.id, stageId);
      implementationRuntimeByStageId = {
        ...implementationRuntimeByStageId,
        [stageId]: runtime,
      };
      mergeDownAction = {
        ...mergeDownAction,
        error: null,
        success: 'Stage merged with squash.',
      };
      await invalidateAll();
    } catch (error) {
      mergeDownAction = {
        ...mergeDownAction,
        error:
          error instanceof Error ? error.message : 'Unable to merge stage PR.',
      };
    }
  }

  function canStartFeature(): boolean {
    return (
      canStartFeatureWithRuntime({
        stages: stack.stages ?? [],
        implementationRuntimeByStageId,
        startPending: startAction.pending,
      }) &&
      !syncAction.pending &&
      !mergeDownAction.pending
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

    notifyReviewTransitions(entries);

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

  onMount(() => {
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
    mergeDownAction = {
      ...mergeDownAction,
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

  async function mergeDownStack(): Promise<void> {
    if (!canMergeDown()) {
      return;
    }

    const stageCount = (stack.stages ?? []).length;
    const confirmed = window.confirm(
      `Merge down ${stageCount} stage PR${stageCount === 1 ? '' : 's'} into the default branch using squash? This updates and merges each PR from bottom to top.`,
    );
    if (!confirmed) {
      return;
    }

    mergeDownAction = {
      pending: true,
      error: null,
      success: null,
    };
    startAction = {
      ...startAction,
      error: null,
    };
    syncAction = {
      ...syncAction,
      error: null,
    };

    try {
      const response = await mergeDownStackRequest(stack.id);
      mergeDownAction = {
        pending: false,
        error: null,
        success: formatMergeDownSuccessMessage(response),
      };
      await invalidateAll();
    } catch (error) {
      mergeDownAction = {
        pending: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to merge down stack.',
        success: null,
      };
    }
  }

  async function openReviewStage(stageId: string): Promise<void> {
    const requestToken = ++reviewRequestToken;
    selectedReviewStageId = stageId;
    reviewLoading = true;
    reviewError = null;
    reviewSession = null;

    try {
      const session = await loadStageReviewSession(stack.id, stageId);
      if (requestToken !== reviewRequestToken) {
        return;
      }

      reviewSession = session;
    } catch (error) {
      if (requestToken !== reviewRequestToken) {
        return;
      }

      reviewError =
        error instanceof Error
          ? error.message
          : 'Unable to open review session.';
    } finally {
      if (requestToken === reviewRequestToken) {
        reviewLoading = false;
      }
    }
  }

  function closeReviewStage(): void {
    reviewRequestToken += 1;
    selectedReviewStageId = null;
    reviewSession = null;
    reviewError = null;
    reviewLoading = false;
  }
</script>

<div class="space-y-4">
  <FeatureActionAlerts
    syncError={syncAction.error}
    syncSuccess={syncAction.success}
    mergeDownError={mergeDownAction.error}
    mergeDownSuccess={mergeDownAction.success}
    startError={startAction.error}
    startSuccess={startAction.success}
  />

  <FeatureImplementationSection
    {hasSavedPlan}
    stages={stack.stages ?? []}
    stageSyncById={stack.stageSyncById}
    {implementationRuntimeByStageId}
    {startAction}
    {syncAction}
    {mergeDownAction}
    canStartFeature={canStartFeature()}
    canSyncStack={canSyncStack()}
    canMergeDown={canMergeDown()}
    startButtonLabel={startButtonLabel()}
    {onOpenPlanningChat}
    onStartFeature={startFeature}
    onSyncStack={syncStack}
    onMergeDown={mergeDownStack}
    onOpenReview={openReviewStage}
    onApproveStage={approveStage}
    onMergeStage={mergeStage}
  />
</div>

<FeatureReviewDialog
  open={Boolean(selectedReviewStageId)}
  stackId={stack.id}
  stageId={selectedReviewStageId}
  stageTitle={selectedReviewStage?.title ?? null}
  {reviewLoading}
  {reviewError}
  {reviewSession}
  onClose={closeReviewStage}
/>
