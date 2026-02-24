export type StackSyncState = 'clean' | 'dirty' | 'repo-error';

export type FeatureType = 'feature' | 'bugfix' | 'chore';

export type StackStatus = 'created' | 'planned' | 'started' | 'complete';

export type FeatureStageStatus =
  | 'not-started'
  | 'in-progress'
  | 'review-ready'
  | 'done';

export interface FeatureStage {
  id: string;
  title: string;
  details?: string;
  status: FeatureStageStatus;
  pullRequest?: StackPullRequest;
}

export interface StackMetadata {
  id: string;
  projectId: string;
  name: string;
  notes?: string;
  type: FeatureType;
  status: StackStatus;
  stages?: FeatureStage[];
}

export interface StackUpsertInput {
  projectId?: string;
  name: string;
  notes?: string;
  type: FeatureType;
}

export interface StackedProject {
  id: string;
  name: string;
  repositoryPath: string;
}

export interface StackedProjectConfig {
  version: number;
  defaultModel?: string;
  projects: StackedProject[];
}

export interface ProjectHealthCheck {
  key:
    | 'path-exists'
    | 'path-is-directory'
    | 'git-repo'
    | 'stacked-writable'
    | 'git-status'
    | 'gh-auth';
  ok: boolean;
  message?: string;
}

export interface ProjectHealthSummary {
  projectId: string;
  ok: boolean;
  repositoryRoot?: string;
  checks: ProjectHealthCheck[];
}

export interface StackFile {
  version: number;
  stacks: StackMetadata[];
  planningSessions?: StackPlanningSession[];
  implementationSessions?: StackImplementationSession[];
  reviewSessions?: StackReviewSession[];
}

export type PlanningRole = 'user' | 'assistant' | 'system' | 'tool';

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

export interface StackReviewSession {
  id: string;
  stackId: string;
  stageId: string;
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
  commentCount?: number;
}

export interface StackViewModel extends StackMetadata {
  repositoryAbsolutePath: string;
  currentBranch: string;
  syncState: StackSyncState;
  workingTreeDirty: boolean;
  gitError?: string;
  ghError?: string;
  stageSyncById?: Record<string, StageSyncMetadata>;
}

export interface StageSyncMetadata {
  isOutOfSync: boolean;
  behindBy: number;
  branchName?: string;
  baseRef?: string;
  reasonIfUnavailable?: string;
}
