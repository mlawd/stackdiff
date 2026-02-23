import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/start-service', () => ({
  startFeatureNextStage: vi.fn(),
}));

import { startFeatureNextStage } from '$lib/server/start-service';
import { POST } from './+server';

const startFeatureNextStageMock = vi.mocked(startFeatureNextStage);

describe('POST /api/stacks/[id]/start', () => {
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

  it('returns started stage payload on success', async () => {
    startFeatureNextStageMock.mockResolvedValue({
      stack: {
        id: 'stack-1',
        projectId: 'repo-1',
        name: 'Auth',
        type: 'feature',
        status: 'started',
        stages: [],
      },
      implementationSession: {
        id: 'impl-1',
        stackId: 'stack-1',
        stageId: 'stage-1',
        branchName: 'feature/auth-stage-1',
        worktreePathKey: 'auth-stage-1',
        createdAt: '2026-02-21T00:00:00.000Z',
        updatedAt: '2026-02-21T00:00:00.000Z',
      },
      stageNumber: 1,
      stageTitle: 'Build auth flow',
      branchName: 'feature/auth-stage-1',
      worktreePathKey: 'auth-stage-1',
      worktreeAbsolutePath: '/repo/.worktrees/auth-stage-1',
      reusedWorktree: false,
      reusedSession: false,
      startedNow: true,
    });

    const response = await POST({ params: { id: 'stack-1' } } as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.stageNumber).toBe(1);
    expect(body.data.stageTitle).toBe('Build auth flow');
  });

  it('maps service not found errors', async () => {
    startFeatureNextStageMock.mockRejectedValue(new Error('Stack not found.'));

    const response = await POST({ params: { id: 'stack-1' } } as never);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: {
        code: 'not-found',
        message: 'Stack not found.',
      },
    });
  });
});
