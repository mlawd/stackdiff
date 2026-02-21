import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/implementation-status-service', () => ({
  getImplementationStageStatusSummary: vi.fn(),
}));

import { getImplementationStageStatusSummary } from '$lib/server/implementation-status-service';
import { GET } from './+server';

const getImplementationStageStatusSummaryMock = vi.mocked(
  getImplementationStageStatusSummary,
);

describe('GET /api/stacks/[id]/stages/[stageId]/implementation/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when stage id is missing', async () => {
    const response = await GET({ params: { id: 'stack-1', stageId: '' } } as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: 'invalid-input',
        message: 'Stage id is required.',
      },
    });
  });

  it('returns status summary in data envelope', async () => {
    getImplementationStageStatusSummaryMock.mockResolvedValue({
      stageStatus: 'in-progress',
      runtimeState: 'busy',
      todoCompleted: 1,
      todoTotal: 3,
    });

    const response = await GET(
      { params: { id: 'stack-1', stageId: 'stage-1' } } as never,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      data: {
        stageStatus: 'in-progress',
        runtimeState: 'busy',
        todoCompleted: 1,
        todoTotal: 3,
      },
    });
  });
});
