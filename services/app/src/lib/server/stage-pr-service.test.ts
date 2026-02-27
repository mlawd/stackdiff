import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommandResult } from '$lib/server/command';

vi.mock('$lib/server/command', () => ({
  runCommand: vi.fn(),
}));

vi.mock('$lib/server/stack-store', () => ({
  getImplementationSessionByStackAndStage: vi.fn(),
  setStackStagePullRequest: vi.fn(),
}));

vi.mock('$lib/server/worktree-service', () => ({
  resolveDefaultBaseBranch: vi.fn(),
}));

import { runCommand } from '$lib/server/command';
import { setStackStagePullRequest } from '$lib/server/stack-store';
import { ensureStagePullRequest } from '$lib/server/stage-pr-service';
import { resolveDefaultBaseBranch } from '$lib/server/worktree-service';

const runCommandMock = vi.mocked(runCommand);
const setStackStagePullRequestMock = vi.mocked(setStackStagePullRequest);
const resolveDefaultBaseBranchMock = vi.mocked(resolveDefaultBaseBranch);

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

describe('stage-pr-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveDefaultBaseBranchMock.mockResolvedValue('main');
    setStackStagePullRequestMock.mockResolvedValue({
      id: 'stack-1',
      projectId: 'repo-1',
      name: 'Feature',
      type: 'feature',
      status: 'started',
      stages: [],
    });
  });

  it('counts unresolved review threads for existing pull requests', async () => {
    runCommandMock.mockImplementation(async (_command, args) => {
      if (args[0] === 'pr' && args[1] === 'list') {
        return ok(
          JSON.stringify([
            {
              number: 14,
              title: 'Stage PR',
              state: 'OPEN',
              isDraft: false,
              url: 'https://github.com/org/repo/pull/14',
              updatedAt: '2026-02-22T00:00:00.000Z',
              comments: [{ id: 'fallback-1' }],
            },
          ]),
        );
      }

      if (
        args[0] === 'api' &&
        args[1] === 'graphql' &&
        !args.includes('after=cursor-1')
      ) {
        return ok(
          JSON.stringify({
            data: {
              resource: {
                reviewThreads: {
                  nodes: [{ isResolved: false }, { isResolved: true }],
                  pageInfo: {
                    hasNextPage: true,
                    endCursor: 'cursor-1',
                  },
                },
              },
            },
          }),
        );
      }

      if (
        args[0] === 'api' &&
        args[1] === 'graphql' &&
        args.includes('after=cursor-1')
      ) {
        return ok(
          JSON.stringify({
            data: {
              resource: {
                reviewThreads: {
                  nodes: [{ isResolved: false }, { isResolved: false }],
                  pageInfo: {
                    hasNextPage: false,
                    endCursor: null,
                  },
                },
              },
            },
          }),
        );
      }

      if (args[0] === 'pr' && args[1] === 'checks') {
        return ok(
          JSON.stringify([
            { name: 'Lint', state: 'pass', bucket: 'pass' },
            { name: 'Unit tests', state: 'success', bucket: 'pass' },
            { name: 'E2E', state: 'pending', bucket: 'pending' },
            { name: 'Type check', state: 'failure', bucket: 'fail' },
          ]),
        );
      }

      return fail(`unexpected command: ${args.join(' ')}`);
    });

    const pullRequest = await ensureStagePullRequest({
      repositoryRoot: '/repo',
      stack: {
        id: 'stack-1',
        projectId: 'repo-1',
        name: 'Feature',
        type: 'feature',
        status: 'started',
        stages: [
          {
            id: 'stage-1',
            title: 'Stage 1',
            status: 'review',
            pullRequest: {
              number: 14,
              title: 'Stale PR',
              state: 'OPEN',
              isDraft: false,
              url: 'https://github.com/org/repo/pull/14',
              updatedAt: '2026-02-20T00:00:00.000Z',
              commentCount: 0,
            },
          },
        ],
      },
      stage: {
        id: 'stage-1',
        title: 'Stage 1',
        status: 'review',
      },
      stageIndex: 0,
      branchName: 'feature/stage-1',
    });

    expect(pullRequest?.commentCount).toBe(3);
    expect(pullRequest?.checks).toEqual({
      completed: 3,
      total: 4,
      passed: 2,
      failed: 1,
      items: [
        { name: 'Lint', status: 'Passed' },
        { name: 'Unit tests', status: 'Passed' },
        { name: 'E2E', status: 'Pending' },
        { name: 'Type check', status: 'Failed' },
      ],
    });
    expect(setStackStagePullRequestMock).toHaveBeenCalledWith(
      'stack-1',
      'stage-1',
      expect.objectContaining({
        number: 14,
        commentCount: 3,
        checks: {
          completed: 3,
          total: 4,
          passed: 2,
          failed: 1,
          items: [
            { name: 'Lint', status: 'Passed' },
            { name: 'Unit tests', status: 'Passed' },
            { name: 'E2E', status: 'Pending' },
            { name: 'Type check', status: 'Failed' },
          ],
        },
      }),
    );
  });

  it('falls back to issue comment count when review thread query fails', async () => {
    runCommandMock.mockImplementation(async (_command, args) => {
      if (args[0] === 'pr' && args[1] === 'list') {
        return ok(
          JSON.stringify([
            {
              number: 15,
              title: 'Stage PR',
              state: 'OPEN',
              isDraft: false,
              url: 'https://github.com/org/repo/pull/15',
              updatedAt: '2026-02-22T00:00:00.000Z',
              comments: [{ id: 1 }, { id: 2 }],
            },
          ]),
        );
      }

      if (args[0] === 'api' && args[1] === 'graphql') {
        return fail('graphql unavailable');
      }

      return fail(`unexpected command: ${args.join(' ')}`);
    });

    const pullRequest = await ensureStagePullRequest({
      repositoryRoot: '/repo',
      stack: {
        id: 'stack-1',
        projectId: 'repo-1',
        name: 'Feature',
        type: 'feature',
        status: 'started',
        stages: [
          {
            id: 'stage-1',
            title: 'Stage 1',
            status: 'review',
          },
        ],
      },
      stage: {
        id: 'stage-1',
        title: 'Stage 1',
        status: 'review',
      },
      stageIndex: 0,
      branchName: 'feature/stage-1',
    });

    expect(pullRequest?.commentCount).toBe(2);
  });

  it('uses heading-based PR template when creating pull requests', async () => {
    let prBody = '';
    let prTitle = '';

    runCommandMock.mockImplementation(async (_command, args) => {
      if (args[0] === 'pr' && args[1] === 'list') {
        if (args.includes('--head') && args.includes('feature/stage-1')) {
          const isLookupAfterCreate = prBody.length > 0;
          if (!isLookupAfterCreate) {
            return ok('[]');
          }

          return ok(
            JSON.stringify([
              {
                number: 16,
                title: 'feat: Feature - 1: Stage 1',
                state: 'OPEN',
                isDraft: false,
                url: 'https://github.com/org/repo/pull/16',
                updatedAt: '2026-02-22T00:00:00.000Z',
                comments: [],
              },
            ]),
          );
        }
      }

      if (args[0] === 'ls-remote' && args[1] === '--heads') {
        return ok('abc refs/heads/feature/stage-1\n');
      }

      if (args[0] === 'pr' && args[1] === 'create') {
        const titleIndex = args.indexOf('--title');
        if (titleIndex >= 0) {
          prTitle = args[titleIndex + 1] ?? '';
        }

        const bodyIndex = args.indexOf('--body');
        if (bodyIndex >= 0) {
          prBody = args[bodyIndex + 1] ?? '';
        }

        return ok('https://github.com/org/repo/pull/16\n');
      }

      if (args[0] === 'api' && args[1] === 'graphql') {
        return fail('graphql unavailable');
      }

      return fail(`unexpected command: ${args.join(' ')}`);
    });

    await ensureStagePullRequest({
      repositoryRoot: '/repo',
      stack: {
        id: 'stack-1',
        projectId: 'repo-1',
        name: 'Feature',
        type: 'feature',
        status: 'started',
        notes: 'Feature description',
        stages: [
          {
            id: 'stage-1',
            title: 'Stage 1',
            status: 'in-progress',
            details: 'Stage description',
          },
        ],
      },
      stage: {
        id: 'stage-1',
        title: 'Stage 1',
        status: 'in-progress',
        details: 'Stage description',
      },
      stageIndex: 0,
      branchName: 'feature/stage-1',
    });

    expect(prBody).toBe(
      '# Feature\n\nFeature description\n\n# Stage goal\n\nStage description',
    );
    expect(prTitle).toBe('feat: Feature - 1: Stage 1');
  });
});
