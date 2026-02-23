<script lang="ts">
  import { resolve } from '$app/paths';
  import { Button } from 'flowbite-svelte';
  import type { Snippet } from 'svelte';

  import type { LayoutData } from './$types';

  import '../app.css';
  import favicon from '$lib/assets/favicon.svg';

  let { children, data }: { children: Snippet; data: LayoutData } = $props();

  let createFeatureHref = $derived.by(() => {
    const baseHref = resolve('/stacks/new');
    if (!data.selectedProjectId) {
      return baseHref;
    }

    const query = new URLSearchParams({ project: data.selectedProjectId });
    return `${baseHref}?${query.toString()}`;
  });

  function handleProjectChange(event: Event): void {
    const projectId = (event.currentTarget as HTMLSelectElement).value;
    const baseHref = resolve('/');
    if (!projectId) {
      window.location.assign(baseHref);
      return;
    }

    const query = new URLSearchParams({ project: projectId });
    window.location.assign(`${baseHref}?${query.toString()}`);
  }
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<header
  class="stacked-fade-in mb-0 w-full border-b stacked-divider bg-[var(--stacked-surface)] px-4 py-3 sm:mb-0 sm:px-6"
>
  <div class="mx-auto flex w-full max-w-6xl items-center justify-between">
    <a
      href={resolve('/')}
      class="text-sm font-semibold tracking-wide text-[var(--stacked-text)] sm:text-base"
      >stackdiff</a
    >
    <div class="flex items-center gap-3">
      {#if data.projects.length > 0}
        <label class="text-xs font-medium stacked-subtle sm:text-sm">
          <span class="sr-only">Project</span>
          <select
            value={data.selectedProjectId ?? ''}
            onchange={handleProjectChange}
            class="h-9 min-w-44 rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] pl-3 pr-9 text-xs text-[var(--stacked-text)] outline-none transition focus:border-[var(--stacked-accent)] sm:text-sm"
          >
            {#each data.projects as project (project.id)}
              <option value={project.id}>{project.name}</option>
            {/each}
          </select>
        </label>
      {/if}
      <Button href={createFeatureHref} size="sm" color="primary">
        Create feature
      </Button>
    </div>
  </div>
</header>

{#if data.projectLoadError}
  <div
    class="w-full border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-100 sm:px-6"
  >
    <p class="mx-auto w-full max-w-6xl">
      Project error: {data.projectLoadError}
    </p>
  </div>
{/if}

{@render children()}
