import { ensureImplementationSessionBootstrap } from '$lib/server/implementation-service';
import {
  getImplementationSessionByStackAndStage,
  getRuntimeRepositoryPath,
  getStackById,
  setStackStartedWithStageInProgress,
} from '$lib/server/stack-store';
import {
  createStageBranchIdentity,
  ensureStageBranchWorktree,
  resolveDefaultBaseBranch,
} from '$lib/server/worktree-service';
import type {
  StackImplementationSession,
  StackMetadata,
} from '$lib/types/stack';

export interface StartFeatureResult {
  stack: StackMetadata;
  implementationSession: StackImplementationSession;
  stageNumber: number;
  stageTitle: string;
  branchName: string;
  worktreePathKey: string;
  worktreeAbsolutePath: string;
  reusedWorktree: boolean;
  reusedSession: boolean;
  startedNow: boolean;
}

interface StartPreconditions {
  stageId: string;
  stageTitle: string;
  stageIndex: number;
  baseBranch: string;
}

async function resolveStartPreconditions(
  stack: StackMetadata,
  repositoryRoot: string,
): Promise<StartPreconditions> {
  const stages = stack.stages ?? [];
  if (stages.length === 0) {
    throw new Error(
      'Save a plan with at least one stage before starting implementation.',
    );
  }

  if (stages.some((stage) => stage.status === 'in-progress')) {
    throw new Error(
      'A stage is already in progress. Finish it before starting the next stage.',
    );
  }

  const stageIndex = stages.findIndex(
    (stage) => stage.status === 'not-started',
  );
  if (stageIndex === -1) {
    throw new Error('No remaining stages are ready to start.');
  }

  const stage = stages[stageIndex];
  if (!stage) {
    throw new Error(
      'Unable to resolve the next stage. Save the plan again to regenerate stages.',
    );
  }

  let baseBranch: string;
  if (stageIndex === 0) {
    baseBranch = await resolveDefaultBaseBranch(repositoryRoot);
  } else {
    const previousStage = stages[stageIndex - 1];
    if (!previousStage) {
      throw new Error(
        'Unable to resolve the previous stage branch for the next stage.',
      );
    }

    const previousSession = await getImplementationSessionByStackAndStage(
      stack.id,
      previousStage.id,
    );
    if (!previousSession?.branchName) {
      throw new Error(
        'Previous stage branch is missing. Start stages in order from the first stage.',
      );
    }

    baseBranch = previousSession.branchName;
  }

  return {
    stageId: stage.id,
    stageTitle: stage.title,
    stageIndex,
    baseBranch,
  };
}

export async function startFeatureNextStage(
  stackId: string,
): Promise<StartFeatureResult> {
  const stack = await getStackById(stackId);
  if (!stack) {
    throw new Error('Feature not found.');
  }

  const repositoryRoot = await getRuntimeRepositoryPath();
  const stage = await resolveStartPreconditions(stack, repositoryRoot);
  const identity = createStageBranchIdentity({
    featureType: stack.type,
    featureName: stack.name,
    stageNumber: stage.stageIndex + 1,
    stageName: stage.stageTitle,
  });

  const worktree = await ensureStageBranchWorktree({
    repositoryRoot,
    baseBranch: stage.baseBranch,
    branchName: identity.branchName,
    worktreePathKey: identity.worktreePathKey,
  });

  const stageEntry = (stack.stages ?? [])[stage.stageIndex];
  if (!stageEntry) {
    throw new Error(
      'The next stage is missing. Save the plan again to regenerate stages.',
    );
  }

  const implementation = await ensureImplementationSessionBootstrap({
    stack,
    stage: stageEntry,
    stageIndex: stage.stageIndex,
    branchName: worktree.branchName,
    worktreePathKey: worktree.worktreePathKey,
    worktreeAbsolutePath: worktree.worktreeAbsolutePath,
  });

  const updated = await setStackStartedWithStageInProgress(
    stack.id,
    stage.stageId,
  );

  return {
    stack: updated.stack,
    implementationSession: implementation.session,
    stageNumber: stage.stageIndex + 1,
    stageTitle: stage.stageTitle,
    branchName: worktree.branchName,
    worktreePathKey: worktree.worktreePathKey,
    worktreeAbsolutePath: worktree.worktreeAbsolutePath,
    reusedWorktree: worktree.reusedWorktree,
    reusedSession: implementation.reusedSession,
    startedNow: updated.startedNow,
  };
}
