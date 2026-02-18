export type StackSyncState = 'clean' | 'dirty' | 'repo-error';

export type FeatureType = 'feature' | 'bugfix' | 'chore';

export type FeatureStageStatus = 'not-started' | 'in-progress' | 'done';

export interface FeatureStage {
	id: string;
	title: string;
	details?: string;
	status: FeatureStageStatus;
}

export interface StackMetadata {
	id: string;
	name: string;
	notes?: string;
	type: FeatureType;
	stages?: FeatureStage[];
}

export interface StackUpsertInput {
	name: string;
	notes?: string;
	type: FeatureType;
}

export interface StackFile {
	version: number;
	stacks: StackMetadata[];
	planningSessions?: StackPlanningSession[];
}

export type PlanningRole = 'user' | 'assistant' | 'system';

export interface PlanningMessage {
	id: string;
	role: PlanningRole;
	content: string;
	createdAt: string;
}

export interface StackPlanningSession {
	id: string;
	stackId: string;
	opencodeSessionId?: string;
	messages: PlanningMessage[];
	createdAt: string;
	updatedAt: string;
	savedPlanPath?: string;
	savedAt?: string;
}

export interface StackPullRequest {
	number: number;
	title: string;
	state: 'OPEN' | 'CLOSED' | 'MERGED';
	isDraft: boolean;
	url: string;
	updatedAt: string;
}

export interface StackViewModel extends StackMetadata {
	repositoryAbsolutePath: string;
	currentBranch: string;
	syncState: StackSyncState;
	workingTreeDirty: boolean;
	gitError?: string;
	ghError?: string;
	pullRequest?: StackPullRequest;
}
