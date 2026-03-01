import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/agent-runtime', () => ({
  createAndSeedAgentSession: vi.fn(),
  getAgentSessionRuntimeState: vi.fn(),
  getAgentSessionMessages: vi.fn(),
  sendAgentSessionMessage: vi.fn(),
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
  setPlanningSessionAgentId: vi.fn(),
  setStackStatus: vi.fn(),
  setStackStages: vi.fn(),
  touchPlanningSessionUpdatedAt: vi.fn(),
}));

import {
  createAndSeedAgentSession,
  getAgentSessionMessages,
  getAgentSessionRuntimeState,
  sendAgentSessionMessage,
} from '$lib/server/agent-runtime';
import {
  createAndSeedPlanningSessionForStack,
  loadExistingPlanningSession,
  sendPlanningMessage,
} from '$lib/server/planning-service';
import {
  createOrGetPlanningSession,
  getRuntimeRepositoryPath,
  getPlanningSessionByStackId,
  setPlanningSessionAgentId,
  touchPlanningSessionUpdatedAt,
} from '$lib/server/stack-store';

const createAndSeedAgentSessionMock = vi.mocked(createAndSeedAgentSession);
const getAgentSessionMessagesMock = vi.mocked(getAgentSessionMessages);
const getAgentSessionRuntimeStateMock = vi.mocked(getAgentSessionRuntimeState);
const sendAgentSessionMessageMock = vi.mocked(sendAgentSessionMessage);

const createOrGetPlanningSessionMock = vi.mocked(createOrGetPlanningSession);
const getRuntimeRepositoryPathMock = vi.mocked(getRuntimeRepositoryPath);
const getPlanningSessionByStackIdMock = vi.mocked(getPlanningSessionByStackId);
const setPlanningSessionAgentIdMock = vi.mocked(setPlanningSessionAgentId);
const touchPlanningSessionUpdatedAtMock = vi.mocked(
  touchPlanningSessionUpdatedAt,
);

describe('planning-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getRuntimeRepositoryPathMock.mockResolvedValue('/repo');
    getAgentSessionMessagesMock.mockResolvedValue([]);
    getAgentSessionRuntimeStateMock.mockResolvedValue('idle');
    touchPlanningSessionUpdatedAtMock.mockResolvedValue({
      id: 'session-1',
      stackId: 'stack-1',
      agentSessionId: 'opencode-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('uses project repository root when creating and loading planning session', async () => {
    createOrGetPlanningSessionMock.mockResolvedValue({
      id: 'session-1',
      stackId: 'stack-1',
      agentSessionId: undefined,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    createAndSeedAgentSessionMock.mockResolvedValue('opencode-1');
    setPlanningSessionAgentIdMock.mockResolvedValue({
      id: 'session-1',
      stackId: 'stack-1',
      agentSessionId: 'opencode-1',
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

    expect(createAndSeedAgentSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: '/repo',
      }),
    );
    expect(getAgentSessionMessagesMock).toHaveBeenCalledWith('opencode-1', {
      directory: '/repo',
    });
  });

  it('uses project repository root for planning session reads and writes', async () => {
    getPlanningSessionByStackIdMock.mockResolvedValue({
      id: 'session-1',
      stackId: 'stack-1',
      agentSessionId: 'opencode-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    sendAgentSessionMessageMock.mockResolvedValue('done');

    await loadExistingPlanningSession('stack-1');

    expect(getAgentSessionMessagesMock).toHaveBeenCalledWith('opencode-1', {
      directory: '/repo',
    });
    expect(getAgentSessionRuntimeStateMock).toHaveBeenCalledWith('opencode-1', {
      directory: '/repo',
    });

    await sendPlanningMessage('stack-1', 'hello planner');

    expect(sendAgentSessionMessageMock).toHaveBeenCalledWith(
      'opencode-1',
      'hello planner',
      expect.objectContaining({
        directory: '/repo',
      }),
    );
  });
});
