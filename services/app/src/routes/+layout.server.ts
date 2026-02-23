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
    const message =
      error instanceof Error ? error.message : 'Unable to load projects.';

    return {
      projects: [],
      selectedProjectId: '',
      projectLoadError: message,
    };
  }
};
