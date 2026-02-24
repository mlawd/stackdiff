import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/opencode', () => ({
  getOpencodeSessionRuntimeState: vi.fn(),
  listPendingOpencodeSessionQuestions: vi.fn(),
  replyOpencodeQuestion: vi.fn(),
  streamOpencodeSessionMessage: vi.fn(),
  watchOpencodeSession: vi.fn(),
}));

vi.mock('$lib/server/planning-service', () => ({
  getPlanningMessages: vi.fn(),
  loadExistingPlanningSession: vi.fn(),
  savePlanFromSession: vi.fn(),
  shouldAutoSavePlan: vi.fn(),
  PLANNING_SYSTEM_PROMPT: 'system prompt',
}));

vi.mock('$lib/server/stack-store', () => ({
  getRuntimeRepositoryPath: vi.fn(),
  getStackById: vi.fn(),
  touchPlanningSessionUpdatedAt: vi.fn(),
}));

import { streamOpencodeSessionMessage } from '$lib/server/opencode';
import {
  getPlanningMessages,
  loadExistingPlanningSession,
  shouldAutoSavePlan,
} from '$lib/server/planning-service';
import { handlePlanningMessageStreamRequest } from '$lib/server/planning-stream-service';
import {
  getRuntimeRepositoryPath,
  getStackById,
  touchPlanningSessionUpdatedAt,
} from '$lib/server/stack-store';

const streamOpencodeSessionMessageMock = vi.mocked(
  streamOpencodeSessionMessage,
);
const getPlanningMessagesMock = vi.mocked(getPlanningMessages);
const loadExistingPlanningSessionMock = vi.mocked(loadExistingPlanningSession);
const shouldAutoSavePlanMock = vi.mocked(shouldAutoSavePlan);
const getRuntimeRepositoryPathMock = vi.mocked(getRuntimeRepositoryPath);
const getStackByIdMock = vi.mocked(getStackById);
const touchPlanningSessionUpdatedAtMock = vi.mocked(
  touchPlanningSessionUpdatedAt,
);

describe('planning-stream-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getStackByIdMock.mockResolvedValue({
      id: 'stack-1',
      projectId: 'repo-1',
      name: 'Stack',
      type: 'feature',
      status: 'planned',
      stages: [],
    });
    loadExistingPlanningSessionMock.mockResolvedValue({
      session: {
        id: 'session-1',
        stackId: 'stack-1',
        opencodeSessionId: 'opencode-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      messages: [],
      awaitingResponse: false,
    });
    shouldAutoSavePlanMock.mockReturnValue(false);
    getRuntimeRepositoryPathMock.mockResolvedValue('/repo');
    touchPlanningSessionUpdatedAtMock.mockResolvedValue({
      id: 'session-1',
      stackId: 'stack-1',
      opencodeSessionId: 'opencode-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    getPlanningMessagesMock.mockResolvedValue([
      {
        id: 'assistant-question',
        role: 'assistant',
        content: JSON.stringify({
          type: 'question',
          questions: [
            {
              header: 'Scope',
              question: 'What should we do?',
              options: [{ label: 'A' }],
            },
          ],
        }),
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });

  it('emits done immediately after question event', async () => {
    streamOpencodeSessionMessageMock.mockReturnValue(
      (async function* () {
        yield {
          type: 'question',
          question: {
            questions: [
              {
                header: 'Scope',
                question: 'What should we do?',
                options: [{ label: 'A' }],
              },
            ],
          },
          requestId: 'req-1',
          source: 'tool',
        };
      })(),
    );

    const response = await handlePlanningMessageStreamRequest({
      stackId: 'stack-1',
      request: new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'hello' }),
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const body = await response.text();
    expect(body).toContain('event: start');
    expect(body).toContain('event: question');
    expect(body).toContain('"requestId":"req-1"');
    expect(body).toContain('event: done');
    expect(body.indexOf('event: question')).toBeLessThan(
      body.indexOf('event: done'),
    );

    expect(touchPlanningSessionUpdatedAtMock).toHaveBeenCalledWith('stack-1');
    expect(getPlanningMessagesMock).toHaveBeenCalledWith('stack-1');
    expect(streamOpencodeSessionMessageMock).toHaveBeenCalledWith(
      'opencode-1',
      'hello',
      expect.objectContaining({
        directory: '/repo',
      }),
    );
  });
});
