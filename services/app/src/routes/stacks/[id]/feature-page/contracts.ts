import type {
	FeatureStage,
	FeatureStageStatus,
	DiffSelection,
	StageDiffPayload,
	StageDiffChatResult,
	StackPullRequest,
	StackViewModel
} from '../../../../lib/types/stack';

export type FeaturePageTabKey = 'plan' | 'stack';

export interface StartResponse {
	stageNumber?: number;
	stageTitle?: string;
	reusedWorktree?: boolean;
	reusedSession?: boolean;
	startedNow?: boolean;
	error?: string;
}

export interface StageDiffSuccessResponse {
	diff: StageDiffPayload;
}

export interface StageDiffErrorResponse {
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

export interface StageDiffChatSuccessResponse {
	result: StageDiffChatResult;
}

export interface StageDiffChatErrorResponse {
	error?: {
		code?: string;
		message?: string;
	};
}

export type OrderedDiffLine = {
	lineId: string;
	filePath: string;
	content: string;
	type: 'context' | 'add' | 'del';
};

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
	stageCanOpenDiff: boolean;
	stageRuntime?: ImplementationStageRuntime;
}

export interface FocusedDiffChatRequest {
	stageId: string;
	selection: DiffSelection;
	message?: string;
}
