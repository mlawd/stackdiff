<script lang="ts">
  import type { StackViewModel } from '$lib/types/stack';
  import { statusClass, statusLabel, typeClass, typeLabel } from '../behavior';

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
      <span class={typeClass[stack.type]}>{typeLabel[stack.type]}</span>
      <span class={statusClass[stack.status]}>{statusLabel[stack.status]}</span>
    </div>
  </div>
  <p class="mt-2 text-sm stacked-subtle">
    {stack.notes ?? 'No description provided for this feature yet.'}
  </p>
</div>
