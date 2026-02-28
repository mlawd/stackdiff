import type {
  FeatureStage,
  StackPullRequest,
  StageSyncMetadata,
} from '$lib/types/stack';

import type { ImplementationStageRuntime } from './contracts';

export interface ImplementationStageRowModel {
  stageStatus: FeatureStage['status'];
  pullRequest: FeatureStage['pullRequest'];
  canOpenReview: boolean;
  canApprove: boolean;
  canMerge: boolean;
  checks: StackPullRequest['checks'];
  checksMergeable: boolean;
  stageWorking: boolean;
  checksWorking: boolean;
  checksSummaryLabel: string | null;
  outOfSyncTitle: string;
}

export function toImplementationStageRowModel(input: {
  stage: FeatureStage;
  runtime?: ImplementationStageRuntime;
  syncMetadata: StageSyncMetadata;
}): ImplementationStageRowModel {
  const stageStatus = input.runtime?.stageStatus ?? input.stage.status;
  const pullRequest = input.runtime?.pullRequest ?? input.stage.pullRequest;
  const canOpenReview = stageStatus !== 'done' && Boolean(pullRequest?.number);
  const canApprove = stageStatus === 'review' && canOpenReview;
  const checks = pullRequest?.checks;
  const checksMergeable = Boolean(
    checks &&
    checks.total > 0 &&
    checks.completed === checks.total &&
    checks.failed === 0,
  );
  const canMerge = stageStatus === 'approved' && checksMergeable;
  const stageWorking =
    stageStatus === 'in-progress' &&
    (input.runtime?.runtimeState === 'busy' ||
      input.runtime?.runtimeState === 'retry');
  const checksWorking = Boolean(checks && checks.completed < checks.total);
  const checksSummaryLabel = checks ? `${checks.passed}/${checks.total}` : null;
  const outOfSyncTitle = `Behind ${input.syncMetadata.baseRef ?? 'base'} by ${input.syncMetadata.behindBy} commit${input.syncMetadata.behindBy === 1 ? '' : 's'}`;

  return {
    stageStatus,
    pullRequest,
    canOpenReview,
    canApprove,
    canMerge,
    checks,
    checksMergeable,
    stageWorking,
    checksWorking,
    checksSummaryLabel,
    outOfSyncTitle,
  };
}
