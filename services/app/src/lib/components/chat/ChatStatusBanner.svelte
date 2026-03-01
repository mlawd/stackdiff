<script lang="ts">
  import { getChatPanelContext } from '$lib/components/chat/chat-panel-context.svelte';

  const chatPanel = getChatPanelContext();
</script>

{#if chatPanel.errorMessage}
  <div
    class="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
  >
    {chatPanel.errorMessage}
  </div>
{/if}

{#if chatPanel.successMessage}
  <div
    class="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
  >
    {chatPanel.successMessage}
  </div>
{/if}
