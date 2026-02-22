<script lang="ts">
  import { tick } from 'svelte';
  import { Button, Spinner } from 'flowbite-svelte';

  import { renderMarkdown } from '$lib/markdown';
  import type {
    PlanningMessage,
    PlanningQuestionDialog,
    PlanningQuestionItem,
    PlanningQuestionOption,
  } from '$lib/types/stack';

  interface StreamDonePayload extends Record<string, unknown> {
    assistantReply: string;
    messages?: PlanningMessage[];
  }

  interface StreamQuestionPayload extends Record<string, unknown> {
    requestId?: string;
    source?: string;
  }

  interface StreamErrorPayload {
    message?: string;
  }

  interface SaveResponseBody extends Record<string, unknown> {
    messages?: PlanningMessage[];
  }

  interface ApiErrorEnvelope {
    error?: {
      message?: string;
    };
  }

  interface ApiSuccessEnvelope<T> {
    data?: T;
  }

  interface StageSummaryItem {
    stageName: string;
    stageDescription: string;
  }

  interface QuestionAnswerItem {
    question: string;
    selected: string[];
    customAnswer?: string;
  }

  const SAVE_PLAN_PROMPT_PREFIX =
    'Create a detailed implementation plan and stages config from this conversation.';

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
  }: Props = $props();

  let initialized = false;
  let messages = $state<PlanningMessage[]>([]);
  let messagesViewport = $state<HTMLDivElement | null>(null);
  let messageInput = $state('');
  let sending = $state(false);
  let saving = $state(false);
  let streamingReply = $state('');
  let assistantThinking = $state(false);
  let errorMessage = $state<string | null>(null);
  let successMessage = $state<string | null>(null);
  let resumePendingStream = $state(false);
  let activeQuestionDialog = $state<PlanningQuestionDialog | null>(null);
  let activeQuestionRequestId = $state<string | null>(null);
  let activeQuestionIndex = $state(0);
  let questionSelections = $state<Record<number, string[]>>({});
  let questionCustomAnswers = $state<Record<number, string>>({});

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
    streamingReply;
    assistantThinking;

    if (!initialized) {
      return;
    }

    void scrollChatToBottom();
  });

  function normalizeQuestionOption(
    option: unknown,
  ): PlanningQuestionOption | null {
    if (typeof option === 'string') {
      const label = option.trim();
      if (!label) {
        return null;
      }

      return { label };
    }

    if (typeof option !== 'object' || option === null) {
      return null;
    }

    const candidate = option as {
      label?: unknown;
      text?: unknown;
      value?: unknown;
      description?: unknown;
    };

    const label =
      typeof candidate.label === 'string'
        ? candidate.label.trim()
        : typeof candidate.text === 'string'
          ? candidate.text.trim()
          : typeof candidate.value === 'string'
            ? candidate.value.trim()
            : '';

    if (!label) {
      return null;
    }

    const description =
      typeof candidate.description === 'string' &&
      candidate.description.trim().length > 0
        ? candidate.description.trim()
        : undefined;

    return { label, description };
  }

  function normalizeQuestionItem(item: unknown): PlanningQuestionItem | null {
    if (typeof item !== 'object' || item === null) {
      return null;
    }

    const candidate = item as {
      header?: unknown;
      title?: unknown;
      question?: unknown;
      prompt?: unknown;
      text?: unknown;
      label?: unknown;
      options?: unknown;
      choices?: unknown;
      multiple?: unknown;
      allowCustom?: unknown;
      custom?: unknown;
    };

    const header =
      typeof candidate.header === 'string' && candidate.header.trim().length > 0
        ? candidate.header.trim()
        : typeof candidate.title === 'string' &&
            candidate.title.trim().length > 0
          ? candidate.title.trim()
          : 'Question';

    const question =
      typeof candidate.question === 'string'
        ? candidate.question.trim()
        : typeof candidate.prompt === 'string'
          ? candidate.prompt.trim()
          : typeof candidate.text === 'string'
            ? candidate.text.trim()
            : typeof candidate.label === 'string'
              ? candidate.label.trim()
              : '';

    const optionsRaw = Array.isArray(candidate.options)
      ? candidate.options
      : Array.isArray(candidate.choices)
        ? candidate.choices
        : [];

    const options = optionsRaw
      .map((option) => normalizeQuestionOption(option))
      .filter((option): option is PlanningQuestionOption => option !== null);

    const allowCustom =
      candidate.allowCustom === true ||
      candidate.custom === true ||
      (candidate.allowCustom === undefined &&
        candidate.custom === undefined &&
        options.length === 0);

    if (!question || (options.length === 0 && !allowCustom)) {
      return null;
    }

    return {
      header,
      question,
      options,
      multiple: candidate.multiple === true,
      allowCustom,
    };
  }

  function normalizeQuestionDialog(
    payload: unknown,
  ): PlanningQuestionDialog | null {
    if (typeof payload !== 'object' || payload === null) {
      return null;
    }

    const candidate = payload as {
      questions?: unknown;
      question?: unknown;
      prompt?: unknown;
      options?: unknown;
      choices?: unknown;
    };

    if (Array.isArray(candidate.questions)) {
      const questions = candidate.questions
        .map((item) => normalizeQuestionItem(item))
        .filter((item): item is PlanningQuestionItem => item !== null);

      if (questions.length > 0) {
        return { questions };
      }
    }

    if (
      candidate.question ||
      candidate.prompt ||
      candidate.options ||
      candidate.choices
    ) {
      const fallback = normalizeQuestionItem(payload);
      if (fallback) {
        return {
          questions: [fallback],
        };
      }

      const nested = normalizeQuestionItem(candidate.question);
      if (nested) {
        return {
          questions: [nested],
        };
      }
    }

    return null;
  }

  function parseQuestionDialogMessage(
    content: string,
  ): PlanningQuestionDialog | null {
    const trimmed = content.trim();
    if (!trimmed.startsWith('{')) {
      return null;
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return normalizeQuestionDialog(parsed);
    } catch {
      return null;
    }
  }

  function parseQuestionAnswerMessage(
    content: string,
  ): QuestionAnswerItem[] | null {
    const trimmed = content.trim();
    if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }

    const fromArrayAnswers = (answers: unknown): QuestionAnswerItem[] => {
      if (!Array.isArray(answers)) {
        return [];
      }

      return answers
        .map((answer, index) => {
          if (Array.isArray(answer)) {
            const selected = answer
              .map((value) => (typeof value === 'string' ? value.trim() : ''))
              .filter((value) => value.length > 0);
            return selected.length > 0
              ? {
                  question: `Question ${index + 1}`,
                  selected,
                }
              : null;
          }

          if (typeof answer !== 'object' || answer === null) {
            return null;
          }

          const candidate = answer as {
            header?: unknown;
            question?: unknown;
            selected?: unknown;
            customAnswer?: unknown;
          };

          const question =
            typeof candidate.question === 'string' &&
            candidate.question.trim().length > 0
              ? candidate.question.trim()
              : typeof candidate.header === 'string' &&
                  candidate.header.trim().length > 0
                ? candidate.header.trim()
                : `Question ${index + 1}`;

          const selected = Array.isArray(candidate.selected)
            ? candidate.selected
                .map((value) => (typeof value === 'string' ? value.trim() : ''))
                .filter((value) => value.length > 0)
            : [];

          const customAnswer =
            typeof candidate.customAnswer === 'string' &&
            candidate.customAnswer.trim().length > 0
              ? candidate.customAnswer.trim()
              : undefined;

          if (selected.length === 0 && !customAnswer) {
            return null;
          }

          return {
            question,
            selected,
            customAnswer,
          };
        })
        .filter((item): item is QuestionAnswerItem => item !== null);
    };

    if (Array.isArray(parsed)) {
      const answers = fromArrayAnswers(parsed);
      return answers.length > 0 ? answers : null;
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    const candidate = parsed as { type?: unknown; answers?: unknown };
    if (
      candidate.type === 'question_answer' ||
      Array.isArray(candidate.answers)
    ) {
      const answers = fromArrayAnswers(candidate.answers);
      return answers.length > 0 ? answers : null;
    }

    return null;
  }

  function findPreviousQuestionDialog(
    history: PlanningMessage[],
    beforeIndex: number,
  ): PlanningQuestionDialog | null {
    for (let index = beforeIndex - 1; index >= 0; index -= 1) {
      const message = history[index];
      if (message.role === 'user') {
        continue;
      }

      const dialog = parseQuestionDialogMessage(message.content);
      if (dialog) {
        return dialog;
      }
    }

    return null;
  }

  function parseStageSummary(content: string): StageSummaryItem[] | null {
    const trimmed = content.trim();
    if (!trimmed.startsWith('{')) {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    const candidate = parsed as {
      stages?: unknown;
    };

    if (!Array.isArray(candidate.stages)) {
      return null;
    }

    const stages = candidate.stages
      .map((entry) => {
        if (typeof entry !== 'object' || entry === null) {
          return null;
        }

        const stage = entry as {
          stageName?: unknown;
          name?: unknown;
          title?: unknown;
          stageDescription?: unknown;
          description?: unknown;
          details?: unknown;
        };

        const stageName =
          typeof stage.stageName === 'string'
            ? stage.stageName.trim()
            : typeof stage.name === 'string'
              ? stage.name.trim()
              : typeof stage.title === 'string'
                ? stage.title.trim()
                : '';

        const stageDescription =
          typeof stage.stageDescription === 'string'
            ? stage.stageDescription.trim()
            : typeof stage.description === 'string'
              ? stage.description.trim()
              : typeof stage.details === 'string'
                ? stage.details.trim()
                : '';

        if (!stageName || !stageDescription) {
          return null;
        }

        return { stageName, stageDescription };
      })
      .filter((item): item is StageSummaryItem => item !== null);

    return stages.length > 0 ? stages : null;
  }

  function isJsonObjectOrArray(content: string): boolean {
    const trimmed = content.trim();
    if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
      return false;
    }

    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      return false;
    }
  }

  function getDisplayMessageContent(message: PlanningMessage): string {
    if (
      message.role === 'user' &&
      message.content.startsWith(SAVE_PLAN_PROMPT_PREFIX) &&
      message.content.includes('Return ONLY valid JSON')
    ) {
      return 'Save plan';
    }

    return message.content;
  }

  function isSavePlanPromptMessage(message: PlanningMessage): boolean {
    return getDisplayMessageContent(message) === 'Save plan';
  }

  function initializeQuestionResponses(dialog: PlanningQuestionDialog): void {
    const nextSelections: Record<number, string[]> = {};
    const nextCustomAnswers: Record<number, string> = {};

    dialog.questions.forEach((item, index) => {
      nextSelections[index] = [];
      nextCustomAnswers[index] = '';
    });

    activeQuestionIndex = 0;
    questionSelections = nextSelections;
    questionCustomAnswers = nextCustomAnswers;
  }

  function getActiveQuestion(): PlanningQuestionItem | null {
    if (!activeQuestionDialog) {
      return null;
    }

    return activeQuestionDialog.questions[activeQuestionIndex] ?? null;
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

  function applyStreamEvent(eventBlock: string): {
    done?: StreamDonePayload;
    error?: StreamErrorPayload;
    question?: {
      dialog: PlanningQuestionDialog;
      requestId: string | null;
    };
  } {
    const lines = eventBlock.split('\n');
    const event =
      lines
        .find((line) => line.startsWith('event:'))
        ?.slice(6)
        .trim() ?? 'message';
    const dataLine = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('');

    if (!dataLine) {
      return {};
    }

    let payload: unknown;
    try {
      payload = JSON.parse(dataLine) as unknown;
    } catch {
      return {};
    }

    if (event === 'start') {
      assistantThinking = true;
      return {};
    }

    if (event === 'delta') {
      const chunk =
        typeof payload === 'object' &&
        payload !== null &&
        'chunk' in payload &&
        typeof payload.chunk === 'string'
          ? payload.chunk
          : '';
      if (chunk) {
        assistantThinking = false;
        streamingReply += chunk;
      }
      return {};
    }

    if (event === 'question') {
      const question = normalizeQuestionDialog(payload);
      if (question) {
        const envelope = payload as StreamQuestionPayload;
        const requestId =
          typeof envelope.requestId === 'string' &&
          envelope.requestId.length > 0
            ? envelope.requestId
            : null;
        return {
          question: {
            dialog: question,
            requestId,
          },
        };
      }
    }

    if (event === 'done' && typeof payload === 'object' && payload !== null) {
      return { done: payload as StreamDonePayload };
    }

    if (event === 'error' && typeof payload === 'object' && payload !== null) {
      return { error: payload as StreamErrorPayload };
    }

    return {};
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
    streamingReply = '';
    assistantThinking = true;
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
              : { content: options.content },
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

          if (result.question) {
            activeQuestionDialog = result.question.dialog;
            activeQuestionRequestId = result.question.requestId;
            initializeQuestionResponses(result.question.dialog);
            assistantThinking = false;
          }

          if (result.done) {
            if (result.done.messages && result.done.messages.length > 0) {
              messages = result.done.messages;
            } else {
              appendAssistantMessage(result.done.assistantReply);
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
      assistantThinking = false;
      streamingReply = '';
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

  async function sendMessage(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    await submitCurrentMessage();
  }

  async function handleInputKeydown(event: KeyboardEvent): Promise<void> {
    if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) {
      return;
    }

    event.preventDefault();
    await submitCurrentMessage();
  }

  async function scrollChatToBottom(): Promise<void> {
    await tick();
    if (!messagesViewport) {
      return;
    }

    messagesViewport.scrollTop = messagesViewport.scrollHeight;
  }

  function isQuestionOptionSelected(
    questionIndex: number,
    optionLabel: string,
  ): boolean {
    const selected = questionSelections[questionIndex] ?? [];
    return selected.includes(optionLabel);
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

    return activeQuestionDialog.questions.every((item, index) => {
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
</script>

{#if errorMessage}
  <div
    class="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
  >
    {errorMessage}
  </div>
{/if}

{#if successMessage}
  <div
    class="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
  >
    {successMessage}
  </div>
{/if}

<div class="relative mb-3 h-[26rem] sm:h-[35rem]">
  <div
    bind:this={messagesViewport}
    class={`stacked-scroll h-full overflow-y-auto p-1 ${activeQuestionDialog ? 'pb-64' : ''}`}
  >
    {#if messages.length === 0 && !sending}
      <div
        class="stacked-chat-font h-full content-center text-sm stacked-subtle"
      >
        <p class="mb-2 font-semibold text-[var(--stacked-text)]">
          {emptyTitle}
        </p>
        <p>{emptyDescription}</p>
      </div>
    {:else}
      <div class="space-y-3">
        {#each messages as message, messageIndex (message.id)}
          {@const messageQuestionDialog =
            message.role !== 'user'
              ? parseQuestionDialogMessage(message.content)
              : null}
          {@const messageQuestionAnswers =
            message.role !== 'assistant'
              ? parseQuestionAnswerMessage(message.content)
              : null}
          {@const answeredQuestionDialog = messageQuestionAnswers
            ? findPreviousQuestionDialog(messages, messageIndex)
            : null}
          {@const messageStageSummary =
            message.role === 'assistant'
              ? parseStageSummary(message.content)
              : null}
          {@const renderAsUserBubble =
            message.role === 'user' || Boolean(messageQuestionAnswers)}
          {@const hideRawToolPayload =
            (message.role === 'tool' || message.role === 'system') &&
            !messageQuestionDialog &&
            !messageQuestionAnswers &&
            !messageStageSummary &&
            isJsonObjectOrArray(message.content)}
          {#if !hideRawToolPayload}
            <div
              class={`stacked-chat-font w-fit max-w-[90%] rounded-2xl border px-4 py-3 text-sm ${
                renderAsUserBubble
                  ? 'ml-auto rounded-br-none border-[var(--stacked-accent)] bg-blue-500/20 text-blue-50'
                  : 'mr-auto rounded-bl-none border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] text-[var(--stacked-text)]'
              }`}
            >
              <p class="mb-1 text-[11px] uppercase tracking-wide opacity-70">
                {renderAsUserBubble
                  ? 'user'
                  : message.role === 'assistant'
                    ? 'agent'
                    : message.role === 'tool'
                      ? 'tool'
                      : message.role}
              </p>
              {#if messageQuestionDialog}
                <div class="space-y-2">
                  <p class="stacked-subtle text-xs uppercase tracking-wide">
                    Questions asked
                  </p>
                  {#each messageQuestionDialog.questions as question, questionIndex (`${question.header}-${questionIndex}`)}
                    <div
                      class="rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg)]/40 p-3"
                    >
                      <p
                        class="text-xs font-semibold uppercase tracking-wide opacity-70"
                      >
                        {question.header}
                      </p>
                      <p class="mt-1 text-sm">{question.question}</p>
                      {#if question.options.length > 0}
                        <ul class="mt-2 space-y-1 text-sm">
                          {#each question.options as option, optionIndex (`${option.label}-${optionIndex}`)}
                            <li class="stacked-subtle">
                              - {option.label}
                              {#if option.description}
                                <span class="opacity-80">
                                  ({option.description})</span
                                >
                              {/if}
                            </li>
                          {/each}
                        </ul>
                      {/if}
                      {#if question.allowCustom}
                        <p class="mt-2 text-xs stacked-subtle">
                          Includes custom answer input.
                        </p>
                      {/if}
                    </div>
                  {/each}
                </div>
              {:else if messageQuestionAnswers}
                <div class="space-y-2">
                  <p class="stacked-subtle text-xs uppercase tracking-wide">
                    Answers given
                  </p>
                  {#each messageQuestionAnswers as answer, answerIndex (`${answer.question}-${answerIndex}`)}
                    {@const matchedQuestion =
                      answeredQuestionDialog?.questions[answerIndex]}
                    {@const answerValue = [
                      ...answer.selected,
                      ...(answer.customAnswer ? [answer.customAnswer] : []),
                    ].join(', ')}
                    <div
                      class="rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg)]/40 p-3"
                    >
                      <p
                        class="text-xs font-semibold uppercase tracking-wide opacity-70"
                      >
                        {matchedQuestion?.header ??
                          `Question ${answerIndex + 1}`}
                      </p>
                      <p class="mt-1 text-sm">{answerValue}</p>
                    </div>
                  {/each}
                </div>
              {:else if messageStageSummary}
                <div class="space-y-2">
                  <p class="stacked-subtle text-xs uppercase tracking-wide">
                    Stages
                  </p>
                  {#each messageStageSummary as stage, stageIndex (`${stage.stageName}-${stageIndex}`)}
                    <p class="leading-snug">
                      <span class="text-sm font-semibold"
                        >{stage.stageName}</span
                      >
                      <span class="mx-1 opacity-70">-</span>
                      <span class="text-sm">{stage.stageDescription}</span>
                    </p>
                  {/each}
                </div>
              {:else if isSavePlanPromptMessage(message)}
                <div
                  class="inline-flex items-center gap-2 rounded-full border border-blue-300/50 bg-blue-400/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-100"
                >
                  <span class="opacity-80">Action</span>
                  <span class="h-1 w-1 rounded-full bg-blue-100/80"></span>
                  <span>Save plan</span>
                </div>
              {:else}
                <div class="stacked-markdown">
                  {@html renderMarkdown(getDisplayMessageContent(message))}
                </div>
              {/if}
            </div>
          {/if}
        {/each}

        {#if sending}
          <div
            class="stacked-chat-font mr-auto w-fit max-w-[90%] rounded-2xl rounded-bl-none border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-4 py-3 text-sm text-[var(--stacked-text)]"
          >
            <p class="mb-1 text-[11px] uppercase tracking-wide opacity-70">
              agent
            </p>
            {#if assistantThinking && !streamingReply}
              <div class="stacked-subtle flex items-center gap-2">
                <Spinner
                  size="4"
                  currentFill="var(--stacked-accent)"
                  currentColor="color-mix(in oklab, var(--stacked-border-soft) 82%, #9aa3b7 18%)"
                  class="opacity-90"
                />
                <span>Assistant is thinking...</span>
              </div>
            {:else}
              <div class="stacked-markdown">
                {@html renderMarkdown(streamingReply)}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </div>

  {#if activeQuestionDialog}
    {@const activeQuestion = getActiveQuestion()}
    {#if activeQuestion}
      <div
        class="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-2 sm:p-3"
      >
        <div
          class="pointer-events-auto rounded-2xl border border-[var(--stacked-border-soft)] bg-[color-mix(in_oklab,var(--stacked-bg-soft)_86%,black_14%)] px-4 py-3 shadow-xl backdrop-blur-sm stacked-chat-font text-sm text-[var(--stacked-text)]"
        >
          <div class="mb-2 flex items-center justify-between gap-3">
            <p class="text-[11px] uppercase tracking-wide opacity-70">
              agent question
            </p>
            <p class="stacked-subtle text-xs">
              Question {activeQuestionIndex + 1} of {activeQuestionDialog
                .questions.length}
            </p>
          </div>
          <div
            class="rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)]/60 p-3"
          >
            <p class="text-xs font-semibold uppercase tracking-wide opacity-70">
              {activeQuestion.header}
            </p>
            <p class="mt-1 text-sm">{activeQuestion.question}</p>
            <div class="mt-2 space-y-2">
              {#each activeQuestion.options as option, optionIndex (`${option.label}-${optionIndex}`)}
                <label
                  class="flex items-start gap-2 rounded-md border border-transparent px-2 py-1.5 transition hover:border-[var(--stacked-border-soft)] hover:bg-[var(--stacked-bg)]/50"
                >
                  <input
                    type={activeQuestion.multiple ? 'checkbox' : 'radio'}
                    name={`question-${activeQuestionIndex}`}
                    checked={isQuestionOptionSelected(
                      activeQuestionIndex,
                      option.label,
                    )}
                    onchange={(event) => {
                      const target = event.currentTarget as HTMLInputElement;
                      if (activeQuestion.multiple) {
                        toggleQuestionOption(
                          activeQuestionIndex,
                          option.label,
                          target.checked,
                        );
                        return;
                      }
                      setSingleQuestionOption(
                        activeQuestionIndex,
                        option.label,
                      );
                    }}
                  />
                  <span class="leading-snug">
                    <span class="block text-sm">{option.label}</span>
                    {#if option.description}
                      <span class="stacked-subtle block text-xs"
                        >{option.description}</span
                      >
                    {/if}
                  </span>
                </label>
              {/each}
            </div>
            {#if activeQuestion.allowCustom}
              <label class="mt-3 flex flex-col gap-1 text-sm">
                <span class="stacked-subtle text-xs">Type your own answer</span>
                <input
                  value={questionCustomAnswers[activeQuestionIndex] ?? ''}
                  oninput={(event) =>
                    setQuestionCustomAnswer(
                      activeQuestionIndex,
                      (event.currentTarget as HTMLInputElement).value,
                    )}
                  placeholder="Type your own answer"
                  class="rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-3 py-2 text-sm text-[var(--stacked-text)] outline-none transition focus:border-[var(--stacked-accent)]"
                />
              </label>
            {/if}
          </div>
          <div class="mt-4 flex items-center justify-end gap-2">
            <Button
              size="sm"
              color="alternative"
              onclick={goToPreviousQuestion}
              disabled={sending || saving || activeQuestionIndex === 0}
            >
              Back
            </Button>
            {#if activeQuestionIndex < activeQuestionDialog.questions.length - 1}
              <Button
                size="sm"
                color="primary"
                onclick={goToNextQuestion}
                disabled={sending ||
                  saving ||
                  !canAnswerQuestion(activeQuestionIndex)}
              >
                Next
              </Button>
            {:else}
              <Button
                size="sm"
                color="primary"
                onclick={submitQuestionAnswer}
                disabled={sending || saving || !canSubmitQuestionAnswers()}
              >
                Send Answer
              </Button>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>

<form
  onsubmit={sendMessage}
  class="stacked-chat-font mt-2 grid gap-2.5 border-t stacked-divider pt-3 sm:grid-cols-[1fr_auto] sm:gap-3 sm:pt-4"
>
  <textarea
    bind:value={messageInput}
    onkeydown={handleInputKeydown}
    rows="3"
    placeholder={inputPlaceholder}
    class="rounded-xl border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-3 py-2 text-[0.95rem] text-[var(--stacked-text)] outline-none transition focus:border-[var(--stacked-accent)]"
  ></textarea>
  <div class="flex gap-2 sm:flex-col sm:items-stretch">
    <Button
      type="submit"
      size="sm"
      color="primary"
      disabled={sending || saving}
      loading={sending}
    >
      Send
    </Button>
    {#if saveUrl}
      <Button
        type="button"
        size="sm"
        outline
        color="emerald"
        onclick={saveConversation}
        disabled={sending || saving}
        loading={saving}
      >
        Save
      </Button>
    {/if}
  </div>
  <p class="text-xs stacked-subtle sm:col-span-2">
    Enter for new line, Cmd/Ctrl+Enter to send
  </p>
</form>
