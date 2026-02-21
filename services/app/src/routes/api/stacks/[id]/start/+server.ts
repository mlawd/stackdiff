import type { RequestHandler } from '@sveltejs/kit';

import { fail, ok } from '$lib/server/api-response';
import { requireStackId } from '$lib/server/api-validators';
import { startFeatureNextStage } from '$lib/server/start-service';

export const POST: RequestHandler = async ({ params }) => {
  try {
    const stackId = requireStackId(params.id);
    const result = await startFeatureNextStage(stackId);
    return ok(result);
  } catch (error) {
    return fail(error);
  }
};
