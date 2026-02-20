<script lang="ts">
  import PlanningChat from '$lib/components/PlanningChat.svelte';
  import type { PlanningMessage, StackPlanningSession } from '$lib/types/stack';

  let {
    stackId,
    session,
    messages,
    awaitingResponse,
  }: {
    stackId: string;
    session: StackPlanningSession;
    messages: PlanningMessage[];
    awaitingResponse: boolean;
  } = $props();
</script>

<div>
  <PlanningChat {stackId} {session} {messages} {awaitingResponse} />
</div>
