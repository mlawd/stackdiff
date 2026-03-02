import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

import { normalizeProjectRouteParam } from '$lib/server/project-route';
import { enrichStackStatus } from '$lib/server/stack-status';
import { getStackById } from '$lib/server/stack-store';

export const load: PageServerLoad = async ({ params }) => {
  const projectId = normalizeProjectRouteParam(params.projectId);
  const stack = await getStackById(params.id);

  if (!stack || stack.projectId !== projectId) {
    throw error(404, 'Feature not found');
  }

  const stage = (stack.stages ?? []).find(
    (entry) => entry.id === params.stageId,
  );
  if (!stage) {
    throw error(404, 'Stage not found');
  }

  const enriched = await enrichStackStatus(stack);

  return {
    stack: enriched,
    stage,
    loadedAt: new Date().toISOString(),
  };
};
