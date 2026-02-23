import type {
  StackMetadata,
  StackSyncState,
  StackViewModel,
} from '$lib/types/stack';

import { runCommand } from '$lib/server/command';
import { getRuntimeRepositoryPath } from '$lib/server/stack-store';

interface RuntimeStatus {
  repositoryAbsolutePath: string;
  currentBranch: string;
  syncState: StackSyncState;
  workingTreeDirty: boolean;
  gitError?: string;
  ghError?: string;
}

function applyRuntimeStatus(
  stack: StackMetadata,
  runtime: RuntimeStatus,
): StackViewModel {
  return {
    ...stack,
    repositoryAbsolutePath: runtime.repositoryAbsolutePath,
    currentBranch: runtime.currentBranch,
    syncState: runtime.syncState,
    workingTreeDirty: runtime.workingTreeDirty,
    gitError: runtime.gitError,
    ghError: runtime.ghError,
  };
}

async function getRuntimeStatus(projectId: string): Promise<RuntimeStatus> {
  const repositoryAbsolutePath = await getRuntimeRepositoryPath({ projectId });

  const gitStatus = await runCommand(
    'git',
    ['status', '--porcelain', '--branch'],
    repositoryAbsolutePath,
  );
  if (!gitStatus.ok) {
    return {
      repositoryAbsolutePath,
      currentBranch: 'unknown',
      syncState: 'repo-error',
      workingTreeDirty: false,
      gitError: gitStatus.stderr || gitStatus.error,
    };
  }

  const currentBranch = await runCommand(
    'git',
    ['branch', '--show-current'],
    repositoryAbsolutePath,
  );

  const workingTreeDirty = gitStatus.stdout
    .split('\n')
    .some((line) => line.length > 0 && !line.startsWith('##'));

  let syncState: StackSyncState = 'clean';
  if (!currentBranch.ok) {
    syncState = 'repo-error';
  } else if (workingTreeDirty) {
    syncState = 'dirty';
  }

  const activeBranch = currentBranch.ok
    ? currentBranch.stdout || 'detached-head'
    : 'unknown';

  let ghError: string | undefined;

  const ghAuth = await runCommand(
    'gh',
    ['auth', 'status'],
    repositoryAbsolutePath,
  );
  if (!ghAuth.ok) {
    ghError = ghAuth.stderr || ghAuth.error;
  }

  return {
    repositoryAbsolutePath,
    currentBranch: activeBranch,
    syncState,
    workingTreeDirty,
    ghError,
  };
}

export async function enrichStacksStatus(
  stacks: StackMetadata[],
): Promise<StackViewModel[]> {
  const runtimeByProjectId = new Map<string, RuntimeStatus>();

  return Promise.all(
    stacks.map(async (stack) => {
      const existingRuntime = runtimeByProjectId.get(stack.projectId);
      if (existingRuntime) {
        return applyRuntimeStatus(stack, existingRuntime);
      }

      const runtime = await getRuntimeStatus(stack.projectId);
      runtimeByProjectId.set(stack.projectId, runtime);
      return applyRuntimeStatus(stack, runtime);
    }),
  );
}

export async function enrichStackStatus(
  stack: StackMetadata,
): Promise<StackViewModel> {
  const runtime = await getRuntimeStatus(stack.projectId);
  return applyRuntimeStatus(stack, runtime);
}
