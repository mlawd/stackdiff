import { badRequest } from '$lib/server/api-errors';
import type { StackUpsertInput } from '$lib/types/stack';

export function requireStackId(id: string | undefined): string {
  const trimmed = id?.trim();
  if (!trimmed) {
    throw badRequest('Stack id is required.');
  }

  return trimmed;
}

export function requireStageId(id: string | undefined): string {
  const trimmed = id?.trim();
  if (!trimmed) {
    throw badRequest('Stage id is required.');
  }

  return trimmed;
}

export function parseStackUpsertInput(body: unknown): StackUpsertInput {
  if (typeof body !== 'object' || body === null) {
    throw badRequest('Invalid request body.');
  }

  const candidate = body as Partial<StackUpsertInput>;

  return {
    name: String(candidate.name ?? ''),
    notes: candidate.notes ? String(candidate.notes) : undefined,
    type: String(candidate.type ?? 'feature') as StackUpsertInput['type'],
  };
}

export function parsePlanningMessageBody(body: unknown): {
  content?: string;
  watch: boolean;
  agent: 'plan' | 'build';
  questionReply?: {
    requestId: string;
    answers: string[][];
  };
} {
  if (typeof body !== 'object' || body === null) {
    throw badRequest('Invalid request body.');
  }

  const candidate = body as {
    content?: unknown;
    watch?: unknown;
    agent?: unknown;
    questionReply?: unknown;
  };
  if (
    candidate.agent !== undefined &&
    candidate.agent !== 'plan' &&
    candidate.agent !== 'build'
  ) {
    throw badRequest('Agent must be either plan or build.');
  }
  const agent = candidate.agent === 'build' ? 'build' : 'plan';
  const watch = candidate.watch === true;
  if (watch) {
    return { watch: true, agent };
  }

  if (typeof candidate.questionReply === 'object' && candidate.questionReply) {
    const reply = candidate.questionReply as {
      requestId?: unknown;
      answers?: unknown;
    };
    const requestId =
      typeof reply.requestId === 'string' ? reply.requestId.trim() : '';
    if (!requestId) {
      throw badRequest('Question reply request id is required.');
    }

    if (!Array.isArray(reply.answers)) {
      throw badRequest('Question reply answers must be an array.');
    }

    const answers = reply.answers.map((answerGroup) => {
      if (!Array.isArray(answerGroup)) {
        throw badRequest('Each question reply answer must be an array.');
      }

      const values = answerGroup
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0);

      if (values.length === 0) {
        throw badRequest(
          'Each question reply answer must include at least one value.',
        );
      }

      return values;
    });

    if (answers.length === 0) {
      throw badRequest('Question reply answers are required.');
    }

    return {
      watch: false,
      agent,
      questionReply: {
        requestId,
        answers,
      },
    };
  }

  const content = String(candidate.content ?? '').trim();

  if (!content) {
    throw badRequest('Message content is required.');
  }

  return { content, watch: false, agent };
}
