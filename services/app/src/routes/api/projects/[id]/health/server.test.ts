import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/project-health', () => ({
  getProjectHealth: vi.fn(),
}));

import { getProjectHealth } from '$lib/server/project-health';
import { GET } from './+server';

const getProjectHealthMock = vi.mocked(getProjectHealth);

describe('GET /api/projects/[id]/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when project id is missing', async () => {
    const response = await GET({ params: { id: '' } } as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: 'invalid-input',
        message: 'Project id is required.',
      },
    });
  });

  it('returns health payload on success', async () => {
    getProjectHealthMock.mockResolvedValue({
      projectId: 'repo-1',
      ok: true,
      repositoryRoot: '/repo',
      checks: [
        {
          key: 'git-repo',
          ok: true,
        },
      ],
    });

    const response = await GET({ params: { id: 'repo-1' } } as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.health).toMatchObject({
      projectId: 'repo-1',
      ok: true,
      repositoryRoot: '/repo',
    });
  });
});
