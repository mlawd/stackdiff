export type StackSyncState = 'clean' | 'dirty' | 'missing-branch' | 'repo-error';

export interface StackMetadata {
	id: string;
	name: string;
	repositoryPath: string;
	branches: string[];
	notes?: string;
}

export interface StackUpsertInput {
	name: string;
	repositoryPath: string;
	branches: string[];
	notes?: string;
}

export interface StackFile {
	version: number;
	stacks: StackMetadata[];
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
	tipBranch: string;
	syncState: StackSyncState;
	workingTreeDirty: boolean;
	gitError?: string;
	ghError?: string;
	pullRequest?: StackPullRequest;
}
