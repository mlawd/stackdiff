import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/stack-runtime-stream-service', () => ({
  handleStackRuntimeStreamRequest: vi.fn(),
}));

import { handleStackRuntimeStreamRequest } from '$lib/server/stack-runtime-stream-service';
import { GET } from './+server';

const handleStackRuntimeStreamRequestMock = vi.mocked(
  handleStackRuntimeStreamRequest,
);

describe('GET /api/stacks/[id]/runtime/stream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when stack id is missing', async () => {
    const request = new Request('http://localhost/api/stacks//runtime/stream');

    const response = await GET({ params: { id: '' }, request } as never);
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
    const request = new Request(
      'http://localhost/api/stacks/stack-1/runtime/stream',
    );
    const streamed = new Response('ok', {
      headers: { 'content-type': 'text/event-stream; charset=utf-8' },
    });
    handleStackRuntimeStreamRequestMock.mockResolvedValue(streamed);

    const response = await GET({
      params: { id: 'stack-1' },
      request,
    } as never);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
  });
});
