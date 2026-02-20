import type {
	FeatureStage,
	FeatureStageStatus,
	StackPullRequest,
	StackViewModel
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

export interface FeatureStackTabContract {
	stack: StackViewModel;
	startPending: boolean;
	startError: string | null;
	startSuccess: string | null;
	implementationRuntimeByStageId: Record<string, ImplementationStageRuntime>;
}

export interface ImplementationStageRowContract {
	stage: FeatureStage;
	currentStageStatus: FeatureStageStatus;
	currentStagePullRequest?: StackPullRequest;
	stageWorking: boolean;
	stageRuntime?: ImplementationStageRuntime;
}
