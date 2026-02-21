import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/stack-sync-service', () => ({
  syncStack: vi.fn(),
}));

import { syncStack } from '$lib/server/stack-sync-service';
import { POST } from './+server';

const syncStackMock = vi.mocked(syncStack);

describe('POST /api/stacks/[id]/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when stack id is missing', async () => {
    const response = await POST({ params: { id: '' } } as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: 'invalid-input',
        message: 'Stack id is required.',
      },
    });
  });

  it('returns 200 with sync result payload', async () => {
    syncStackMock.mockResolvedValue({
      stackId: 'stack-1',
      totalStages: 2,
      rebasedStages: 1,
      skippedStages: 1,
      stages: [],
    });

    const response = await POST({ params: { id: 'stack-1' } } as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.result).toMatchObject({
      stackId: 'stack-1',
      totalStages: 2,
      rebasedStages: 1,
      skippedStages: 1,
    });
    expect(syncStackMock).toHaveBeenCalledWith('stack-1');
  });

  it('returns mapped status for stack sync errors', async () => {
    syncStackMock.mockRejectedValue({
      code: 'command-failed',
      message: 'Failed to sync stage Stage 1',
    });

    const response = await POST({ params: { id: 'stack-1' } } as never);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      error: {
        code: 'command-failed',
        message: 'Failed to sync stage Stage 1',
      },
    });
  });

  it('returns 400 for unknown errors', async () => {
    syncStackMock.mockRejectedValue(new Error('unexpected failure'));

    const response = await POST({ params: { id: 'stack-1' } } as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: 'invalid-input',
        message: 'unexpected failure',
      },
    });
  });
});
