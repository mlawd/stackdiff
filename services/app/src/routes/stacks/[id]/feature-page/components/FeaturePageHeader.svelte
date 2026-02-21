<script lang="ts">
  import { Badge } from 'flowbite-svelte';

  import type { StackStatus, StackViewModel } from '$lib/types/stack';
  import { statusLabel, typeLabel } from '../behavior';

  type BadgeColor = 'gray' | 'yellow' | 'green' | 'red' | 'purple';

  const typeColor: Record<StackViewModel['type'], BadgeColor> = {
    feature: 'purple',
    bugfix: 'red',
    chore: 'gray',
  };

  const statusColor: Record<StackStatus, BadgeColor> = {
    created: 'gray',
    planned: 'yellow',
    started: 'purple',
    complete: 'green',
  };

  let {
    stack,
    loadedAt,
    backHref,
  }: {
    stack: StackViewModel;
    loadedAt: string;
    backHref: string;
  } = $props();
</script>

<div
  class="mb-4 flex flex-wrap items-center justify-between gap-3 border-b stacked-divider pb-3"
>
  <a href={backHref} class="stacked-link text-sm font-semibold"
    >Back to features</a
  >
  <p class="text-xs stacked-subtle">
    Loaded {new Date(loadedAt).toLocaleString()}
  </p>
</div>

<div class="mb-4">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">
      {stack.name}
    </h1>
    <div class="flex flex-wrap items-center gap-2">
      <Badge rounded color={typeColor[stack.type]}>{typeLabel[stack.type]}</Badge>
      <Badge rounded color={statusColor[stack.status]}
        >{statusLabel[stack.status]}</Badge
      >
    </div>
  </div>
  <p class="mt-2 text-sm stacked-subtle">
    {stack.notes ?? 'No description provided for this feature yet.'}
  </p>
</div>
