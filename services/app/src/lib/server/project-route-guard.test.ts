import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/project-config', () => ({
  listConfiguredProjects: vi.fn(),
}));

import { listConfiguredProjects } from '$lib/server/project-config';

import { requireConfiguredProjectRouteId } from './project-route-guard';

const listConfiguredProjectsMock = vi.mocked(listConfiguredProjects);

describe('requireConfiguredProjectRouteId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns normalized project route id when configured', async () => {
    listConfiguredProjectsMock.mockResolvedValue([
      {
        id: 'repo/one',
        name: 'Repo One',
        repositoryPath: '/tmp/repo-one',
      },
    ]);

    await expect(requireConfiguredProjectRouteId('repo%252Fone')).resolves.toBe(
      'repo/one',
    );
  });

  it('throws 404 when project does not exist', async () => {
    listConfiguredProjectsMock.mockResolvedValue([
      {
        id: 'repo-one',
        name: 'Repo One',
        repositoryPath: '/tmp/repo-one',
      },
    ]);

    await expect(
      requireConfiguredProjectRouteId('missing'),
    ).rejects.toMatchObject({
      status: 404,
    });
  });
});
