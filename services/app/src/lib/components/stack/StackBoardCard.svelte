<script lang="ts">
  import { Badge } from 'flowbite-svelte';
  import { resolve } from '$app/paths';
  import { getProjectContext } from '$lib/context/project-context';
  import { projectStackPath } from '$lib/project-paths';
  import type { StackViewModel } from '$lib/types/stack';
  import StackTypeBadge from './StackTypeBadge.svelte';

  let {
    stack,
  }: {
    stack: StackViewModel;
  } = $props();

  const getProject = getProjectContext();

  const totalTasks = $derived(stack.stages?.length ?? 0);
  const completedTasks = $derived(
    (stack.stages ?? []).filter((stage) => stage.status === 'done').length,
  );
</script>

<a
  href={resolve(projectStackPath(getProject().id, stack.id))}
  class="lane-card stacked-panel-elevated block p-3"
>
  <p class="text-sm font-semibold text-[var(--stacked-text)]">
    {stack.name}
  </p>
  <div class="mt-3 flex flex-wrap items-center gap-2">
    <StackTypeBadge type={stack.type} />
    {#if stack.status === 'started'}
      <Badge
        rounded
        color="gray"
        class="inline-flex items-center whitespace-nowrap border-[1px] border-[var(--stacked-border-soft)] bg-[color-mix(in_oklab,var(--stacked-bg-soft)_88%,#0d0f14_12%)] text-[0.72rem] font-semibold tracking-[0.02em] text-[var(--stacked-text-muted)]"
      >
        {completedTasks}/{totalTasks}
      </Badge>
    {/if}
  </div>
</a>

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
