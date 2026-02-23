<script lang="ts">
  import { lockBodyScroll, portalToBody } from '$lib/client/overlay';
  import ReviewChat from '$lib/components/ReviewChat.svelte';
  import type { ReviewSessionResponse } from '../contracts';

  let {
    open,
    stackId,
    stageId,
    stageTitle,
    reviewLoading,
    reviewError,
    reviewSession,
    onClose,
  }: {
    open: boolean;
    stackId: string;
    stageId: string | null;
    stageTitle: string | null;
    reviewLoading: boolean;
    reviewError: string | null;
    reviewSession: ReviewSessionResponse | null;
    onClose: () => void;
  } = $props();

  $effect(() => {
    if (!open) {
      return;
    }

    return lockBodyScroll();
  });
</script>

{#if open}
  <div
    use:portalToBody
    class="fixed inset-0 z-50 flex h-screen w-screen flex-col bg-[var(--stacked-bg)]"
    role="dialog"
    aria-modal="true"
    aria-label="Review chat"
  >
    <div
      class="flex items-start justify-between gap-3 border-b stacked-divider px-4 py-3 sm:px-6 sm:py-4"
    >
      <div>
        <p
          class="text-xs font-semibold uppercase tracking-[0.16em] stacked-subtle"
        >
          Review chat
        </p>
        {#if stageTitle}
          <p class="mt-1 text-sm text-[var(--stacked-text)]">
            {stageTitle}
          </p>
        {/if}
      </div>
      <button
        type="button"
        class="rounded border border-[var(--stacked-border-soft)] px-2.5 py-1 text-xs stacked-subtle transition hover:text-[var(--stacked-text)]"
        onclick={onClose}
      >
        Close
      </button>
    </div>

    <div class="min-h-0 flex-1 px-4 py-3 sm:px-6 sm:py-4">
      {#if reviewError}
        <div
          class="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
        >
          {reviewError}
        </div>
      {/if}

      {#if reviewLoading}
        <p class="text-sm stacked-subtle">Loading review session...</p>
      {:else if reviewSession && stageId}
        <ReviewChat
          {stackId}
          {stageId}
          messages={reviewSession.messages}
          awaitingResponse={reviewSession.awaitingResponse}
        />
      {/if}
    </div>
  </div>
{/if}
