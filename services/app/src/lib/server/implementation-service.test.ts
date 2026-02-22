import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

vi.mock('$lib/server/opencode', () => ({
  createAndSeedOpencodeSession: vi.fn(),
}));

vi.mock('$lib/server/stack-store', () => ({
  createOrGetImplementationSession: vi.fn(),
  getPlanningSessionByStackId: vi.fn(),
  getRuntimeRepositoryPath: vi.fn(),
  setImplementationSessionOpencodeId: vi.fn(),
}));

import { createAndSeedOpencodeSession } from '$lib/server/opencode';
import {
  createOrGetImplementationSession,
  getPlanningSessionByStackId,
  getRuntimeRepositoryPath,
  setImplementationSessionOpencodeId,
} from '$lib/server/stack-store';
import { ensureImplementationSessionBootstrap } from '$lib/server/implementation-service';

const createOrGetImplementationSessionMock = vi.mocked(
  createOrGetImplementationSession,
);
const getPlanningSessionByStackIdMock = vi.mocked(getPlanningSessionByStackId);
const getRuntimeRepositoryPathMock = vi.mocked(getRuntimeRepositoryPath);
const setImplementationSessionOpencodeIdMock = vi.mocked(
  setImplementationSessionOpencodeId,
);
const createAndSeedOpencodeSessionMock = vi.mocked(
  createAndSeedOpencodeSession,
);

describe('implementation-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createOrGetImplementationSessionMock.mockResolvedValue({
      created: true,
      session: {
        id: 'impl-1',
        stackId: 'stack-1',
        stageId: 'stage-1',
        branchName: 'feature/auth-stage-1',
        worktreePathKey: 'auth-stage-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });
    getPlanningSessionByStackIdMock.mockResolvedValue(undefined);
    getRuntimeRepositoryPathMock.mockResolvedValue('/repo');
    createAndSeedOpencodeSessionMock.mockResolvedValue('opencode-impl-1');
    setImplementationSessionOpencodeIdMock.mockResolvedValue({
      id: 'impl-1',
      stackId: 'stack-1',
      stageId: 'stage-1',
      branchName: 'feature/auth-stage-1',
      worktreePathKey: 'auth-stage-1',
      opencodeSessionId: 'opencode-impl-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('seeds implementation prompt with pre-commit /review flow', async () => {
    await ensureImplementationSessionBootstrap({
      stack: {
        id: 'stack-1',
        name: 'Auth',
        notes: 'Add sign in flow',
        type: 'feature',
        status: 'started',
      },
      stage: {
        id: 'stage-1',
        title: 'Build auth flow',
        details: 'Implement login endpoint and UI',
        status: 'in-progress',
      },
      stageIndex: 0,
      branchName: 'feature/auth-stage-1',
      worktreePathKey: 'auth-stage-1',
      worktreeAbsolutePath: '/repo/.stacked/worktrees/auth-stage-1',
    });

    expect(createAndSeedOpencodeSessionMock).toHaveBeenCalledTimes(1);
    const seededPrompt =
      createAndSeedOpencodeSessionMock.mock.calls[0]?.[0]?.prompt;

    expect(seededPrompt).toContain(
      'Before committing, run /review on the current uncommitted changes in this worktree.',
    );
    expect(seededPrompt).toContain(
      'After /review returns, continue this implementation session: apply fixes, rerun checks, and only then commit.',
    );
    expect(seededPrompt).toContain(
      'Address any review findings, rerun relevant validation checks, then commit with a clear message.',
    );
    expect(seededPrompt).toContain(
      'If there are no code changes, skip /review and do not create an empty commit.',
    );
    expect(seededPrompt).not.toContain(
      'When implementation is complete, commit the changes with a clear message.',
    );

    const reviewIndex = seededPrompt?.indexOf(
      'Before committing, run /review on the current uncommitted changes in this worktree.',
    );
    const commitIndex = seededPrompt?.indexOf(
      'Address any review findings, rerun relevant validation checks, then commit with a clear message.',
    );
    const continueIndex = seededPrompt?.indexOf(
      'After /review returns, continue this implementation session: apply fixes, rerun checks, and only then commit.',
    );

    expect(reviewIndex).toBeGreaterThanOrEqual(0);
    expect(continueIndex).toBeGreaterThanOrEqual(0);
    expect(commitIndex).toBeGreaterThanOrEqual(0);
    expect((reviewIndex ?? -1) < (continueIndex ?? -1)).toBe(true);
    expect((continueIndex ?? -1) < (commitIndex ?? -1)).toBe(true);
  });
});
