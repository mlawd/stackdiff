import type { RequestHandler } from '@sveltejs/kit';

import { notFound } from '$lib/server/api-errors';
import { fail, failInternal, mapDataOrThrow, ok } from '$lib/server/api-response';
import { parseStackUpsertInput, requireStackId } from '$lib/server/api-validators';
import { enrichStackStatus } from '$lib/server/stack-status';
import {
  deleteStack,
  getStackById,
  updateStack,
} from '$lib/server/stack-store';

export const PATCH: RequestHandler = async ({ params, request }) => {
  try {
    const stackId = requireStackId(params.id);
    const body = (await request.json()) as unknown;
    const input = parseStackUpsertInput(body);
    const updated = await updateStack(stackId, input);
    const enriched = await enrichStackStatus(updated);

    return ok({ stack: enriched });
  } catch (error) {
    return fail(error);
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    const stackId = requireStackId(params.id);
    await deleteStack(stackId);
    return ok({ ok: true });
  } catch (error) {
    return fail(error);
  }
};

export const GET: RequestHandler = async ({ params }) => {
  try {
    const stackId = requireStackId(params.id);
    const stack = mapDataOrThrow(
      await getStackById(stackId),
      notFound('Stack not found.'),
    );

    const enriched = await enrichStackStatus(stack);
    return ok({ stack: enriched });
  } catch (error) {
    return failInternal(error);
  }
};
