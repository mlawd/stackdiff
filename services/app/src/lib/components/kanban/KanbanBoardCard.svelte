<script
  lang="ts"
  generics="TItem extends { id: string; title: string; status: TStatus }, TStatus extends string"
>
  import { getKanbanContext } from './kanban-context';

  let { item }: { item: TItem } = $props();

  const kanbanContext = getKanbanContext<TItem>();
  const onCardClick = $derived(kanbanContext.getOnCardClick());
  const cardStatus = $derived(kanbanContext.getCardStatus());

  function handleCardKeydown(event: KeyboardEvent): void {
    if (!onCardClick) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onCardClick(item);
    }
  }
</script>

{#if onCardClick}
  <div
    role="button"
    tabindex="0"
    class="lane-card stacked-panel-elevated block w-full cursor-pointer p-3 text-left"
    onclick={() => onCardClick(item)}
    onkeydown={handleCardKeydown}
  >
    <p class="text-sm font-semibold text-[var(--stacked-text)]">{item.title}</p>
    {#if cardStatus}
      <div class="mt-3 flex flex-wrap items-center gap-2">
        {@render cardStatus(item)}
      </div>
    {/if}
  </div>
{:else}
  <div class="lane-card stacked-panel-elevated p-3">
    <p class="text-sm font-semibold text-[var(--stacked-text)]">{item.title}</p>
    {#if cardStatus}
      <div class="mt-3 flex flex-wrap items-center gap-2">
        {@render cardStatus(item)}
      </div>
    {/if}
  </div>
{/if}

<style>
  .lane-card {
    border-radius: 6px;
    transition:
      transform 160ms ease,
      border-color 160ms ease,
      background-color 160ms ease;
  }

  .lane-card:hover {
    transform: translateY(-1px);
    background: color-mix(
      in oklab,
      var(--stacked-surface-elevated) 95%,
      #0c0d11 5%
    );
    border-color: color-mix(
      in oklab,
      var(--lane-accent, var(--stacked-accent)) 40%,
      var(--stacked-border-soft)
    );
  }

  @media (prefers-reduced-motion: reduce) {
    .lane-card {
      transition: none;
    }

    .lane-card:hover {
      transform: none;
    }
  }
</style>
