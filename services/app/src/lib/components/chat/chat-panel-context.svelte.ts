import { getContext, setContext } from 'svelte';

import type { ChatPanelViewModel } from '$lib/components/chat/use-chat-panel.svelte';

const CHAT_PANEL_CONTEXT_KEY = Symbol('chat-panel-context');

export function setChatPanelContext(
  value: ChatPanelViewModel,
): ChatPanelViewModel {
  setContext(CHAT_PANEL_CONTEXT_KEY, value);
  return value;
}

export function getChatPanelContext(): ChatPanelViewModel {
  const context = getContext<ChatPanelViewModel | undefined>(
    CHAT_PANEL_CONTEXT_KEY,
  );

  if (!context) {
    throw new Error('Chat panel context is unavailable.');
  }

  return context;
}
