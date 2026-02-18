export type StackSyncState = 'clean' | 'dirty' | 'repo-error';

export interface StackMetadata {
	id: string;
	name: string;
	notes?: string;
}

export interface StackUpsertInput {
	name: string;
	notes?: string;
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
