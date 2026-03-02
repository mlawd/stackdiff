<script lang="ts">
  import { Badge } from 'flowbite-svelte';

  import type { StackViewModel } from '$lib/types/stack';

  import StackTypeBadge from './StackTypeBadge.svelte';

  let {
    item,
  }: {
    item: StackViewModel;
  } = $props();

  const totalTasks = $derived(item.stages?.length ?? 0);
  const completedTasks = $derived(
    (item.stages ?? []).filter((stage) => stage.status === 'done').length,
  );
</script>

<StackTypeBadge type={item.type} />
{#if item.status === 'started'}
  <Badge
    rounded
    color="gray"
    class="inline-flex items-center whitespace-nowrap border-[1px] border-[var(--stacked-border-soft)] bg-[color-mix(in_oklab,var(--stacked-bg-soft)_88%,#0d0f14_12%)] text-[0.72rem] font-semibold tracking-[0.02em] text-[var(--stacked-text-muted)]"
  >
    {completedTasks}/{totalTasks}
  </Badge>
{/if}
