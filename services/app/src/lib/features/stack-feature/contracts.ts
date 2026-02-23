import type {
  FeatureStageStatus,
  PlanningMessage,
  StackPullRequest,
  StackReviewSession,
} from '$lib/types/stack';

export interface ApiErrorObject {
  code: string;
  message: string;
}

export interface ApiSuccessEnvelope<T> {
  data: T;
}

export interface ApiErrorEnvelope {
  error: ApiErrorObject;
}

export interface StartResponse {
  stageNumber: number;
  stageTitle: string;
  reusedWorktree: boolean;
  reusedSession: boolean;
  startedNow: boolean;
}

export interface SyncStackResponse {
  result: {
    totalStages: number;
    rebasedStages: number;
    skippedStages: number;
  };
}

export interface ImplementationStatusResponse {
  stageStatus: FeatureStageStatus;
  runtimeState: 'idle' | 'busy' | 'retry' | 'missing';
  todoCompleted: number;
  todoTotal: number;
  pullRequest?: StackPullRequest;
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

export interface ReviewSessionResponse {
  session: StackReviewSession;
  messages: PlanningMessage[];
  awaitingResponse: boolean;
}
