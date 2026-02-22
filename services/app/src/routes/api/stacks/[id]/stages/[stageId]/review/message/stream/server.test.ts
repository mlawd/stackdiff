import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/stage-review-stream-service', () => ({
  handleStageReviewMessageStreamRequest: vi.fn(),
}));

import { handleStageReviewMessageStreamRequest } from '$lib/server/stage-review-stream-service';
import { POST } from './+server';

const handleStageReviewMessageStreamRequestMock = vi.mocked(
  handleStageReviewMessageStreamRequest,
);

describe('POST /api/stacks/[id]/stages/[stageId]/review/message/stream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when stack id is missing', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ content: 'hello' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(
      { params: { id: '', stageId: 'stage-1' }, request } as never,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: 'invalid-input',
        message: 'Stack id is required.',
      },
    });
  });

  it('forwards successful stream response', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ content: 'hello' }),
      headers: { 'content-type': 'application/json' },
    });
    const streamed = new Response('ok', {
      headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    });
    handleStageReviewMessageStreamRequestMock.mockResolvedValue(streamed);

    const response = await POST(
      {
        params: { id: 'stack-1', stageId: 'stage-1' },
        request,
      } as never,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
  });
});
