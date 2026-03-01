import type { PlanningMessage, PlanningQuestionDialog } from '$lib/types/stack';

import { applyStreamEvent } from '$lib/components/chat/chat-stream';
import type {
  ApiErrorEnvelope,
  ChatAgent,
  StreamDonePayload,
  StreamingAssistantMessage,
} from '$lib/components/chat/chat-types';

export interface StreamMessageOptions {
  content?: string;
  watch: boolean;
  questionReply?: {
    requestId: string;
    answers: string[][];
  };
}

export interface ChatStreamController {
  addOptimisticUserMessage: (content: string) => void;
  streamMessage: (options: StreamMessageOptions) => Promise<boolean>;
}

export function createChatStreamController(input: {
  getStreamUrl: () => string;
  getSelectedAgent: () => ChatAgent;
  getFormatDoneSuccess:
    | (() => ((payload: StreamDonePayload) => string | null) | undefined)
    | undefined;
  getMessages: () => PlanningMessage[];
  setMessages: (value: PlanningMessage[]) => void;
  getStreamingAssistantMessages: () => StreamingAssistantMessage[];
  setStreamingAssistantMessages: (value: StreamingAssistantMessage[]) => void;
  setSending: (value: boolean) => void;
  setErrorMessage: (value: string | null) => void;
  setSuccessMessage: (value: string | null) => void;
  onBeforeStream: () => void;
  onQuestion: (
    dialog: PlanningQuestionDialog,
    requestId: string | null,
  ) => void;
}): ChatStreamController {
  function addOptimisticUserMessage(content: string): void {
    input.setMessages([
      ...input.getMessages(),
      {
        id: `optimistic-${crypto.randomUUID()}`,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  function appendAssistantMessage(content: string): void {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }

    input.setMessages([
      ...input.getMessages(),
      {
        id: `optimistic-assistant-${crypto.randomUUID()}`,
        role: 'assistant',
        content: trimmed,
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  function appendStreamingChunk(messageId: string, chunk: string): void {
    if (!chunk) {
      return;
    }

    const existingMessages = input.getStreamingAssistantMessages();
    const existingIndex = existingMessages.findIndex(
      (message) => message.key === messageId,
    );

    if (existingIndex < 0) {
      input.setStreamingAssistantMessages([
        ...existingMessages,
        { key: messageId, content: chunk },
      ]);
      return;
    }

    const updated = [...existingMessages];
    const existing = updated[existingIndex];
    updated[existingIndex] = {
      ...existing,
      content: `${existing.content}${chunk}`,
    };
    input.setStreamingAssistantMessages(updated);
  }

  function appendStreamingAssistantMessagesToHistory(): boolean {
    const appendedMessages = input
      .getStreamingAssistantMessages()
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

    input.setMessages([...input.getMessages(), ...appendedMessages]);
    return true;
  }

  async function streamMessage(
    options: StreamMessageOptions,
  ): Promise<boolean> {
    let ok = true;
    input.setSending(true);
    input.setErrorMessage(null);
    input.setSuccessMessage(null);
    input.setStreamingAssistantMessages([]);
    input.onBeforeStream();

    if (!options.watch && options.content) {
      addOptimisticUserMessage(options.content);
    }

    try {
      const response = await fetch(input.getStreamUrl(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          options.watch
            ? { watch: true }
            : options.questionReply
              ? { questionReply: options.questionReply }
              : { content: options.content, agent: input.getSelectedAgent() },
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
            input.onQuestion(result.question.dialog, result.question.requestId);
          }

          if (result.done) {
            if (result.done.messages && result.done.messages.length > 0) {
              input.setMessages(result.done.messages);
            } else {
              const appendedStreamingMessages =
                appendStreamingAssistantMessagesToHistory();
              if (!appendedStreamingMessages) {
                appendAssistantMessage(result.done.assistantReply);
              }
            }

            const formatDoneSuccess = input.getFormatDoneSuccess?.();
            if (formatDoneSuccess) {
              const doneSuccessMessage = formatDoneSuccess(result.done);
              if (doneSuccessMessage) {
                input.setSuccessMessage(doneSuccessMessage);
              }
            }
          }
        }
      }
    } catch (error) {
      ok = false;
      input.setErrorMessage(
        error instanceof Error ? error.message : 'Unable to send message.',
      );
    } finally {
      input.setSending(false);
      input.setStreamingAssistantMessages([]);
    }

    return ok;
  }

  return {
    addOptimisticUserMessage,
    streamMessage,
  };
}
