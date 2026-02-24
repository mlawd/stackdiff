import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/opencode', () => ({
  createAndSeedOpencodeSession: vi.fn(),
  getOpencodeSessionRuntimeState: vi.fn(),
  getOpencodeSessionMessages: vi.fn(),
  sendOpencodeSessionMessage: vi.fn(),
}));

vi.mock('$lib/server/plan-file', () => ({
  writeStackPlanFile: vi.fn(),
  writeStackStageConfigFile: vi.fn(),
}));

vi.mock('$lib/server/stack-store', () => ({
  createOrGetPlanningSession: vi.fn(),
  getRuntimeRepositoryPath: vi.fn(),
  getStackById: vi.fn(),
  getPlanningSessionByStackId: vi.fn(),
  markPlanningSessionSaved: vi.fn(),
  setPlanningSessionOpencodeId: vi.fn(),
  setStackStatus: vi.fn(),
  setStackStages: vi.fn(),
  touchPlanningSessionUpdatedAt: vi.fn(),
}));

import {
  createAndSeedOpencodeSession,
  getOpencodeSessionMessages,
  getOpencodeSessionRuntimeState,
  sendOpencodeSessionMessage,
} from '$lib/server/opencode';
import {
  createAndSeedPlanningSessionForStack,
  loadExistingPlanningSession,
  sendPlanningMessage,
} from '$lib/server/planning-service';
import {
  createOrGetPlanningSession,
  getRuntimeRepositoryPath,
  getPlanningSessionByStackId,
  setPlanningSessionOpencodeId,
  touchPlanningSessionUpdatedAt,
} from '$lib/server/stack-store';

const createAndSeedOpencodeSessionMock = vi.mocked(
  createAndSeedOpencodeSession,
);
const getOpencodeSessionMessagesMock = vi.mocked(getOpencodeSessionMessages);
const getOpencodeSessionRuntimeStateMock = vi.mocked(
  getOpencodeSessionRuntimeState,
);
const sendOpencodeSessionMessageMock = vi.mocked(sendOpencodeSessionMessage);

const createOrGetPlanningSessionMock = vi.mocked(createOrGetPlanningSession);
const getRuntimeRepositoryPathMock = vi.mocked(getRuntimeRepositoryPath);
const getPlanningSessionByStackIdMock = vi.mocked(getPlanningSessionByStackId);
const setPlanningSessionOpencodeIdMock = vi.mocked(
  setPlanningSessionOpencodeId,
);
const touchPlanningSessionUpdatedAtMock = vi.mocked(
  touchPlanningSessionUpdatedAt,
);

describe('planning-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getRuntimeRepositoryPathMock.mockResolvedValue('/repo');
    getOpencodeSessionMessagesMock.mockResolvedValue([]);
    getOpencodeSessionRuntimeStateMock.mockResolvedValue('idle');
    touchPlanningSessionUpdatedAtMock.mockResolvedValue({
      id: 'session-1',
      stackId: 'stack-1',
      opencodeSessionId: 'opencode-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('uses project repository root when creating and loading planning session', async () => {
    createOrGetPlanningSessionMock.mockResolvedValue({
      id: 'session-1',
      stackId: 'stack-1',
      opencodeSessionId: undefined,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    createAndSeedOpencodeSessionMock.mockResolvedValue('opencode-1');
    setPlanningSessionOpencodeIdMock.mockResolvedValue({
      id: 'session-1',
      stackId: 'stack-1',
      opencodeSessionId: 'opencode-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await createAndSeedPlanningSessionForStack({
      id: 'stack-1',
      projectId: 'repo-1',
      name: 'Auth flow',
      type: 'feature',
      status: 'created',
      stages: [],
    });

    expect(createAndSeedOpencodeSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: '/repo',
      }),
    );
    expect(getOpencodeSessionMessagesMock).toHaveBeenCalledWith('opencode-1', {
      directory: '/repo',
    });
  });

  it('uses project repository root for planning session reads and writes', async () => {
    getPlanningSessionByStackIdMock.mockResolvedValue({
      id: 'session-1',
      stackId: 'stack-1',
      opencodeSessionId: 'opencode-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    sendOpencodeSessionMessageMock.mockResolvedValue('done');

    await loadExistingPlanningSession('stack-1');

    expect(getOpencodeSessionMessagesMock).toHaveBeenCalledWith('opencode-1', {
      directory: '/repo',
    });
    expect(getOpencodeSessionRuntimeStateMock).toHaveBeenCalledWith(
      'opencode-1',
      {
        directory: '/repo',
      },
    );

    await sendPlanningMessage('stack-1', 'hello planner');

    expect(sendOpencodeSessionMessageMock).toHaveBeenCalledWith(
      'opencode-1',
      'hello planner',
      expect.objectContaining({
        directory: '/repo',
      }),
    );
  });
});
