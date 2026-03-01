import { describe, expect, it, vi } from 'vitest';

import type { PlanningQuestionDialog } from '$lib/types/stack';

import { createChatPanelController } from './chat-panel-controller';

function createDialog(): PlanningQuestionDialog {
  return {
    questions: [
      {
        header: 'Scope',
        question: 'What should we build?',
        options: [{ label: 'CLI', description: '' }],
        multiple: false,
        allowCustom: true,
      },
    ],
  };
}

describe('chat panel controller', () => {
  it('submits message and restores input when stream fails', async () => {
    let sending = false;
    let saving = false;
    let messageInput = 'Ship it';
    let selectedAgent: 'plan' | 'build' = 'plan';

    const streamMessage = vi
      .fn<
        ({
          content,
          watch,
        }: {
          content?: string;
          watch: boolean;
        }) => Promise<boolean>
      >()
      .mockResolvedValue(false);

    const controller = createChatPanelController({
      getSending: () => sending,
      getSaving: () => saving,
      getMessageInput: () => messageInput,
      setMessageInput: (value) => {
        messageInput = value;
      },
      setSelectedAgent: (value) => {
        selectedAgent = value;
      },
      setErrorMessage: vi.fn(),
      getActiveQuestionDialog: () => null,
      getActiveQuestionRequestId: () => null,
      canSubmitQuestionAnswers: () => false,
      buildToolQuestionAnswers: () => [],
      buildOptimisticQuestionAnswerMessage: () => '',
      addOptimisticUserMessage: vi.fn(),
      streamMessage,
      saveConversation: vi.fn(),
    });

    await controller.submitCurrentMessage();

    expect(streamMessage).toHaveBeenCalledWith({
      content: 'Ship it',
      watch: false,
    });
    expect(messageInput).toBe('Ship it');

    controller.selectAgent('build');
    expect(selectedAgent).toBe('build');

    controller.setMessageInput('  ');
    await controller.submitCurrentMessage();
    expect(streamMessage).toHaveBeenCalledTimes(1);

    sending = true;
    messageInput = 'Another';
    await controller.submitCurrentMessage();
    expect(streamMessage).toHaveBeenCalledTimes(1);

    saving = true;
    sending = false;
    await controller.submitCurrentMessage();
    expect(streamMessage).toHaveBeenCalledTimes(1);
  });

  it('submits question answers and validates missing request id', async () => {
    let errorMessage: string | null = null;
    const activeQuestionDialog = createDialog();

    const setErrorMessage = vi.fn((value: string | null) => {
      errorMessage = value;
    });
    const addOptimisticUserMessage = vi.fn();
    const streamMessage = vi.fn().mockResolvedValue(true);

    const controllerMissingRequestId = createChatPanelController({
      getSending: () => false,
      getSaving: () => false,
      getMessageInput: () => '',
      setMessageInput: vi.fn(),
      setSelectedAgent: vi.fn(),
      setErrorMessage,
      getActiveQuestionDialog: () => activeQuestionDialog,
      getActiveQuestionRequestId: () => null,
      canSubmitQuestionAnswers: () => true,
      buildToolQuestionAnswers: () => [['CLI']],
      buildOptimisticQuestionAnswerMessage: () => '{"type":"question_answer"}',
      addOptimisticUserMessage,
      streamMessage,
      saveConversation: vi.fn(),
    });

    await controllerMissingRequestId.submitQuestionAnswer();
    expect(errorMessage).toBe('Question reply request id is missing.');
    expect(streamMessage).not.toHaveBeenCalled();

    const controller = createChatPanelController({
      getSending: () => false,
      getSaving: () => false,
      getMessageInput: () => '',
      setMessageInput: vi.fn(),
      setSelectedAgent: vi.fn(),
      setErrorMessage: vi.fn(),
      getActiveQuestionDialog: () => activeQuestionDialog,
      getActiveQuestionRequestId: () => 'req-1',
      canSubmitQuestionAnswers: () => true,
      buildToolQuestionAnswers: () => [['CLI']],
      buildOptimisticQuestionAnswerMessage: () => '{"type":"question_answer"}',
      addOptimisticUserMessage,
      streamMessage,
      saveConversation: vi.fn(),
    });

    await controller.submitQuestionAnswer();

    expect(addOptimisticUserMessage).toHaveBeenCalledWith(
      '{"type":"question_answer"}',
    );
    expect(streamMessage).toHaveBeenCalledWith({
      watch: false,
      questionReply: {
        requestId: 'req-1',
        answers: [['CLI']],
      },
    });
  });
});
