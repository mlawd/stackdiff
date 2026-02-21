import type { FeatureStage } from '$lib/types/stack';

import { stageIdsForRuntimePolling, stageStatus } from './behavior';
import type {
  ImplementationStageRuntime,
  ImplementationStatusResponse,
} from './contracts';

export type RuntimeUpdateEntry = readonly [string, ImplementationStageRuntime];

export async function fetchRuntimeUpdateEntries(input: {
  stackId: string;
  stages: FeatureStage[];
  implementationRuntimeByStageId: Record<string, ImplementationStageRuntime>;
  fetchStatus: (
    stackId: string,
    stageId: string,
  ) => Promise<ImplementationStatusResponse>;
}): Promise<RuntimeUpdateEntry[]> {
  const stageIds = stageIdsForRuntimePolling({
    stages: input.stages,
    implementationRuntimeByStageId: input.implementationRuntimeByStageId,
  });

  return Promise.all(
    stageIds.map(async (stageId) => {
      const stageEntry = input.stages.find((stage) => stage.id === stageId);
      const fallbackStatus = stageEntry
        ? stageStatus(
            input.implementationRuntimeByStageId,
            stageId,
            stageEntry.status,
          )
        : 'in-progress';

      try {
        const payload = await input.fetchStatus(input.stackId, stageId);
        return [
          stageId,
          {
            stageStatus: payload.stageStatus ?? fallbackStatus,
            runtimeState: payload.runtimeState ?? 'missing',
            todoCompleted: payload.todoCompleted ?? 0,
            todoTotal: payload.todoTotal ?? 0,
            pullRequest: payload.pullRequest,
          } satisfies ImplementationStageRuntime,
        ] as const;
      } catch {
        return [
          stageId,
          {
            stageStatus: fallbackStatus,
            runtimeState: 'missing',
            todoCompleted: 0,
            todoTotal: 0,
            pullRequest: undefined,
          } satisfies ImplementationStageRuntime,
        ] as const;
      }
    }),
  );
}

export function mergeRuntimeByStageId(
  current: Record<string, ImplementationStageRuntime>,
  updates: ReadonlyArray<RuntimeUpdateEntry>,
): Record<string, ImplementationStageRuntime> {
  return {
    ...current,
    ...Object.fromEntries(updates),
  };
}
