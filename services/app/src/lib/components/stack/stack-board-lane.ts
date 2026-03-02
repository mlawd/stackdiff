import type { StackStatus } from '$lib/types/stack';

export type StackBoardLaneType = 'backlog' | 'planned' | 'in-progress' | 'done';

export const STACK_BOARD_LANE_ORDER: StackBoardLaneType[] = [
  'backlog',
  'planned',
  'in-progress',
  'done',
];

export const STACK_BOARD_LANE_STATUS: Record<StackBoardLaneType, StackStatus> =
  {
    backlog: 'created',
    planned: 'planned',
    'in-progress': 'started',
    done: 'complete',
  };

export const STACK_BOARD_LANE_TITLE: Record<StackBoardLaneType, string> = {
  backlog: 'Backlog',
  planned: 'Planned',
  'in-progress': 'In Progress',
  done: 'Done',
};

export const STACK_BOARD_LANE_ACCENT: Record<StackBoardLaneType, string> = {
  backlog: 'var(--stacked-text-muted)',
  planned: 'var(--stacked-accent-strong)',
  'in-progress': 'var(--stacked-warning)',
  done: 'var(--stacked-success)',
};
