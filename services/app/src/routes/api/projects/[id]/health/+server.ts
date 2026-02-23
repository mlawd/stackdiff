import type { RequestHandler } from '@sveltejs/kit';

import { fail, ok } from '$lib/server/api-response';
import { requireProjectId } from '$lib/server/api-validators';
import { getProjectHealth } from '$lib/server/project-health';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const projectId = requireProjectId(params.id);
    const health = await getProjectHealth(projectId);
    return ok({ health });
  } catch (error) {
    return fail(error);
  }
};
