import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/agent-runtime', () => ({
  getAgentSessionMessages: vi.fn(),
  getAgentSessionRuntimeState: vi.fn(),
  listPendingAgentSessionQuestions: vi.fn(),
  replyAgentQuestion: vi.fn(),
  streamAgentSessionMessage: vi.fn(),
  watchAgentSession: vi.fn(),
}));

vi.mock('$lib/server/stage-review-service', () => ({
  getExistingStageReviewSession: vi.fn(),
  REVIEW_SYSTEM_PROMPT: 'review prompt',
}));

vi.mock('$lib/server/stack-store', () => ({
  getStackById: vi.fn(),
  touchReviewSessionUpdatedAt: vi.fn(),
}));

import {
  getAgentSessionMessages,
  streamAgentSessionMessage,
} from '$lib/server/agent-runtime';
import { getExistingStageReviewSession } from '$lib/server/stage-review-service';
import { handleStageReviewMessageStreamRequest } from '$lib/server/stage-review-stream-service';
import {
  getStackById,
  touchReviewSessionUpdatedAt,
} from '$lib/server/stack-store';

const getAgentSessionMessagesMock = vi.mocked(getAgentSessionMessages);
const streamAgentSessionMessageMock = vi.mocked(streamAgentSessionMessage);
const getExistingStageReviewSessionMock = vi.mocked(
  getExistingStageReviewSession,
);
const getStackByIdMock = vi.mocked(getStackById);
const touchReviewSessionUpdatedAtMock = vi.mocked(touchReviewSessionUpdatedAt);

describe('stage-review-stream-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getStackByIdMock.mockResolvedValue({
      id: 'stack-1',
      projectId: 'repo-1',
      name: 'Stack',
      type: 'feature',
      status: 'started',
      stages: [{ id: 'stage-1', title: 'Stage 1', status: 'review' }],
    });
    getExistingStageReviewSessionMock.mockResolvedValue({
      session: {
        id: 'review-session-1',
        stackId: 'stack-1',
        stageId: 'stage-1',
        agentSessionId: 'opencode-review-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      worktreeAbsolutePath: '/repo/.stacked/worktrees/stage-1',
    });
    touchReviewSessionUpdatedAtMock.mockResolvedValue({
      id: 'review-session-1',
      stackId: 'stack-1',
      stageId: 'stage-1',
      agentSessionId: 'opencode-review-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    getAgentSessionMessagesMock.mockResolvedValue([
      {
        id: 'assistant-question',
        role: 'assistant',
        content: JSON.stringify({
          type: 'question',
          questions: [
            {
              header: 'Review focus',
              question: 'Which issue should be fixed first?',
              options: [{ label: 'Bug A' }],
            },
          ],
        }),
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });

  it('emits done immediately after question event', async () => {
    streamAgentSessionMessageMock.mockReturnValue(
      (async function* () {
        yield {
          type: 'question',
          question: {
            questions: [
              {
                header: 'Review focus',
                question: 'Which issue should be fixed first?',
                options: [{ label: 'Bug A' }],
              },
            ],
          },
          requestId: 'req-review-1',
          source: 'tool',
        };
      })(),
    );

    const response = await handleStageReviewMessageStreamRequest({
      stackId: 'stack-1',
      stageId: 'stage-1',
      request: new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'please review' }),
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const body = await response.text();
    expect(body).toContain('event: question');
    expect(body).toContain('"requestId":"req-review-1"');
    expect(body).toContain('event: done');
    expect(body.indexOf('event: question')).toBeLessThan(
      body.indexOf('event: done'),
    );

    expect(touchReviewSessionUpdatedAtMock).toHaveBeenCalledWith(
      'stack-1',
      'stage-1',
    );
    expect(getAgentSessionMessagesMock).toHaveBeenCalledWith(
      'opencode-review-1',
      {
        directory: '/repo/.stacked/worktrees/stage-1',
      },
    );
  });
});
