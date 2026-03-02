<script lang="ts">
  import { afterNavigate, beforeNavigate } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { Progressbar } from 'flowbite-svelte';
  import type { Snippet } from 'svelte';
  import type { StackedProject } from '$lib/types/stack';
  import LayoutHead from '$lib/components/layout/LayoutHead.svelte';
  import LayoutHeader from '$lib/components/layout/LayoutHeader.svelte';
  import ProjectErrorBanner from '$lib/components/layout/ProjectErrorBanner.svelte';
  import { projectStacksPath } from '$lib/project-paths';

  import type { LayoutData } from './$types';

  import '../app.css';

  let { children, data }: { children: Snippet; data: LayoutData } = $props();
  let isNavigating = $state(false);
  let navigationProgress = $state(0);
  let progressInterval: ReturnType<typeof setInterval> | null = null;
  let completeTimeout: ReturnType<typeof setTimeout> | null = null;

  function clearProgressTimers(): void {
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }

    if (completeTimeout) {
      clearTimeout(completeTimeout);
      completeTimeout = null;
    }
  }

  function startNavigationProgress(): void {
    clearProgressTimers();
    isNavigating = true;
    navigationProgress = 12;

    progressInterval = setInterval(() => {
      navigationProgress = Math.min(
        92,
        navigationProgress + Math.max(1, (95 - navigationProgress) * 0.08),
      );
    }, 120);
  }

  function completeNavigationProgress(): void {
    clearProgressTimers();
    navigationProgress = 100;

    completeTimeout = setTimeout(() => {
      isNavigating = false;
      navigationProgress = 0;
      completeTimeout = null;
    }, 180);
  }

  beforeNavigate(({ to }) => {
    if (to) {
      startNavigationProgress();
    }
  });

  afterNavigate(() => {
    if (isNavigating) {
      completeNavigationProgress();
    }
  });

  let selectedProject = $derived.by<StackedProject | null>(() => {
    if (!data.selectedProjectId) {
      return null;
    }

    return (
      data.projects.find((project) => project.id === data.selectedProjectId) ??
      null
    );
  });

  function handleProjectChange(projectId: string): void {
    if (!projectId) {
      window.location.assign(resolve('/'));
      return;
    }

    window.location.assign(resolve(projectStacksPath(projectId)));
  }
</script>

{#if isNavigating}
  <div class="nav-progress" aria-hidden="true">
    <Progressbar
      animate
      color="primary"
      size="h-1"
      progress={navigationProgress}
      class="w-full rounded-none border-0 bg-[color-mix(in_oklab,var(--stacked-accent)_16%,transparent)]"
      classes={{
        inside:
          'rounded-none bg-[var(--stacked-accent-strong)] shadow-[0_0_12px_color-mix(in_oklab,var(--stacked-accent)_35%,transparent)]',
      }}
    />
  </div>
{/if}

<LayoutHead selectedProjectName={selectedProject?.name ?? null} />

<LayoutHeader
  projects={data.projects}
  selectedProjectId={data.selectedProjectId || null}
  onProjectChange={handleProjectChange}
/>

<ProjectErrorBanner message={data.projectLoadError} />

{@render children()}

<style>
  .nav-progress {
    position: fixed;
    inset: 0 0 auto 0;
    z-index: 70;
    pointer-events: none;
    line-height: 0;
  }
</style>
