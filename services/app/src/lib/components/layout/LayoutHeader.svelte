<script lang="ts">
  import { resolve } from '$app/paths';
  import { Button } from 'flowbite-svelte';

  import type { StackedProject } from '$lib/types/stack';
  import NotificationsToggleButton from '$lib/components/layout/NotificationsToggleButton.svelte';
  import ProjectSwitcher from '$lib/components/layout/ProjectSwitcher.svelte';

  interface Props {
    pipelineRoute: '/' | `/projects/${string}/stacks`;
    createFeatureRoute: '/' | `/projects/${string}/stacks/new`;
    projects: StackedProject[];
    selectedProjectId: string | null;
    onProjectChange: (projectId: string) => void;
  }

  let {
    pipelineRoute,
    createFeatureRoute,
    projects,
    selectedProjectId,
    onProjectChange,
  }: Props = $props();
</script>

<header
  class="stacked-fade-in mb-0 w-full border-b stacked-divider bg-[var(--stacked-surface)] px-4 py-3 sm:mb-0 sm:px-6"
>
  <div class="mx-auto flex w-full max-w-6xl items-center justify-between">
    <a
      href={resolve(pipelineRoute)}
      class="text-sm font-semibold tracking-wide text-[var(--stacked-text)] sm:text-base"
      >stackdiff</a
    >
    <div class="flex items-center gap-3">
      <NotificationsToggleButton />

      <ProjectSwitcher
        {projects}
        {selectedProjectId}
        onChange={onProjectChange}
      />

      <Button href={resolve(createFeatureRoute)} size="sm" color="primary">
        Create feature
      </Button>
    </div>
  </div>
</header>
