<script lang="ts">
  import type { FeatureStage, StageSyncMetadata } from '$lib/types/stack';

  import type { ImplementationStageRuntime } from '../contracts';
  import ImplementationStageRow from './ImplementationStageRow.svelte';

  const fallbackSyncMetadata: StageSyncMetadata = {
    isOutOfSync: false,
    behindBy: 0,
    reasonIfUnavailable: 'Stage sync status is unavailable.',
  };

  let {
    stages,
    stageSyncById,
    implementationRuntimeByStageId,
    onOpenReview,
    onApproveStage,
    onMergeStage,
  }: {
    stages: FeatureStage[];
    stageSyncById: Record<string, StageSyncMetadata> | undefined;
    implementationRuntimeByStageId: Record<string, ImplementationStageRuntime>;
    onOpenReview?: (stageId: string) => void;
    onApproveStage?: (stageId: string) => void;
    onMergeStage?: (stageId: string) => void;
  } = $props();

  function stageSyncMetadata(stageId: string): StageSyncMetadata {
    return stageSyncById?.[stageId] ?? fallbackSyncMetadata;
  }
</script>

{#if stages.length > 0}
  <div class="space-y-2">
    {#each stages as stage (stage.id)}
      <ImplementationStageRow
        {stage}
        runtime={implementationRuntimeByStageId[stage.id]}
        syncMetadata={stageSyncMetadata(stage.id)}
        {onOpenReview}
        {onApproveStage}
        {onMergeStage}
      />
    {/each}
  </div>
{:else}
  <p class="text-sm stacked-subtle">
    Save a plan in planning chat to generate implementation stages.
  </p>
{/if}
