import type { Dirent } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommandResult } from '$lib/server/command';

vi.mock('node:fs/promises', () => ({
  copyFile: vi.fn(),
  mkdir: vi.fn(),
  readdir: vi.fn(),
}));

vi.mock('$lib/server/command', () => ({
  runCommand: vi.fn(),
}));

import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { runCommand } from '$lib/server/command';
import { ensureStageBranchWorktree } from '$lib/server/worktree-service';

const copyFileMock = vi.mocked(copyFile);
const mkdirMock = vi.mocked(mkdir);
const readdirMock = vi.mocked(readdir);
const runCommandMock = vi.mocked(runCommand);

function dirent(name: string, kind: 'file' | 'directory'): Dirent {
  return {
    name,
    isDirectory: () => kind === 'directory',
    isFile: () => kind === 'file',
  } as unknown as Dirent;
}

function ok(stdout = ''): CommandResult {
  return { ok: true, stdout, stderr: '' };
}

function fail(stderr = 'failed'): CommandResult {
  return { ok: false, stdout: '', stderr, error: stderr };
}

describe('worktree-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    copyFileMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
    readdirMock.mockResolvedValue(
      [] as unknown as Awaited<ReturnType<typeof readdir>>,
    );
  });

  it('creates a fresh branch when only origin tracking ref exists', async () => {
    runCommandMock.mockImplementation(async (_command, args) => {
      if (args[0] === 'worktree' && args[1] === 'list') {
        return ok('worktree /repo\nHEAD 123\nbranch refs/heads/main\n');
      }

      if (
        args[0] === 'show-ref' &&
        args[1] === '--verify' &&
        args[3] ===
          'refs/heads/chore/test-thing-again/1-single-pass-comment-insertio'
      ) {
        return fail('not found');
      }

      if (args[0] === 'worktree' && args[1] === 'add') {
        return ok('');
      }

      return fail(`unexpected command: ${args.join(' ')}`);
    });

    await ensureStageBranchWorktree({
      repositoryRoot: '/repo',
      baseBranch: 'main',
      branchName: 'chore/test-thing-again/1-single-pass-comment-insertio',
      worktreePathKey:
        '.stacked/worktrees/chore-test-thing-again-1-single-pass-comment-insertio',
    });

    expect(runCommandMock).toHaveBeenCalledWith(
      'git',
      [
        'worktree',
        'add',
        '-b',
        'chore/test-thing-again/1-single-pass-comment-insertio',
        '/repo/.stacked/worktrees/chore-test-thing-again-1-single-pass-comment-insertio',
        'main',
      ],
      '/repo',
    );
  });

  it('copies .env files into a newly created worktree', async () => {
    runCommandMock.mockImplementation(async (_command, args) => {
      if (args[0] === 'worktree' && args[1] === 'list') {
        return ok('worktree /repo\nHEAD 123\nbranch refs/heads/main\n');
      }

      if (
        args[0] === 'show-ref' &&
        args[1] === '--verify' &&
        args[3] === 'refs/heads/feat/sample/1-stage'
      ) {
        return fail('not found');
      }

      if (args[0] === 'worktree' && args[1] === 'add') {
        return ok('');
      }

      return fail(`unexpected command: ${args.join(' ')}`);
    });

    readdirMock.mockImplementation(async (directoryPath) => {
      const directory = String(directoryPath);
      if (directory === '/repo') {
        return [
          dirent('.env', 'file'),
          dirent('services', 'directory'),
          dirent('.stacked', 'directory'),
        ] as unknown as Awaited<ReturnType<typeof readdir>>;
      }

      if (directory === '/repo/services') {
        return [dirent('app', 'directory')] as unknown as Awaited<
          ReturnType<typeof readdir>
        >;
      }

      if (directory === '/repo/services/app') {
        return [dirent('.env.local', 'file')] as unknown as Awaited<
          ReturnType<typeof readdir>
        >;
      }

      if (directory === '/repo/.stacked') {
        return [dirent('worktrees', 'directory')] as unknown as Awaited<
          ReturnType<typeof readdir>
        >;
      }

      return [] as unknown as Awaited<ReturnType<typeof readdir>>;
    });

    await ensureStageBranchWorktree({
      repositoryRoot: '/repo',
      baseBranch: 'main',
      branchName: 'feat/sample/1-stage',
      worktreePathKey: '.stacked/worktrees/feat-sample-1-stage',
    });

    expect(copyFileMock).toHaveBeenCalledWith(
      '/repo/.env',
      '/repo/.stacked/worktrees/feat-sample-1-stage/.env',
    );
    expect(copyFileMock).toHaveBeenCalledWith(
      '/repo/services/app/.env.local',
      '/repo/.stacked/worktrees/feat-sample-1-stage/services/app/.env.local',
    );
  });
});
