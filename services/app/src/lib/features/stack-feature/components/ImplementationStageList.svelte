<script lang="ts">
  import KanbanBoard from '$lib/components/kanban/KanbanBoard.svelte';
  import type {
    FeatureStage,
    FeatureStageStatus,
    StageSyncMetadata,
  } from '$lib/types/stack';

  import {
    implementationStageColor,
    implementationStageLabel,
    stageStatus,
  } from '../behavior';
  import type { ImplementationStageRuntime } from '../contracts';
  import type { StageKanbanItem } from '../stage-kanban-item';
  import StageCardStatus from './StageCardStatus.svelte';

  const fallbackSyncMetadata: StageSyncMetadata = {
    isOutOfSync: false,
    behindBy: 0,
    reasonIfUnavailable: 'Stage sync status is unavailable.',
  };

  const stageStatusOrder: FeatureStageStatus[] = [
    'not-started',
    'in-progress',
    'review',
    'approved',
    'done',
  ];

  let {
    stages,
    stageSyncById,
    implementationRuntimeByStageId,
    onOpenStage,
  }: {
    stages: FeatureStage[];
    stageSyncById: Record<string, StageSyncMetadata> | undefined;
    implementationRuntimeByStageId: Record<string, ImplementationStageRuntime>;
    onOpenStage?: (stageId: string) => void;
  } = $props();

  let stageItems = $derived<StageKanbanItem[]>(
    stages.map((stage) => ({
      id: stage.id,
      title: stage.title,
      status: stageStatus(
        implementationRuntimeByStageId,
        stage.id,
        stage.status,
      ),
      stage,
      runtime: implementationRuntimeByStageId[stage.id],
      syncMetadata: stageSyncMetadata(stage.id),
    })),
  );

  let laneConfig = $derived(
    stageStatusOrder.map((status) => ({
      title: implementationStageLabel(status),
      status,
      accent: statusAccent(status),
    })),
  );

  function stageSyncMetadata(stageId: string): StageSyncMetadata {
    return stageSyncById?.[stageId] ?? fallbackSyncMetadata;
  }

  function statusAccent(status: FeatureStageStatus): string {
    const color = implementationStageColor(status);

    if (color === 'green') {
      return 'var(--stacked-success)';
    }

    if (color === 'lime') {
      return '#84cc16';
    }

    if (color === 'purple') {
      return '#9f7aea';
    }

    if (color === 'yellow') {
      return 'var(--stacked-warning)';
    }

    return 'var(--stacked-text-muted)';
  }

  function openStage(item: StageKanbanItem): void {
    onOpenStage?.(item.stage.id);
  }
</script>

{#if stages.length > 0}
  <KanbanBoard
    items={stageItems}
    {laneConfig}
    onCardClick={onOpenStage ? openStage : undefined}
    collapseEmptyLanes
  >
    {#snippet cardStatus(item)}
      <StageCardStatus item={item as StageKanbanItem} />
    {/snippet}
  </KanbanBoard>
{:else}
  <p class="text-sm stacked-subtle">
    Save a plan in planning chat to generate implementation stages.
  </p>
{/if}
