<script lang="ts">
  import type { StackViewModel } from '$lib/types/stack';
  import StackBoardCard from './StackBoardCard.svelte';
  import {
    STACK_BOARD_LANE_ACCENT,
    STACK_BOARD_LANE_TITLE,
    type StackBoardLaneType,
  } from './stack-board-lane';

  let {
    type,
    stacks,
    animationDelayMs = 0,
  }: {
    type: StackBoardLaneType;
    stacks: StackViewModel[];
    animationDelayMs?: number;
  } = $props();
</script>

<section
  class="lane stacked-fade-in p-3"
  style={`--lane-accent: ${STACK_BOARD_LANE_ACCENT[type]}; animation-delay: ${animationDelayMs}ms`}
>
  <div class="lane-header flex items-center justify-between gap-3">
    <div class="flex items-center gap-2">
      <span class="lane-dot" aria-hidden="true"></span>
      <h2
        class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--stacked-text)]"
      >
        {STACK_BOARD_LANE_TITLE[type]}
      </h2>
    </div>
    <p class="lane-count text-xs">{stacks.length}</p>
  </div>
  <div class="lane-separator" aria-hidden="true"></div>

  {#if stacks.length === 0}
    <p class="py-6 text-left text-xs stacked-subtle">
      No features in this lane.
    </p>
  {:else}
    <div class="mt-3 space-y-2">
      {#each stacks as stack (stack.id)}
        <StackBoardCard {stack} />
      {/each}
    </div>
  {/if}
</section>

<style>
  .lane {
    position: relative;
    border: 0;
    border-radius: 0;
    background: transparent;
    transition:
      border-color 180ms ease,
      transform 180ms ease;
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

  @media (prefers-reduced-motion: reduce) {
    .lane {
      transition: none;
    }
  }
</style>
