import { runCommand } from '$lib/server/command';
import type { StackPullRequest } from '$lib/types/stack';

interface PullRequestCommentPayload {
  body?: unknown;
  author?: { login?: unknown };
  createdAt?: unknown;
  url?: unknown;
}

interface PullRequestCommentsResponse {
  comments?: unknown;
}

interface PullRequestThreadCommentPayload {
  body?: unknown;
  author?: { login?: unknown };
  createdAt?: unknown;
  url?: unknown;
}

interface PullRequestThreadsResponse {
  data?: {
    resource?: {
      reviewThreads?: {
        nodes?: unknown;
        pageInfo?: {
          hasNextPage?: unknown;
          endCursor?: unknown;
        };
      };
    };
  };
}

export interface StageReviewComment {
  author: string;
  body: string;
  url?: string;
  createdAt?: string;
  source: 'comment' | 'thread';
  threadId?: string;
}

function toBody(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function normalizeComment(value: unknown): StageReviewComment | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const comment = value as PullRequestCommentPayload;
  const body = toBody(comment.body);
  if (!body) {
    return null;
  }

  return {
    author: toText(comment.author?.login) ?? 'unknown',
    body,
    createdAt: toText(comment.createdAt),
    url: toText(comment.url),
    source: 'comment',
  };
}

function normalizeThreadComment(
  value: unknown,
  threadId?: string,
): StageReviewComment | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const comment = value as PullRequestThreadCommentPayload;
  const body = toBody(comment.body);
  if (!body) {
    return null;
  }

  return {
    author: toText(comment.author?.login) ?? 'unknown',
    body,
    createdAt: toText(comment.createdAt),
    url: toText(comment.url),
    source: 'thread',
    threadId,
  };
}

function extractUnresolvedThreadComments(output: string): {
  comments: StageReviewComment[];
  hasNextPage: boolean;
  endCursor?: string;
} {
  let parsed: PullRequestThreadsResponse;
  try {
    parsed = JSON.parse(output || '{}') as PullRequestThreadsResponse;
  } catch {
    throw new Error('Unable to parse pull request review thread response.');
  }

  const reviewThreads = parsed.data?.resource?.reviewThreads;
  const threadNodes = Array.isArray(reviewThreads?.nodes)
    ? reviewThreads.nodes
    : [];

  const comments = threadNodes.flatMap((thread) => {
    if (typeof thread !== 'object' || thread === null) {
      return [];
    }

    const threadRecord = thread as {
      id?: unknown;
      isResolved?: unknown;
      comments?: { nodes?: unknown };
    };
    if (threadRecord.isResolved !== false) {
      return [];
    }

    const threadId = toText(threadRecord.id);
    const commentNodes = Array.isArray(threadRecord.comments?.nodes)
      ? threadRecord.comments.nodes
      : [];
    return commentNodes
      .map((entry) => normalizeThreadComment(entry, threadId))
      .filter((entry): entry is StageReviewComment => entry !== null);
  });

  const hasNextPage = reviewThreads?.pageInfo?.hasNextPage === true;
  const endCursor =
    typeof reviewThreads?.pageInfo?.endCursor === 'string'
      ? reviewThreads.pageInfo.endCursor
      : undefined;

  return {
    comments,
    hasNextPage,
    endCursor,
  };
}

async function getPullRequestIssueComments(input: {
  repositoryRoot: string;
  pullRequestNumber: number;
}): Promise<StageReviewComment[]> {
  const command = await runCommand(
    'gh',
    ['pr', 'view', String(input.pullRequestNumber), '--json', 'comments'],
    input.repositoryRoot,
  );

  if (!command.ok) {
    throw new Error(
      `Unable to load pull request comments: ${command.stderr || command.error || 'unknown gh error'}`,
    );
  }

  let parsed: PullRequestCommentsResponse;
  try {
    parsed = JSON.parse(command.stdout || '{}') as PullRequestCommentsResponse;
  } catch {
    throw new Error('Unable to parse pull request comments response.');
  }

  return Array.isArray(parsed.comments)
    ? parsed.comments
        .map((entry) => normalizeComment(entry))
        .filter((entry): entry is StageReviewComment => entry !== null)
    : [];
}

async function getUnresolvedReviewThreadComments(input: {
  repositoryRoot: string;
  pullRequestUrl: string;
}): Promise<StageReviewComment[]> {
  const query =
    'query($url: URI!, $after: String) { resource(url: $url) { ... on PullRequest { reviewThreads(first: 100, after: $after) { nodes { id isResolved comments(first: 100) { nodes { body createdAt url author { login } } } } pageInfo { hasNextPage endCursor } } } } }';

  const comments: StageReviewComment[] = [];
  let cursor: string | undefined;

  for (;;) {
    const args = [
      'api',
      'graphql',
      '-f',
      `query=${query}`,
      '-F',
      `url=${input.pullRequestUrl}`,
    ];
    if (cursor) {
      args.push('-F', `after=${cursor}`);
    }

    const command = await runCommand('gh', args, input.repositoryRoot);
    if (!command.ok) {
      throw new Error(
        `Unable to load pull request review threads: ${command.stderr || command.error || 'unknown gh error'}`,
      );
    }

    const page = extractUnresolvedThreadComments(command.stdout);
    comments.push(...page.comments);

    if (!page.hasNextPage || !page.endCursor) {
      return comments;
    }

    cursor = page.endCursor;
  }
}

export async function getStagePullRequestComments(input: {
  repositoryRoot: string;
  pullRequest: StackPullRequest;
}): Promise<StageReviewComment[]> {
  const [issueComments, unresolvedThreadComments] = await Promise.all([
    getPullRequestIssueComments({
      repositoryRoot: input.repositoryRoot,
      pullRequestNumber: input.pullRequest.number,
    }),
    getUnresolvedReviewThreadComments({
      repositoryRoot: input.repositoryRoot,
      pullRequestUrl: input.pullRequest.url,
    }),
  ]);

  return [...issueComments, ...unresolvedThreadComments]
    .sort((left, right) => {
      const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
      const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
      return leftTime - rightTime;
    })
    .slice(-120);
}
