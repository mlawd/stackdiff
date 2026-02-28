<script lang="ts">
  import { BrainSolid } from 'flowbite-svelte-icons';

  import { renderMarkdown } from '$lib/markdown';
  import type { PlanningMessage } from '$lib/types/stack';

  import type { StreamingAssistantMessage } from './chat-types';
  import ChatMessageBubble from './ChatMessageBubble.svelte';

  interface Props {
    messages: PlanningMessage[];
    streamingAssistantMessages: StreamingAssistantMessage[];
    sending: boolean;
    emptyTitle: string;
    emptyDescription: string;
  }

  let {
    messages,
    streamingAssistantMessages,
    sending,
    emptyTitle,
    emptyDescription,
  }: Props = $props();
</script>

{#if messages.length === 0 && !sending}
  <div class="stacked-chat-font h-full content-center text-sm stacked-subtle">
    <p class="mb-2 font-semibold text-[var(--stacked-text)]">{emptyTitle}</p>
    <p>{emptyDescription}</p>
  </div>
{:else}
  <div class="space-y-3">
    {#each messages as message, messageIndex (message.id)}
      <ChatMessageBubble {message} {messageIndex} {messages} />
    {/each}

    {#if sending}
      {#each streamingAssistantMessages as streamingMessage (streamingMessage.key)}
        <div class="stacked-chat-font flex items-start gap-2">
          <BrainSolid class="mt-0.5 h-8 w-8 shrink-0 opacity-80" />
          <div
            class="mr-auto w-fit max-w-[90%] rounded-2xl rounded-tl-none border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-4 py-3 text-sm text-[var(--stacked-text)]"
          >
            <p class="mb-1 text-[11px] uppercase tracking-wide opacity-70">
              <span>agent</span>
            </p>
            <div class="stacked-markdown">
              {@html renderMarkdown(streamingMessage.content)}
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>
{/if}
