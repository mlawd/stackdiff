<script lang="ts">
  import { resolve } from '$app/paths';
  import type { Snippet } from 'svelte';
  import type { StackedProject } from '$lib/types/stack';
  import LayoutHead from '$lib/components/layout/LayoutHead.svelte';
  import LayoutHeader from '$lib/components/layout/LayoutHeader.svelte';
  import ProjectErrorBanner from '$lib/components/layout/ProjectErrorBanner.svelte';
  import { projectStacksPath } from '$lib/project-paths';

  import type { LayoutData } from './$types';

  import '../app.css';

  let { children, data }: { children: Snippet; data: LayoutData } = $props();

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

<LayoutHead selectedProjectName={selectedProject?.name ?? null} />

<LayoutHeader
  projects={data.projects}
  selectedProjectId={data.selectedProjectId || null}
  onProjectChange={handleProjectChange}
/>

<ProjectErrorBanner message={data.projectLoadError} />

{@render children()}
