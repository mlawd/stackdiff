import { runCommand } from '$lib/server/command';
import type { StackPullRequest } from '$lib/types/stack';

interface PullRequestCommentPayload {
  body?: unknown;
  author?: { login?: unknown };
  createdAt?: unknown;
  url?: unknown;
}

interface PullRequestReviewPayload {
  body?: unknown;
  author?: { login?: unknown };
  state?: unknown;
  submittedAt?: unknown;
  url?: unknown;
}

interface PullRequestReviewResponse {
  comments?: unknown;
  reviews?: unknown;
}

export interface StageReviewComment {
  author: string;
  body: string;
  url?: string;
  createdAt?: string;
  source: 'comment' | 'review';
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

function normalizeReview(value: unknown): StageReviewComment | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const review = value as PullRequestReviewPayload;
  const body = toBody(review.body);
  if (!body) {
    return null;
  }

  const state = toText(review.state);
  const withState = state ? `[${state}] ${body}` : body;

  return {
    author: toText(review.author?.login) ?? 'unknown',
    body: withState,
    createdAt: toText(review.submittedAt),
    url: toText(review.url),
    source: 'review',
  };
}

export async function getStagePullRequestComments(input: {
  repositoryRoot: string;
  pullRequest: StackPullRequest;
}): Promise<StageReviewComment[]> {
  const command = await runCommand(
    'gh',
    [
      'pr',
      'view',
      String(input.pullRequest.number),
      '--json',
      'comments,reviews',
    ],
    input.repositoryRoot,
  );

  if (!command.ok) {
    throw new Error(
      `Unable to load pull request comments: ${command.stderr || command.error || 'unknown gh error'}`,
    );
  }

  let parsed: PullRequestReviewResponse;
  try {
    parsed = JSON.parse(command.stdout || '{}') as PullRequestReviewResponse;
  } catch {
    throw new Error('Unable to parse pull request comments response.');
  }

  const comments = Array.isArray(parsed.comments)
    ? parsed.comments
        .map((entry) => normalizeComment(entry))
        .filter((entry): entry is StageReviewComment => entry !== null)
    : [];

  const reviews = Array.isArray(parsed.reviews)
    ? parsed.reviews
        .map((entry) => normalizeReview(entry))
        .filter((entry): entry is StageReviewComment => entry !== null)
    : [];

  return [...comments, ...reviews]
    .sort((left, right) => {
      const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
      const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
      return leftTime - rightTime;
    })
    .slice(-40);
}
