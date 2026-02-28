import type {
  StreamDeltaPayload,
  StreamEventResult,
  StreamQuestionPayload,
} from './chat-types';
import { normalizeQuestionDialog } from './chat-parsers';

export const FALLBACK_STREAM_MESSAGE_KEY = 'streaming-assistant';

export function applyStreamEvent(eventBlock: string): StreamEventResult {
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
    return {};
  }

  if (event === 'delta') {
    const deltaPayload =
      typeof payload === 'object' && payload !== null
        ? (payload as StreamDeltaPayload)
        : null;
    const chunk =
      typeof deltaPayload?.chunk === 'string' ? deltaPayload.chunk : '';
    if (chunk) {
      const messageId =
        typeof deltaPayload?.messageId === 'string' &&
        deltaPayload.messageId.trim().length > 0
          ? deltaPayload.messageId
          : FALLBACK_STREAM_MESSAGE_KEY;
      return {
        delta: {
          messageId,
          chunk,
        },
      };
    }
    return {};
  }

  if (event === 'question') {
    const question = normalizeQuestionDialog(payload);
    if (question) {
      const envelope = payload as StreamQuestionPayload;
      const requestId =
        typeof envelope.requestId === 'string' && envelope.requestId.length > 0
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
    return { done: payload as StreamEventResult['done'] };
  }

  if (event === 'error' && typeof payload === 'object' && payload !== null) {
    return { error: payload as StreamEventResult['error'] };
  }

  return {};
}
