import {
  getOpencodeSessionRuntimeState,
  getOpencodeSessionTodos,
} from '$lib/server/opencode';
import { runCommand } from '$lib/server/command';
import { ensureStagePullRequest } from '$lib/server/stage-pr-service';
import {
  getImplementationSessionByStackAndStage,
  getRuntimeRepositoryPath,
  getStackById,
  setStackStageApproved,
  setStackStageStatus,
} from '$lib/server/stack-store';
import {
  resolveDefaultBaseBranch,
  resolveWorktreeAbsolutePath,
} from '$lib/server/worktree-service';
import type {
  FeatureStage,
  FeatureStageStatus,
  StackPullRequest,
} from '$lib/types/stack';

export interface ImplementationStageStatusSummary {
  stageStatus: FeatureStageStatus;
  runtimeState: 'idle' | 'busy' | 'retry' | 'missing';
  todoCompleted: number;
  todoTotal: number;
  approvedCommitSha?: string;
  pullRequest?: StackPullRequest;
}

interface StageStatusContext {
  stackId: string;
  stageId: string;
  stageIndex: number;
  stageStatus: FeatureStageStatus;
  approvedCommitSha?: string;
  pullRequest?: StackPullRequest;
  branchName?: string;
  worktreeAbsolutePath?: string;
  baseBranch?: string;
  runtimeState: 'idle' | 'busy' | 'retry' | 'missing';
  todoCompleted: number;
  todoTotal: number;
}

function summarizeTodos(todos: Array<{ status: string }>): {
  completed: number;
  total: number;
} {
  const activeTodos = todos.filter((todo) => todo.status !== 'cancelled');
  const completed = activeTodos.filter(
    (todo) => todo.status === 'completed',
  ).length;

  return {
    completed,
    total: activeTodos.length,
  };
}

async function isWorktreeClean(worktreeAbsolutePath: string): Promise<boolean> {
  const status = await runCommand(
    'git',
    ['status', '--porcelain'],
    worktreeAbsolutePath,
  );
  return status.ok && status.stdout.length === 0;
}

async function branchHasCommitsAheadOfBase(
  worktreeAbsolutePath: string,
  baseBranch: string,
): Promise<boolean> {
  try {
    const ahead = await runCommand(
      'git',
      ['rev-list', '--count', `${baseBranch}..HEAD`],
      worktreeAbsolutePath,
    );
    if (!ahead.ok || !ahead.stdout) {
      return false;
    }

    const parsed = Number.parseInt(ahead.stdout.trim(), 10);
    return Number.isFinite(parsed) && parsed > 0;
  } catch {
    return false;
  }
}

async function resolveStageBaseBranch(
  repositoryRoot: string,
  stackId: string,
  stages: FeatureStage[],
  stageIndex: number,
): Promise<string> {
  if (stageIndex === 0) {
    return resolveDefaultBaseBranch(repositoryRoot);
  }

  const previousStage = stages[stageIndex - 1];
  if (!previousStage) {
    throw new Error('Unable to resolve previous stage branch.');
  }

  const previousSession = await getImplementationSessionByStackAndStage(
    stackId,
    previousStage.id,
  );
  if (!previousSession?.branchName) {
    throw new Error('Previous stage branch is missing.');
  }

  return previousSession.branchName;
}

async function loadStageStatusContext(
  stackId: string,
  stageId: string,
): Promise<StageStatusContext> {
  const stack = await getStackById(stackId);
  if (!stack) {
    throw new Error('Stack not found.');
  }

  const stages = stack.stages ?? [];
  const stageIndex = stages.findIndex((item) => item.id === stageId);
  if (stageIndex === -1) {
    throw new Error('Stage not found.');
  }

  const stage = stages[stageIndex];
  if (!stage) {
    throw new Error('Stage not found.');
  }

  const implementationSession = await getImplementationSessionByStackAndStage(
    stackId,
    stageId,
  );
  if (!implementationSession?.opencodeSessionId) {
    return {
      stackId,
      stageId,
      stageIndex,
      stageStatus: stage.status,
      approvedCommitSha: stage.approvedCommitSha,
      pullRequest: stage.pullRequest,
      runtimeState: 'missing',
      todoCompleted: 0,
      todoTotal: 0,
    };
  }

  const repositoryRoot = await getRuntimeRepositoryPath({ stackId });
  const worktreeAbsolutePath = resolveWorktreeAbsolutePath(
    repositoryRoot,
    implementationSession.worktreePathKey,
  );
  const baseBranch = await resolveStageBaseBranch(
    repositoryRoot,
    stackId,
    stages,
    stageIndex,
  );

  const runtimeState = await getOpencodeSessionRuntimeState(
    implementationSession.opencodeSessionId,
    {
      directory: worktreeAbsolutePath,
    },
  );
  const todos = await getOpencodeSessionTodos(
    implementationSession.opencodeSessionId,
    {
      directory: worktreeAbsolutePath,
    },
  );
  const todoSummary = summarizeTodos(todos);

  return {
    stackId,
    stageId,
    stageIndex,
    stageStatus: stage.status,
    approvedCommitSha: stage.approvedCommitSha,
    pullRequest: stage.pullRequest,
    branchName: implementationSession.branchName,
    worktreeAbsolutePath,
    baseBranch,
    runtimeState,
    todoCompleted: todoSummary.completed,
    todoTotal: todoSummary.total,
  };
}

function toSummary(
  context: StageStatusContext,
): ImplementationStageStatusSummary {
  return {
    stageStatus: context.stageStatus,
    runtimeState: context.runtimeState,
    todoCompleted: context.todoCompleted,
    todoTotal: context.todoTotal,
    approvedCommitSha: context.approvedCommitSha,
    pullRequest: context.pullRequest,
  };
}

function checksAreMergeable(
  pullRequest: StackPullRequest | undefined,
): boolean {
  const checks = pullRequest?.checks;
  if (!checks || checks.total === 0) {
    return false;
  }

  return checks.completed === checks.total && checks.failed === 0;
}

async function refreshPullRequestContext(
  context: StageStatusContext,
): Promise<void> {
  if (!context.branchName) {
    return;
  }

  const repositoryRoot = await getRuntimeRepositoryPath({
    stackId: context.stackId,
  });
  const stack = await getStackById(context.stackId);
  const stage = (stack?.stages ?? []).find(
    (item) => item.id === context.stageId,
  );

  if (!stack || !stage) {
    return;
  }

  try {
    const pullRequest = await ensureStagePullRequest({
      repositoryRoot,
      stack,
      stage,
      stageIndex: context.stageIndex,
      branchName: context.branchName,
    });
    if (pullRequest) {
      context.pullRequest = pullRequest;
    }
  } catch (error) {
    console.error(
      '[implementation-status] Failed to ensure stage pull request',
      {
        stackId: context.stackId,
        stageId: context.stageId,
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }
}

async function applyApprovalStateTransitions(
  context: StageStatusContext,
): Promise<void> {
  if (context.stageStatus === 'review') {
    if (
      context.pullRequest?.reviewDecision === 'APPROVED' &&
      context.pullRequest.headRefOid
    ) {
      const updatedStack = await setStackStageApproved(
        context.stackId,
        context.stageId,
        context.pullRequest.headRefOid,
      );
      const updatedStage = (updatedStack.stages ?? []).find(
        (item) => item.id === context.stageId,
      );
      if (updatedStage) {
        context.stageStatus = updatedStage.status;
        context.approvedCommitSha = updatedStage.approvedCommitSha;
      }
    }

    return;
  }

  if (context.stageStatus !== 'approved') {
    return;
  }

  if (!context.approvedCommitSha) {
    const updatedStack = await setStackStageStatus(
      context.stackId,
      context.stageId,
      'review',
    );
    const updatedStage = (updatedStack.stages ?? []).find(
      (item) => item.id === context.stageId,
    );
    if (updatedStage) {
      context.stageStatus = updatedStage.status;
      context.approvedCommitSha = updatedStage.approvedCommitSha;
    }
    return;
  }

  const currentHeadSha = context.pullRequest?.headRefOid;
  if (!currentHeadSha || currentHeadSha !== context.approvedCommitSha) {
    const updatedStack = await setStackStageStatus(
      context.stackId,
      context.stageId,
      'review',
    );
    const updatedStage = (updatedStack.stages ?? []).find(
      (item) => item.id === context.stageId,
    );
    if (updatedStage) {
      context.stageStatus = updatedStage.status;
      context.approvedCommitSha = updatedStage.approvedCommitSha;
    }
  }
}

export async function getImplementationStageStatusSummary(
  stackId: string,
  stageId: string,
): Promise<ImplementationStageStatusSummary> {
  const context = await loadStageStatusContext(stackId, stageId);
  return toSummary(context);
}

export async function reconcileImplementationStageStatus(
  stackId: string,
  stageId: string,
): Promise<ImplementationStageStatusSummary> {
  const context = await loadStageStatusContext(stackId, stageId);

  if (
    context.stageStatus === 'in-progress' &&
    context.runtimeState !== 'busy' &&
    context.runtimeState !== 'retry' &&
    context.worktreeAbsolutePath &&
    context.baseBranch
  ) {
    const [clean, ahead] = await Promise.all([
      isWorktreeClean(context.worktreeAbsolutePath),
      branchHasCommitsAheadOfBase(
        context.worktreeAbsolutePath,
        context.baseBranch,
      ),
    ]);

    if (clean && ahead) {
      const updatedStack = await setStackStageStatus(
        context.stackId,
        context.stageId,
        'review',
      );
      const updatedStage = (updatedStack.stages ?? []).find(
        (item) => item.id === context.stageId,
      );
      if (updatedStage) {
        context.stageStatus = updatedStage.status;
        context.approvedCommitSha = updatedStage.approvedCommitSha;
        context.pullRequest = updatedStage.pullRequest;
      }
    }
  }

  if (
    (context.stageStatus === 'review' || context.stageStatus === 'approved') &&
    context.branchName
  ) {
    await refreshPullRequestContext(context);
    await applyApprovalStateTransitions(context);
  }

  return toSummary(context);
}

export async function approveStageForMerge(
  stackId: string,
  stageId: string,
): Promise<ImplementationStageStatusSummary> {
  const context = await loadStageStatusContext(stackId, stageId);
  if (!context.branchName) {
    throw new Error('Stage branch is unavailable. Start this stage first.');
  }

  await refreshPullRequestContext(context);
  const headSha = context.pullRequest?.headRefOid;
  if (!headSha) {
    throw new Error(
      'Pull request head commit is unavailable. Ensure the stage has an open PR before approving.',
    );
  }

  const updatedStack = await setStackStageApproved(stackId, stageId, headSha);
  const updatedStage = (updatedStack.stages ?? []).find(
    (item) => item.id === stageId,
  );

  return {
    stageStatus: updatedStage?.status ?? 'approved',
    runtimeState: context.runtimeState,
    todoCompleted: context.todoCompleted,
    todoTotal: context.todoTotal,
    approvedCommitSha: updatedStage?.approvedCommitSha ?? headSha,
    pullRequest: context.pullRequest,
  };
}

export async function mergeStagePullRequest(
  stackId: string,
  stageId: string,
): Promise<ImplementationStageStatusSummary> {
  const context = await loadStageStatusContext(stackId, stageId);
  await refreshPullRequestContext(context);

  if (context.stageStatus !== 'approved') {
    throw new Error('Stage must be approved before merge.');
  }

  const pullRequestNumber = context.pullRequest?.number;
  if (!pullRequestNumber) {
    throw new Error('Stage pull request is unavailable.');
  }

  if (!checksAreMergeable(context.pullRequest)) {
    throw new Error('Stage pull request checks are not fully passing yet.');
  }

  const repositoryRoot = await getRuntimeRepositoryPath({ stackId });
  const merged = await runCommand(
    'gh',
    ['pr', 'merge', String(pullRequestNumber), '--squash'],
    repositoryRoot,
  );
  if (!merged.ok) {
    throw new Error(
      `Unable to merge pull request: ${merged.stderr || merged.error || 'unknown gh error'}`,
    );
  }

  const updatedStack = await setStackStageStatus(stackId, stageId, 'done');
  const updatedStage = (updatedStack.stages ?? []).find(
    (item) => item.id === stageId,
  );

  return {
    stageStatus: updatedStage?.status ?? 'done',
    runtimeState: context.runtimeState,
    todoCompleted: context.todoCompleted,
    todoTotal: context.todoTotal,
    approvedCommitSha: undefined,
    pullRequest: context.pullRequest
      ? {
          ...context.pullRequest,
          state: 'MERGED',
        }
      : context.pullRequest,
  };
}
