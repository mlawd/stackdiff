import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/stage-review-service', () => ({
  loadStageReviewSession: vi.fn(),
}));

import { loadStageReviewSession } from '$lib/server/stage-review-service';
import { POST } from './+server';

const loadStageReviewSessionMock = vi.mocked(loadStageReviewSession);

describe('POST /api/stacks/[id]/stages/[stageId]/review/session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when stage id is missing', async () => {
    const response = await POST({ params: { id: 'stack-1', stageId: '' } } as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: 'invalid-input',
        message: 'Stage id is required.',
      },
    });
  });

  it('returns review session payload on success', async () => {
    loadStageReviewSessionMock.mockResolvedValue({
      session: {
        id: 'review-1',
        stackId: 'stack-1',
        stageId: 'stage-1',
        opencodeSessionId: 'ses_1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      messages: [],
      awaitingResponse: false,
    });

    const response = await POST(
      { params: { id: 'stack-1', stageId: 'stage-1' } } as never,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      data: {
        session: {
          id: 'review-1',
          stackId: 'stack-1',
          stageId: 'stage-1',
          opencodeSessionId: 'ses_1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        messages: [],
        awaitingResponse: false,
      },
    });
  });
});
