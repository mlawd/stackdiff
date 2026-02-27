import type { RequestHandler } from '@sveltejs/kit';

import { fail } from '$lib/server/api-response';
import { requireStackId } from '$lib/server/api-validators';
import { handleStackRuntimeStreamRequest } from '$lib/server/stack-runtime-stream-service';

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown request failure';
}

export const GET: RequestHandler = async ({ params, request }) => {
  try {
    const stackId = requireStackId(params.id);
    return await handleStackRuntimeStreamRequest({
      stackId,
      request,
    });
  } catch (error) {
    console.error('[stack-runtime-stream] Request failed', {
      stackId: params.id,
      error: toErrorMessage(error),
    });
    return fail(error);
  }
};
