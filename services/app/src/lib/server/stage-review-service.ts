import {
  createAndSeedOpencodeSession,
  getOpencodeSessionMessages,
  getOpencodeSessionRuntimeState,
} from '$lib/server/opencode';
import { getStagePullRequestComments } from '$lib/server/stage-review-comment-service';
import {
  createOrGetReviewSession,
  getImplementationSessionByStackAndStage,
  getReviewSessionByStackAndStage,
  getRuntimeRepositoryPath,
  getStackById,
  setReviewSessionOpencodeId,
} from '$lib/server/stack-store';
import { resolveWorktreeAbsolutePath } from '$lib/server/worktree-service';
import type {
  PlanningMessage,
  StackImplementationSession,
  StackReviewSession,
} from '$lib/types/stack';

const REVIEW_SYSTEM_PROMPT = `You are helping with stage review follow-up.
Use PR feedback as input and propose the smallest, highest-impact fixes.
Keep responses concise and execution-oriented.
Start with a short summary of issues, then propose an ordered fix plan.
When helpful, include validation steps and risk notes.
If context is missing, ask focused questions.`;

interface StageReviewContext {
  reviewSession: StackReviewSession;
  implementationSession: StackImplementationSession;
  worktreeAbsolutePath: string;
}

function formatSeedPrompt(input: {
  stackName: string;
  stackType: string;
  stackNotes?: string;
  stageId: string;
  stageTitle: string;
  stageDetails?: string;
  branchName: string;
  pullRequestNumber: number;
  pullRequestTitle: string;
  pullRequestUrl: string;
  comments: Awaited<ReturnType<typeof getStagePullRequestComments>>;
}): string {
  const lines = [
    'Start a review follow-up session for this stage.',
    `Feature type: ${input.stackType}`,
    `Feature: ${input.stackName}`,
    `Feature notes: ${input.stackNotes?.trim() || 'No additional notes.'}`,
    `Stage id: ${input.stageId}`,
    `Stage title: ${input.stageTitle}`,
    `Stage details: ${input.stageDetails?.trim() || 'No stage details provided.'}`,
    `Branch: ${input.branchName}`,
    `Pull request: #${input.pullRequestNumber} ${input.pullRequestTitle}`,
    `Pull request URL: ${input.pullRequestUrl}`,
    '',
    'Use the PR comments below as the current review signal. Prioritize concrete fixes and implementation sequencing.',
  ];

  if (input.comments.length === 0) {
    lines.push('', 'No PR comments were found yet. Ask for reviewer intent or propose a self-review checklist.');
    return lines.join('\n');
  }

  lines.push('', 'PR comments:');
  input.comments.forEach((comment, index) => {
    const author = comment.author || 'unknown';
    const source = comment.source === 'review' ? 'review' : 'comment';
    const createdAt = comment.createdAt ? ` at ${comment.createdAt}` : '';
    lines.push(`${index + 1}. [${source}] ${author}${createdAt}`);
    lines.push(`   ${comment.body}`);
    if (comment.url) {
      lines.push(`   URL: ${comment.url}`);
    }
  });

  return lines.join('\n');
}

async function requireReviewContext(
  stackId: string,
  stageId: string,
): Promise<StageReviewContext> {
  const stack = await getStackById(stackId);
  if (!stack) {
    throw new Error('Stack not found.');
  }

  const stage = (stack.stages ?? []).find((item) => item.id === stageId);
  if (!stage) {
    throw new Error('Stage not found.');
  }

  const implementationSession = await getImplementationSessionByStackAndStage(
    stackId,
    stageId,
  );
  if (!implementationSession) {
    throw new Error(
      'Implementation session not found. Start the stage before opening review chat.',
    );
  }

  if (!stage.pullRequest?.number) {
    throw new Error(
      'Stage pull request is missing. Move the stage to review-ready to create a PR first.',
    );
  }

  const repositoryRoot = await getRuntimeRepositoryPath();
  const worktreeAbsolutePath = resolveWorktreeAbsolutePath(
    repositoryRoot,
    implementationSession.worktreePathKey,
  );

  const reviewSession = await createOrGetReviewSession(stackId, stageId);
  if (!reviewSession.opencodeSessionId) {
    const comments = await getStagePullRequestComments({
      repositoryRoot,
      pullRequest: stage.pullRequest,
    });
    const prompt = formatSeedPrompt({
      stackName: stack.name,
      stackType: stack.type,
      stackNotes: stack.notes,
      stageId: stage.id,
      stageTitle: stage.title,
      stageDetails: stage.details,
      branchName: implementationSession.branchName,
      pullRequestNumber: stage.pullRequest.number,
      pullRequestTitle: stage.pullRequest.title,
      pullRequestUrl: stage.pullRequest.url,
      comments,
    });
    const opencodeSessionId = await createAndSeedOpencodeSession({
      prompt,
      agent: 'build',
      system: REVIEW_SYSTEM_PROMPT,
      directory: worktreeAbsolutePath,
    });
    const seeded = await setReviewSessionOpencodeId(
      stackId,
      stageId,
      opencodeSessionId,
    );

    return {
      reviewSession: seeded,
      implementationSession,
      worktreeAbsolutePath,
    };
  }

  return {
    reviewSession,
    implementationSession,
    worktreeAbsolutePath,
  };
}

export async function loadStageReviewSession(input: {
  stackId: string;
  stageId: string;
}): Promise<{
  session: StackReviewSession;
  messages: PlanningMessage[];
  awaitingResponse: boolean;
}> {
  const context = await requireReviewContext(input.stackId, input.stageId);
  const sessionId = context.reviewSession.opencodeSessionId;
  if (!sessionId) {
    throw new Error('Review session is missing an OpenCode session id.');
  }

  const messages = await getOpencodeSessionMessages(sessionId, {
    directory: context.worktreeAbsolutePath,
  });
  const runtimeState = await getOpencodeSessionRuntimeState(sessionId, {
    directory: context.worktreeAbsolutePath,
  });

  return {
    session: context.reviewSession,
    messages,
    awaitingResponse: runtimeState === 'busy' || runtimeState === 'retry',
  };
}

export async function getExistingStageReviewSession(input: {
  stackId: string;
  stageId: string;
}): Promise<{
  session: StackReviewSession;
  worktreeAbsolutePath: string;
}> {
  const existing = await getReviewSessionByStackAndStage(input.stackId, input.stageId);
  if (!existing?.opencodeSessionId) {
    const loaded = await requireReviewContext(input.stackId, input.stageId);
    return {
      session: loaded.reviewSession,
      worktreeAbsolutePath: loaded.worktreeAbsolutePath,
    };
  }

  const implementationSession = await getImplementationSessionByStackAndStage(
    input.stackId,
    input.stageId,
  );
  if (!implementationSession) {
    throw new Error('Implementation session not found.');
  }

  const repositoryRoot = await getRuntimeRepositoryPath();
  return {
    session: existing,
    worktreeAbsolutePath: resolveWorktreeAbsolutePath(
      repositoryRoot,
      implementationSession.worktreePathKey,
    ),
  };
}

export { REVIEW_SYSTEM_PROMPT };
