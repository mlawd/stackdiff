import { runCommand } from '$lib/server/command';
import { loadProjectConfig } from '$lib/server/project-config';
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
  comments?: unknown;
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

interface StackPullRequestSnapshotResponse {
  data?: {
    repository?: Record<string, unknown>;
    rateLimit?: {
      cost?: unknown;
      remaining?: unknown;
      resetAt?: unknown;
    };
  };
}

interface GraphqlCheckRunNode {
  __typename?: unknown;
  name?: unknown;
  conclusion?: unknown;
  status?: unknown;
}

interface GraphqlStatusContextNode {
  __typename?: unknown;
  context?: unknown;
  state?: unknown;
}

interface SnapshotPullRequestPayload extends GitHubPullRequestPayload {
  comments?: {
    totalCount?: unknown;
  };
  commits?: {
    nodes?: Array<{
      commit?: {
        statusCheckRollup?: {
          contexts?: {
            nodes?: Array<GraphqlCheckRunNode | GraphqlStatusContextNode>;
          };
        };
      };
    }>;
  };
}

interface PullRequestSnapshotCacheEntry {
  key: string;
  expiresAt: number;
  byNumber: Map<number, StackPullRequest>;
}

const pullRequestSnapshotCache = new Map<
  string,
  PullRequestSnapshotCacheEntry
>();

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

function toCheckStatePayloadFromRollupNode(
  node: GraphqlCheckRunNode | GraphqlStatusContextNode,
): PullRequestCheckStatePayload | undefined {
  if (typeof node !== 'object' || node === null) {
    return undefined;
  }

  const typename =
    typeof node.__typename === 'string' ? node.__typename.trim() : '';
  if (typename === 'CheckRun') {
    const checkRun = node as GraphqlCheckRunNode;
    const name =
      typeof checkRun.name === 'string' ? checkRun.name : 'Unnamed check';
    const status =
      typeof checkRun.status === 'string'
        ? checkRun.status.trim().toUpperCase()
        : '';
    const conclusion =
      typeof checkRun.conclusion === 'string'
        ? checkRun.conclusion.trim().toUpperCase()
        : '';

    if (status !== 'COMPLETED' || !conclusion) {
      return {
        name,
        state: 'pending',
      };
    }

    return {
      name,
      state: conclusion,
    };
  }

  if (typename === 'StatusContext') {
    const statusContext = node as GraphqlStatusContextNode;
    const context =
      typeof statusContext.context === 'string'
        ? statusContext.context
        : 'Unnamed check';
    return {
      name: context,
      state:
        typeof statusContext.state === 'string'
          ? statusContext.state
          : 'pending',
    };
  }

  return undefined;
}

function summarizeChecksFromSnapshot(
  payload: SnapshotPullRequestPayload,
): PullRequestChecksSummary | undefined {
  const nodes = payload.commits?.nodes;
  const latestCommit = Array.isArray(nodes) ? nodes[0] : undefined;
  const contextNodes = latestCommit?.commit?.statusCheckRollup?.contexts?.nodes;
  if (!Array.isArray(contextNodes)) {
    return undefined;
  }

  const states = contextNodes
    .map((node) => toCheckStatePayloadFromRollupNode(node))
    .filter((entry): entry is PullRequestCheckStatePayload => Boolean(entry));
  if (states.length === 0) {
    return undefined;
  }

  const dedupedByName = new Map<string, PullRequestCheckStatePayload>();
  const rank = (state: string): number => {
    const status = checkStatusLabel({ state });
    if (status === 'fail') {
      return 3;
    }

    if (status === 'pending') {
      return 2;
    }

    if (status === 'pass') {
      return 1;
    }

    return 0;
  };

  for (const state of states) {
    const name = typeof state.name === 'string' ? state.name.trim() : '';
    const key = name.length > 0 ? name.toLowerCase() : 'unnamed-check';
    const existing = dedupedByName.get(key);
    if (
      !existing ||
      rank(String(state.state ?? '')) > rank(String(existing.state ?? ''))
    ) {
      dedupedByName.set(key, {
        ...state,
        name: name.length > 0 ? name : 'Unnamed check',
      });
    }
  }

  return summarizeChecks(Array.from(dedupedByName.values()));
}

function parseRepositoryOwnerAndNameFromPullRequestUrl(input: {
  stackId: string;
  pullRequests: Array<{ url: string }>;
}): { owner: string; name: string } | undefined {
  for (const pullRequest of input.pullRequests) {
    try {
      const parsedUrl = new URL(pullRequest.url);
      const segments = parsedUrl.pathname
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean);
      if (segments.length >= 4 && segments[2] === 'pull') {
        const owner = segments[0];
        const name = segments[1];
        if (owner && name) {
          return { owner, name };
        }
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

function buildSnapshotCacheKey(input: {
  repositoryRoot: string;
  stack: StackMetadata;
  pullRequestNumbers: number[];
}): string {
  const sorted = [...input.pullRequestNumbers].sort(
    (left, right) => left - right,
  );
  return `${input.repositoryRoot}::${input.stack.id}::${sorted.join(',')}`;
}

function getSnapshotCommentCount(payload: SnapshotPullRequestPayload): number {
  const fromCommentsField = payload.comments;
  if (
    typeof fromCommentsField === 'object' &&
    fromCommentsField !== null &&
    'totalCount' in fromCommentsField
  ) {
    const totalCount = (fromCommentsField as { totalCount?: unknown })
      .totalCount;
    if (typeof totalCount === 'number' && Number.isFinite(totalCount)) {
      return totalCount;
    }
  }

  if (Array.isArray(payload.comments)) {
    return payload.comments.length;
  }

  return 0;
}

async function readSnapshotTtlMs(): Promise<number> {
  try {
    const config = await loadProjectConfig();
    return config.runtime.prSnapshotTtlMs;
  } catch {
    return 30_000;
  }
}

async function getStackPullRequestSnapshotByNumber(input: {
  repositoryRoot: string;
  stack: StackMetadata;
}): Promise<Map<number, StackPullRequest>> {
  const stages = input.stack.stages ?? [];
  const stagePullRequests = stages
    .map((stage) => stage.pullRequest)
    .filter((pullRequest): pullRequest is StackPullRequest =>
      Boolean(pullRequest?.number && pullRequest.url),
    );
  if (stagePullRequests.length === 0) {
    return new Map();
  }

  const pullRequestNumbers = stagePullRequests.map((pullRequest) =>
    Number(pullRequest.number),
  );
  const cacheKey = buildSnapshotCacheKey({
    repositoryRoot: input.repositoryRoot,
    stack: input.stack,
    pullRequestNumbers,
  });
  const now = Date.now();
  const existing = pullRequestSnapshotCache.get(cacheKey);
  if (existing && existing.expiresAt > now) {
    return existing.byNumber;
  }

  const repoOwnerAndName = parseRepositoryOwnerAndNameFromPullRequestUrl({
    stackId: input.stack.id,
    pullRequests: stagePullRequests,
  });
  if (!repoOwnerAndName) {
    throw new Error(
      'Unable to resolve GitHub repository owner/name for stack PR snapshot.',
    );
  }

  const aliasEntries = pullRequestNumbers.map((_, index) => {
    const alias = `pr${index}`;
    const variable = `$number${index}`;
    return {
      alias,
      variable,
      field: `${alias}: pullRequest(number: ${variable}) { number title state isDraft url updatedAt reviewDecision headRefOid comments { totalCount } commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 100) { nodes { __typename ... on CheckRun { name status conclusion } ... on StatusContext { context state } } } } } } } }`,
    };
  });
  const variableDefinitions = ['$owner: String!', '$name: String!']
    .concat(aliasEntries.map((entry) => `${entry.variable}: Int!`))
    .join(', ');
  const query = `query(${variableDefinitions}) { repository(owner: $owner, name: $name) { ${aliasEntries
    .map((entry) => entry.field)
    .join(' ')} } rateLimit { cost remaining resetAt } }`;

  const args = [
    'api',
    'graphql',
    '-f',
    `query=${query}`,
    '-F',
    `owner=${repoOwnerAndName.owner}`,
    '-F',
    `name=${repoOwnerAndName.name}`,
  ];
  aliasEntries.forEach((entry, index) => {
    args.push('-F', `number${index}=${pullRequestNumbers[index]}`);
  });

  const response = await runCommand('gh', args, input.repositoryRoot);
  if (!response.ok) {
    throw new Error(
      `Unable to fetch stack PR snapshot: ${response.stderr || response.error || 'unknown gh error'}`,
    );
  }

  const parsed = parseJsonPayload<StackPullRequestSnapshotResponse>(
    response.stdout || '{}',
  );
  const repositoryPayload = parsed.data?.repository;
  if (!repositoryPayload || typeof repositoryPayload !== 'object') {
    return new Map();
  }

  const byNumber = new Map<number, StackPullRequest>();
  aliasEntries.forEach((entry) => {
    const payload = repositoryPayload[entry.alias];
    if (typeof payload !== 'object' || payload === null) {
      return;
    }

    const pullRequestPayload = payload as SnapshotPullRequestPayload;
    if (typeof pullRequestPayload.number !== 'number') {
      return;
    }

    const normalized = toStackPullRequest(
      pullRequestPayload,
      getSnapshotCommentCount(pullRequestPayload),
      summarizeChecksFromSnapshot(pullRequestPayload),
    );
    if (normalized) {
      byNumber.set(normalized.number, normalized);
    }
  });

  const ttlMs = await readSnapshotTtlMs();
  pullRequestSnapshotCache.set(cacheKey, {
    key: cacheKey,
    expiresAt: now + ttlMs,
    byNumber,
  });

  return byNumber;
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
  const matchingStage = (input.stack.stages ?? []).find(
    (stage) => stage.id === input.stage.id,
  );
  const existingPullRequestNumber =
    input.stage.pullRequest?.number ?? matchingStage?.pullRequest?.number;
  if (typeof existingPullRequestNumber === 'number') {
    try {
      const snapshotByNumber = await getStackPullRequestSnapshotByNumber({
        repositoryRoot: input.repositoryRoot,
        stack: input.stack,
      });
      const fromSnapshot = snapshotByNumber.get(existingPullRequestNumber);
      if (fromSnapshot) {
        await setStackStagePullRequest(
          input.stack.id,
          input.stage.id,
          fromSnapshot,
        );
        return fromSnapshot;
      }
    } catch (error) {
      console.error('[stage-pr-service] Failed stack PR snapshot lookup', {
        stackId: input.stack.id,
        stageId: input.stage.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

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
