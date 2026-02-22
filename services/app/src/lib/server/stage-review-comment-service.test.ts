import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommandResult } from '$lib/server/command';

vi.mock('$lib/server/command', () => ({
  runCommand: vi.fn(),
}));

import { runCommand } from '$lib/server/command';
import { getStagePullRequestComments } from '$lib/server/stage-review-comment-service';

const runCommandMock = vi.mocked(runCommand);

function ok(stdout: string): CommandResult {
  return { ok: true, stdout, stderr: '' };
}

function fail(stderr: string): CommandResult {
  return { ok: false, stdout: '', stderr, error: stderr };
}

describe('stage-review-comment-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns issue comments plus unresolved thread discussion', async () => {
    runCommandMock.mockImplementation(async (_command, args) => {
      if (args[0] === 'pr' && args[1] === 'view') {
        return ok(
          JSON.stringify({
            comments: [
              {
                body: 'General PR note',
                author: { login: 'maintainer' },
                createdAt: '2026-02-22T10:00:00Z',
                url: 'https://example.com/comment-1',
              },
            ],
          }),
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
                  nodes: [
                    {
                      isResolved: false,
                      comments: {
                        nodes: [
                          {
                            body: 'Inline thread opener',
                            author: { login: 'reviewer' },
                            createdAt: '2026-02-22T10:10:00Z',
                            url: 'https://example.com/thread-1-comment-1',
                          },
                          {
                            body: 'Reply in same thread',
                            author: { login: 'author' },
                            createdAt: '2026-02-22T10:12:00Z',
                            url: 'https://example.com/thread-1-comment-2',
                          },
                        ],
                      },
                    },
                    {
                      isResolved: true,
                      comments: {
                        nodes: [
                          {
                            body: 'Should be ignored',
                            author: { login: 'reviewer' },
                            createdAt: '2026-02-22T10:20:00Z',
                            url: 'https://example.com/thread-2-comment-1',
                          },
                        ],
                      },
                    },
                  ],
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
                  nodes: [
                    {
                      isResolved: false,
                      comments: {
                        nodes: [
                          {
                            body: 'Second unresolved thread',
                            author: { login: 'reviewer-2' },
                            createdAt: '2026-02-22T10:30:00Z',
                            url: 'https://example.com/thread-3-comment-1',
                          },
                        ],
                      },
                    },
                  ],
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

      return fail(`unexpected command: ${args.join(' ')}`);
    });

    const comments = await getStagePullRequestComments({
      repositoryRoot: '/repo',
      pullRequest: {
        number: 14,
        title: 'PR',
        state: 'OPEN',
        isDraft: false,
        url: 'https://github.com/org/repo/pull/14',
        updatedAt: '2026-02-22T10:00:00Z',
      },
    });

    expect(comments).toHaveLength(4);
    expect(comments.map((entry) => entry.body)).toEqual([
      'General PR note',
      'Inline thread opener',
      'Reply in same thread',
      'Second unresolved thread',
    ]);
    expect(comments.map((entry) => entry.source)).toEqual([
      'comment',
      'thread',
      'thread',
      'thread',
    ]);
  });
});
