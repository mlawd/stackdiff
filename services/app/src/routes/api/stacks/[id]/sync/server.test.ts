import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/stack-sync-service', () => ({
  syncStack: vi.fn(),
  isStackSyncServiceError: vi.fn(),
}));

import {
  isStackSyncServiceError,
  syncStack,
} from '$lib/server/stack-sync-service';
import { POST } from './+server';

const syncStackMock = vi.mocked(syncStack);
const isStackSyncServiceErrorMock = vi.mocked(isStackSyncServiceError);

describe('POST /api/stacks/[id]/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isStackSyncServiceErrorMock.mockImplementation((error: unknown) => {
      if (typeof error !== 'object' || error === null) {
        return false;
      }

      const candidate = error as { code?: unknown; message?: unknown };
      return (
        typeof candidate.code === 'string' &&
        typeof candidate.message === 'string'
      );
    });
  });

  it('returns 404 when feature id is missing', async () => {
    const response = await POST({ params: { id: '' } } as never);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: {
        code: 'not-found',
        message: 'Feature id is required.',
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
    expect(body.result).toMatchObject({
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

  it('returns 500 for unknown errors', async () => {
    isStackSyncServiceErrorMock.mockReturnValue(false);
    syncStackMock.mockRejectedValue(new Error('unexpected failure'));

    const response = await POST({ params: { id: 'stack-1' } } as never);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: {
        code: 'command-failed',
        message: 'unexpected failure',
      },
    });
  });
});
