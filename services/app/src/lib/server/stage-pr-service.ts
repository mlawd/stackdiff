import { runCommand } from '$lib/server/command';
import {
  getImplementationSessionByStackAndStage,
  setStackStagePullRequest,
} from '$lib/server/stack-store';
import { resolveDefaultBaseBranch } from '$lib/server/worktree-service';
import type {
  FeatureStage,
  StackMetadata,
  StackPullRequest,
} from '$lib/types/stack';

interface GitHubPullRequestPayload {
  number: number;
  title: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  isDraft: boolean;
  url: string;
  updatedAt: string;
  comments?: unknown[];
  reviewDecision?: unknown;
  headRefOid?: unknown;
}

interface PullRequestCheckStatePayload {
  name?: unknown;
  bucket?: unknown;
  state?: unknown;
}

type PullRequestChecksSummary = NonNullable<StackPullRequest['checks']>;

interface PullRequestThreadsResponse {
  data?: {
    resource?: {
      reviewThreads?: {
        nodes?: Array<{
          isResolved?: unknown;
        }>;
        pageInfo?: {
          hasNextPage?: unknown;
          endCursor?: unknown;
        };
      };
    };
  };
}

function parseJsonPayload<T>(output: string): T {
  const trimmed = output.trim();
  if (!trimmed) {
    throw new Error('empty-json');
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const arrayStart = trimmed.indexOf('[');
    const objectStart = trimmed.indexOf('{');
    let start = -1;
    let end = -1;

    if (arrayStart >= 0 && (objectStart === -1 || arrayStart < objectStart)) {
      start = arrayStart;
      end = trimmed.lastIndexOf(']');
    } else if (objectStart >= 0) {
      start = objectStart;
      end = trimmed.lastIndexOf('}');
    }

    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    }

    throw new Error('invalid-json');
  }
}

function toStackPullRequest(
  payload: GitHubPullRequestPayload | undefined,
  commentCount: number,
  checks: PullRequestChecksSummary | undefined,
): StackPullRequest | undefined {
  if (!payload) {
    return undefined;
  }

  return {
    number: payload.number,
    title: payload.title,
    state: payload.state,
    isDraft: payload.isDraft,
    url: payload.url,
    updatedAt: payload.updatedAt,
    commentCount,
    reviewDecision:
      payload.reviewDecision === 'APPROVED' ||
      payload.reviewDecision === 'CHANGES_REQUESTED' ||
      payload.reviewDecision === 'REVIEW_REQUIRED'
        ? payload.reviewDecision
        : undefined,
    headRefOid:
      typeof payload.headRefOid === 'string' ? payload.headRefOid : undefined,
    checks,
  };
}

function normalizeCheckState(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function checkStatusLabel(entry: PullRequestCheckStatePayload): string {
  const bucket = normalizeCheckState(entry.bucket);
  if (bucket) {
    if (bucket === 'pass') {
      return 'pass';
    }

    if (bucket === 'fail' || bucket === 'cancel') {
      return 'fail';
    }

    if (bucket === 'pending') {
      return 'pending';
    }

    if (bucket === 'skipping') {
      return 'skipped';
    }
  }

  const state = normalizeCheckState(entry.state);
  if (!state) {
    return 'pending';
  }

  if (
    state === 'pass' ||
    state === 'passed' ||
    state === 'success' ||
    state === 'successful'
  ) {
    return 'pass';
  }

  if (
    state === 'pending' ||
    state === 'queued' ||
    state === 'in_progress' ||
    state === 'running' ||
    state === 'requested' ||
    state === 'waiting' ||
    state === 'startup_pending'
  ) {
    return 'pending';
  }

  if (
    state === 'fail' ||
    state === 'failed' ||
    state === 'failure' ||
    state === 'error' ||
    state === 'timed_out' ||
    state === 'cancelled' ||
    state === 'cancel' ||
    state === 'action_required' ||
    state === 'startup_failure'
  ) {
    return 'fail';
  }

  return state;
}

function summarizeChecks(
  states: PullRequestCheckStatePayload[],
): PullRequestChecksSummary {
  const total = states.length;
  let passed = 0;
  let failed = 0;
  let pending = 0;
  const items: PullRequestChecksSummary['items'] = [];

  for (const entry of states) {
    const status = checkStatusLabel(entry);
    if (status === 'pass') {
      passed += 1;
    } else if (status === 'pending') {
      pending += 1;
    } else if (status === 'fail') {
      failed += 1;
    }

    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    const itemName = name.length > 0 ? name : 'Unnamed check';
    const label =
      status === 'pass'
        ? 'Passed'
        : status === 'fail'
          ? 'Failed'
          : status === 'pending'
            ? 'Pending'
            : status === 'skipped'
              ? 'Skipped'
              : status;
    items.push({
      name: itemName,
      status: label,
    });

    if (status === 'skipped') {
      continue;
    }

    if (status !== 'pass' && status !== 'fail' && status !== 'pending') {
      pending += 1;
    }
  }

  return {
    completed: total - pending,
    total,
    passed,
    failed,
    items,
  };
}

async function getPullRequestChecksSummary(
  repositoryRoot: string,
  pullRequestNumber: number,
): Promise<PullRequestChecksSummary | undefined> {
  const command = await runCommand(
    'gh',
    ['pr', 'checks', String(pullRequestNumber), '--json', 'name,state,bucket'],
    repositoryRoot,
  );

  if (!command.ok) {
    return undefined;
  }

  let parsed: PullRequestCheckStatePayload[];
  try {
    parsed = parseJsonPayload<PullRequestCheckStatePayload[]>(
      command.stdout || '[]',
    );
  } catch {
    return undefined;
  }

  if (!Array.isArray(parsed)) {
    return undefined;
  }

  return summarizeChecks(parsed);
}

function unresolvedThreadCountFromResponse(output: string): {
  unresolvedCount: number;
  hasNextPage: boolean;
  endCursor?: string;
} {
  let parsed: PullRequestThreadsResponse;
  try {
    parsed = parseJsonPayload<PullRequestThreadsResponse>(output || '{}');
  } catch {
    return { unresolvedCount: 0, hasNextPage: false };
  }

  const reviewThreads = parsed.data?.resource?.reviewThreads;
  const nodes = Array.isArray(reviewThreads?.nodes) ? reviewThreads.nodes : [];
  const unresolvedCount = nodes.filter(
    (thread) => thread.isResolved === false,
  ).length;
  const hasNextPage = reviewThreads?.pageInfo?.hasNextPage === true;
  const endCursor =
    typeof reviewThreads?.pageInfo?.endCursor === 'string'
      ? reviewThreads.pageInfo.endCursor
      : undefined;

  return {
    unresolvedCount,
    hasNextPage,
    endCursor,
  };
}

async function getUnresolvedReviewThreadCount(
  repositoryRoot: string,
  pullRequestUrl: string,
): Promise<number | undefined> {
  const query =
    'query($url: URI!, $after: String) { resource(url: $url) { ... on PullRequest { reviewThreads(first: 100, after: $after) { nodes { isResolved } pageInfo { hasNextPage endCursor } } } } }';

  let unresolvedCount = 0;
  let cursor: string | undefined;

  for (;;) {
    const args = [
      'api',
      'graphql',
      '-f',
      `query=${query}`,
      '-F',
      `url=${pullRequestUrl}`,
    ];
    if (cursor) {
      args.push('-F', `after=${cursor}`);
    }

    const command = await runCommand('gh', args, repositoryRoot);
    if (!command.ok) {
      return undefined;
    }

    const page = unresolvedThreadCountFromResponse(command.stdout);
    unresolvedCount += page.unresolvedCount;

    if (!page.hasNextPage || !page.endCursor) {
      return unresolvedCount;
    }

    cursor = page.endCursor;
  }
}

async function toStackPullRequestWithCommentCount(
  repositoryRoot: string,
  payload: GitHubPullRequestPayload | undefined,
): Promise<StackPullRequest | undefined> {
  const fallbackCommentCount = Array.isArray(payload?.comments)
    ? payload.comments.length
    : 0;

  if (!payload) {
    return undefined;
  }

  const unresolvedReviewThreadCount = await getUnresolvedReviewThreadCount(
    repositoryRoot,
    payload.url,
  );

  const checks = await getPullRequestChecksSummary(
    repositoryRoot,
    payload.number,
  );

  return toStackPullRequest(
    payload,
    unresolvedReviewThreadCount ?? fallbackCommentCount,
    checks,
  );
}

function buildStagePullRequestTitle(
  stack: StackMetadata,
  stageNumber: number,
  stage: FeatureStage,
): string {
  const typeLabel =
    stack.type === 'feature'
      ? 'feat'
      : stack.type === 'bugfix'
        ? 'fix'
        : stack.type;

  return `${typeLabel}: ${stack.name} - ${stageNumber}: ${stage.title}`;
}

function buildStagePullRequestBody(
  stack: StackMetadata,
  stage: FeatureStage,
): string {
  const featureGoal = stack.notes?.trim() || 'No description provided.';
  const stageGoal = stage.details?.trim() || 'No details provided.';

  return ['# Feature', '', featureGoal, '', '# Stage goal', '', stageGoal].join(
    '\n',
  );
}

async function lookupPullRequestByHeadBranch(
  repositoryRoot: string,
  headBranch: string,
): Promise<StackPullRequest | undefined> {
  const lookup = await runCommand(
    'gh',
    [
      'pr',
      'list',
      '--head',
      headBranch,
      '--state',
      'all',
      '--limit',
      '1',
      '--json',
      'number,title,state,isDraft,url,updatedAt,comments,reviewDecision,headRefOid',
    ],
    repositoryRoot,
  );

  if (!lookup.ok) {
    throw new Error(
      `Unable to lookup pull request: ${lookup.stderr || lookup.error || 'unknown gh error'}`,
    );
  }

  let parsed: GitHubPullRequestPayload[];
  try {
    parsed = parseJsonPayload<GitHubPullRequestPayload[]>(
      lookup.stdout || '[]',
    );
  } catch {
    throw new Error('Unable to parse pull request lookup response.');
  }

  return toStackPullRequestWithCommentCount(repositoryRoot, parsed[0]);
}

async function ensureRemoteBranch(
  repositoryRoot: string,
  branchName: string,
): Promise<void> {
  const remoteBranch = await runCommand(
    'git',
    ['ls-remote', '--heads', 'origin', branchName],
    repositoryRoot,
  );
  if (!remoteBranch.ok) {
    throw new Error(
      `Unable to inspect remote branch: ${remoteBranch.stderr || remoteBranch.error || 'unknown git error'}`,
    );
  }

  if (remoteBranch.stdout.trim().length > 0) {
    return;
  }

  const pushed = await runCommand(
    'git',
    ['push', '-u', 'origin', branchName],
    repositoryRoot,
  );
  if (!pushed.ok) {
    throw new Error(
      `Unable to push branch before pull request creation: ${pushed.stderr || pushed.error || 'unknown git error'}`,
    );
  }
}

async function resolvePullRequestBaseBranch(
  stack: StackMetadata,
  stageIndex: number,
  repositoryRoot: string,
): Promise<string> {
  if (stageIndex === 0) {
    return resolveDefaultBaseBranch(repositoryRoot);
  }

  const previousStage = (stack.stages ?? [])[stageIndex - 1];
  if (!previousStage) {
    throw new Error(
      'Unable to resolve previous stage for pull request base branch.',
    );
  }

  const previousSession = await getImplementationSessionByStackAndStage(
    stack.id,
    previousStage.id,
  );
  if (!previousSession?.branchName) {
    throw new Error(
      'Previous stage branch is missing. Start stages in order from the first stage.',
    );
  }

  return previousSession.branchName;
}

export async function ensureStagePullRequest(input: {
  repositoryRoot: string;
  stack: StackMetadata;
  stage: FeatureStage;
  stageIndex: number;
  branchName: string;
}): Promise<StackPullRequest | undefined> {
  const existing = await lookupPullRequestByHeadBranch(
    input.repositoryRoot,
    input.branchName,
  );
  if (existing) {
    await setStackStagePullRequest(input.stack.id, input.stage.id, existing);
    return existing;
  }

  const stageNumber = input.stageIndex + 1;
  const title = buildStagePullRequestTitle(
    input.stack,
    stageNumber,
    input.stage,
  );
  const body = buildStagePullRequestBody(input.stack, input.stage);
  const baseBranch = await resolvePullRequestBaseBranch(
    input.stack,
    input.stageIndex,
    input.repositoryRoot,
  );
  await ensureRemoteBranch(input.repositoryRoot, input.branchName);

  const created = await runCommand(
    'gh',
    [
      'pr',
      'create',
      '--head',
      input.branchName,
      '--base',
      baseBranch,
      '--title',
      title,
      '--body',
      body,
    ],
    input.repositoryRoot,
  );

  if (!created.ok) {
    throw new Error(
      `Unable to create pull request: ${created.stderr || created.error || 'unknown gh error'}`,
    );
  }

  const resolved = await lookupPullRequestByHeadBranch(
    input.repositoryRoot,
    input.branchName,
  );
  if (!resolved) {
    throw new Error(
      'Pull request was created but could not be resolved afterwards.',
    );
  }

  await setStackStagePullRequest(input.stack.id, input.stage.id, resolved);
  return resolved;
}
