import type { PlanningMessage, PlanningQuestionDialog } from '$lib/types/stack';
import { tick } from 'svelte';

import {
  createChatPanelController,
  type ChatPanelController,
} from '$lib/components/chat/chat-panel-controller';
import {
  createChatQuestionFlowController,
  type ChatQuestionFlowController,
} from '$lib/components/chat/chat-question-flow-controller';
import { createChatSaveController } from '$lib/components/chat/chat-save-controller';
import { createChatStreamController } from '$lib/components/chat/chat-stream-controller';
import type {
  ChatAgent,
  SaveResponseBody,
  StreamDonePayload,
  StreamingAssistantMessage,
} from '$lib/components/chat/chat-types';

interface UseChatPanelProps {
  streamUrl: () => string;
  initialMessages: () => PlanningMessage[];
  initialAwaitingResponse: () => boolean;
  saveUrl: () => string | undefined;
  formatDoneSuccess:
    | (() => ((payload: StreamDonePayload) => string | null) | undefined)
    | undefined;
  formatSaveSuccess:
    | (() => ((payload: SaveResponseBody) => string | null) | undefined)
    | undefined;
  onSaveResponse:
    | (() => ((payload: SaveResponseBody) => void) | undefined)
    | undefined;
  defaultAgent: () => ChatAgent;
}

export interface ChatPanelViewModel {
  readonly panelId: string;
  readonly messages: PlanningMessage[];
  readonly messageInput: string;
  readonly sending: boolean;
  readonly saving: boolean;
  readonly streamingAssistantMessages: StreamingAssistantMessage[];
  readonly errorMessage: string | null;
  readonly successMessage: string | null;
  readonly activeQuestionDialog: PlanningQuestionDialog | null;
  readonly activeQuestionIndex: number;
  readonly questionSelections: Record<number, string[]>;
  readonly questionCustomAnswers: Record<number, string>;
  readonly selectedAgent: ChatAgent;
  messagesViewportAttachment: (node: HTMLDivElement) => (() => void) | void;
  setMessageInput: ChatPanelController['setMessageInput'];
  selectAgent: ChatPanelController['selectAgent'];
  submitCurrentMessage: ChatPanelController['submitCurrentMessage'];
  submitQuestionAnswer: ChatPanelController['submitQuestionAnswer'];
  saveConversation: ChatPanelController['saveConversation'];
  setSingleQuestionOption: ChatQuestionFlowController['setSingleQuestionOption'];
  toggleQuestionOption: ChatQuestionFlowController['toggleQuestionOption'];
  setQuestionCustomAnswer: ChatQuestionFlowController['setQuestionCustomAnswer'];
  canAnswerQuestion: ChatQuestionFlowController['canAnswerQuestion'];
  canSubmitQuestionAnswers: ChatQuestionFlowController['canSubmitQuestionAnswers'];
  goToPreviousQuestion: ChatQuestionFlowController['goToPreviousQuestion'];
  goToNextQuestion: ChatQuestionFlowController['goToNextQuestion'];
}

export function useChatPanel(input: UseChatPanelProps): ChatPanelViewModel {
  const panelId = `chat-panel-${crypto.randomUUID()}`;
  let messagesViewport: HTMLDivElement | null = null;
  let scrollPending = false;

  let messages = $state<PlanningMessage[]>(input.initialMessages());
  let messageInput = $state('');
  let sending = $state(false);
  let saving = $state(false);
  let streamingAssistantMessages = $state<StreamingAssistantMessage[]>([]);
  let errorMessage = $state<string | null>(null);
  let successMessage = $state<string | null>(null);
  let activeQuestionDialog = $state<PlanningQuestionDialog | null>(null);
  let activeQuestionRequestId = $state<string | null>(null);
  let activeQuestionIndex = $state(0);
  let questionSelections = $state<Record<number, string[]>>({});
  let questionCustomAnswers = $state<Record<number, string>>({});
  let selectedAgent = $derived(input.defaultAgent());

  const questionFlowController = createChatQuestionFlowController({
    getActiveQuestionDialog: () => activeQuestionDialog,
    setActiveQuestionDialog: (value) => {
      activeQuestionDialog = value;
    },
    setActiveQuestionRequestId: (value) => {
      activeQuestionRequestId = value;
    },
    getActiveQuestionIndex: () => activeQuestionIndex,
    setActiveQuestionIndex: (value) => {
      activeQuestionIndex = value;
    },
    getQuestionSelections: () => questionSelections,
    setQuestionSelections: (value) => {
      questionSelections = value;
    },
    getQuestionCustomAnswers: () => questionCustomAnswers,
    setQuestionCustomAnswers: (value) => {
      questionCustomAnswers = value;
    },
  });

  function setMessages(value: PlanningMessage[]): void {
    messages = value;
    scheduleScroll();
  }

  function setStreamingAssistantMessages(
    value: StreamingAssistantMessage[],
  ): void {
    streamingAssistantMessages = value;
    scheduleScroll();
  }

  const streamController = createChatStreamController({
    getStreamUrl: input.streamUrl,
    getSelectedAgent: () => selectedAgent,
    getFormatDoneSuccess: input.formatDoneSuccess,
    getMessages: () => messages,
    setMessages,
    getStreamingAssistantMessages: () => streamingAssistantMessages,
    setStreamingAssistantMessages,
    setSending: (value) => {
      sending = value;
    },
    setErrorMessage: (value) => {
      errorMessage = value;
    },
    setSuccessMessage: (value) => {
      successMessage = value;
    },
    onBeforeStream: () => {
      questionFlowController.reset();
    },
    onQuestion: (dialog, requestId) => {
      questionFlowController.initializeFromDialog(dialog, requestId);
    },
  });

  const saveController = createChatSaveController({
    getSaveUrl: input.saveUrl,
    getFormatSaveSuccess: input.formatSaveSuccess,
    getOnSaveResponse: input.onSaveResponse,
    setMessages,
    setSaving: (value) => {
      saving = value;
    },
    setErrorMessage: (value) => {
      errorMessage = value;
    },
    setSuccessMessage: (value) => {
      successMessage = value;
    },
  });

  const panelController = createChatPanelController({
    getSending: () => sending,
    getSaving: () => saving,
    getMessageInput: () => messageInput,
    setMessageInput: (value) => {
      messageInput = value;
    },
    setSelectedAgent: (value) => {
      selectedAgent = value;
    },
    setErrorMessage: (value) => {
      errorMessage = value;
    },
    getActiveQuestionDialog: () => activeQuestionDialog,
    getActiveQuestionRequestId: () => activeQuestionRequestId,
    canSubmitQuestionAnswers: questionFlowController.canSubmitQuestionAnswers,
    buildToolQuestionAnswers: questionFlowController.buildToolQuestionAnswers,
    buildOptimisticQuestionAnswerMessage:
      questionFlowController.buildOptimisticQuestionAnswerMessage,
    addOptimisticUserMessage: streamController.addOptimisticUserMessage,
    streamMessage: streamController.streamMessage,
    saveConversation: saveController.saveConversation,
  });

  if (input.initialAwaitingResponse()) {
    queueMicrotask(() => {
      if (sending) {
        return;
      }

      void panelController.streamMessage({ watch: true });
    });
  }

  function scheduleScroll(): void {
    if (scrollPending) {
      return;
    }

    scrollPending = true;
    queueMicrotask(async () => {
      await tick();
      scrollPending = false;
      if (!messagesViewport) {
        return;
      }

      messagesViewport.scrollTop = messagesViewport.scrollHeight;
    });
  }

  function messagesViewportAttachment(
    node: HTMLDivElement,
  ): (() => void) | void {
    messagesViewport = node;
    scheduleScroll();

    return () => {
      if (messagesViewport === node) {
        messagesViewport = null;
      }
    };
  }

  return {
    get panelId() {
      return panelId;
    },
    get messages() {
      return messages;
    },
    get messageInput() {
      return messageInput;
    },
    get sending() {
      return sending;
    },
    get saving() {
      return saving;
    },
    get streamingAssistantMessages() {
      return streamingAssistantMessages;
    },
    get errorMessage() {
      return errorMessage;
    },
    get successMessage() {
      return successMessage;
    },
    get activeQuestionDialog() {
      return activeQuestionDialog;
    },
    get activeQuestionIndex() {
      return activeQuestionIndex;
    },
    get questionSelections() {
      return questionSelections;
    },
    get questionCustomAnswers() {
      return questionCustomAnswers;
    },
    get selectedAgent() {
      return selectedAgent;
    },
    messagesViewportAttachment,
    setMessageInput: panelController.setMessageInput,
    selectAgent: panelController.selectAgent,
    submitCurrentMessage: panelController.submitCurrentMessage,
    submitQuestionAnswer: panelController.submitQuestionAnswer,
    saveConversation: panelController.saveConversation,
    setSingleQuestionOption: questionFlowController.setSingleQuestionOption,
    toggleQuestionOption: questionFlowController.toggleQuestionOption,
    setQuestionCustomAnswer: questionFlowController.setQuestionCustomAnswer,
    canAnswerQuestion: questionFlowController.canAnswerQuestion,
    canSubmitQuestionAnswers: questionFlowController.canSubmitQuestionAnswers,
    goToPreviousQuestion: questionFlowController.goToPreviousQuestion,
    goToNextQuestion: questionFlowController.goToNextQuestion,
  };
}
