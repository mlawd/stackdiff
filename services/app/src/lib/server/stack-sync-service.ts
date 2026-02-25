import { runCommand } from '$lib/server/command';
import {
  getImplementationSessionsByStackId,
  getRuntimeRepositoryPath,
  getStackById,
} from '$lib/server/stack-store';
import {
  resolveDefaultBaseBranch,
  resolveWorktreeAbsolutePath,
} from '$lib/server/worktree-service';
import type {
  FeatureStageStatus,
  StageSyncMetadata,
  StackImplementationSession,
  StackMetadata,
} from '$lib/types/stack';

export type StackSyncErrorCode =
  | 'not-found'
  | 'invalid-state'
  | 'command-failed';

export interface SyncStackStageResult {
  stageId: string;
  stageTitle: string;
  branchName?: string;
  baseRef?: string;
  status: 'rebased' | 'skipped';
  reason?: string;
}

export interface SyncStackResult {
  stackId: string;
  totalStages: number;
  rebasedStages: number;
  skippedStages: number;
  stages: SyncStackStageResult[];
}

interface ResolvedStageContext {
  stageId: string;
  stageTitle: string;
  stageStatus: FeatureStageStatus;
  branchName?: string;
  comparisonBranchRef?: string;
  comparisonBranchTip?: string;
  baseRef?: string;
  session?: StackImplementationSession;
  reasonIfUnavailable?: string;
}

class StackSyncServiceError extends Error {
  code: StackSyncErrorCode;

  constructor(code: StackSyncErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

async function resolveExistingRef(
  repositoryRoot: string,
  ref: string,
): Promise<string> {
  if (ref.startsWith('origin/')) {
    const remoteRef = await runCommand(
      'git',
      ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`],
      repositoryRoot,
    );
    if (remoteRef.ok) {
      return ref;
    }

    throw new StackSyncServiceError(
      'invalid-state',
      `Git ref not found: ${ref}`,
    );
  }

  const remoteCandidate = `origin/${ref}`;
  const remoteRef = await runCommand(
    'git',
    ['rev-parse', '--verify', '--quiet', `${remoteCandidate}^{commit}`],
    repositoryRoot,
  );
  if (remoteRef.ok) {
    return remoteCandidate;
  }

  const localRef = await runCommand(
    'git',
    ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`],
    repositoryRoot,
  );
  if (localRef.ok) {
    return ref;
  }

  throw new StackSyncServiceError('invalid-state', `Git ref not found: ${ref}`);
}

async function countBehind(
  repositoryRoot: string,
  branchName: string,
  baseRef: string,
): Promise<number> {
  const count = await runCommand(
    'git',
    ['rev-list', '--count', `${branchName}..${baseRef}`],
    repositoryRoot,
  );
  if (!count.ok || !count.stdout) {
    throw new StackSyncServiceError(
      'command-failed',
      `Unable to compare ${branchName} against ${baseRef}: ${count.stderr || count.error || 'unknown git failure'}`,
    );
  }

  const parsed = Number.parseInt(count.stdout.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new StackSyncServiceError(
      'command-failed',
      `Unable to parse behind count for ${branchName}.`,
    );
  }

  return parsed;
}

async function resolveCommitSha(
  repositoryRoot: string,
  ref: string,
): Promise<string> {
  const resolved = await runCommand(
    'git',
    ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`],
    repositoryRoot,
  );
  if (!resolved.ok || !resolved.stdout.trim()) {
    throw new StackSyncServiceError(
      'invalid-state',
      `Git ref not found: ${ref}`,
    );
  }

  return resolved.stdout.trim();
}

function isMissingRefFailure(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('unknown revision') ||
    normalized.includes('ambiguous argument') ||
    normalized.includes('bad revision') ||
    normalized.includes('not a valid object name')
  );
}

function stageUnavailableMetadata(input: {
  branchName?: string;
  baseRef?: string;
  reason: string;
}): StageSyncMetadata {
  return {
    isOutOfSync: false,
    behindBy: 0,
    branchName: input.branchName,
    baseRef: input.baseRef,
    reasonIfUnavailable: input.reason,
  };
}

async function resolveStageContexts(
  stack: StackMetadata,
  repositoryRoot: string,
  sessionsByStageId: Map<string, StackImplementationSession>,
): Promise<ResolvedStageContext[]> {
  const stages = stack.stages ?? [];
  const contexts: ResolvedStageContext[] = [];
  const defaultBaseBranch = await resolveDefaultBaseBranch(repositoryRoot);
  const defaultBaseRef = await resolveExistingRef(
    repositoryRoot,
    defaultBaseBranch,
  );

  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index];
    if (!stage) {
      continue;
    }

    if (stage.status === 'done') {
      contexts.push({
        stageId: stage.id,
        stageTitle: stage.title,
        stageStatus: stage.status,
        reasonIfUnavailable: 'Stage is merged; sync is not required.',
      });
      continue;
    }

    const session = sessionsByStageId.get(stage.id);
    if (!session?.branchName) {
      contexts.push({
        stageId: stage.id,
        stageTitle: stage.title,
        stageStatus: stage.status,
        reasonIfUnavailable:
          'Stage branch is unavailable. Start this stage first.',
      });
      continue;
    }

    let resolvedBranchName: string;
    let resolvedBranchTip: string;
    try {
      resolvedBranchName = await resolveExistingRef(
        repositoryRoot,
        session.branchName,
      );
      resolvedBranchTip = await resolveCommitSha(
        repositoryRoot,
        resolvedBranchName,
      );
    } catch {
      contexts.push({
        stageId: stage.id,
        stageTitle: stage.title,
        stageStatus: stage.status,
        session,
        branchName: session.branchName,
        reasonIfUnavailable:
          'Stage branch is unavailable. Start this stage first.',
      });
      continue;
    }

    if (index === 0) {
      contexts.push({
        stageId: stage.id,
        stageTitle: stage.title,
        stageStatus: stage.status,
        session,
        branchName: session.branchName,
        comparisonBranchRef: resolvedBranchName,
        comparisonBranchTip: resolvedBranchTip,
        baseRef: defaultBaseRef,
      });
      continue;
    }

    let baseRef = defaultBaseRef;
    for (
      let previousIndex = index - 1;
      previousIndex >= 0;
      previousIndex -= 1
    ) {
      const previousStage = stages[previousIndex];
      if (!previousStage || previousStage.status === 'done') {
        continue;
      }

      const previousSession = sessionsByStageId.get(previousStage.id);
      if (!previousSession?.branchName) {
        continue;
      }

      try {
        baseRef = await resolveExistingRef(
          repositoryRoot,
          previousSession.branchName,
        );
        break;
      } catch {
        continue;
      }
    }

    contexts.push({
      stageId: stage.id,
      stageTitle: stage.title,
      stageStatus: stage.status,
      session,
      branchName: session.branchName,
      comparisonBranchRef: resolvedBranchName,
      comparisonBranchTip: resolvedBranchTip,
      baseRef,
    });
  }

  return contexts;
}

export async function getStageSyncById(
  stack: StackMetadata,
): Promise<Record<string, StageSyncMetadata>> {
  const repositoryRoot = await getRuntimeRepositoryPath({ stackId: stack.id });
  const sessions = await getImplementationSessionsByStackId(stack.id);
  const sessionsByStageId = new Map<string, StackImplementationSession>();
  for (const session of sessions) {
    sessionsByStageId.set(session.stageId, session);
  }

  const contexts = await resolveStageContexts(
    stack,
    repositoryRoot,
    sessionsByStageId,
  );
  const entries = await Promise.all(
    contexts.map(async (context) => {
      if (!context.branchName || !context.baseRef) {
        return [
          context.stageId,
          stageUnavailableMetadata({
            branchName: context.branchName,
            baseRef: context.baseRef,
            reason:
              context.reasonIfUnavailable ??
              'Stage sync status is unavailable.',
          }),
        ] as const;
      }

      let behindBy = 0;
      try {
        behindBy = await countBehind(
          repositoryRoot,
          context.comparisonBranchRef ?? context.branchName,
          context.baseRef,
        );
      } catch (error) {
        if (
          isStackSyncServiceError(error) &&
          error.code === 'command-failed' &&
          isMissingRefFailure(error.message)
        ) {
          return [
            context.stageId,
            stageUnavailableMetadata({
              branchName: context.branchName,
              baseRef: context.baseRef,
              reason:
                'Stage sync status is unavailable because a comparison branch no longer exists.',
            }),
          ] as const;
        }

        throw error;
      }

      return [
        context.stageId,
        {
          isOutOfSync: behindBy > 0,
          behindBy,
          branchName: context.branchName,
          baseRef: context.baseRef,
        } satisfies StageSyncMetadata,
      ] as const;
    }),
  );

  return Object.fromEntries(entries);
}

export async function syncStack(stackId: string): Promise<SyncStackResult> {
  const stack = await getStackById(stackId);
  if (!stack) {
    throw new StackSyncServiceError('not-found', 'Feature not found.');
  }

  const repositoryRoot = await getRuntimeRepositoryPath({ stackId: stack.id });
  const sessions = await getImplementationSessionsByStackId(stack.id);
  const sessionsByStageId = new Map<string, StackImplementationSession>();
  for (const session of sessions) {
    sessionsByStageId.set(session.stageId, session);
  }

  const contexts = await resolveStageContexts(
    stack,
    repositoryRoot,
    sessionsByStageId,
  );
  const stageResults: SyncStackStageResult[] = [];
  let rebasedStages = 0;
  let skippedStages = 0;

  function findPreviousStageContext(
    currentIndex: number,
  ): ResolvedStageContext | undefined {
    for (let index = currentIndex - 1; index >= 0; index -= 1) {
      const candidate = contexts[index];
      if (!candidate?.session || !candidate.branchName) {
        continue;
      }

      return candidate;
    }

    return undefined;
  }

  for (
    let contextIndex = 0;
    contextIndex < contexts.length;
    contextIndex += 1
  ) {
    const context = contexts[contextIndex];
    if (!context) {
      continue;
    }

    if (!context.session || !context.branchName || !context.baseRef) {
      skippedStages += 1;
      stageResults.push({
        stageId: context.stageId,
        stageTitle: context.stageTitle,
        branchName: context.branchName,
        baseRef: context.baseRef,
        status: 'skipped',
        reason: context.reasonIfUnavailable ?? 'Stage branch is unavailable.',
      });
      continue;
    }

    const behindBy = await countBehind(
      repositoryRoot,
      context.comparisonBranchRef ?? context.branchName,
      context.baseRef,
    );
    if (behindBy <= 0) {
      skippedStages += 1;
      stageResults.push({
        stageId: context.stageId,
        stageTitle: context.stageTitle,
        branchName: context.branchName,
        baseRef: context.baseRef,
        status: 'skipped',
        reason: 'Already in sync.',
      });
      continue;
    }

    const worktreeAbsolutePath = resolveWorktreeAbsolutePath(
      repositoryRoot,
      context.session.worktreePathKey,
    );

    const previousContext = findPreviousStageContext(contextIndex);
    const previousBranchName = previousContext?.branchName;
    const previousBranchTip = previousContext?.comparisonBranchTip;
    const rebaseArgs: string[] =
      previousBranchName && previousBranchTip
        ? [
            'rebase',
            '--onto',
            previousBranchName,
            previousBranchTip,
            context.branchName,
          ]
        : ['rebase', context.baseRef];

    const rebased = await runCommand('git', rebaseArgs, worktreeAbsolutePath, {
      timeoutMs: 120_000,
    });

    if (!rebased.ok) {
      await runCommand('git', ['rebase', '--abort'], worktreeAbsolutePath, {
        timeoutMs: 120_000,
      });
      throw new StackSyncServiceError(
        'command-failed',
        `Failed to sync stage ${context.stageTitle}: ${rebased.stderr || rebased.error || 'unknown git failure'}. Rebase was automatically aborted.`,
      );
    }

    const pushed = await runCommand(
      'git',
      ['push', '--force-with-lease', 'origin', context.branchName],
      worktreeAbsolutePath,
      { timeoutMs: 120_000 },
    );
    if (!pushed.ok) {
      throw new StackSyncServiceError(
        'command-failed',
        `Failed to push synced stage ${context.stageTitle}: ${pushed.stderr || pushed.error || 'unknown git failure'}.`,
      );
    }

    rebasedStages += 1;
    stageResults.push({
      stageId: context.stageId,
      stageTitle: context.stageTitle,
      branchName: context.branchName,
      baseRef: context.baseRef,
      status: 'rebased',
    });
  }

  return {
    stackId,
    totalStages: contexts.length,
    rebasedStages,
    skippedStages,
    stages: stageResults,
  };
}

export function isStackSyncServiceError(
  error: unknown,
): error is { code: StackSyncErrorCode; message: string } {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as Partial<{ code: string; message: string }>;
  return (
    typeof candidate.code === 'string' && typeof candidate.message === 'string'
  );
}
