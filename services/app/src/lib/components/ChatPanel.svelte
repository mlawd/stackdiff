<script lang="ts">
  import { Spinner } from 'flowbite-svelte';

  import type { PlanningMessage } from '$lib/types/stack';

  import type {
    ChatAgent,
    SaveResponseBody,
    StreamDonePayload,
  } from '$lib/components/chat/chat-types';
  import ChatComposer from '$lib/components/chat/ChatComposer.svelte';
  import ChatMessageList from '$lib/components/chat/ChatMessageList.svelte';
  import ChatQuestionOverlay from '$lib/components/chat/ChatQuestionOverlay.svelte';
  import ChatStatusBanner from '$lib/components/chat/ChatStatusBanner.svelte';
  import { useChatPanel } from '$lib/components/chat/use-chat-panel.svelte';

  interface Props {
    streamUrl: string;
    initialMessages: PlanningMessage[];
    initialAwaitingResponse?: boolean;
    saveUrl?: string;
    inputPlaceholder?: string;
    emptyTitle?: string;
    emptyDescription?: string;
    saveButtonLabel?: string;
    formatDoneSuccess?: (payload: StreamDonePayload) => string | null;
    formatSaveSuccess?: (payload: SaveResponseBody) => string | null;
    onSaveResponse?: (payload: SaveResponseBody) => void;
    showAgentSelector?: boolean;
    defaultAgent?: ChatAgent;
  }

  let {
    streamUrl,
    initialMessages,
    initialAwaitingResponse = false,
    saveUrl,
    inputPlaceholder = 'Reply to the agent...',
    emptyTitle = 'No messages yet.',
    emptyDescription = 'Start by describing what you want to ship.',
    saveButtonLabel = 'Save',
    formatDoneSuccess,
    formatSaveSuccess,
    onSaveResponse,
    showAgentSelector = false,
    defaultAgent = 'plan',
  }: Props = $props();

  const chatPanel = useChatPanel({
    streamUrl: () => streamUrl,
    initialMessages: () => initialMessages,
    initialAwaitingResponse: () => initialAwaitingResponse,
    saveUrl: () => saveUrl,
    formatDoneSuccess: () => formatDoneSuccess,
    formatSaveSuccess: () => formatSaveSuccess,
    onSaveResponse: () => onSaveResponse,
    defaultAgent: () => defaultAgent,
  });
</script>

<ChatStatusBanner
  errorMessage={chatPanel.errorMessage}
  successMessage={chatPanel.successMessage}
/>

<div class="flex h-full min-h-0 flex-col">
  <div class="relative mb-3 min-h-0 flex-1">
    <div
      {@attach chatPanel.messagesViewportAttachment}
      class={`stacked-scroll h-full overflow-y-auto p-1 ${chatPanel.activeQuestionDialog ? 'pb-64' : 'pb-4'}`}
    >
      <ChatMessageList
        messages={chatPanel.messages}
        streamingAssistantMessages={chatPanel.streamingAssistantMessages}
        sending={chatPanel.sending}
        {emptyTitle}
        {emptyDescription}
      />
    </div>

    <ChatQuestionOverlay
      activeQuestionDialog={chatPanel.activeQuestionDialog}
      activeQuestionIndex={chatPanel.activeQuestionIndex}
      questionSelections={chatPanel.questionSelections}
      questionCustomAnswers={chatPanel.questionCustomAnswers}
      sending={chatPanel.sending}
      saving={chatPanel.saving}
      onPrevious={chatPanel.goToPreviousQuestion}
      onNext={chatPanel.goToNextQuestion}
      onSubmit={chatPanel.submitQuestionAnswer}
      onToggleOption={chatPanel.toggleQuestionOption}
      onSetSingleOption={chatPanel.setSingleQuestionOption}
      onSetCustomAnswer={chatPanel.setQuestionCustomAnswer}
      canAnswerQuestion={chatPanel.canAnswerQuestion}
      canSubmitQuestionAnswers={chatPanel.canSubmitQuestionAnswers}
    />
  </div>

  {#if chatPanel.sending && !chatPanel.activeQuestionDialog}
    <div
      class="stacked-chat-font mb-2 flex items-center gap-2 px-1 text-sm stacked-subtle"
      aria-live="polite"
    >
      <Spinner
        size="4"
        currentFill="var(--stacked-accent)"
        currentColor="color-mix(in oklab, var(--stacked-border-soft) 82%, #9aa3b7 18%)"
        class="opacity-90"
      />
      <span>Assistant is thinking...</span>
    </div>
  {/if}

  <ChatComposer
    messageInput={chatPanel.messageInput}
    {inputPlaceholder}
    sending={chatPanel.sending}
    saving={chatPanel.saving}
    saveEnabled={Boolean(saveUrl)}
    {saveButtonLabel}
    {showAgentSelector}
    selectedAgent={chatPanel.selectedAgent}
    onInput={chatPanel.setMessageInput}
    onSend={chatPanel.submitCurrentMessage}
    onSave={chatPanel.saveConversation}
    onSelectAgent={chatPanel.selectAgent}
  />
</div>
