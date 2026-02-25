import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { StageSyncMetadata } from '$lib/types/stack';

import { loadExistingPlanningSession } from '$lib/server/planning-service';
import { normalizeProjectRouteParam } from '$lib/server/project-route';
import { getStageSyncById } from '$lib/server/stack-sync-service';
import { enrichStackStatus } from '$lib/server/stack-status';
import { getStackById } from '$lib/server/stack-store';

export const load: PageServerLoad = async ({ params }) => {
  const projectId = normalizeProjectRouteParam(params.projectId);
  const stack = await getStackById(params.id);

  if (!stack || stack.projectId !== projectId) {
    throw error(404, 'Feature not found');
  }

  const enriched = await enrichStackStatus(stack);
  let stageSyncById: Record<string, StageSyncMetadata> = {};
  try {
    stageSyncById = await getStageSyncById(stack);
  } catch (syncError) {
    console.error('[stack-page] Failed to load stage sync status', {
      stackId: stack.id,
      error: syncError instanceof Error ? syncError.message : String(syncError),
    });
  }
  const { session, messages, awaitingResponse } =
    await loadExistingPlanningSession(params.id);

  return {
    stack: {
      ...enriched,
      stageSyncById,
    },
    session,
    messages,
    awaitingResponse,
    loadedAt: new Date().toISOString(),
  };
};
