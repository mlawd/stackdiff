import { describe, expect, it } from 'vitest';

import { applyStreamEvent, FALLBACK_STREAM_MESSAGE_KEY } from './chat-stream';

describe('chat stream event parser', () => {
  it('parses delta events and falls back to a default message id', () => {
    const parsed = applyStreamEvent(
      `event: delta\ndata: ${JSON.stringify({ chunk: 'hello' })}`,
    );

    expect(parsed.delta).toEqual({
      messageId: FALLBACK_STREAM_MESSAGE_KEY,
      chunk: 'hello',
    });
  });

  it('parses question events', () => {
    const parsed = applyStreamEvent(
      `event: question\ndata: ${JSON.stringify({
        requestId: 'req-1',
        questions: [
          {
            header: 'Scope',
            question: 'What should we do?',
            options: ['A'],
          },
        ],
      })}`,
    );

    expect(parsed.question?.requestId).toBe('req-1');
    expect(parsed.question?.dialog.questions[0]?.header).toBe('Scope');
  });

  it('parses done and error events', () => {
    const done = applyStreamEvent(
      `event: done\ndata: ${JSON.stringify({ assistantReply: 'done' })}`,
    );
    const error = applyStreamEvent(
      `event: error\ndata: ${JSON.stringify({ message: 'boom' })}`,
    );

    expect(done.done?.assistantReply).toBe('done');
    expect(error.error?.message).toBe('boom');
  });

  it('returns empty result for invalid payloads', () => {
    expect(applyStreamEvent('event: delta\ndata: not-json')).toEqual({});
    expect(applyStreamEvent('event: start\ndata: {}')).toEqual({});
  });
});
