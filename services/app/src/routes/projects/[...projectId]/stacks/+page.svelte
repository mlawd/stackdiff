<script lang="ts">
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import KanbanBoard from '$lib/components/kanban/KanbanBoard.svelte';
  import StackCardStatus from '$lib/components/stack/StackCardStatus.svelte';
  import {
    STACK_BOARD_LANE_ORDER,
    STACK_BOARD_LANE_STATUS,
    STACK_BOARD_LANE_ACCENT,
    STACK_BOARD_LANE_TITLE,
  } from '$lib/components/stack/stack-board-lane';
  import { setProjectContext } from '$lib/context/project-context';
  import { projectStackPath } from '$lib/project-paths';
  import type { StackViewModel } from '$lib/types/stack';

  import type { PageData } from './$types';

  type StackBoardItem = StackViewModel & { title: string };

  let { data }: { data: PageData } = $props();
  let stacks = $derived<StackBoardItem[]>(
    data.stacks.map((stack) => ({ ...stack, title: stack.name })),
  );
  let laneConfig = $derived(
    STACK_BOARD_LANE_ORDER.map((type) => ({
      title: STACK_BOARD_LANE_TITLE[type],
      status: STACK_BOARD_LANE_STATUS[type],
      accent: STACK_BOARD_LANE_ACCENT[type],
    })),
  );
  let loadedAt = $derived(data.loadedAt);
  let failedProjectChecks = $derived(
    (data.selectedProjectHealth?.checks ?? []).filter((check) => !check.ok),
  );
  const projectName = $derived(
    data.projects.find((project) => project.id === data.projectId)?.name ??
      data.projectId,
  );

  setProjectContext(() => ({ id: data.projectId, name: projectName }));

  function openStack(item: StackBoardItem): void {
    void goto(resolve(projectStackPath(data.projectId, item.id)));
  }
</script>

<main class="stacked-shell mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-6">
  <div class="stacked-fade-in">
    <div class="mb-5 border-b stacked-divider pb-4">
      <p
        class="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--stacked-accent-strong)]"
      >
        stackdiff
      </p>
      <h1 class="stacked-title">Feature Pipeline</h1>
      <p class="mt-2 text-xs stacked-subtle">
        Synced {new Date(loadedAt).toLocaleString()}
      </p>
    </div>

    {#if data.selectedProjectHealth && !data.selectedProjectHealth.ok}
      <div
        class="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
      >
        <p class="font-medium">
          Selected project health checks need attention.
        </p>
        {#if data.selectedProjectHealth.repositoryRoot}
          <p class="mt-1 text-xs text-amber-200/90">
            Repository: {data.selectedProjectHealth.repositoryRoot}
          </p>
        {/if}
        <ul class="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-100/90">
          {#each failedProjectChecks as check (check.key)}
            <li>{check.message ?? `${check.key} check failed.`}</li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if stacks.length === 0}
      <div class="stacked-panel-elevated px-6 py-10 text-center">
        <p class="mb-2 text-lg font-semibold">No features yet.</p>
        <p class="text-sm stacked-subtle">
          Create one from the header to start planning.
        </p>
      </div>
    {:else}
      <KanbanBoard items={stacks} {laneConfig} onCardClick={openStack}>
        {#snippet cardStatus(item)}
          <StackCardStatus item={item as StackBoardItem} />
        {/snippet}
      </KanbanBoard>
    {/if}
  </div>
</main>
