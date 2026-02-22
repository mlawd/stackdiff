import type { RequestHandler } from '@sveltejs/kit';

import { fail } from '$lib/server/api-response';
import { requireStackId, requireStageId } from '$lib/server/api-validators';
import { handleStageReviewMessageStreamRequest } from '$lib/server/stage-review-stream-service';

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown request failure';
}

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const stackId = requireStackId(params.id);
    const stageId = requireStageId(params.stageId);

    return await handleStageReviewMessageStreamRequest({
      stackId,
      stageId,
      request,
    });
  } catch (error) {
    console.error('[review-stream] Request failed', {
      stackId: params.id,
      stageId: params.stageId,
      error: toErrorMessage(error),
    });
    return fail(error);
  }
};
