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

export interface SyncStackResponse {
  result?: {
    totalStages: number;
    rebasedStages: number;
    skippedStages: number;
  };
  error?: {
    code?: string;
    message?: string;
  };
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

export interface FeatureActionState {
  pending: boolean;
  error: string | null;
  success: string | null;
}
