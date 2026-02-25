import { describe, expect, it, vi } from 'vitest';

import type { FeatureStage } from '$lib/types/stack';

import {
  fetchRuntimeUpdateEntries,
  mergeRuntimeByStageId,
} from './runtime-polling';
import type { ImplementationStageRuntime } from './contracts';

describe('runtime polling helpers', () => {
  it('maps API payloads to runtime entries', async () => {
    const fetchStatus = vi.fn(async () => ({
      stageStatus: 'review' as const,
      runtimeState: 'idle' as const,
      todoCompleted: 3,
      todoTotal: 4,
    }));
    const stages: FeatureStage[] = [
      { id: 's-1', title: 'Stage 1', status: 'in-progress' },
    ];

    const result = await fetchRuntimeUpdateEntries({
      stackId: 'stack-1',
      stages,
      implementationRuntimeByStageId: {},
      fetchStatus,
    });

    expect(fetchStatus).toHaveBeenCalledWith('stack-1', 's-1');
    expect(result).toEqual([
      [
        's-1',
        {
          stageStatus: 'review',
          runtimeState: 'idle',
          todoCompleted: 3,
          todoTotal: 4,
          approvedCommitSha: undefined,
          pullRequest: undefined,
        },
      ],
    ]);
  });

  it('falls back to missing runtime state when status request fails', async () => {
    const fetchStatus = vi.fn(async () => {
      throw new Error('failed');
    });
    const stages: FeatureStage[] = [
      { id: 's-1', title: 'Stage 1', status: 'in-progress' },
    ];

    const result = await fetchRuntimeUpdateEntries({
      stackId: 'stack-1',
      stages,
      implementationRuntimeByStageId: {},
      fetchStatus,
    });

    expect(result).toEqual([
      [
        's-1',
        {
          stageStatus: 'in-progress',
          runtimeState: 'missing',
          todoCompleted: 0,
          todoTotal: 0,
          approvedCommitSha: undefined,
          pullRequest: undefined,
        },
      ],
    ]);
  });

  it('merges runtime updates by stage id', () => {
    const current: Record<string, ImplementationStageRuntime> = {
      's-1': {
        stageStatus: 'in-progress',
        runtimeState: 'busy',
        todoCompleted: 1,
        todoTotal: 4,
      },
    };

    const merged = mergeRuntimeByStageId(current, [
      [
        's-1',
        {
          stageStatus: 'review',
          runtimeState: 'idle',
          todoCompleted: 4,
          todoTotal: 4,
        },
      ],
      [
        's-2',
        {
          stageStatus: 'in-progress',
          runtimeState: 'busy',
          todoCompleted: 0,
          todoTotal: 3,
        },
      ],
    ]);

    expect(merged).toEqual({
      's-1': {
        stageStatus: 'review',
        runtimeState: 'idle',
        todoCompleted: 4,
        todoTotal: 4,
      },
      's-2': {
        stageStatus: 'in-progress',
        runtimeState: 'busy',
        todoCompleted: 0,
        todoTotal: 3,
      },
    });
  });
});
