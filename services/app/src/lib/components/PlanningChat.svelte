<script lang="ts">
  import ChatPanel from '$lib/components/ChatPanel.svelte';
  import type { PlanningMessage, StackPlanningSession } from '$lib/types/stack';

  interface StreamDonePayload extends Record<string, unknown> {
    autoSavedPlanPath?: string;
    autoSavedStageConfigPath?: string;
  }

  interface SaveResponse extends Record<string, unknown> {
    session?: StackPlanningSession;
    savedPlanPath?: string;
    savedStageConfigPath?: string;
  }

  interface Props {
    stackId: string;
    session: StackPlanningSession;
    messages: PlanningMessage[];
    awaitingResponse: boolean;
    onPlanSaved?: () => void | Promise<void>;
  }

  let { stackId, messages, awaitingResponse, onPlanSaved }: Props = $props();

  function formatDoneSuccess(payload: StreamDonePayload): string | null {
    if (payload.autoSavedPlanPath && payload.autoSavedStageConfigPath) {
      void onPlanSaved?.();
      return `Saved plan to ${payload.autoSavedPlanPath} and stage config to ${payload.autoSavedStageConfigPath}.`;
    }

    return null;
  }

  function formatSaveSuccess(payload: SaveResponse): string | null {
    if (payload.savedPlanPath && payload.savedStageConfigPath) {
      return `Saved plan to ${payload.savedPlanPath} and stage config to ${payload.savedStageConfigPath}.`;
    }

    return 'Saved plan.';
  }

  function handleSaveResponse(_payload: SaveResponse): void {
    void onPlanSaved?.();
  }
</script>

<ChatPanel
  streamUrl={`/api/stacks/${stackId}/plan/message/stream`}
  saveUrl={`/api/stacks/${stackId}/plan/save`}
  initialMessages={messages}
  initialAwaitingResponse={awaitingResponse}
  emptyTitle="No stages yet."
  emptyDescription="Start by describing what you want to ship. Ask questions and iterate until the plan is clear."
  saveButtonLabel="Save Plan"
  {formatDoneSuccess}
  {formatSaveSuccess}
  onSaveResponse={handleSaveResponse}
/>
