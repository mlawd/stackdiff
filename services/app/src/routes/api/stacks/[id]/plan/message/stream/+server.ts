import type { RequestHandler } from '@sveltejs/kit';

import { fail } from '$lib/server/api-response';
import { requireStackId } from '$lib/server/api-validators';
import { handlePlanningMessageStreamRequest } from '$lib/server/planning-stream-service';

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown request failure';
}

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const stackId = requireStackId(params.id);
    return await handlePlanningMessageStreamRequest({
      stackId,
      request,
    });
  } catch (error) {
    console.error('[planning-stream] Request failed', {
      stackId: params.id,
      error: toErrorMessage(error),
    });
    return fail(error);
  }
};
