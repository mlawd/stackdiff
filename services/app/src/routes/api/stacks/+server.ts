import type { RequestHandler } from '@sveltejs/kit';

import { fail, failInternal, ok } from '$lib/server/api-response';
import { parseStackUpsertInput } from '$lib/server/api-validators';
import { enrichStackStatus } from '$lib/server/stack-status';
import { createStackWithPlanningBootstrap } from '$lib/server/stack-create-service';
import { readStacksFromFile } from '$lib/server/stack-store';

export const GET: RequestHandler = async () => {
  try {
    const stacks = await readStacksFromFile();
    return ok({ stacks });
  } catch (error) {
    return failInternal(error);
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = (await request.json()) as unknown;
    const input = parseStackUpsertInput(body);
    const created = await createStackWithPlanningBootstrap(input);

    const enriched = await enrichStackStatus(created);
    return ok({ stack: enriched }, 201);
  } catch (error) {
    return fail(error);
  }
};
