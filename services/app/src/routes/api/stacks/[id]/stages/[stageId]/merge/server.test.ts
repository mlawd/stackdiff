import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/implementation-status-service', () => ({
  mergeStagePullRequest: vi.fn(),
}));

import { mergeStagePullRequest } from '$lib/server/implementation-status-service';
import { POST } from './+server';

const mergeStagePullRequestMock = vi.mocked(mergeStagePullRequest);

describe('POST /api/stacks/[id]/stages/[stageId]/merge', () => {
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

  it('returns 200 with merge status summary', async () => {
    mergeStagePullRequestMock.mockResolvedValue({
      stageStatus: 'done',
      runtimeState: 'idle',
      todoCompleted: 5,
      todoTotal: 5,
      pullRequest: {
        number: 123,
        title: 'feat: Example',
        state: 'MERGED',
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
      stageStatus: 'done',
    });
    expect(mergeStagePullRequestMock).toHaveBeenCalledWith(
      'stack-1',
      'stage-1',
    );
  });
});
