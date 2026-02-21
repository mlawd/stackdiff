import type {
  FeatureStage,
  FeatureStageStatus,
  StackStatus,
} from '../../../../lib/types/stack';
import type { ImplementationStageRuntime } from './contracts';

export const typeLabel = {
  feature: 'Feature',
  bugfix: 'Bugfix',
  chore: 'Chore',
} as const;

export const statusLabel: Record<StackStatus, string> = {
  created: 'Created',
  planned: 'Planned',
  started: 'Started',
  complete: 'Complete',
};

export function implementationStageLabel(status: FeatureStageStatus): string {
  if (status === 'done') {
    return 'Done';
  }

  if (status === 'review-ready') {
    return 'Review ready';
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
