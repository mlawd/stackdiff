<script lang="ts">
  import StackBoardLane from '$lib/components/stack/StackBoardLane.svelte';
  import {
    STACK_BOARD_LANE_ORDER,
    STACK_BOARD_LANE_STATUS,
  } from '$lib/components/stack/stack-board-lane';
  import { setProjectContext } from '$lib/context/project-context';

  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let stacks = $derived(data.stacks);
  let stacksByLane = $derived(
    STACK_BOARD_LANE_ORDER.map((type) => ({
      type,
      stacks: stacks.filter(
        (stack) => stack.status === STACK_BOARD_LANE_STATUS[type],
      ),
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
      <div class="stacked-scroll overflow-x-auto pb-2">
        <div class="grid min-w-[56rem] grid-cols-4 gap-0 lg:min-w-0">
          {#each stacksByLane as lane, laneIndex (lane.type)}
            <StackBoardLane
              type={lane.type}
              stacks={lane.stacks}
              animationDelayMs={laneIndex * 35}
            />
          {/each}
        </div>
      </div>
    {/if}
  </div>
</main>
