<script lang="ts">
  import { getChatPanelContext } from '$lib/components/chat/chat-panel-context.svelte';
  import ChatMessageBubble from './ChatMessageBubble.svelte';

  interface Props {
    emptyTitle: string;
    emptyDescription: string;
  }

  let { emptyTitle, emptyDescription }: Props = $props();

  const chatPanel = getChatPanelContext();
</script>

{#if chatPanel.messages.length === 0 && !chatPanel.sending}
  <div class="stacked-chat-font h-full content-center text-sm stacked-subtle">
    <p class="mb-2 font-semibold text-[var(--stacked-text)]">{emptyTitle}</p>
    <p>{emptyDescription}</p>
  </div>
{:else}
  <div class="space-y-3">
    {#each chatPanel.messages as message, messageIndex (message.id)}
      <ChatMessageBubble
        {message}
        {messageIndex}
        messages={chatPanel.messages}
      />
    {/each}

    {#if chatPanel.sending}
      {#each chatPanel.streamingAssistantMessages as streamingMessage, streamingIndex (streamingMessage.key)}
        <ChatMessageBubble
          message={{
            id: `streaming-${streamingMessage.key}`,
            role: 'assistant',
            content: streamingMessage.content,
            createdAt: new Date(0).toISOString(),
          }}
          messageIndex={chatPanel.messages.length + streamingIndex}
          messages={chatPanel.messages}
        />
      {/each}
    {/if}
  </div>
{/if}
