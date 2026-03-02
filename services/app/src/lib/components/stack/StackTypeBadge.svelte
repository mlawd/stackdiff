<script lang="ts">
  import { Badge } from 'flowbite-svelte';
  import {
    BugSolid,
    LightbulbSolid,
    ToolsOutline,
  } from 'flowbite-svelte-icons';

  import type { FeatureType } from '$lib/types/stack';

  type BadgeColor = 'gray' | 'red' | 'purple';

  const typeLabel: Record<FeatureType, string> = {
    feature: 'Feature',
    bugfix: 'Bugfix',
    chore: 'Chore',
  };

  const typeColor: Record<FeatureType, BadgeColor> = {
    feature: 'purple',
    bugfix: 'red',
    chore: 'gray',
  };

  let { type }: { type: FeatureType } = $props();
</script>

<Badge rounded color={typeColor[type]} class="inline-flex items-center gap-1.5">
  {#if type === 'feature'}
    <LightbulbSolid class="h-3.5 w-3.5" aria-hidden="true" />
  {:else if type === 'bugfix'}
    <BugSolid class="h-3.5 w-3.5" aria-hidden="true" />
  {:else}
    <ToolsOutline class="h-3.5 w-3.5" aria-hidden="true" />
  {/if}
  <span>{typeLabel[type]}</span>
</Badge>
