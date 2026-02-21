import type {
  FeatureStageStatus,
  StackPullRequest,
} from '../../../../lib/types/stack';

export interface StartResponse {
  stageNumber?: number;
  stageTitle?: string;
  reusedWorktree?: boolean;
  reusedSession?: boolean;
  startedNow?: boolean;
  error?: string;
}

export interface ImplementationStatusResponse {
  stageStatus?: FeatureStageStatus;
  runtimeState?: 'idle' | 'busy' | 'retry' | 'missing';
  todoCompleted?: number;
  todoTotal?: number;
  pullRequest?: StackPullRequest;
  error?: string;
}

export interface ImplementationStageRuntime {
  stageStatus: FeatureStageStatus;
  runtimeState: 'idle' | 'busy' | 'retry' | 'missing';
  todoCompleted: number;
  todoTotal: number;
  pullRequest?: StackPullRequest;
}
