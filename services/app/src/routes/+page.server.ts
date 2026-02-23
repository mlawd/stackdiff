import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

import {
  resolveSelectedProjectId,
  SELECTED_PROJECT_COOKIE,
} from '$lib/server/project-context';
import { listConfiguredProjects } from '$lib/server/project-config';
import { projectStacksPath } from '$lib/project-paths';

export const load: PageServerLoad = async ({ url, cookies }) => {
  const projects = await listConfiguredProjects();
  const selectedProjectId = resolveSelectedProjectId({
    projects,
    urlProjectId: url.searchParams.get('project'),
    cookieProjectId: cookies.get(SELECTED_PROJECT_COOKIE),
  });

  if (!selectedProjectId) {
    return {
      error: 'No projects configured.',
    };
  }

  throw redirect(307, projectStacksPath(selectedProjectId));
};
