import { fail, isRedirect, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

import { createStack } from '$lib/features/stack-create/server/create-stack';
import type { StackCreateActionFailureData } from '$lib/features/stack-create/contracts';
import {
  hasStackCreateFieldErrors,
  toStackCreateInput,
  validateStackCreateValues,
  valuesFromStackCreateFormData,
} from '$lib/features/stack-create/form-state';
import { projectStackPath } from '$lib/project-paths';
import { requireConfiguredProjectRouteId } from '$lib/server/project-route-guard';

function toRecoverableFormError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unable to create feature.';
}

export const load: PageServerLoad = async ({ params }) => {
  const projectId = await requireConfiguredProjectRouteId(params.projectId);

  return {
    selectedProjectId: projectId,
  };
};

export const actions: Actions = {
  default: async ({ params, request }) => {
    const projectId = await requireConfiguredProjectRouteId(params.projectId);
    const values = valuesFromStackCreateFormData(await request.formData());
    const fieldErrors = validateStackCreateValues(values);

    if (hasStackCreateFieldErrors(fieldErrors)) {
      const response: StackCreateActionFailureData = {
        values,
        fieldErrors,
      };

      return fail(400, response);
    }

    try {
      const created = await createStack(toStackCreateInput(projectId, values));
      throw redirect(303, projectStackPath(projectId, created.id));
    } catch (error) {
      if (isRedirect(error)) {
        throw error;
      }

      const response: StackCreateActionFailureData = {
        values,
        fieldErrors: {},
        formError: toRecoverableFormError(error),
      };

      return fail(400, response);
    }
  },
};
