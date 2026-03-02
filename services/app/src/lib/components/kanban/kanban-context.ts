import { getContext, setContext } from 'svelte';
import type { Snippet } from 'svelte';

const KANBAN_CONTEXT_KEY = Symbol('kanban-context');

export interface KanbanContextValue<TItem> {
  getOnCardClick: () => ((item: TItem) => void) | undefined;
  getCardStatus: () => Snippet<[TItem]> | undefined;
}

export function setKanbanContext<TItem>(
  value: KanbanContextValue<TItem>,
): KanbanContextValue<TItem> {
  setContext(KANBAN_CONTEXT_KEY, value as KanbanContextValue<unknown>);
  return value;
}

export function getKanbanContext<TItem>(): KanbanContextValue<TItem> {
  const context = getContext<KanbanContextValue<unknown> | undefined>(
    KANBAN_CONTEXT_KEY,
  );

  if (!context) {
    throw new Error('Kanban context is unavailable.');
  }

  return context as KanbanContextValue<TItem>;
}
