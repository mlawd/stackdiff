<script lang="ts">
  import { Badge } from 'flowbite-svelte';

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

<Badge rounded color={typeColor[type]}>{typeLabel[type]}</Badge>
