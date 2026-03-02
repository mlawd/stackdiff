<script
  lang="ts"
  generics="TItem extends { id: string; title: string; status: TStatus }, TStatus extends string"
>
  import type { Snippet } from 'svelte';

  import KanbanBoardLane from './KanbanBoardLane.svelte';
  import { setKanbanContext } from './kanban-context';

  interface KanbanLaneConfig {
    title: string;
    status: TStatus;
    accent?: string;
  }

  interface ResolvedKanbanLane {
    id: string;
    title: string;
    accent: string;
    items: TItem[];
  }

  let {
    items,
    laneConfig,
    onCardClick,
    cardStatus,
    collapseEmptyLanes = false,
  }: {
    items: TItem[];
    laneConfig: KanbanLaneConfig[];
    onCardClick?: (item: TItem) => void;
    cardStatus?: Snippet<[TItem]>;
    collapseEmptyLanes?: boolean;
  } = $props();

  const lanes = $derived<ResolvedKanbanLane[]>(
    laneConfig.map((lane) => ({
      id: String(lane.status),
      title: lane.title,
      accent: lane.accent ?? 'var(--stacked-text-muted)',
      items: items.filter((item) => item.status === lane.status),
    })),
  );

  setKanbanContext<TItem>({
    getOnCardClick: () => onCardClick,
    getCardStatus: () => cardStatus,
  });
</script>

<div class="overflow-x-hidden pb-1">
  <div class="flex flex-col gap-3 md:flex-row md:items-start md:gap-4">
    {#each lanes as lane (lane.id)}
      <div
        class={lane.items.length === 0 && collapseEmptyLanes
          ? 'md:w-[4.5rem] md:shrink-0'
          : 'md:min-w-0 md:flex-1'}
      >
        <KanbanBoardLane
          title={lane.title}
          accent={lane.accent}
          items={lane.items}
          collapsed={collapseEmptyLanes && lane.items.length === 0}
        />
      </div>
    {/each}
  </div>
</div>
