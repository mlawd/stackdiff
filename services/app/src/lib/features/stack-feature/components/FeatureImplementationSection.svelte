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
    canStartFeature,
    canSyncStack,
    startButtonLabel,
    onOpenPlanningChat,
    onStartFeature,
    onSyncStack,
    onOpenReview,
  }: {
    hasSavedPlan: boolean;
    stages: FeatureStage[];
    stageSyncById: Record<string, StageSyncMetadata> | undefined;
    implementationRuntimeByStageId: Record<string, ImplementationStageRuntime>;
    startAction: FeatureActionState;
    syncAction: FeatureActionState;
    canStartFeature: boolean;
    canSyncStack: boolean;
    startButtonLabel: string;
    onOpenPlanningChat: () => void;
    onStartFeature: () => void;
    onSyncStack: () => void;
    onOpenReview: (stageId: string) => void;
  } = $props();
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
