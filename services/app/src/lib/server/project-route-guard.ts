import { error } from '@sveltejs/kit';

import { listConfiguredProjects } from '$lib/server/project-config';
import { normalizeProjectRouteParam } from '$lib/server/project-route';

export async function requireConfiguredProjectRouteId(
  routeProjectId: string,
): Promise<string> {
  const projectId = normalizeProjectRouteParam(routeProjectId);
  const projects = await listConfiguredProjects();
  const hasProject = projects.some((project) => project.id === projectId);

  if (!hasProject) {
    throw error(404, 'Project not found');
  }

  return projectId;
}
