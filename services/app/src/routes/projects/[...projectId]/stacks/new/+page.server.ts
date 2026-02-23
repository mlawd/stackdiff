import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

import { listConfiguredProjects } from '$lib/server/project-config';
import { normalizeProjectRouteParam } from '$lib/server/project-route';

export const load: PageServerLoad = async ({ params }) => {
  const projectId = normalizeProjectRouteParam(params.projectId);

  const projects = await listConfiguredProjects();
  const hasProject = projects.some((project) => project.id === projectId);
  if (!hasProject) {
    throw error(404, 'Project not found');
  }

  return {
    selectedProjectId: projectId,
  };
};
