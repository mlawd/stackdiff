import type { PlanningQuestionDialog } from '$lib/types/stack';

import type { ChatAgent } from '$lib/components/chat/chat-types';
import type { StreamMessageOptions } from '$lib/components/chat/chat-stream-controller';

export interface ChatPanelController {
  streamMessage: (options: StreamMessageOptions) => Promise<boolean>;
  submitCurrentMessage: () => Promise<void>;
  submitQuestionAnswer: () => Promise<void>;
  saveConversation: () => Promise<void>;
  setMessageInput: (value: string) => void;
  selectAgent: (agent: ChatAgent) => void;
}

export function createChatPanelController(input: {
  getSending: () => boolean;
  getSaving: () => boolean;
  getMessageInput: () => string;
  setMessageInput: (value: string) => void;
  setSelectedAgent: (value: ChatAgent) => void;
  setErrorMessage: (value: string | null) => void;
  getActiveQuestionDialog: () => PlanningQuestionDialog | null;
  getActiveQuestionRequestId: () => string | null;
  canSubmitQuestionAnswers: () => boolean;
  buildToolQuestionAnswers: () => string[][];
  buildOptimisticQuestionAnswerMessage: (
    dialog: PlanningQuestionDialog,
  ) => string;
  addOptimisticUserMessage: (content: string) => void;
  streamMessage: (options: StreamMessageOptions) => Promise<boolean>;
  saveConversation: () => Promise<void>;
}): ChatPanelController {
  async function submitCurrentMessage(): Promise<void> {
    if (input.getSending() || input.getSaving()) {
      return;
    }

    const content = input.getMessageInput().trim();
    if (!content) {
      return;
    }

    input.setMessageInput('');

    const ok = await input.streamMessage({ content, watch: false });
    if (!ok) {
      input.setMessageInput(content);
    }
  }

  async function submitQuestionAnswer(): Promise<void> {
    const activeQuestionDialog = input.getActiveQuestionDialog();
    if (
      !activeQuestionDialog ||
      input.getSending() ||
      input.getSaving() ||
      !input.canSubmitQuestionAnswers()
    ) {
      return;
    }

    const activeQuestionRequestId = input.getActiveQuestionRequestId();
    if (!activeQuestionRequestId) {
      input.setErrorMessage('Question reply request id is missing.');
      return;
    }

    const optimisticQuestionAnswerMessage =
      input.buildOptimisticQuestionAnswerMessage(activeQuestionDialog);
    const toolAnswers = input.buildToolQuestionAnswers();
    input.addOptimisticUserMessage(optimisticQuestionAnswerMessage);
    await input.streamMessage({
      watch: false,
      questionReply: {
        requestId: activeQuestionRequestId,
        answers: toolAnswers,
      },
    });
  }

  function setMessageInput(value: string): void {
    input.setMessageInput(value);
  }

  function selectAgent(agent: ChatAgent): void {
    input.setSelectedAgent(agent);
  }

  return {
    streamMessage: input.streamMessage,
    submitCurrentMessage,
    submitQuestionAnswer,
    saveConversation: input.saveConversation,
    setMessageInput,
    selectAgent,
  };
}
