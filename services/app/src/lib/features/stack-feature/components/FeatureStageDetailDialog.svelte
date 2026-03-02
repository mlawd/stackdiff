<script lang="ts">
  import { portalToBody } from '$lib/client/overlay';
  import BodyScrollLock from '$lib/components/BodyScrollLock.svelte';
  import { renderMarkdown } from '$lib/markdown';
  import type { FeatureStage, FeatureStageStatus } from '$lib/types/stack';
  import {
    implementationStageColor,
    implementationStageLabel,
  } from '../behavior';

  let {
    open,
    stackName,
    stage,
    status,
    onClose,
  }: {
    open: boolean;
    stackName: string;
    stage: FeatureStage | null;
    status: FeatureStageStatus | null;
    onClose: () => void;
  } = $props();

  const hasDetails = $derived(Boolean(stage?.details?.trim()));
  const renderedDetails = $derived(
    hasDetails ? renderMarkdown(stage?.details ?? '') : '',
  );
  const statusLabel = $derived(
    status ? implementationStageLabel(status) : 'Not started',
  );
  const statusColor = $derived(
    status ? implementationStageColor(status) : 'gray',
  );

  function setMarkdown(html: string) {
    return (node: HTMLElement) => {
      node.innerHTML = html;
    };
  }
</script>

{#if open && stage}
  <div
    use:portalToBody
    class="fixed inset-0 z-50 flex h-screen w-screen flex-col bg-[var(--stacked-bg)]"
    role="dialog"
    aria-modal="true"
    aria-label="Stage details"
    tabindex="-1"
  >
    <BodyScrollLock />
    <header
      class="flex items-start justify-between gap-3 border-b stacked-divider px-4 py-3 sm:px-6 sm:py-4"
    >
      <div class="min-w-0">
        <p
          class="truncate text-xs font-semibold uppercase tracking-[0.16em] stacked-subtle"
        >
          {stackName}
        </p>
        <p class="mt-1 text-sm text-[var(--stacked-text)]">{stage.title}</p>
      </div>
      <button
        type="button"
        class="rounded border border-[var(--stacked-border-soft)] px-2.5 py-1 text-xs stacked-subtle transition hover:text-[var(--stacked-text)]"
        onclick={onClose}
      >
        Close
      </button>
    </header>

    <section
      class="stacked-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5"
    >
      {#if hasDetails}
        <div
          class="stacked-markdown text-sm stacked-subtle"
          {@attach setMarkdown(renderedDetails)}
        ></div>
      {:else}
        <p class="text-sm stacked-subtle">
          No stage details were provided for this implementation stage.
        </p>
      {/if}
    </section>
  </div>
{/if}
