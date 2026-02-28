<script lang="ts">
  import { Spinner } from 'flowbite-svelte';
  import { tick } from 'svelte';

  import type {
    PlanningMessage,
    PlanningQuestionDialog,
  } from '$lib/types/stack';

  import { applyStreamEvent } from '$lib/components/chat/chat-stream';
  import type {
    ApiErrorEnvelope,
    ApiSuccessEnvelope,
    ChatAgent,
    SaveResponseBody,
    StreamDonePayload,
    StreamingAssistantMessage,
  } from '$lib/components/chat/chat-types';
  import ChatComposer from '$lib/components/chat/ChatComposer.svelte';
  import ChatMessageList from '$lib/components/chat/ChatMessageList.svelte';
  import ChatQuestionOverlay from '$lib/components/chat/ChatQuestionOverlay.svelte';
  import ChatStatusBanner from '$lib/components/chat/ChatStatusBanner.svelte';

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

  let initialized = false;
  let messages = $state<PlanningMessage[]>([]);
  let messagesViewport = $state<HTMLDivElement | null>(null);
  let messageInput = $state('');
  let sending = $state(false);
  let saving = $state(false);
  let streamingAssistantMessages = $state<StreamingAssistantMessage[]>([]);
  let errorMessage = $state<string | null>(null);
  let successMessage = $state<string | null>(null);
  let resumePendingStream = $state(false);
  let activeQuestionDialog = $state<PlanningQuestionDialog | null>(null);
  let activeQuestionRequestId = $state<string | null>(null);
  let activeQuestionIndex = $state(0);
  let questionSelections = $state<Record<number, string[]>>({});
  let questionCustomAnswers = $state<Record<number, string>>({});
  let selectedAgent = $state<ChatAgent>('plan');

  $effect(() => {
    selectedAgent = defaultAgent;
  });

  $effect(() => {
    if (initialized) {
      return;
    }

    messages = initialMessages;
    resumePendingStream = initialAwaitingResponse;
    initialized = true;
  });

  $effect(() => {
    if (!initialized || !resumePendingStream || sending) {
      return;
    }

    resumePendingStream = false;
    void streamMessage({ watch: true });
  });

  $effect(() => {
    messages.length;
    streamingAssistantMessages;

    if (!initialized) {
      return;
    }

    void scrollChatToBottom();
  });

  function initializeQuestionResponses(dialog: PlanningQuestionDialog): void {
    const nextSelections: Record<number, string[]> = {};
    const nextCustomAnswers: Record<number, string> = {};

    dialog.questions.forEach((_item, index) => {
      nextSelections[index] = [];
      nextCustomAnswers[index] = '';
    });

    activeQuestionIndex = 0;
    questionSelections = nextSelections;
    questionCustomAnswers = nextCustomAnswers;
  }

  function addOptimisticUserMessage(content: string): void {
    messages = [
      ...messages,
      {
        id: `optimistic-${crypto.randomUUID()}`,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      },
    ];
  }

  function appendAssistantMessage(content: string): void {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }

    messages = [
      ...messages,
      {
        id: `optimistic-assistant-${crypto.randomUUID()}`,
        role: 'assistant',
        content: trimmed,
        createdAt: new Date().toISOString(),
      },
    ];
  }

  function appendStreamingChunk(messageId: string, chunk: string): void {
    if (!chunk) {
      return;
    }

    const existingIndex = streamingAssistantMessages.findIndex(
      (message) => message.key === messageId,
    );

    if (existingIndex < 0) {
      streamingAssistantMessages = [
        ...streamingAssistantMessages,
        { key: messageId, content: chunk },
      ];
      return;
    }

    const updated = [...streamingAssistantMessages];
    const existing = updated[existingIndex];
    updated[existingIndex] = {
      ...existing,
      content: `${existing.content}${chunk}`,
    };
    streamingAssistantMessages = updated;
  }

  function appendStreamingAssistantMessagesToHistory(): boolean {
    const appendedMessages = streamingAssistantMessages
      .map((message) => message.content.trim())
      .filter((content) => content.length > 0)
      .map((content) => ({
        id: `optimistic-assistant-${crypto.randomUUID()}`,
        role: 'assistant' as const,
        content,
        createdAt: new Date().toISOString(),
      }));

    if (appendedMessages.length === 0) {
      return false;
    }

    messages = [...messages, ...appendedMessages];
    return true;
  }

  async function streamMessage(options: {
    content?: string;
    watch: boolean;
    questionReply?: {
      requestId: string;
      answers: string[][];
    };
  }): Promise<boolean> {
    let ok = true;
    sending = true;
    errorMessage = null;
    successMessage = null;
    streamingAssistantMessages = [];
    activeQuestionDialog = null;
    activeQuestionRequestId = null;
    activeQuestionIndex = 0;
    questionSelections = {};
    questionCustomAnswers = {};

    if (!options.watch && options.content) {
      addOptimisticUserMessage(options.content);
    }

    try {
      const response = await fetch(streamUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          options.watch
            ? { watch: true }
            : options.questionReply
              ? { questionReply: options.questionReply }
              : { content: options.content, agent: selectedAgent },
        ),
      });

      if (!response.ok) {
        const body = (await response.json()) as ApiErrorEnvelope;
        throw new Error(body.error?.message ?? 'Unable to send message.');
      }

      if (!response.body) {
        throw new Error('Streaming response body missing.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffered = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffered += decoder.decode(value, { stream: true });

        while (buffered.includes('\n\n')) {
          const splitAt = buffered.indexOf('\n\n');
          const eventBlock = buffered.slice(0, splitAt);
          buffered = buffered.slice(splitAt + 2);

          const result = applyStreamEvent(eventBlock);
          if (result.error) {
            throw new Error(result.error.message ?? 'Streaming failed.');
          }

          if (result.delta) {
            appendStreamingChunk(result.delta.messageId, result.delta.chunk);
          }

          if (result.question) {
            activeQuestionDialog = result.question.dialog;
            activeQuestionRequestId = result.question.requestId;
            initializeQuestionResponses(result.question.dialog);
          }

          if (result.done) {
            if (result.done.messages && result.done.messages.length > 0) {
              messages = result.done.messages;
            } else {
              const appendedStreamingMessages =
                appendStreamingAssistantMessagesToHistory();
              if (!appendedStreamingMessages) {
                appendAssistantMessage(result.done.assistantReply);
              }
            }

            if (formatDoneSuccess) {
              const doneSuccessMessage = formatDoneSuccess(result.done);
              if (doneSuccessMessage) {
                successMessage = doneSuccessMessage;
              }
            }
          }
        }
      }
    } catch (error) {
      ok = false;
      errorMessage =
        error instanceof Error ? error.message : 'Unable to send message.';
    } finally {
      sending = false;
      streamingAssistantMessages = [];
    }

    return ok;
  }

  async function submitCurrentMessage(): Promise<void> {
    if (sending || saving) {
      return;
    }

    const content = messageInput.trim();
    if (!content) {
      return;
    }

    messageInput = '';

    const ok = await streamMessage({ content, watch: false });
    if (!ok) {
      messageInput = content;
    }
  }

  async function scrollChatToBottom(): Promise<void> {
    await tick();
    if (!messagesViewport) {
      return;
    }

    messagesViewport.scrollTop = messagesViewport.scrollHeight;
  }

  function setSingleQuestionOption(
    questionIndex: number,
    optionLabel: string,
  ): void {
    questionSelections = {
      ...questionSelections,
      [questionIndex]: [optionLabel],
    };

    questionCustomAnswers = {
      ...questionCustomAnswers,
      [questionIndex]: '',
    };
  }

  function toggleQuestionOption(
    questionIndex: number,
    optionLabel: string,
    checked: boolean,
  ): void {
    const selected = questionSelections[questionIndex] ?? [];
    if (checked) {
      questionSelections = {
        ...questionSelections,
        [questionIndex]: selected.includes(optionLabel)
          ? selected
          : [...selected, optionLabel],
      };
      return;
    }

    questionSelections = {
      ...questionSelections,
      [questionIndex]: selected.filter((value) => value !== optionLabel),
    };
  }

  function setQuestionCustomAnswer(questionIndex: number, value: string): void {
    questionCustomAnswers = {
      ...questionCustomAnswers,
      [questionIndex]: value,
    };

    if (value.trim().length > 0) {
      questionSelections = {
        ...questionSelections,
        [questionIndex]: [],
      };
    }
  }

  function canAnswerQuestion(questionIndex: number): boolean {
    const selected = (questionSelections[questionIndex] ?? []).filter(
      (value) => value.trim().length > 0,
    );
    const customAnswer = (questionCustomAnswers[questionIndex] ?? '').trim();
    return selected.length > 0 || customAnswer.length > 0;
  }

  function canSubmitQuestionAnswers(): boolean {
    if (!activeQuestionDialog) {
      return false;
    }

    return activeQuestionDialog.questions.every((_item, index) => {
      return canAnswerQuestion(index);
    });
  }

  function goToPreviousQuestion(): void {
    activeQuestionIndex = Math.max(0, activeQuestionIndex - 1);
  }

  function goToNextQuestion(): void {
    if (!activeQuestionDialog || !canAnswerQuestion(activeQuestionIndex)) {
      return;
    }

    activeQuestionIndex = Math.min(
      activeQuestionDialog.questions.length - 1,
      activeQuestionIndex + 1,
    );
  }

  function buildToolQuestionAnswers(): string[][] {
    if (!activeQuestionDialog) {
      return [];
    }

    return activeQuestionDialog.questions.map((_item, index) => {
      const selected = questionSelections[index] ?? [];
      const customAnswer = (questionCustomAnswers[index] ?? '').trim();
      return customAnswer.length > 0 ? [...selected, customAnswer] : selected;
    });
  }

  function buildOptimisticQuestionAnswerMessage(
    dialog: PlanningQuestionDialog,
  ): string {
    const answers = dialog.questions.map((question, index) => {
      const selected = (questionSelections[index] ?? []).filter(
        (value) => value.trim().length > 0,
      );
      const customAnswer = (questionCustomAnswers[index] ?? '').trim();

      return {
        header: question.header,
        question: question.question,
        selected,
        customAnswer: customAnswer.length > 0 ? customAnswer : undefined,
      };
    });

    return JSON.stringify({
      type: 'question_answer',
      answers,
    });
  }

  async function submitQuestionAnswer(): Promise<void> {
    if (
      !activeQuestionDialog ||
      sending ||
      saving ||
      !canSubmitQuestionAnswers()
    ) {
      return;
    }

    if (!activeQuestionRequestId) {
      errorMessage = 'Question reply request id is missing.';
      return;
    }

    const optimisticQuestionAnswerMessage =
      buildOptimisticQuestionAnswerMessage(activeQuestionDialog);
    const toolAnswers = buildToolQuestionAnswers();
    addOptimisticUserMessage(optimisticQuestionAnswerMessage);
    await streamMessage({
      watch: false,
      questionReply: {
        requestId: activeQuestionRequestId,
        answers: toolAnswers,
      },
    });
  }

  async function saveConversation(): Promise<void> {
    if (!saveUrl) {
      return;
    }

    saving = true;
    errorMessage = null;
    successMessage = null;

    try {
      const response = await fetch(saveUrl, {
        method: 'POST',
      });
      const body = (await response.json()) as
        | ApiSuccessEnvelope<SaveResponseBody>
        | ApiErrorEnvelope;

      if (!response.ok) {
        throw new Error(
          (body as ApiErrorEnvelope).error?.message ?? 'Unable to save.',
        );
      }

      const payload = (body as ApiSuccessEnvelope<SaveResponseBody>).data;
      if (!payload) {
        throw new Error('Unable to save.');
      }

      if (payload.messages && payload.messages.length > 0) {
        messages = payload.messages;
      }

      if (onSaveResponse) {
        onSaveResponse(payload);
      }

      if (formatSaveSuccess) {
        const saveSuccessMessage = formatSaveSuccess(payload);
        if (saveSuccessMessage) {
          successMessage = saveSuccessMessage;
        }
      } else {
        successMessage = 'Saved.';
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Unable to save.';
    } finally {
      saving = false;
    }
  }

  function setMessageInput(value: string): void {
    messageInput = value;
  }

  function selectAgent(agent: ChatAgent): void {
    selectedAgent = agent;
  }
</script>

<ChatStatusBanner {errorMessage} {successMessage} />

<div class="flex h-full min-h-0 flex-col">
  <div class="relative mb-3 min-h-0 flex-1">
    <div
      bind:this={messagesViewport}
      class={`stacked-scroll h-full overflow-y-auto p-1 ${activeQuestionDialog ? 'pb-64' : 'pb-4'}`}
    >
      <ChatMessageList
        {messages}
        {streamingAssistantMessages}
        {sending}
        {emptyTitle}
        {emptyDescription}
      />
    </div>

    <ChatQuestionOverlay
      {activeQuestionDialog}
      {activeQuestionIndex}
      {questionSelections}
      {questionCustomAnswers}
      {sending}
      {saving}
      onPrevious={goToPreviousQuestion}
      onNext={goToNextQuestion}
      onSubmit={submitQuestionAnswer}
      onToggleOption={toggleQuestionOption}
      onSetSingleOption={setSingleQuestionOption}
      onSetCustomAnswer={setQuestionCustomAnswer}
      {canAnswerQuestion}
      {canSubmitQuestionAnswers}
    />
  </div>

  {#if sending && !activeQuestionDialog}
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
    {messageInput}
    {inputPlaceholder}
    {sending}
    {saving}
    saveEnabled={Boolean(saveUrl)}
    {saveButtonLabel}
    {showAgentSelector}
    {selectedAgent}
    onInput={setMessageInput}
    onSend={submitCurrentMessage}
    onSave={saveConversation}
    onSelectAgent={selectAgent}
  />
</div>
