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
  pullRequest?: StackPullRequest;
}

interface StageStatusContext {
  stackId: string;
  stageId: string;
  stageIndex: number;
  stageStatus: FeatureStageStatus;
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
    pullRequest: context.pullRequest,
  };
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
        'review-ready',
      );
      const updatedStage = (updatedStack.stages ?? []).find(
        (item) => item.id === context.stageId,
      );
      if (updatedStage) {
        context.stageStatus = updatedStage.status;
        context.pullRequest = updatedStage.pullRequest;
      }
    }
  }

  if (context.stageStatus === 'review-ready' && context.branchName) {
    const repositoryRoot = await getRuntimeRepositoryPath({
      stackId: context.stackId,
    });
    const stack = await getStackById(context.stackId);
    const stage = (stack?.stages ?? []).find((item) => item.id === stageId);

    if (stack && stage) {
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
  }

  return toSummary(context);
}
