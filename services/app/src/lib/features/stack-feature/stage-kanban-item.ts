import type {
  FeatureStage,
  FeatureStageStatus,
  StageSyncMetadata,
} from '$lib/types/stack';

import type { ImplementationStageRuntime } from './contracts';

export interface StageKanbanItem {
  id: string;
  title: string;
  status: FeatureStageStatus;
  stage: FeatureStage;
  runtime: ImplementationStageRuntime | undefined;
  syncMetadata: StageSyncMetadata;
}
