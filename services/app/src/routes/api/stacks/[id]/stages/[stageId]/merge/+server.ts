import type { RequestHandler } from '@sveltejs/kit';

import { fail, ok } from '$lib/server/api-response';
import { requireStackId, requireStageId } from '$lib/server/api-validators';
import { mergeStagePullRequest } from '$lib/server/implementation-status-service';

export const POST: RequestHandler = async ({ params }) => {
  try {
    const stackId = requireStackId(params.id);
    const stageId = requireStageId(params.stageId);

    const statusSummary = await mergeStagePullRequest(stackId, stageId);
    return ok(statusSummary);
  } catch (error) {
    return fail(error);
  }
};
