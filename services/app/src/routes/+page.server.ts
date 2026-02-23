import type { PageServerLoad } from './$types';

import {
  persistSelectedProjectId,
  resolveSelectedProjectId,
  SELECTED_PROJECT_COOKIE,
} from '$lib/server/project-context';
import { getProjectHealth } from '$lib/server/project-health';
import { listConfiguredProjects } from '$lib/server/project-config';
import { enrichStacksStatus } from '$lib/server/stack-status';
import { readStacksByProjectId } from '$lib/server/stack-store';

export const load: PageServerLoad = async ({ url, cookies }) => {
  try {
    const projects = await listConfiguredProjects();
    const selectedProjectId = resolveSelectedProjectId({
      projects,
      urlProjectId: url.searchParams.get('project'),
      cookieProjectId: cookies.get(SELECTED_PROJECT_COOKIE),
    });
    persistSelectedProjectId(cookies, selectedProjectId);

    const stacks = await readStacksByProjectId(selectedProjectId);
    const enrichedStacks = await enrichStacksStatus(stacks);
    const health = await getProjectHealth(selectedProjectId);

    return {
      stacks: enrichedStacks,
      projects,
      selectedProjectId,
      selectedProjectHealth: health,
      loadedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown load failure';

    return {
      stacks: [],
      projects: [],
      selectedProjectId: '',
      selectedProjectHealth: undefined,
      loadedAt: new Date().toISOString(),
      error: message,
    };
  }
};
