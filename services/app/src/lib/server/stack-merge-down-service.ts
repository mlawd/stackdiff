import { runCommand } from '$lib/server/command';
import {
  getImplementationSessionsByStackId,
  removeImplementationSessionByStackAndStage,
  getRuntimeRepositoryPath,
  getStackById,
  setStackStageStatus,
  setStackStatus,
} from '$lib/server/stack-store';
import {
  resolveDefaultBaseBranch,
  resolveWorktreeAbsolutePath,
} from '$lib/server/worktree-service';

export type StackMergeDownErrorCode =
  | 'not-found'
  | 'invalid-state'
  | 'command-failed';

export interface MergeDownStageResult {
  stageId: string;
  stageTitle: string;
  pullRequestNumber: number;
  branchName: string;
}

export interface MergeDownStackResult {
  stackId: string;
  defaultBranch: string;
  mergedStages: number;
  stages: MergeDownStageResult[];
}

class StackMergeDownServiceError extends Error {
  code: StackMergeDownErrorCode;

  constructor(code: StackMergeDownErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function commandFailure(prefix: string, stderrOrError: string): never {
  throw new StackMergeDownServiceError(
    'command-failed',
    `${prefix}: ${stderrOrError}`,
  );
}

async function ensureRepositoryIsClean(repositoryRoot: string): Promise<void> {
  const status = await runCommand(
    'git',
    ['status', '--porcelain'],
    repositoryRoot,
  );
  if (!status.ok) {
    commandFailure(
      'Unable to inspect repository status',
      status.stderr || status.error || 'unknown git failure',
    );
  }

  if (status.stdout.trim().length > 0) {
    throw new StackMergeDownServiceError(
      'invalid-state',
      'Repository has uncommitted changes. Commit or stash them before merging down.',
    );
  }
}

async function fetchDefaultBranch(
  repositoryRoot: string,
  defaultBranch: string,
): Promise<void> {
  const fetched = await runCommand(
    'git',
    ['fetch', 'origin', defaultBranch],
    repositoryRoot,
    { timeoutMs: 120_000 },
  );
  if (!fetched.ok) {
    commandFailure(
      `Unable to fetch origin/${defaultBranch}`,
      fetched.stderr || fetched.error || 'unknown git failure',
    );
  }
}

async function resolveCommitSha(
  repositoryRoot: string,
  ref: string,
): Promise<string | undefined> {
  const resolved = await runCommand(
    'git',
    ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`],
    repositoryRoot,
  );
  if (!resolved.ok || !resolved.stdout.trim()) {
    return undefined;
  }

  return resolved.stdout.trim();
}

async function rebaseAndPushStage(input: {
  defaultBranch: string;
  branchName: string;
  stageTitle: string;
  worktreeAbsolutePath: string;
  oldParentTip?: string;
}): Promise<void> {
  const rebaseArgs: string[] = input.oldParentTip
    ? [
        'rebase',
        '--onto',
        `origin/${input.defaultBranch}`,
        input.oldParentTip,
        input.branchName,
      ]
    : ['rebase', `origin/${input.defaultBranch}`];

  const rebased = await runCommand(
    'git',
    rebaseArgs,
    input.worktreeAbsolutePath,
    { timeoutMs: 120_000 },
  );
  if (!rebased.ok) {
    await runCommand('git', ['rebase', '--abort'], input.worktreeAbsolutePath, {
      timeoutMs: 120_000,
    });
    commandFailure(
      `Failed to rebase stage "${input.stageTitle}"`,
      rebased.stderr || rebased.error || 'unknown git failure',
    );
  }

  const pushed = await runCommand(
    'git',
    ['push', '--force-with-lease', 'origin', input.branchName],
    input.worktreeAbsolutePath,
    { timeoutMs: 120_000 },
  );
  if (!pushed.ok) {
    commandFailure(
      `Failed to push rebased branch for stage "${input.stageTitle}"`,
      pushed.stderr || pushed.error || 'unknown git failure',
    );
  }
}

async function resolveStageTip(input: {
  repositoryRoot: string;
  branchName?: string;
  pullRequestHeadRefOid?: string;
}): Promise<string | undefined> {
  if (input.branchName) {
    const localTip = await resolveCommitSha(
      input.repositoryRoot,
      input.branchName,
    );
    if (localTip) {
      return localTip;
    }

    const remoteTip = await resolveCommitSha(
      input.repositoryRoot,
      `origin/${input.branchName}`,
    );
    if (remoteTip) {
      return remoteTip;
    }
  }

  if (input.pullRequestHeadRefOid) {
    return input.pullRequestHeadRefOid;
  }

  return undefined;
}

async function retargetAndMergePullRequest(input: {
  repositoryRoot: string;
  pullRequestNumber: number;
  defaultBranch: string;
  stageTitle: string;
}): Promise<void> {
  const retargeted = await runCommand(
    'gh',
    [
      'pr',
      'edit',
      String(input.pullRequestNumber),
      '--base',
      input.defaultBranch,
    ],
    input.repositoryRoot,
    { timeoutMs: 120_000 },
  );
  if (!retargeted.ok) {
    commandFailure(
      `Failed to retarget PR #${input.pullRequestNumber} for stage "${input.stageTitle}"`,
      retargeted.stderr || retargeted.error || 'unknown gh failure',
    );
  }

  const merged = await runCommand(
    'gh',
    ['pr', 'merge', String(input.pullRequestNumber), '--squash'],
    input.repositoryRoot,
    { timeoutMs: 120_000 },
  );
  if (!merged.ok) {
    commandFailure(
      `Failed to merge PR #${input.pullRequestNumber} for stage "${input.stageTitle}"`,
      merged.stderr || merged.error || 'unknown gh failure',
    );
  }
}

async function getPullRequestState(input: {
  repositoryRoot: string;
  pullRequestNumber: number;
}): Promise<'OPEN' | 'CLOSED' | 'MERGED' | undefined> {
  const viewed = await runCommand(
    'gh',
    ['pr', 'view', String(input.pullRequestNumber), '--json', 'state'],
    input.repositoryRoot,
    { timeoutMs: 120_000 },
  );
  if (!viewed.ok) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(viewed.stdout || '{}') as { state?: unknown };
    if (
      parsed.state === 'OPEN' ||
      parsed.state === 'CLOSED' ||
      parsed.state === 'MERGED'
    ) {
      return parsed.state;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

async function cleanupLocalWorktreeAndBranch(input: {
  repositoryRoot: string;
  worktreeAbsolutePath: string;
  branchName: string;
}): Promise<void> {
  const removed = await runCommand(
    'git',
    ['worktree', 'remove', '--force', input.worktreeAbsolutePath],
    input.repositoryRoot,
    { timeoutMs: 120_000 },
  );
  if (!removed.ok) {
    commandFailure(
      `Merged successfully, but failed to remove worktree ${input.worktreeAbsolutePath}`,
      removed.stderr || removed.error || 'unknown git failure',
    );
  }

  const deleted = await runCommand(
    'git',
    ['branch', '-D', input.branchName],
    input.repositoryRoot,
    { timeoutMs: 120_000 },
  );
  if (!deleted.ok) {
    commandFailure(
      `Merged successfully, but failed to delete local branch ${input.branchName}`,
      deleted.stderr || deleted.error || 'unknown git failure',
    );
  }
}

async function lookupPullRequestHead(input: {
  repositoryRoot: string;
  pullRequestNumber: number;
}): Promise<{ headRefOid?: string }> {
  const result = await runCommand(
    'gh',
    ['pr', 'view', String(input.pullRequestNumber), '--json', 'headRefOid'],
    input.repositoryRoot,
    { timeoutMs: 120_000 },
  );

  if (!result.ok) {
    commandFailure(
      `Unable to inspect PR #${input.pullRequestNumber}`,
      result.stderr || result.error || 'unknown gh failure',
    );
  }

  try {
    const parsed = JSON.parse(result.stdout || '{}') as {
      headRefOid?: unknown;
    };
    return {
      headRefOid:
        typeof parsed.headRefOid === 'string' ? parsed.headRefOid : undefined,
    };
  } catch {
    commandFailure(
      `Unable to parse PR #${input.pullRequestNumber} details`,
      'invalid JSON payload from gh',
    );
  }
}

async function validateStageIsMergeSafe(input: {
  repositoryRoot: string;
  stageTitle: string;
  stageStatus: string;
  approvedCommitSha?: string;
  pullRequestNumber: number;
}): Promise<void> {
  if (input.stageStatus === 'done') {
    return;
  }

  if (input.stageStatus !== 'approved') {
    throw new StackMergeDownServiceError(
      'invalid-state',
      `Stage "${input.stageTitle}" must be approved before merge down.`,
    );
  }

  if (!input.approvedCommitSha) {
    throw new StackMergeDownServiceError(
      'invalid-state',
      `Stage "${input.stageTitle}" is approved without an approved commit SHA. Re-approve before merging.`,
    );
  }

  const pr = await lookupPullRequestHead({
    repositoryRoot: input.repositoryRoot,
    pullRequestNumber: input.pullRequestNumber,
  });

  if (!pr.headRefOid || pr.headRefOid !== input.approvedCommitSha) {
    throw new StackMergeDownServiceError(
      'invalid-state',
      `Stage "${input.stageTitle}" approval is stale. Re-approve the latest commit before merging.`,
    );
  }
}

export async function mergeDownStack(
  stackId: string,
): Promise<MergeDownStackResult> {
  const stack = await getStackById(stackId);
  if (!stack) {
    throw new StackMergeDownServiceError('not-found', 'Stack not found.');
  }

  const stages = stack.stages ?? [];
  if (stages.length === 0) {
    throw new StackMergeDownServiceError(
      'invalid-state',
      'This stack has no stages to merge.',
    );
  }

  const repositoryRoot = await getRuntimeRepositoryPath({ stackId });
  await ensureRepositoryIsClean(repositoryRoot);

  const defaultBranch = await resolveDefaultBaseBranch(repositoryRoot);
  await fetchDefaultBranch(repositoryRoot, defaultBranch);

  const sessions = await getImplementationSessionsByStackId(stackId);
  const sessionsByStageId = new Map(
    sessions.map((session) => [session.stageId, session]),
  );
  const stageTipById = new Map<string, string>();
  for (const stage of stages) {
    const session = sessionsByStageId.get(stage.id);
    const tip = await resolveStageTip({
      repositoryRoot,
      branchName: session?.branchName,
      pullRequestHeadRefOid: stage.pullRequest?.headRefOid,
    });
    if (tip) {
      stageTipById.set(stage.id, tip);
    }
  }

  const mergedStages: MergeDownStageResult[] = [];

  for (const stage of stages) {
    const pullRequestNumber = stage.pullRequest?.number;
    if (!pullRequestNumber) {
      throw new StackMergeDownServiceError(
        'invalid-state',
        `Stage "${stage.title}" is missing a pull request.`,
      );
    }

    await validateStageIsMergeSafe({
      repositoryRoot,
      stageTitle: stage.title,
      stageStatus: stage.status,
      approvedCommitSha: stage.approvedCommitSha,
      pullRequestNumber,
    });
  }

  for (let stageIndex = 0; stageIndex < stages.length; stageIndex += 1) {
    const stage = stages[stageIndex];
    if (!stage) {
      continue;
    }

    if (stage.status === 'done') {
      continue;
    }

    const pullRequestNumber = stage.pullRequest?.number;
    if (!pullRequestNumber) {
      throw new StackMergeDownServiceError(
        'invalid-state',
        `Stage "${stage.title}" is missing a pull request.`,
      );
    }

    const session = sessionsByStageId.get(stage.id);
    if (!session?.branchName || !session.worktreePathKey) {
      throw new StackMergeDownServiceError(
        'invalid-state',
        `Stage "${stage.title}" is missing branch/worktree session data.`,
      );
    }

    const worktreeAbsolutePath = resolveWorktreeAbsolutePath(
      repositoryRoot,
      session.worktreePathKey,
    );

    const pullRequestState = await getPullRequestState({
      repositoryRoot,
      pullRequestNumber,
    });

    if (pullRequestState !== 'MERGED') {
      let oldParentTip: string | undefined;
      if (stageIndex > 0) {
        const previousStage = stages[stageIndex - 1];
        if (previousStage) {
          oldParentTip = stageTipById.get(previousStage.id);
        }
      }

      await rebaseAndPushStage({
        defaultBranch,
        branchName: session.branchName,
        stageTitle: stage.title,
        worktreeAbsolutePath,
        oldParentTip,
      });

      await retargetAndMergePullRequest({
        repositoryRoot,
        pullRequestNumber,
        defaultBranch,
        stageTitle: stage.title,
      });
    }

    await cleanupLocalWorktreeAndBranch({
      repositoryRoot,
      worktreeAbsolutePath,
      branchName: session.branchName,
    });

    mergedStages.push({
      stageId: stage.id,
      stageTitle: stage.title,
      pullRequestNumber,
      branchName: session.branchName,
    });

    await setStackStageStatus(stackId, stage.id, 'done');
    await removeImplementationSessionByStackAndStage(stackId, stage.id);

    await fetchDefaultBranch(repositoryRoot, defaultBranch);
  }

  await setStackStatus(stackId, 'complete');

  return {
    stackId,
    defaultBranch,
    mergedStages: mergedStages.length,
    stages: mergedStages,
  };
}

export function isStackMergeDownServiceError(
  error: unknown,
): error is { code: StackMergeDownErrorCode; message: string } {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as Partial<{ code: string; message: string }>;
  return (
    typeof candidate.code === 'string' && typeof candidate.message === 'string'
  );
}
