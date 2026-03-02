<script
  lang="ts"
  generics="TItem extends { id: string; title: string; status: TStatus }, TStatus extends string"
>
  import KanbanBoardCard from './KanbanBoardCard.svelte';

  let {
    title,
    accent,
    items,
    collapsed = false,
  }: {
    title: string;
    accent: string;
    items: TItem[];
    collapsed?: boolean;
  } = $props();
</script>

<section
  class={`lane ${collapsed ? 'lane-collapsed' : ''}`}
  style={`--lane-accent: ${accent}`}
>
  <div class="lane-header" class:flex={collapsed} class:flex-col={collapsed}>
    <div class="flex items-center gap-3">
      <span class="lane-dot" aria-hidden="true"></span>
      <h2
        class="lane-title text-sm font-semibold uppercase tracking-[0.14em] text-[var(--stacked-text)]"
      >
        {title}
      </h2>
      <p class="lane-count text-xs">{items.length}</p>
    </div>
    <div class="lane-separator" aria-hidden="true"></div>
  </div>

  {#if items.length === 0 && !collapsed}
    <p class="py-6 text-left text-xs stacked-subtle">Empty lane</p>
  {:else if items.length > 0}
    <div class="lane-content stacked-scroll mt-3 space-y-2 pr-1">
      {#each items as item (item.id)}
        <KanbanBoardCard {item} />
      {/each}
    </div>
  {/if}
</section>

<style>
  .lane {
    position: relative;
    display: flex;
    min-height: 0;
    max-height: min(70vh, 44rem);
    flex-direction: column;
    border: 0;
    border-radius: 0;
    background: transparent;
    transition:
      border-color 180ms ease,
      transform 180ms ease;
  }

  .lane-content {
    min-height: 0;
    overflow-y: auto;
    padding-top: 10px;
  }

  .lane-header {
    min-height: 2rem;
  }

  .lane-separator {
    margin-top: 0.5rem;
    height: 3px;
    width: 100%;
    background: linear-gradient(90deg, var(--lane-accent), transparent 70%);
    opacity: 0.9;
    pointer-events: none;
  }

  .lane-dot {
    height: 0.5rem;
    width: 0.5rem;
    border-radius: 999px;
    background: var(--lane-accent);
    box-shadow: 0 0 0 4px
      color-mix(in oklab, var(--lane-accent) 20%, transparent);
  }

  .lane-count {
    color: color-mix(
      in oklab,
      var(--stacked-text-muted) 65%,
      var(--lane-accent) 35%
    );
  }

  .lane-collapsed {
    opacity: 0.88;
    max-height: none;
  }

  .lane-collapsed .lane-header {
    min-height: 9rem;
  }

  .lane-collapsed .lane-dot {
    display: none;
  }

  .lane-collapsed .lane-header {
    writing-mode: sideways-lr;
  }

  .lane-collapsed .lane-separator {
    margin-left: 0.5rem;
    height: 100%;
    width: 3px;
    background: linear-gradient(to top, var(--lane-accent), transparent 70%);
    opacity: 0.9;
    pointer-events: none;
  }

  /*
  .lane-collapsed .lane-header {
    display: inline-block;
    white-space: nowrap;
    transform: rotate(-90deg);
    transform-origin: right center;
    text-align: right;
    letter-spacing: 0.08em;
  }
    */

  @media (prefers-reduced-motion: reduce) {
    .lane {
      transition: none;
    }
  }
</style>
