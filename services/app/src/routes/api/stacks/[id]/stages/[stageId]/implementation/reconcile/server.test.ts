import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/implementation-status-service', () => ({
  reconcileImplementationStageStatus: vi.fn(),
}));

import { reconcileImplementationStageStatus } from '$lib/server/implementation-status-service';
import { POST } from './+server';

const reconcileImplementationStageStatusMock = vi.mocked(
  reconcileImplementationStageStatus,
);

describe('POST /api/stacks/[id]/stages/[stageId]/implementation/reconcile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when stack id is missing', async () => {
    const response = await POST(
      { params: { id: '', stageId: 'stage-1' } } as never,
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

  it('returns reconciled status payload on success', async () => {
    reconcileImplementationStageStatusMock.mockResolvedValue({
      stageStatus: 'review',
      runtimeState: 'idle',
      todoCompleted: 4,
      todoTotal: 4,
    });

    const response = await POST(
      { params: { id: 'stack-1', stageId: 'stage-1' } } as never,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      stageStatus: 'review',
      runtimeState: 'idle',
      todoCompleted: 4,
      todoTotal: 4,
    });
  });
});
