export type StackSyncState = 'clean' | 'dirty' | 'repo-error';

export type FeatureType = 'feature' | 'bugfix' | 'chore';

export type StackStatus = 'created' | 'planned' | 'started' | 'complete';

export type FeatureStageStatus = 'not-started' | 'in-progress' | 'review-ready' | 'done';

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
	status: StackStatus;
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
	implementationSessions?: StackImplementationSession[];
}

export type PlanningRole = 'user' | 'assistant' | 'system';

export interface PlanningMessage {
	id: string;
	role: PlanningRole;
	content: string;
	createdAt: string;
}

export interface PlanningQuestionOption {
	label: string;
	description?: string;
}

export interface PlanningQuestionItem {
	header: string;
	question: string;
	options: PlanningQuestionOption[];
	multiple?: boolean;
	allowCustom?: boolean;
}

export interface PlanningQuestionDialog {
	questions: PlanningQuestionItem[];
}

export interface PlanningQuestionAnswer {
	header: string;
	question: string;
	selected: string[];
	customAnswer?: string;
}

export interface StackPlanningSession {
	id: string;
	stackId: string;
	opencodeSessionId?: string;
	createdAt: string;
	updatedAt: string;
	savedPlanPath?: string;
	savedStageConfigPath?: string;
	savedAt?: string;
}

export interface StackImplementationSession {
	id: string;
	stackId: string;
	stageId: string;
	branchName: string;
	worktreePathKey: string;
	opencodeSessionId?: string;
	createdAt: string;
	updatedAt: string;
}

export interface StageMarkdownSectionRef {
	heading: string;
	anchor: string;
}

export interface StageConfigEntry {
	id: string;
	stageName: string;
	stageDescription: string;
	markdownSection: StageMarkdownSectionRef;
}

export interface StageConfigFile {
	schemaVersion: number;
	stackId: string;
	generatedAt: string;
	planMarkdownPath: string;
	stages: StageConfigEntry[];
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

export type StageDiffLineType = 'context' | 'add' | 'del';

export interface StageDiffLine {
	lineId: string;
	type: StageDiffLineType;
	content: string;
	oldLineNumber: number | null;
	newLineNumber: number | null;
}

export interface StageDiffHunk {
	header: string;
	oldStart: number;
	oldLines: number;
	newStart: number;
	newLines: number;
	lines: StageDiffLine[];
}

export type StageDiffFileChangeType = 'added' | 'deleted' | 'modified' | 'renamed';

export interface StageDiffFile {
	path: string;
	previousPath?: string;
	changeType: StageDiffFileChangeType;
	isBinary: boolean;
	additions: number;
	deletions: number;
	hunks: StageDiffHunk[];
}

export interface StageDiffSummary {
	filesChanged: number;
	additions: number;
	deletions: number;
}

export interface StageDiffPayload {
	stackId: string;
	stageId: string;
	baseRef: string;
	targetRef: string;
	isTruncated: boolean;
	summary: StageDiffSummary;
	files: StageDiffFile[];
}

export type StageDiffErrorCode = 'not-found' | 'not-diffable' | 'command-failed' | 'parse-failed';

export interface StageDiffServiceErrorShape {
	code: StageDiffErrorCode;
	message: string;
}
