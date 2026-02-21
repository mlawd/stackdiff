<script lang="ts">
  import { Badge } from 'flowbite-svelte';

  import type { StackStatus } from '$lib/types/stack';

  type BadgeColor = 'gray' | 'yellow' | 'green' | 'purple';

  const statusLabel: Record<StackStatus, string> = {
    created: 'Created',
    planned: 'Planned',
    started: 'Started',
    complete: 'Complete',
  };

  const statusColor: Record<StackStatus, BadgeColor> = {
    created: 'gray',
    planned: 'yellow',
    started: 'purple',
    complete: 'green',
  };

  let { status }: { status: StackStatus } = $props();
</script>

<Badge rounded color={statusColor[status]}>{statusLabel[status]}</Badge>
