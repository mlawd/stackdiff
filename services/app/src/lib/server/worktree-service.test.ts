import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommandResult } from '$lib/server/command';

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
}));

vi.mock('$lib/server/command', () => ({
  runCommand: vi.fn(),
}));

import { mkdir } from 'node:fs/promises';
import { runCommand } from '$lib/server/command';
import { ensureStageBranchWorktree } from '$lib/server/worktree-service';

const mkdirMock = vi.mocked(mkdir);
const runCommandMock = vi.mocked(runCommand);

function ok(stdout = ''): CommandResult {
  return { ok: true, stdout, stderr: '' };
}

function fail(stderr = 'failed'): CommandResult {
  return { ok: false, stdout: '', stderr, error: stderr };
}

describe('worktree-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mkdirMock.mockResolvedValue(undefined);
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
});
