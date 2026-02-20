import type { PageServerLoad } from './$types';

import { enrichStacksStatus } from '$lib/server/stack-status';
import { readStacksFromFile } from '$lib/server/stack-store';

export const load: PageServerLoad = async () => {
  try {
    const stacks = await readStacksFromFile();
    const enrichedStacks = await enrichStacksStatus(stacks);

    return {
      stacks: enrichedStacks,
      loadedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown load failure';

    return {
      stacks: [],
      loadedAt: new Date().toISOString(),
      error: message,
    };
  }
};
