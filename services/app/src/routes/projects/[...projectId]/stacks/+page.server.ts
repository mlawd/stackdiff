import type { PageServerLoad } from './$types';

import { getProjectHealth } from '$lib/server/project-health';
import { requireConfiguredProjectRouteId } from '$lib/server/project-route-guard';
import { enrichStacksStatus } from '$lib/server/stack-status';
import { readStacksByProjectId } from '$lib/server/stack-store';

export const load: PageServerLoad = async ({ params }) => {
  const projectId = await requireConfiguredProjectRouteId(params.projectId);

  const stacks = await readStacksByProjectId(projectId);
  const enrichedStacks = await enrichStacksStatus(stacks);
  const health = await getProjectHealth(projectId);

  return {
    stacks: enrichedStacks,
    selectedProjectHealth: health,
    loadedAt: new Date().toISOString(),
    projectId,
  };
};
