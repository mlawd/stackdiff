<script lang="ts">
  import { Badge, Spinner } from 'flowbite-svelte';
  import {
    AnnotationOutline,
    ClipboardCheckOutline,
    CodeMergeOutline,
    CodePullRequestOutline,
  } from 'flowbite-svelte-icons';

  import { toImplementationStageRowModel } from '../implementation-stage-row-model';
  import type { StageKanbanItem } from '../stage-kanban-item';

  let {
    item,
  }: {
    item: StageKanbanItem;
  } = $props();

  let model = $derived(
    toImplementationStageRowModel({
      stage: item.stage,
      runtime: item.runtime,
      syncMetadata: item.syncMetadata,
    }),
  );

  function openPullRequest(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function openCurrentPullRequest(event?: Event): void {
    event?.stopPropagation();

    const url = model.pullRequest?.url;
    if (!url) {
      return;
    }

    openPullRequest(url);
  }
</script>

{#if item.syncMetadata.isOutOfSync}
  <Badge rounded color="yellow" title={model.outOfSyncTitle}>Out of sync</Badge>
{/if}
{#if model.pullRequest?.url && model.pullRequest.number}
  <button
    type="button"
    class="inline-flex cursor-pointer"
    onclick={openCurrentPullRequest}
    aria-label={`Open pull request #${model.pullRequest?.number ?? ''} on GitHub`}
  >
    <Badge
      rounded
      color={model.pullRequest.state === 'MERGED' ? 'green' : 'blue'}
      class="inline-flex items-center gap-1"
    >
      {#if model.pullRequest.state === 'MERGED'}
        <CodeMergeOutline class="h-3.5 w-3.5" />
      {:else}
        <CodePullRequestOutline class="h-3.5 w-3.5" />
      {/if}
      <span>#{model.pullRequest.number}</span>
    </Badge>
  </button>
{/if}
{#if model.pullRequest?.number && model.pullRequest.commentCount !== undefined && model.pullRequest.state !== 'MERGED'}
  <Badge
    rounded
    color="lime"
    class="inline-flex items-center gap-1"
    title="Review comments"
  >
    <AnnotationOutline class="h-3.5 w-3.5" />
    <span>{model.pullRequest.commentCount}</span>
  </Badge>
{/if}
{#if model.stageStatus === 'in-progress' && item.runtime}
  <p
    class="inline-flex items-center gap-1.5 whitespace-nowrap text-xs stacked-subtle"
  >
    {#if model.stageWorking}
      <Spinner
        size="4"
        currentFill="var(--stacked-accent)"
        currentColor="color-mix(in oklab, var(--stacked-border-soft) 82%, #9aa3b7 18%)"
        class="opacity-90"
      />
    {/if}
    {item.runtime.todoCompleted}/{item.runtime.todoTotal} Todos done
  </p>
{/if}
{#if model.checks && model.checks.total > 0}
  <p
    class="inline-flex items-center gap-1.5 whitespace-nowrap text-xs stacked-subtle"
  >
    <ClipboardCheckOutline class="h-3.5 w-3.5" />
    {#if model.checksWorking}
      <Spinner
        size="4"
        currentFill="var(--stacked-accent)"
        currentColor="color-mix(in oklab, var(--stacked-border-soft) 82%, #9aa3b7 18%)"
        class="opacity-90"
      />
    {/if}
    {model.checksSummaryLabel}
  </p>
{/if}
