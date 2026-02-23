<script lang="ts">
  import ChatPanel from '$lib/components/ChatPanel.svelte';
  import type { PlanningMessage } from '$lib/types/stack';

  interface Props {
    stackId: string;
    stageId: string;
    messages: PlanningMessage[];
    awaitingResponse: boolean;
  }

  let { stackId, stageId, messages, awaitingResponse }: Props = $props();
</script>

<ChatPanel
  streamUrl={`/api/stacks/${stackId}/stages/${stageId}/review/message/stream`}
  initialMessages={messages}
  initialAwaitingResponse={awaitingResponse}
  emptyTitle="No review messages yet."
  emptyDescription="PR comments have been seeded as context. Add feedback and ask for a fix plan."
  inputPlaceholder="Add review feedback or ask for a fix plan..."
  showAgentSelector
  defaultAgent="plan"
/>
