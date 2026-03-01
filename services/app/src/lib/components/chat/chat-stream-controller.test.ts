import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PlanningMessage } from '$lib/types/stack';

import { createChatStreamController } from './chat-stream-controller';
import type { StreamingAssistantMessage } from './chat-types';

function streamResponseFromText(payload: string): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });

  return {
    ok: true,
    body,
    json: async () => ({}),
  } as Response;
}

describe('chat stream controller', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('streams chunks, handles questions, and finalizes assistant reply', async () => {
    let messages: PlanningMessage[] = [];
    let streamingAssistantMessages: StreamingAssistantMessage[] = [];
    let sending = false;
    let successMessage: string | null = null;
    let errorMessage: string | null = null;
    const onQuestion = vi.fn();

    const payload = [
      'event: delta',
      `data: ${JSON.stringify({ messageId: 'm-1', chunk: 'Hello ' })}`,
      '',
      'event: delta',
      `data: ${JSON.stringify({ messageId: 'm-1', chunk: 'world' })}`,
      '',
      'event: question',
      `data: ${JSON.stringify({
        requestId: 'req-1',
        questions: [
          {
            header: 'Scope',
            question: 'What should we build?',
            options: ['CLI'],
          },
        ],
      })}`,
      '',
      'event: done',
      `data: ${JSON.stringify({ assistantReply: '' })}`,
      '',
      '',
    ].join('\n');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      streamResponseFromText(payload),
    );

    const controller = createChatStreamController({
      getStreamUrl: () => '/api/stream',
      getSelectedAgent: () => 'plan',
      getFormatDoneSuccess: () => () => 'Done!',
      getMessages: () => messages,
      setMessages: (value) => {
        messages = value;
      },
      getStreamingAssistantMessages: () => streamingAssistantMessages,
      setStreamingAssistantMessages: (value) => {
        streamingAssistantMessages = value;
      },
      setSending: (value) => {
        sending = value;
      },
      setErrorMessage: (value) => {
        errorMessage = value;
      },
      setSuccessMessage: (value) => {
        successMessage = value;
      },
      onBeforeStream: vi.fn(),
      onQuestion,
    });

    const ok = await controller.streamMessage({
      watch: false,
      content: 'User prompt',
    });

    expect(ok).toBe(true);
    expect(sending).toBe(false);
    expect(errorMessage).toBeNull();
    expect(successMessage).toBe('Done!');
    expect(onQuestion).toHaveBeenCalledTimes(1);
    expect(onQuestion.mock.calls[0]?.[1]).toBe('req-1');
    expect(onQuestion.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        questions: [expect.objectContaining({ header: 'Scope' })],
      }),
    );
    expect(messages[0]?.role).toBe('user');
    expect(messages[0]?.content).toBe('User prompt');
    expect(messages[1]).toEqual(
      expect.objectContaining({ role: 'assistant', content: 'Hello world' }),
    );
    expect(streamingAssistantMessages).toEqual([]);
  });

  it('returns false and surfaces stream errors', async () => {
    let errorMessage: string | null = null;

    const payload = [
      'event: error',
      `data: ${JSON.stringify({ message: 'Boom' })}`,
      '',
      '',
    ].join('\n');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      streamResponseFromText(payload),
    );

    const controller = createChatStreamController({
      getStreamUrl: () => '/api/stream',
      getSelectedAgent: () => 'plan',
      getFormatDoneSuccess: undefined,
      getMessages: () => [],
      setMessages: vi.fn(),
      getStreamingAssistantMessages: () => [],
      setStreamingAssistantMessages: vi.fn(),
      setSending: vi.fn(),
      setErrorMessage: (value) => {
        errorMessage = value;
      },
      setSuccessMessage: vi.fn(),
      onBeforeStream: vi.fn(),
      onQuestion: vi.fn(),
    });

    const ok = await controller.streamMessage({ watch: true });
    expect(ok).toBe(false);
    expect(errorMessage).toBe('Boom');
  });
});
