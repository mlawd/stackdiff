import type { FeatureStage, FeatureStageStatus } from '$lib/types/stack';

import type {
  ImplementationStageRuntime,
  MergeDownStackResponse,
  StartResponse,
  SyncStackResponse,
} from './contracts';

export function implementationStageLabel(status: FeatureStageStatus): string {
  if (status === 'done') {
    return 'Done';
  }

  if (status === 'approved') {
    return 'Approved';
  }

  if (status === 'review') {
    return 'Review';
  }

  if (status === 'in-progress') {
    return 'In progress';
  }

  return 'Not started';
}

export function stageStatus(
  implementationRuntimeByStageId: Record<string, ImplementationStageRuntime>,
  stageId: string,
  fallback: FeatureStageStatus,
): FeatureStageStatus {
  return implementationRuntimeByStageId[stageId]?.stageStatus ?? fallback;
}

export function stagePullRequest(
  implementationRuntimeByStageId: Record<string, ImplementationStageRuntime>,
  stageId: string,
  fallback: ImplementationStageRuntime['pullRequest'],
): ImplementationStageRuntime['pullRequest'] {
  return implementationRuntimeByStageId[stageId]?.pullRequest ?? fallback;
}

export function implementationStageColor(
  status: FeatureStageStatus,
): 'gray' | 'yellow' | 'green' | 'purple' | 'lime' {
  if (status === 'done') {
    return 'green';
  }

  if (status === 'approved') {
    return 'lime';
  }

  if (status === 'review') {
    return 'purple';
  }

  if (status === 'in-progress') {
    return 'yellow';
  }

  return 'gray';
}

function hasInProgressStage(
  stages: FeatureStage[],
  implementationRuntimeByStageId: Record<string, ImplementationStageRuntime>,
): boolean {
  return stages.some(
    (stage) =>
      stageStatus(implementationRuntimeByStageId, stage.id, stage.status) ===
      'in-progress',
  );
}

function hasRemainingNotStartedStage(
  stages: FeatureStage[],
  implementationRuntimeByStageId: Record<string, ImplementationStageRuntime>,
): boolean {
  return stages.some(
    (stage) =>
      stageStatus(implementationRuntimeByStageId, stage.id, stage.status) ===
      'not-started',
  );
}

export function canStartFeature(input: {
  stages: FeatureStage[];
  implementationRuntimeByStageId: Record<string, ImplementationStageRuntime>;
  startPending: boolean;
}): boolean {
  return (
    hasRemainingNotStartedStage(
      input.stages,
      input.implementationRuntimeByStageId,
    ) &&
    !hasInProgressStage(input.stages, input.implementationRuntimeByStageId) &&
    !input.startPending
  );
}

export function startButtonLabel(input: {
  stages: FeatureStage[];
  implementationRuntimeByStageId: Record<string, ImplementationStageRuntime>;
  startPending: boolean;
}): string {
  if (input.startPending) {
    return 'Starting...';
  }

  if (hasInProgressStage(input.stages, input.implementationRuntimeByStageId)) {
    return 'Start feature';
  }

  return 'Next stage';
}

export function stageIdsForRuntimePolling(input: {
  stages: FeatureStage[];
  implementationRuntimeByStageId: Record<string, ImplementationStageRuntime>;
}): string[] {
  return input.stages
    .filter((stage) => {
      const currentStatus = stageStatus(
        input.implementationRuntimeByStageId,
        stage.id,
        stage.status,
      );
      return (
        currentStatus === 'in-progress' ||
        currentStatus === 'review' ||
        currentStatus === 'approved'
      );
    })
    .map((stage) => stage.id);
}

export function shouldInvalidateFromRuntimeUpdates(input: {
  stages: FeatureStage[];
  updates: ReadonlyArray<readonly [string, ImplementationStageRuntime]>;
}): boolean {
  for (const [stageId, runtime] of input.updates) {
    const stageEntry = input.stages.find((stage) => stage.id === stageId);
    if (!stageEntry) {
      continue;
    }

    if (
      stageEntry.status === 'in-progress' &&
      runtime.stageStatus !== 'in-progress'
    ) {
      return true;
    }

    if (runtime.pullRequest && !stageEntry.pullRequest?.number) {
      return true;
    }

    if (runtime.approvedCommitSha !== stageEntry.approvedCommitSha) {
      return true;
    }
  }

  return false;
}

export function stageIdsTransitionedToReview(input: {
  stages: FeatureStage[];
  implementationRuntimeByStageId: Record<string, ImplementationStageRuntime>;
  updates: ReadonlyArray<readonly [string, ImplementationStageRuntime]>;
}): string[] {
  const stageById = new Map(input.stages.map((stage) => [stage.id, stage]));
  const transitionedStageIds: string[] = [];

  for (const [stageId, runtime] of input.updates) {
    const stageEntry = stageById.get(stageId);
    if (!stageEntry) {
      continue;
    }

    const previousStatus = stageStatus(
      input.implementationRuntimeByStageId,
      stageId,
      stageEntry.status,
    );
    const nextStatus = stageStatus(
      {
        ...input.implementationRuntimeByStageId,
        [stageId]: runtime,
      },
      stageId,
      stageEntry.status,
    );

    if (previousStatus === 'in-progress' && nextStatus === 'review') {
      transitionedStageIds.push(stageId);
    }
  }

  return transitionedStageIds;
}

export function canMergeDownStack(input: {
  stages: FeatureStage[];
  implementationRuntimeByStageId: Record<string, ImplementationStageRuntime>;
}): boolean {
  if (input.stages.length === 0) {
    return false;
  }

  return input.stages.every((stage) => {
    const currentStatus = stageStatus(
      input.implementationRuntimeByStageId,
      stage.id,
      stage.status,
    );
    return currentStatus === 'approved' || currentStatus === 'done';
  });
}

export function formatStartSuccessMessage(response: StartResponse): string {
  const titledStage = response.stageTitle?.trim();
  const stageLabel = response.stageNumber
    ? titledStage
      ? `stage ${response.stageNumber}: ${titledStage}`
      : `stage ${response.stageNumber}`
    : 'next stage';
  const mode = response.startedNow
    ? `Started ${stageLabel}.`
    : `${stageLabel} is already running.`;
  const worktreeState = response.reusedWorktree
    ? 'Reused existing worktree.'
    : 'Created worktree.';
  const sessionState = response.reusedSession
    ? 'Reused implementation session.'
    : 'Created implementation session.';
  return `${mode} ${worktreeState} ${sessionState}`;
}

export function formatSyncSuccessMessage(response: SyncStackResponse): string {
  const rebased = response.result.rebasedStages;
  const skipped = response.result.skippedStages;
  return `Stack sync complete. Rebases: ${rebased}. Skipped: ${skipped}.`;
}

export function formatMergeDownSuccessMessage(
  response: MergeDownStackResponse,
): string {
  return `Merged ${response.result.mergedStages} stage PRs into ${response.result.defaultBranch} with squash.`;
}
