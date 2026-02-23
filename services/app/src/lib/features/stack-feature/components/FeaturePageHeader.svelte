<script lang="ts">
  import { resolve } from '$app/paths';
  import StackStatusBadge from '$lib/components/stack/StackStatusBadge.svelte';
  import StackTypeBadge from '$lib/components/stack/StackTypeBadge.svelte';
  import type { StackViewModel } from '$lib/types/stack';

  let {
    stack,
    loadedAt,
    backHref,
  }: {
    stack: StackViewModel;
    loadedAt: string;
    backHref: `/projects/${string}/stacks`;
  } = $props();
</script>

<div
  class="mb-4 flex flex-wrap items-center justify-between gap-3 border-b stacked-divider pb-3"
>
  <a
    href={resolve(backHref)}
    data-sveltekit-reload
    class="stacked-link text-sm font-semibold">Back to features</a
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
      <StackTypeBadge type={stack.type} />
      <StackStatusBadge status={stack.status} />
    </div>
  </div>
  <p class="mt-2 text-sm stacked-subtle">
    {stack.notes ?? 'No description provided for this feature yet.'}
  </p>
</div>
