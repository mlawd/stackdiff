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
} {
  if (typeof body !== 'object' || body === null) {
    throw badRequest('Invalid request body.');
  }

  const candidate = body as { content?: unknown; watch?: unknown };
  const watch = candidate.watch === true;
  if (watch) {
    return { watch: true };
  }

  const content = String(candidate.content ?? '').trim();

  if (!content) {
    throw badRequest('Message content is required.');
  }

  return { content, watch: false };
}
