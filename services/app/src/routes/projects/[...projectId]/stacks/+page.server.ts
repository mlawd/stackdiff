import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

import { getProjectHealth } from '$lib/server/project-health';
import { listConfiguredProjects } from '$lib/server/project-config';
import { normalizeProjectRouteParam } from '$lib/server/project-route';
import { enrichStacksStatus } from '$lib/server/stack-status';
import { readStacksByProjectId } from '$lib/server/stack-store';

export const load: PageServerLoad = async ({ params }) => {
  console.log('eh');
  const projectId = normalizeProjectRouteParam(params.projectId);

  const projects = await listConfiguredProjects();
  const hasProject = projects.some((project) => project.id === projectId);

  console.log({
    projectId,
    hasProject,
    projects,
  });
  if (!hasProject) {
    throw error(404, 'Project not found');
  }

  const stacks = await readStacksByProjectId(projectId);
  const enrichedStacks = await enrichStacksStatus(stacks);
  const health = await getProjectHealth(projectId);

  console.log(stacks);

  return {
    stacks: enrichedStacks,
    selectedProjectHealth: health,
    loadedAt: new Date().toISOString(),
    projectId,
  };
};
