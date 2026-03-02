<script lang="ts">
  import { resolve } from '$app/paths';
  import StackStatusBadge from '$lib/components/stack/StackStatusBadge.svelte';
  import StackTypeBadge from '$lib/components/stack/StackTypeBadge.svelte';
  import { projectStackPath } from '$lib/project-paths';
  import type { StackStatus } from '$lib/types/stack';

  import type { PageData } from './$types';

  interface BoardColumn {
    id: string;
    title: string;
    status: StackStatus;
  }

  const boardColumns: BoardColumn[] = [
    { id: 'backlog', title: 'Backlog', status: 'created' },
    { id: 'planned', title: 'Planned', status: 'planned' },
    { id: 'in-progress', title: 'In Progress', status: 'started' },
    { id: 'done', title: 'Done', status: 'complete' },
  ];

  let { data }: { data: PageData } = $props();
  let stacks = $derived(data.stacks);
  let stacksByColumn = $derived(
    boardColumns.map((column) => ({
      ...column,
      stacks: stacks.filter((stack) => stack.status === column.status),
    })),
  );
  let loadedAt = $derived(data.loadedAt);
  let failedProjectChecks = $derived(
    (data.selectedProjectHealth?.checks ?? []).filter((check) => !check.ok),
  );
</script>

<main class="stacked-shell mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-6">
  <div class="stacked-fade-in">
    <div class="mb-5 border-b stacked-divider pb-4">
      <p
        class="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--stacked-accent-strong)]"
      >
        stackdiff
      </p>
      <h1 class="stacked-title">Feature Pipeline</h1>
      <p class="mt-2 text-sm stacked-subtle">
        Track feature progress from creation to completion.
      </p>
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
      <div class="stacked-scroll -mx-1 overflow-x-auto pb-2">
        <div class="grid min-w-[56rem] grid-cols-4 gap-3 px-1 lg:min-w-0">
          {#each stacksByColumn as column, columnIndex (column.id)}
            <section
              class="stacked-panel stacked-fade-in p-3"
              style={`animation-delay: ${columnIndex * 35}ms`}
            >
              <div
                class="flex items-center justify-between gap-3 border-b stacked-divider pb-2"
              >
                <h2
                  class="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--stacked-text)]"
                >
                  {column.title}
                </h2>
                <p class="text-xs stacked-subtle">{column.stacks.length}</p>
              </div>

              {#if column.stacks.length === 0}
                <p class="py-6 text-center text-xs stacked-subtle">
                  No features in this lane.
                </p>
              {:else}
                <div class="mt-3 space-y-2">
                  {#each column.stacks as stack (stack.id)}
                    <a
                      href={resolve(projectStackPath(data.projectId, stack.id))}
                      class="stacked-panel-elevated block p-3"
                    >
                      <p
                        class="text-sm font-semibold text-[var(--stacked-text)]"
                      >
                        {stack.name}
                      </p>
                      <div class="mt-3 flex flex-wrap items-center gap-2">
                        <StackTypeBadge type={stack.type} />
                        <StackStatusBadge status={stack.status} />
                      </div>
                    </a>
                  {/each}
                </div>
              {/if}
            </section>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</main>
