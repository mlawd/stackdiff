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
    loadStageReviewSession,
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
  import type { StackViewModel } from '$lib/types/stack';
  import ReviewChat from '$lib/components/ReviewChat.svelte';
  import FeatureActionAlerts from './FeatureActionAlerts.svelte';
  import ImplementationStageList from './ImplementationStageList.svelte';

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
  let reviewLoading = $state(false);
  let reviewError = $state<string | null>(null);
  let selectedReviewStageId = $state<string | null>(null);
  let reviewSession = $state<ReviewSessionResponse | null>(null);
  let runtimeInvalidating = false;

  const BODY_SCROLL_LOCK_COUNT_ATTRIBUTE = 'data-stacked-scroll-lock-count';

  let selectedReviewStage = $derived(
    selectedReviewStageId
      ? ((stack.stages ?? []).find(
          (stage) => stage.id === selectedReviewStageId,
        ) ?? null)
      : null,
  );

  function portalToBody(node: HTMLElement): { destroy: () => void } {
    if (typeof document === 'undefined') {
      return {
        destroy: () => {},
      };
    }

    document.body.appendChild(node);

    return {
      destroy: () => {
        node.remove();
      },
    };
  }

  function hasOutOfSyncStages(): boolean {
    return (stack.stages ?? []).some(
      (stage) => stack.stageSyncById?.[stage.id]?.isOutOfSync,
    );
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

  $effect(() => {
    if (!selectedReviewStageId) {
      return;
    }

    if (typeof document === 'undefined') {
      return;
    }

    const body = document.body;
    const currentCount = Number(
      body.getAttribute(BODY_SCROLL_LOCK_COUNT_ATTRIBUTE) ?? '0',
    );
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;

    if (currentCount === 0) {
      const scrollbarWidth =
        window.innerWidth - document.documentElement.clientWidth;
      body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }
    }

    body.setAttribute(
      BODY_SCROLL_LOCK_COUNT_ATTRIBUTE,
      String(currentCount + 1),
    );

    return () => {
      const nextCount =
        Number(body.getAttribute(BODY_SCROLL_LOCK_COUNT_ATTRIBUTE) ?? '1') - 1;
      if (nextCount <= 0) {
        body.style.overflow = previousOverflow;
        body.style.paddingRight = previousPaddingRight;
        body.removeAttribute(BODY_SCROLL_LOCK_COUNT_ATTRIBUTE);
        return;
      }

      body.setAttribute(BODY_SCROLL_LOCK_COUNT_ATTRIBUTE, String(nextCount));
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

  async function openReviewStage(stageId: string): Promise<void> {
    selectedReviewStageId = stageId;
    reviewLoading = true;
    reviewError = null;
    reviewSession = null;

    try {
      reviewSession = await loadStageReviewSession(stack.id, stageId);
    } catch (error) {
      reviewError =
        error instanceof Error
          ? error.message
          : 'Unable to open review session.';
    } finally {
      reviewLoading = false;
    }
  }

  function closeReviewStage(): void {
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
      onOpenReview={openReviewStage}
    />
  </div>
</div>

{#if selectedReviewStageId}
  <div
    use:portalToBody
    class="fixed inset-0 z-50 flex h-screen w-screen flex-col bg-[var(--stacked-bg)]"
    role="dialog"
    aria-modal="true"
    aria-label="Review chat"
  >
    <div
      class="flex items-start justify-between gap-3 border-b stacked-divider px-4 py-3 sm:px-6 sm:py-4"
    >
      <div>
        <p
          class="text-xs font-semibold uppercase tracking-[0.16em] stacked-subtle"
        >
          Review chat
        </p>
        {#if selectedReviewStage}
          <p class="mt-1 text-sm text-[var(--stacked-text)]">
            {selectedReviewStage.title}
          </p>
        {/if}
      </div>
      <button
        type="button"
        class="rounded border border-[var(--stacked-border-soft)] px-2.5 py-1 text-xs stacked-subtle transition hover:text-[var(--stacked-text)]"
        onclick={closeReviewStage}
      >
        Close
      </button>
    </div>

    <div class="min-h-0 flex-1 px-4 py-3 sm:px-6 sm:py-4">
      {#if reviewError}
        <div
          class="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
        >
          {reviewError}
        </div>
      {/if}

      {#if reviewLoading}
        <p class="text-sm stacked-subtle">Loading review session...</p>
      {:else if reviewSession && selectedReviewStageId}
        <ReviewChat
          stackId={stack.id}
          stageId={selectedReviewStageId}
          messages={reviewSession.messages}
          awaitingResponse={reviewSession.awaitingResponse}
          viewportHeightClass="h-full"
        />
      {/if}
    </div>
  </div>
{/if}
