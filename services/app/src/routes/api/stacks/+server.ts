import type { RequestHandler } from '@sveltejs/kit';

import { createStack } from '$lib/features/stack-create/server/create-stack';
import { fail, failInternal, ok } from '$lib/server/api-response';
import {
  parseStackUpsertInput,
  requireProjectId,
} from '$lib/server/api-validators';
import {
  resolveSelectedProjectId,
  SELECTED_PROJECT_COOKIE,
} from '$lib/server/project-context';
import { listConfiguredProjects } from '$lib/server/project-config';
import { readStacksByProjectId } from '$lib/server/stack-store';

export const GET: RequestHandler = async ({ url, cookies }) => {
  try {
    const projects = await listConfiguredProjects();
    const selectedProjectId = resolveSelectedProjectId({
      projects,
      urlProjectId: url.searchParams.get('project'),
      cookieProjectId: cookies.get(SELECTED_PROJECT_COOKIE),
    });
    const stacks = await readStacksByProjectId(selectedProjectId);
    return ok({ stacks });
  } catch (error) {
    return failInternal(error);
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = (await request.json()) as unknown;
    const input = parseStackUpsertInput(body);
    requireProjectId(input.projectId);
    const created = await createStack(input);
    return ok({ stack: created }, 201);
  } catch (error) {
    return fail(error);
  }
};
