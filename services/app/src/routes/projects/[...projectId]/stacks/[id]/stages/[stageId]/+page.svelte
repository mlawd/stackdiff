<script lang="ts">
  import { resolve } from '$app/paths';
  import { Badge } from 'flowbite-svelte';

  import { renderMarkdown } from '$lib/markdown';
  import { projectStackPath, projectStacksPath } from '$lib/project-paths';
  import {
    implementationStageColor,
    implementationStageLabel,
  } from '$lib/features/stack-feature/behavior';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const hasDetails = $derived(Boolean(data.stage.details?.trim()));
  const renderedDetails = $derived(
    hasDetails ? renderMarkdown(data.stage.details ?? '') : '',
  );
  const stageStatusLabel = $derived(
    implementationStageLabel(data.stage.status),
  );
  const stageStatusColor = $derived(
    implementationStageColor(data.stage.status),
  );
  const stackHref = $derived(
    projectStackPath(data.stack.projectId, data.stack.id),
  );

  function setMarkdown(html: string) {
    return (node: HTMLElement) => {
      node.innerHTML = html;
    };
  }
</script>

<main class="stacked-shell mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-6">
  <div class="stacked-fade-in">
    <div
      class="mb-4 flex flex-wrap items-center justify-between gap-3 border-b stacked-divider pb-3"
    >
      <div class="flex flex-wrap items-center gap-3 text-sm font-semibold">
        <a href={resolve(stackHref)} data-sveltekit-reload class="stacked-link">
          Back to feature
        </a>
        <a
          href={resolve(projectStacksPath(data.stack.projectId))}
          data-sveltekit-reload
          class="stacked-link"
        >
          Back to features
        </a>
      </div>
      <p class="text-xs stacked-subtle">
        Loaded {new Date(data.loadedAt).toLocaleString()}
      </p>
    </div>

    <section class="stacked-panel-elevated rounded-xl px-5 py-5 sm:px-6">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">
          {data.stage.title}
        </h1>
        <Badge rounded color={stageStatusColor}>{stageStatusLabel}</Badge>
      </div>

      {#if hasDetails}
        <div
          class="stacked-markdown text-sm stacked-subtle"
          {@attach setMarkdown(renderedDetails)}
        ></div>
      {:else}
        <p class="text-sm stacked-subtle">
          No stage details were provided for this implementation stage.
        </p>
      {/if}
    </section>
  </div>
</main>
