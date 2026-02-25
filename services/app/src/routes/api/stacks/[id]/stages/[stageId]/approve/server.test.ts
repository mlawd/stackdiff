import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/implementation-status-service', () => ({
  approveStageForMerge: vi.fn(),
}));

import { approveStageForMerge } from '$lib/server/implementation-status-service';
import { POST } from './+server';

const approveStageForMergeMock = vi.mocked(approveStageForMerge);

describe('POST /api/stacks/[id]/stages/[stageId]/approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when stack id is missing', async () => {
    const response = await POST({
      params: { id: '', stageId: 'stage-1' },
    } as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: 'invalid-input',
        message: 'Stack id is required.',
      },
    });
  });

  it('returns 400 when stage id is missing', async () => {
    const response = await POST({
      params: { id: 'stack-1', stageId: '' },
    } as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: 'invalid-input',
        message: 'Stage id is required.',
      },
    });
  });

  it('returns 200 with approval status summary', async () => {
    approveStageForMergeMock.mockResolvedValue({
      stageStatus: 'approved',
      runtimeState: 'idle',
      todoCompleted: 3,
      todoTotal: 3,
      approvedCommitSha: 'abc123',
      pullRequest: {
        number: 123,
        title: 'feat: Example',
        state: 'OPEN',
        isDraft: false,
        url: 'https://github.com/org/repo/pull/123',
        updatedAt: '2026-02-25T00:00:00.000Z',
      },
    });

    const response = await POST({
      params: { id: 'stack-1', stageId: 'stage-1' },
    } as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      stageStatus: 'approved',
      approvedCommitSha: 'abc123',
    });
    expect(approveStageForMergeMock).toHaveBeenCalledWith('stack-1', 'stage-1');
  });
});
