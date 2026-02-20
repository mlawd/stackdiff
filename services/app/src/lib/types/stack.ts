export type StackSyncState = 'clean' | 'dirty' | 'repo-error';

export type FeatureType = 'feature' | 'bugfix' | 'chore';

export type StackStatus = 'created' | 'planned' | 'started' | 'complete';

export type FeatureStageStatus = 'not-started' | 'in-progress' | 'review-ready' | 'done';

export type MergeCommitType = 'feat' | 'fix' | 'chore';

export type StackMergeCheckStatus = 'pending' | 'passed' | 'failed' | 'skipped' | 'unknown';

export type StackMergeCheckSource = 'git' | 'gh' | 'stacked';

export interface StackMergeCheckResult {
	id: string;
	name: string;
	status: StackMergeCheckStatus;
	source: StackMergeCheckSource;
	details?: string;
	url?: string;
}

export interface StackMergeChecksSummary {
	total: number;
	passed: number;
	failed: number;
	pending: number;
	skipped: number;
	unknown: number;
	checks: StackMergeCheckResult[];
	evaluatedAt: string;
}

export type StackMergeReadinessBlockerCode =
	| 'NO_STAGES'
	| 'STAGE_NOT_DONE'
	| 'WORKING_TREE_DIRTY'
	| 'CHECKS_FAILED'
	| 'CHECKS_PENDING'
	| 'PULL_REQUEST_NOT_READY'
	| 'REPOSITORY_ERROR'
	| 'UNKNOWN';

export interface StackMergeReadinessBlocker {
	code: StackMergeReadinessBlockerCode;
	message: string;
	stageId?: string;
	branchName?: string;
}

export interface StackMergeReadiness {
	isReady: boolean;
	blockers: StackMergeReadinessBlocker[];
	checksSummary: StackMergeChecksSummary;
	evaluatedAt: string;
}

export type StackMergeResultStatus = 'merged' | 'blocked' | 'failed';

export interface StackMergeBranchDetail {
	stageId: string;
	stageTitle: string;
	branchName: string;
	commitMessages: string[];
	commitCount: number;
}

export interface StackMergeResult {
	status: StackMergeResultStatus;
	stackId: string;
	commitType: MergeCommitType;
	commitMessage: string;
	mergedAt?: string;
	mergeCommitSha?: string;
	readiness: StackMergeReadiness;
	branches: StackMergeBranchDetail[];
	errorMessage?: string;
}

export interface StackMergeMetadata {
	lastReadiness?: StackMergeReadiness;
	lastMergeResult?: StackMergeResult;
	lastMergedAt?: string;
	lastMergeCommitSha?: string;
	defaultCommitType?: MergeCommitType;
}

export interface FeatureStage {
	id: string;
	title: string;
	details?: string;
	status: FeatureStageStatus;
	pullRequest?: StackPullRequest;
}

export interface StackMetadata {
	id: string;
	name: string;
	notes?: string;
	type: FeatureType;
	status: StackStatus;
	stages?: FeatureStage[];
	merge?: StackMergeMetadata;
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
	stageDiffabilityById?: Record<string, StageDiffabilityMetadata>;
}

export interface StageDiffabilityMetadata {
	isDiffable: boolean;
	branchName?: string;
	reasonIfNotDiffable?: string;
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

export interface StageDiffTruncation {
	maxFiles: number;
	maxLines: number;
	omittedFiles: number;
	omittedLines: number;
}

export interface StageDiffPayload {
	stackId: string;
	stageId: string;
	baseRef: string;
	targetRef: string;
	isTruncated: boolean;
	truncation?: StageDiffTruncation;
	summary: StageDiffSummary;
	files: StageDiffFile[];
}

export interface DiffSelectionRefs {
	baseRef: string;
	targetRef: string;
}

export interface DiffSelection {
	refs: DiffSelectionRefs;
	filePath: string;
	selectedLineIds: string[];
	snippet: string;
}

export interface StageDiffChatResult {
	stackId: string;
	stageId: string;
	selection: DiffSelection;
	assistantReply: string;
}

export type StageDiffErrorCode = 'not-found' | 'not-diffable' | 'command-failed' | 'parse-failed';

export interface StageDiffServiceErrorShape {
	code: StageDiffErrorCode;
	message: string;
}

export type StageDiffChatErrorCode =
	| 'not-found'
	| 'not-diffable'
	| 'invalid-selection'
	| 'command-failed';

export interface StageDiffChatErrorShape {
	code: StageDiffChatErrorCode;
	message: string;
}
