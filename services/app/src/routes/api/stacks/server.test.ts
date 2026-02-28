import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/project-config', () => ({
  listConfiguredProjects: vi.fn(),
}));

vi.mock('$lib/server/stack-store', () => ({
  readStacksByProjectId: vi.fn(),
}));

vi.mock('$lib/features/stack-create/server/create-stack', () => ({
  createStack: vi.fn(),
}));

import { createStack } from '$lib/features/stack-create/server/create-stack';
import { POST } from './+server';

const createStackMock = vi.mocked(createStack);

describe('POST /api/stacks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when project id is missing', async () => {
    const response = await POST({
      request: new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Feature', type: 'feature' }),
      }),
    } as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: {
        code: 'invalid-input',
        message: 'Project id is required.',
      },
    });
  });

  it('returns created stack payload on success', async () => {
    createStackMock.mockResolvedValue({
      id: 'stack-1',
      projectId: 'repo-1',
      name: 'Feature',
      type: 'feature',
      status: 'created',
      stages: [],
      repositoryAbsolutePath: '/repo',
      currentBranch: 'main',
      syncState: 'clean',
      workingTreeDirty: false,
    });

    const response = await POST({
      request: new Request('http://localhost', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: 'repo-1',
          name: 'Feature',
          type: 'feature',
        }),
      }),
    } as never);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data.stack.id).toBe('stack-1');
    expect(createStackMock).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'repo-1' }),
    );
  });
});
