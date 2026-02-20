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
  setStackStageStatus,
} from '$lib/server/stack-store';
import {
  resolveDefaultBaseBranch,
  resolveWorktreeAbsolutePath,
} from '$lib/server/worktree-service';
import type { FeatureStageStatus, StackPullRequest } from '$lib/types/stack';

export interface ImplementationStageStatusSummary {
  stageStatus: FeatureStageStatus;
  runtimeState: 'idle' | 'busy' | 'retry' | 'missing';
  todoCompleted: number;
  todoTotal: number;
  pullRequest?: StackPullRequest;
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
  stages: Array<{ id: string }>,
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

export async function getImplementationStageStatusSummary(
  stackId: string,
  stageId: string,
): Promise<ImplementationStageStatusSummary> {
  const stack = await getStackById(stackId);
  if (!stack) {
    throw new Error('Feature not found.');
  }

  const stage = (stack.stages ?? []).find((item) => item.id === stageId);
  if (!stage) {
    throw new Error('Stage not found.');
  }

  const stageIndex = (stack.stages ?? []).findIndex(
    (item) => item.id === stageId,
  );
  if (stageIndex === -1) {
    throw new Error('Stage not found.');
  }

  const implementationSession = await getImplementationSessionByStackAndStage(
    stackId,
    stageId,
  );
  if (!implementationSession?.opencodeSessionId) {
    return {
      stageStatus: stage.status,
      runtimeState: 'missing',
      todoCompleted: 0,
      todoTotal: 0,
      pullRequest: stage.pullRequest,
    };
  }

  const repositoryRoot = await getRuntimeRepositoryPath();
  const worktreeAbsolutePath = resolveWorktreeAbsolutePath(
    repositoryRoot,
    implementationSession.worktreePathKey,
  );
  const baseBranch = await resolveStageBaseBranch(
    repositoryRoot,
    stackId,
    stack.stages ?? [],
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

  let stageStatus = stage.status;
  let stagePullRequest = stage.pullRequest;
  let prStack = stack;
  let prStage = stage;
  if (
    stageStatus === 'in-progress' &&
    runtimeState !== 'busy' &&
    runtimeState !== 'retry'
  ) {
    const [clean, ahead] = await Promise.all([
      isWorktreeClean(worktreeAbsolutePath),
      branchHasCommitsAheadOfBase(worktreeAbsolutePath, baseBranch),
    ]);

    if (clean && ahead) {
      const updatedStack = await setStackStageStatus(
        stackId,
        stageId,
        'review-ready',
      );
      const updatedStage = (updatedStack.stages ?? []).find(
        (item) => item.id === stageId,
      );
      if (updatedStage) {
        stageStatus = updatedStage.status;
        stagePullRequest = updatedStage.pullRequest;
        prStack = updatedStack;
        prStage = updatedStage;
      }
    }
  }

  if (stageStatus === 'review-ready' && !stagePullRequest?.number) {
    try {
      const pullRequest = await ensureStagePullRequest({
        repositoryRoot,
        stack: prStack,
        stage: prStage,
        stageIndex,
        branchName: implementationSession.branchName,
      });
      if (pullRequest) {
        stagePullRequest = pullRequest;
      }
    } catch (error) {
      console.error(
        '[implementation-status] Failed to ensure stage pull request',
        {
          stackId,
          stageId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  return {
    stageStatus,
    runtimeState,
    todoCompleted: todoSummary.completed,
    todoTotal: todoSummary.total,
    pullRequest: stagePullRequest,
  };
}
