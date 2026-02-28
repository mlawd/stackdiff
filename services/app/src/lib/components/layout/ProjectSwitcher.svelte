<script lang="ts">
  import type { StackedProject } from '$lib/types/stack';

  interface Props {
    projects: StackedProject[];
    selectedProjectId: string | null;
    onChange: (projectId: string) => void;
  }

  let { projects, selectedProjectId, onChange }: Props = $props();

  function handleChange(event: Event): void {
    const projectId = (event.currentTarget as HTMLSelectElement).value;
    onChange(projectId);
  }
</script>

{#if projects.length > 0}
  <label class="text-xs font-medium stacked-subtle sm:text-sm">
    <span class="sr-only">Project</span>
    <select
      value={selectedProjectId ?? ''}
      onchange={handleChange}
      class="h-9 min-w-44 rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] pl-3 pr-9 text-xs text-[var(--stacked-text)] outline-none transition focus:border-[var(--stacked-accent)] sm:text-sm"
    >
      {#each projects as project (project.id)}
        <option value={project.id}>{project.name}</option>
      {/each}
    </select>
  </label>
{/if}
