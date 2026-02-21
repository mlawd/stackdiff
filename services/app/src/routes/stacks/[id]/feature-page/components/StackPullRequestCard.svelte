<script lang="ts">
  import type { StackPullRequest } from '$lib/types/stack';

  let { pullRequest }: { pullRequest: StackPullRequest | undefined } = $props();

  function openPullRequest(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
</script>

{#if pullRequest}
  <p class="text-xs uppercase tracking-wide stacked-subtle">Current PR</p>
  <p class="mt-1 text-sm font-semibold text-[var(--stacked-text)]">
    #{pullRequest.number}
    {pullRequest.title}
  </p>
  <p class="mt-1 text-xs stacked-subtle">
    {pullRequest.state}{pullRequest.isDraft ? ' (draft)' : ''}
  </p>
  <button
    type="button"
    onclick={() => openPullRequest(pullRequest.url)}
    class="stacked-link mt-2 inline-flex cursor-pointer text-sm font-medium"
  >
    Open on GitHub
  </button>
{/if}
