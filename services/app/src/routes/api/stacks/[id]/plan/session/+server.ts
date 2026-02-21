import type { RequestHandler } from '@sveltejs/kit';

import { notFound } from '$lib/server/api-errors';
import { fail, ok } from '$lib/server/api-response';
import { requireStackId } from '$lib/server/api-validators';
import { loadExistingPlanningSession } from '$lib/server/planning-service';
import { getStackById } from '$lib/server/stack-store';

export const POST: RequestHandler = async ({ params }) => {
  try {
    const stackId = requireStackId(params.id);
    const stack = await getStackById(stackId);
    if (!stack) {
      throw notFound('Stack not found.');
    }

    const { session, messages, awaitingResponse } =
      await loadExistingPlanningSession(stackId);
    return ok({ session, messages, awaitingResponse });
  } catch (error) {
    return fail(error);
  }
};
