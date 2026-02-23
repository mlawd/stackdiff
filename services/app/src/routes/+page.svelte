<script lang="ts">
  import { resolve } from '$app/paths';
  import StackStatusBadge from '$lib/components/stack/StackStatusBadge.svelte';
  import StackTypeBadge from '$lib/components/stack/StackTypeBadge.svelte';

  import type { PageData } from './$types';

  interface UiMessage {
    kind: 'success' | 'error';
    text: string;
  }

  let { data }: { data: PageData } = $props();
  let stacks = $derived(data.stacks);
  let loadedAt = $derived(data.loadedAt);
  let message = $derived<UiMessage | null>(
    data.error ? { kind: 'error', text: data.error } : null,
  );
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

    {#if message}
      <div
        class={`mb-4 rounded-xl border px-4 py-3 text-sm ${
          message.kind === 'error'
            ? 'border-red-500/40 bg-red-500/10 text-red-200'
            : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
        }`}
      >
        {message.text}
      </div>
    {/if}

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
      <div class="space-y-2">
        {#each stacks as stack, index (stack.id)}
          <a
            href={resolve(`/stacks/${stack.id}`)}
            class="stacked-panel-elevated stacked-fade-in block p-3.5 sm:p-4"
            style={`animation-delay: ${index * 35}ms`}
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-base font-semibold text-[var(--stacked-text)]">
                  {stack.name}
                </p>
                {#if stack.notes}
                  <p class="mt-1 text-sm stacked-subtle">{stack.notes}</p>
                {/if}
              </div>
              <p class="text-xs stacked-subtle">Open</p>
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <StackTypeBadge type={stack.type} />
              <StackStatusBadge status={stack.status} />
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </div>
</main>
