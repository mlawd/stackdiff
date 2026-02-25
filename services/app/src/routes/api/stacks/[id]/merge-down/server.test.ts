import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/stack-merge-down-service', () => ({
  mergeDownStack: vi.fn(),
}));

import { mergeDownStack } from '$lib/server/stack-merge-down-service';
import { POST } from './+server';

const mergeDownStackMock = vi.mocked(mergeDownStack);

describe('POST /api/stacks/[id]/merge-down', () => {
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

  it('returns 200 with merge-down result payload', async () => {
    mergeDownStackMock.mockResolvedValue({
      stackId: 'stack-1',
      defaultBranch: 'main',
      mergedStages: 2,
      stages: [
        {
          stageId: 'stage-1',
          stageTitle: 'Stage 1',
          pullRequestNumber: 11,
          branchName: 'feature/ship-it/1-stage-1',
        },
      ],
    });

    const response = await POST({ params: { id: 'stack-1' } } as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.result).toMatchObject({
      stackId: 'stack-1',
      defaultBranch: 'main',
      mergedStages: 2,
    });
    expect(mergeDownStackMock).toHaveBeenCalledWith('stack-1');
  });

  it('returns mapped status for merge-down command failures', async () => {
    mergeDownStackMock.mockRejectedValue({
      code: 'command-failed',
      message: 'Failed to merge PR #11',
    });

    const response = await POST({ params: { id: 'stack-1' } } as never);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      error: {
        code: 'command-failed',
        message: 'Failed to merge PR #11',
      },
    });
  });
});
