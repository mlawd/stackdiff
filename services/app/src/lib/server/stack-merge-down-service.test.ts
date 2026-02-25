import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommandResult } from '$lib/server/command';

vi.mock('$lib/server/command', () => ({
  runCommand: vi.fn(),
}));

vi.mock('$lib/server/stack-store', () => ({
  getImplementationSessionsByStackId: vi.fn(),
  removeImplementationSessionByStackAndStage: vi.fn(),
  getRuntimeRepositoryPath: vi.fn(),
  getStackById: vi.fn(),
  setStackStageStatus: vi.fn(),
  setStackStatus: vi.fn(),
}));

vi.mock('$lib/server/worktree-service', () => ({
  resolveDefaultBaseBranch: vi.fn(),
  resolveWorktreeAbsolutePath: vi.fn(),
}));

import { runCommand } from '$lib/server/command';
import {
  getImplementationSessionsByStackId,
  removeImplementationSessionByStackAndStage,
  getRuntimeRepositoryPath,
  getStackById,
  setStackStageStatus,
  setStackStatus,
} from '$lib/server/stack-store';
import { mergeDownStack } from '$lib/server/stack-merge-down-service';
import {
  resolveDefaultBaseBranch,
  resolveWorktreeAbsolutePath,
} from '$lib/server/worktree-service';

const runCommandMock = vi.mocked(runCommand);
const getImplementationSessionsByStackIdMock = vi.mocked(
  getImplementationSessionsByStackId,
);
const getRuntimeRepositoryPathMock = vi.mocked(getRuntimeRepositoryPath);
const getStackByIdMock = vi.mocked(getStackById);
const setStackStageStatusMock = vi.mocked(setStackStageStatus);
const removeImplementationSessionByStackAndStageMock = vi.mocked(
  removeImplementationSessionByStackAndStage,
);
const setStackStatusMock = vi.mocked(setStackStatus);
const resolveDefaultBaseBranchMock = vi.mocked(resolveDefaultBaseBranch);
const resolveWorktreeAbsolutePathMock = vi.mocked(resolveWorktreeAbsolutePath);

function ok(stdout: string): CommandResult {
  return {
    ok: true,
    stdout,
    stderr: '',
  };
}

function fail(stderr: string): CommandResult {
  return {
    ok: false,
    stdout: '',
    stderr,
    error: stderr,
  };
}

describe('stack-merge-down-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getRuntimeRepositoryPathMock.mockResolvedValue('/repo');
    resolveDefaultBaseBranchMock.mockResolvedValue('main');
    resolveWorktreeAbsolutePathMock.mockImplementation(
      (_root, worktreePathKey) => `/repo/${worktreePathKey}`,
    );

    getStackByIdMock.mockResolvedValue({
      id: 'stack-1',
      projectId: 'repo-1',
      name: 'Ship it',
      type: 'feature',
      status: 'started',
      stages: [
        {
          id: 'stage-1',
          title: 'Stage 1',
          status: 'approved',
          approvedCommitSha: 'sha-stage-1',
          pullRequest: {
            number: 11,
            title: 'feat: Ship it - 1: Stage 1',
            state: 'OPEN',
            isDraft: false,
            url: 'https://github.com/org/repo/pull/11',
            updatedAt: '2026-02-25T00:00:00.000Z',
          },
        },
        {
          id: 'stage-2',
          title: 'Stage 2',
          status: 'approved',
          approvedCommitSha: 'sha-stage-2',
          pullRequest: {
            number: 12,
            title: 'feat: Ship it - 2: Stage 2',
            state: 'OPEN',
            isDraft: false,
            url: 'https://github.com/org/repo/pull/12',
            updatedAt: '2026-02-25T00:00:00.000Z',
          },
        },
      ],
    });

    getImplementationSessionsByStackIdMock.mockResolvedValue([
      {
        id: 'impl-1',
        stackId: 'stack-1',
        stageId: 'stage-1',
        branchName: 'feature/ship-it/1-stage-1',
        worktreePathKey: '.stacked/worktrees/stage-1',
        createdAt: '2026-02-25T00:00:00.000Z',
        updatedAt: '2026-02-25T00:00:00.000Z',
      },
      {
        id: 'impl-2',
        stackId: 'stack-1',
        stageId: 'stage-2',
        branchName: 'feature/ship-it/2-stage-2',
        worktreePathKey: '.stacked/worktrees/stage-2',
        createdAt: '2026-02-25T00:00:00.000Z',
        updatedAt: '2026-02-25T00:00:00.000Z',
      },
    ]);

    setStackStatusMock.mockResolvedValue({
      id: 'stack-1',
      projectId: 'repo-1',
      name: 'Ship it',
      type: 'feature',
      status: 'complete',
      stages: [],
    });
    setStackStageStatusMock.mockResolvedValue({
      id: 'stack-1',
      projectId: 'repo-1',
      name: 'Ship it',
      type: 'feature',
      status: 'started',
      stages: [],
    });
  });

  it('merges each stage pull request in order with squash', async () => {
    runCommandMock.mockImplementation(async (_command, args) => {
      if (args[0] === 'status' && args[1] === '--porcelain') {
        return ok('');
      }

      if (args[0] === 'fetch' && args[1] === 'origin' && args[2] === 'main') {
        return ok('');
      }

      if (
        args[0] === 'rev-parse' &&
        args[1] === '--verify' &&
        args[2] === '--quiet'
      ) {
        if (args[3] === 'feature/ship-it/1-stage-1^{commit}') {
          return ok('sha-stage-1');
        }

        if (args[3] === 'feature/ship-it/2-stage-2^{commit}') {
          return ok('sha-stage-2');
        }

        return fail(`unexpected command: ${args.join(' ')}`);
      }

      if (
        args[0] === 'rev-parse' &&
        args[1] === '--verify' &&
        args[2] === '--quiet'
      ) {
        return ok('sha-stage-1');
      }

      if (
        args[0] === 'rev-parse' &&
        args[1] === '--verify' &&
        args[2] === '--quiet'
      ) {
        if (args[3] === 'feature/ship-it/1-stage-1^{commit}') {
          return ok('sha-stage-1');
        }

        if (args[3] === 'feature/ship-it/2-stage-2^{commit}') {
          return ok('sha-stage-2');
        }

        return fail(`unexpected command: ${args.join(' ')}`);
      }

      if (args[0] === 'rebase' && args[1] === 'origin/main') {
        return ok('');
      }

      if (
        args[0] === 'rebase' &&
        args[1] === '--onto' &&
        args[2] === 'origin/main' &&
        args[3] === 'sha-stage-1' &&
        args[4] === 'feature/ship-it/2-stage-2'
      ) {
        return ok('');
      }

      if (args[0] === 'push' && args[1] === '--force-with-lease') {
        return ok('');
      }

      if (
        args[0] === 'pr' &&
        args[1] === 'view' &&
        args[2] === '11' &&
        args.includes('--json')
      ) {
        return ok(
          JSON.stringify({
            headRefOid: 'sha-stage-1',
            reviewDecision: 'APPROVED',
          }),
        );
      }

      if (
        args[0] === 'pr' &&
        args[1] === 'view' &&
        args[2] === '12' &&
        args.includes('--json')
      ) {
        return ok(
          JSON.stringify({
            headRefOid: 'sha-stage-2',
            reviewDecision: 'APPROVED',
          }),
        );
      }

      if (
        args[0] === 'pr' &&
        args[1] === 'edit' &&
        args[3] === '--base' &&
        args[4] === 'main'
      ) {
        return ok('');
      }

      if (
        args[0] === 'pr' &&
        args[1] === 'merge' &&
        args.includes('--squash')
      ) {
        return ok('');
      }

      if (args[0] === 'worktree' && args[1] === 'remove') {
        return ok('');
      }

      if (args[0] === 'branch' && args[1] === '-D') {
        return ok('');
      }

      return fail(`unexpected command: ${args.join(' ')}`);
    });

    const result = await mergeDownStack('stack-1');

    expect(result).toMatchObject({
      stackId: 'stack-1',
      defaultBranch: 'main',
      mergedStages: 2,
    });
    expect(result.stages.map((stage) => stage.pullRequestNumber)).toEqual([
      11, 12,
    ]);
    expect(setStackStatusMock).toHaveBeenCalledWith('stack-1', 'complete');
    expect(setStackStageStatusMock).toHaveBeenCalledWith(
      'stack-1',
      'stage-1',
      'done',
    );
    expect(setStackStageStatusMock).toHaveBeenCalledWith(
      'stack-1',
      'stage-2',
      'done',
    );
    expect(removeImplementationSessionByStackAndStageMock).toHaveBeenCalledWith(
      'stack-1',
      'stage-1',
    );
    expect(removeImplementationSessionByStackAndStageMock).toHaveBeenCalledWith(
      'stack-1',
      'stage-2',
    );
    expect(runCommandMock).toHaveBeenCalledWith(
      'gh',
      ['pr', 'merge', '11', '--squash'],
      '/repo',
      expect.any(Object),
    );
    expect(runCommandMock).toHaveBeenCalledWith(
      'gh',
      ['pr', 'merge', '12', '--squash'],
      '/repo',
      expect.any(Object),
    );
    expect(runCommandMock).toHaveBeenCalledWith(
      'git',
      [
        'rebase',
        '--onto',
        'origin/main',
        'sha-stage-1',
        'feature/ship-it/2-stage-2',
      ],
      '/repo/.stacked/worktrees/stage-2',
      expect.any(Object),
    );
  });

  it('fails when stack does not exist', async () => {
    getStackByIdMock.mockResolvedValue(undefined);

    await expect(mergeDownStack('missing')).rejects.toMatchObject({
      code: 'not-found',
      message: 'Stack not found.',
    });
  });

  it('fails when repository has local changes', async () => {
    runCommandMock.mockImplementation(async (_command, args) => {
      if (args[0] === 'status' && args[1] === '--porcelain') {
        return ok(' M changed-file.ts');
      }

      return fail(`unexpected command: ${args.join(' ')}`);
    });

    await expect(mergeDownStack('stack-1')).rejects.toMatchObject({
      code: 'invalid-state',
      message: expect.stringContaining('uncommitted changes'),
    });
  });

  it('fails when stage is missing pull request metadata', async () => {
    getStackByIdMock.mockResolvedValue({
      id: 'stack-1',
      projectId: 'repo-1',
      name: 'Ship it',
      type: 'feature',
      status: 'started',
      stages: [{ id: 'stage-1', title: 'Stage 1', status: 'review' }],
    });

    runCommandMock.mockImplementation(async (_command, args) => {
      if (args[0] === 'status' && args[1] === '--porcelain') {
        return ok('');
      }

      if (args[0] === 'fetch' && args[1] === 'origin' && args[2] === 'main') {
        return ok('');
      }

      if (args[0] === 'pr' && args[1] === 'view' && args[2] === '11') {
        return ok(
          JSON.stringify({
            headRefOid: 'sha-stage-1',
            reviewDecision: 'APPROVED',
          }),
        );
      }

      return fail(`unexpected command: ${args.join(' ')}`);
    });

    await expect(mergeDownStack('stack-1')).rejects.toMatchObject({
      code: 'invalid-state',
      message: 'Stage "Stage 1" is missing a pull request.',
    });
  });

  it('aborts rebase and surfaces failure when stage rebase fails', async () => {
    runCommandMock.mockImplementation(async (_command, args) => {
      if (args[0] === 'status' && args[1] === '--porcelain') {
        return ok('');
      }

      if (args[0] === 'fetch' && args[1] === 'origin' && args[2] === 'main') {
        return ok('');
      }

      if (args[0] === 'pr' && args[1] === 'view' && args[2] === '11') {
        return ok(
          JSON.stringify({
            headRefOid: 'sha-stage-1',
            reviewDecision: 'APPROVED',
          }),
        );
      }

      if (args[0] === 'pr' && args[1] === 'view' && args[2] === '12') {
        return ok(
          JSON.stringify({
            headRefOid: 'sha-stage-2',
            reviewDecision: 'APPROVED',
          }),
        );
      }

      if (args[0] === 'rebase' && args[1] === 'origin/main') {
        return fail('conflict during rebase');
      }

      if (args[0] === 'rebase' && args[1] === '--abort') {
        return ok('');
      }

      return fail(`unexpected command: ${args.join(' ')}`);
    });

    await expect(mergeDownStack('stack-1')).rejects.toMatchObject({
      code: 'command-failed',
      message: expect.stringContaining('Failed to rebase stage "Stage 1"'),
    });
    expect(runCommandMock).toHaveBeenCalledWith(
      'git',
      ['rebase', '--abort'],
      '/repo/.stacked/worktrees/stage-1',
      expect.any(Object),
    );
  });
});
