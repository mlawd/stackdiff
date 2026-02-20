import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { runCommand } from '$lib/server/command';

export interface StageBranchIdentity {
  branchName: string;
  worktreePathKey: string;
}

export interface EnsureStageBranchWorktreeResult {
  baseBranch: string;
  branchName: string;
  worktreePathKey: string;
  worktreeAbsolutePath: string;
  reusedWorktree: boolean;
}

interface ParsedWorktree {
  path: string;
  branchRef?: string;
}

function sanitizeToken(
  value: string,
  fallback: string,
  maxLength: number,
): string {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength);

  return normalized || fallback;
}

function toWorktreePathKey(
  absolutePath: string,
  repositoryRoot: string,
): string {
  const relative = path.relative(repositoryRoot, absolutePath);
  if (!relative || relative.startsWith('..')) {
    return absolutePath;
  }

  return relative;
}

async function branchRefExists(
  repositoryRoot: string,
  branchName: string,
): Promise<boolean> {
  const local = await runCommand(
    'git',
    ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`],
    repositoryRoot,
  );
  if (local.ok) {
    return true;
  }

  const remote = await runCommand(
    'git',
    ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branchName}`],
    repositoryRoot,
  );

  return remote.ok;
}

function parseWorktreeList(raw: string): ParsedWorktree[] {
  const lines = raw.split('\n');
  const parsed: ParsedWorktree[] = [];
  let current: ParsedWorktree | null = null;

  for (const line of lines) {
    if (!line.trim()) {
      if (current) {
        parsed.push(current);
        current = null;
      }
      continue;
    }

    if (line.startsWith('worktree ')) {
      if (current) {
        parsed.push(current);
      }

      current = { path: line.slice('worktree '.length).trim() };
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith('branch ')) {
      current.branchRef = line.slice('branch '.length).trim();
    }
  }

  if (current) {
    parsed.push(current);
  }

  return parsed;
}

async function listGitWorktrees(
  repositoryRoot: string,
): Promise<ParsedWorktree[]> {
  const listed = await runCommand(
    'git',
    ['worktree', 'list', '--porcelain'],
    repositoryRoot,
  );
  if (!listed.ok) {
    throw new Error(
      `Unable to inspect git worktrees: ${listed.stderr || listed.error || 'unknown failure'}`,
    );
  }

  return parseWorktreeList(listed.stdout);
}

export function createStageBranchIdentity(input: {
  featureType: string;
  featureName: string;
  stageNumber: number;
  stageName: string;
}): StageBranchIdentity {
  const typeToken = sanitizeToken(input.featureType, 'feature', 16);
  const nameToken = sanitizeToken(input.featureName, 'work-item', 32);
  const stageToken = sanitizeToken(input.stageName, 'stage', 28);
  const stagePrefix = `${Math.max(1, Math.trunc(input.stageNumber))}`;

  return {
    branchName: `${typeToken}/${nameToken}/${stagePrefix}-${stageToken}`,
    worktreePathKey: path.posix.join(
      '.stacked',
      'worktrees',
      `${typeToken}-${nameToken}-${stagePrefix}-${stageToken}`,
    ),
  };
}

export function resolveWorktreeAbsolutePath(
  repositoryRoot: string,
  worktreePathKey: string,
): string {
  if (path.isAbsolute(worktreePathKey)) {
    return worktreePathKey;
  }

  return path.resolve(repositoryRoot, worktreePathKey);
}

export async function resolveDefaultBaseBranch(
  repositoryRoot: string,
): Promise<string> {
  const symbolic = await runCommand(
    'git',
    ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'],
    repositoryRoot,
  );

  if (symbolic.ok && symbolic.stdout.startsWith('origin/')) {
    const branch = symbolic.stdout.slice('origin/'.length);
    if (await branchRefExists(repositoryRoot, branch)) {
      return branch;
    }
  }

  const remoteShow = await runCommand(
    'git',
    ['remote', 'show', 'origin'],
    repositoryRoot,
  );
  if (remoteShow.ok) {
    const matched = remoteShow.stdout.match(/HEAD branch:\s*(\S+)/);
    const branch = matched?.[1];
    if (branch && (await branchRefExists(repositoryRoot, branch))) {
      return branch;
    }
  }

  for (const candidate of ['main', 'master']) {
    if (await branchRefExists(repositoryRoot, candidate)) {
      return candidate;
    }
  }

  throw new Error(
    'Unable to resolve the repository default base branch. Configure origin/HEAD or create main/master.',
  );
}

export async function ensureStageBranchWorktree(input: {
  repositoryRoot: string;
  baseBranch: string;
  branchName: string;
  worktreePathKey: string;
}): Promise<EnsureStageBranchWorktreeResult> {
  const worktreeAbsolutePath = resolveWorktreeAbsolutePath(
    input.repositoryRoot,
    input.worktreePathKey,
  );
  const worktrees = await listGitWorktrees(input.repositoryRoot);
  const targetBranchRef = `refs/heads/${input.branchName}`;
  const branchAttached = worktrees.find(
    (entry) => entry.branchRef === targetBranchRef,
  );

  if (branchAttached) {
    return {
      baseBranch: input.baseBranch,
      branchName: input.branchName,
      worktreeAbsolutePath: branchAttached.path,
      worktreePathKey: toWorktreePathKey(
        branchAttached.path,
        input.repositoryRoot,
      ),
      reusedWorktree: true,
    };
  }

  const worktreePathUsed = worktrees.find(
    (entry) => path.resolve(entry.path) === path.resolve(worktreeAbsolutePath),
  );
  if (
    worktreePathUsed &&
    worktreePathUsed.branchRef &&
    worktreePathUsed.branchRef !== targetBranchRef
  ) {
    throw new Error(
      `Worktree path ${input.worktreePathKey} is already attached to ${worktreePathUsed.branchRef.replace('refs/heads/', '')}.`,
    );
  }

  await mkdir(path.dirname(worktreeAbsolutePath), { recursive: true });

  const branchExists = await branchRefExists(
    input.repositoryRoot,
    input.branchName,
  );
  const args = branchExists
    ? ['worktree', 'add', worktreeAbsolutePath, input.branchName]
    : [
        'worktree',
        'add',
        '-b',
        input.branchName,
        worktreeAbsolutePath,
        input.baseBranch,
      ];

  const created = await runCommand('git', args, input.repositoryRoot);
  if (!created.ok) {
    throw new Error(
      `Unable to ensure worktree for ${input.branchName}: ${created.stderr || created.error || 'unknown git error'}`,
    );
  }

  return {
    baseBranch: input.baseBranch,
    branchName: input.branchName,
    worktreeAbsolutePath,
    worktreePathKey: input.worktreePathKey,
    reusedWorktree: false,
  };
}
