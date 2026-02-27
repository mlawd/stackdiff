<script lang="ts">
  import { Button } from 'flowbite-svelte';

  import type { FeatureStage, StageSyncMetadata } from '$lib/types/stack';
  import type {
    FeatureActionState,
    ImplementationStageRuntime,
  } from '../contracts';
  import ImplementationStageList from './ImplementationStageList.svelte';

  let {
    hasSavedPlan,
    stages,
    stageSyncById,
    implementationRuntimeByStageId,
    startAction,
    syncAction,
    mergeDownAction,
    canStartFeature,
    canSyncStack,
    canMergeDown,
    startButtonLabel,
    streamConnectionState,
    streamReconnectAttempt,
    onOpenPlanningChat,
    onStartFeature,
    onSyncStack,
    onMergeDown,
    onOpenReview,
    onApproveStage,
    onMergeStage,
  }: {
    hasSavedPlan: boolean;
    stages: FeatureStage[];
    stageSyncById: Record<string, StageSyncMetadata> | undefined;
    implementationRuntimeByStageId: Record<string, ImplementationStageRuntime>;
    startAction: FeatureActionState;
    syncAction: FeatureActionState;
    mergeDownAction: FeatureActionState;
    canStartFeature: boolean;
    canSyncStack: boolean;
    canMergeDown: boolean;
    startButtonLabel: string;
    streamConnectionState: 'connected' | 'reconnecting' | 'disconnected';
    streamReconnectAttempt: number;
    onOpenPlanningChat: () => void;
    onStartFeature: () => void;
    onSyncStack: () => void;
    onMergeDown: () => void;
    onOpenReview: (stageId: string) => void;
    onApproveStage: (stageId: string) => void;
    onMergeStage: (stageId: string) => void;
  } = $props();

  let streamStatusLabel = $derived.by(() => {
    if (streamConnectionState === 'connected') {
      return 'Connected';
    }

    if (streamConnectionState === 'disconnected') {
      return 'Disconnected';
    }

    return `Reconnecting (attempt ${Math.max(1, streamReconnectAttempt)})`;
  });

  let streamStatusColorClass = $derived.by(() => {
    if (streamConnectionState === 'connected') {
      return 'bg-emerald-400/70';
    }

    if (streamConnectionState === 'disconnected') {
      return 'bg-rose-400/70';
    }

    return 'bg-amber-300/80';
  });
</script>

{#if hasSavedPlan}
  <div>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p
        class="text-xs font-semibold uppercase tracking-[0.16em] stacked-subtle"
      >
        Implementation stages
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <span
          class="inline-flex items-center gap-1.5 rounded-full border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-2 py-1 text-xs stacked-subtle"
          aria-live="polite"
        >
          <span class={`h-1.5 w-1.5 rounded-full ${streamStatusColorClass}`}
          ></span>
          <span>{streamStatusLabel}</span>
        </span>
        <Button
          type="button"
          size="sm"
          color="alternative"
          onclick={onMergeDown}
          disabled={!canMergeDown}
          loading={mergeDownAction.pending}
        >
          Merge Down
        </Button>
        <Button
          type="button"
          size="sm"
          color="alternative"
          onclick={onSyncStack}
          disabled={!canSyncStack}
          loading={syncAction.pending}
        >
          Sync Stack
        </Button>
        <Button
          type="button"
          size="sm"
          color="primary"
          onclick={onStartFeature}
          disabled={!canStartFeature}
          loading={startAction.pending}
        >
          {startButtonLabel}
        </Button>
      </div>
    </div>

    <ImplementationStageList
      {stages}
      {stageSyncById}
      {implementationRuntimeByStageId}
      {onOpenReview}
      {onApproveStage}
      {onMergeStage}
    />
  </div>
{:else}
  <div
    class="rounded-xl border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] p-4"
  >
    <p class="text-sm stacked-subtle">
      Save a plan to generate implementation stages.
    </p>
    <Button
      type="button"
      size="sm"
      color="primary"
      class="mt-3"
      onclick={onOpenPlanningChat}
    >
      Open planning chat
    </Button>
  </div>
{/if}
