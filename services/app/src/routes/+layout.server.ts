import { error, isHttpError } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

import {
  persistSelectedProjectId,
  resolveSelectedProjectId,
  SELECTED_PROJECT_COOKIE,
} from '$lib/server/project-context';
import { listConfiguredProjects } from '$lib/server/project-config';

export const load: LayoutServerLoad = async ({ url, cookies }) => {
  try {
    const projects = await listConfiguredProjects();
    let decodedPathname = url.pathname;
    try {
      decodedPathname = decodeURIComponent(url.pathname);
    } catch {
      decodedPathname = url.pathname;
    }
    const projectsBySpecificity = [...projects].sort(
      (a, b) => b.id.length - a.id.length,
    );
    const pathnameProjectId =
      projectsBySpecificity.find((project) => {
        const basePath = `/projects/${project.id}/stacks`;
        return (
          decodedPathname === basePath ||
          decodedPathname.startsWith(`${basePath}/`)
        );
      })?.id ?? null;

    if (pathnameProjectId) {
      const hasPathProject = projects.some(
        (project) => project.id === pathnameProjectId,
      );
      if (!hasPathProject) {
        throw error(404, 'Project not found');
      }

      persistSelectedProjectId(cookies, pathnameProjectId);
      return {
        projects,
        selectedProjectId: pathnameProjectId,
        projectLoadError: undefined,
      };
    }

    const selectedProjectId = resolveSelectedProjectId({
      projects,
      urlProjectId: url.searchParams.get('project'),
      cookieProjectId: cookies.get(SELECTED_PROJECT_COOKIE),
    });
    persistSelectedProjectId(cookies, selectedProjectId);

    return {
      projects,
      selectedProjectId,
      projectLoadError: undefined,
    };
  } catch (error) {
    if (isHttpError(error)) {
      throw error;
    }

    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'object' &&
            error !== null &&
            'message' in error &&
            typeof error.message === 'string'
          ? error.message
          : 'Unable to load projects.';

    return {
      projects: [],
      selectedProjectId: '',
      projectLoadError: message,
    };
  }
};
