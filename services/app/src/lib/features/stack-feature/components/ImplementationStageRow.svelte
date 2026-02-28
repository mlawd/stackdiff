<script lang="ts">
  import { Badge, Spinner } from 'flowbite-svelte';
  import {
    AnnotationOutline,
    ClipboardCheckOutline,
    CodeMergeOutline,
    CodePullRequestOutline,
  } from 'flowbite-svelte-icons';

  import type { FeatureStage, StageSyncMetadata } from '$lib/types/stack';
  import type { ImplementationStageRuntime } from '../contracts';
  import {
    implementationStageColor,
    implementationStageLabel,
  } from '../behavior';
  import { toImplementationStageRowModel } from '../implementation-stage-row-model';

  let {
    stage,
    runtime,
    syncMetadata,
    onOpenReview,
    onApproveStage,
    onMergeStage,
  }: {
    stage: FeatureStage;
    runtime: ImplementationStageRuntime | undefined;
    syncMetadata: StageSyncMetadata;
    onOpenReview?: (stageId: string) => void;
    onApproveStage?: (stageId: string) => void;
    onMergeStage?: (stageId: string) => void;
  } = $props();

  let model = $derived(
    toImplementationStageRowModel({
      stage,
      runtime,
      syncMetadata,
    }),
  );

  function openPullRequest(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function openCurrentPullRequest(): void {
    const url = model.pullRequest?.url;
    if (!url) {
      return;
    }

    openPullRequest(url);
  }
</script>

<div
  class="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-3 py-2"
>
  <div>
    <p class="text-sm font-medium text-[var(--stacked-text)]">
      {stage.title}
    </p>
    {#if stage.details}
      <p class="mt-1 text-xs stacked-subtle">
        {stage.details}
      </p>
    {/if}
  </div>
  <div class="flex w-full items-center justify-between gap-2">
    <div class="flex flex-wrap items-center gap-2">
      {#if syncMetadata.isOutOfSync}
        <Badge rounded color="yellow" title={model.outOfSyncTitle}>
          Out of sync
        </Badge>
      {/if}
      <Badge
        rounded
        color={implementationStageColor(model.stageStatus)}
        class="inline-flex items-center"
      >
        <span>{implementationStageLabel(model.stageStatus)}</span>
      </Badge>
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
      {#if model.stageStatus === 'in-progress' && runtime}
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
          {runtime.todoCompleted}/{runtime.todoTotal} Todos done
        </p>
      {/if}
      {#if model.checks && model.checks.total > 0}
        <div class="group relative inline-flex">
          <button
            type="button"
            class="inline-flex cursor-help items-center gap-1.5 whitespace-nowrap border-0 bg-transparent p-0 text-xs stacked-subtle"
            aria-label="Pull request checks summary"
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
          </button>
          <div
            class="pointer-events-none absolute left-0 top-full z-20 mt-1 min-w-64 rounded-lg border border-[var(--stacked-border-soft)] bg-[color-mix(in_oklab,var(--stacked-bg-soft)_94%,#05070d_6%)] p-2 text-xs text-[var(--stacked-text)] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            {#if model.checks.items.length > 0}
              {#each model.checks.items as item, index (`${item.name}:${item.status}:${index}`)}
                <p class="truncate">
                  {item.name}: {item.status}
                </p>
              {/each}
            {:else}
              <p>No check details available.</p>
            {/if}
          </div>
        </div>
      {/if}
    </div>
    {#if model.canOpenReview}
      <div class="flex items-center gap-2">
        {#if model.canApprove || model.canMerge}
          <button
            type="button"
            class="rounded border border-lime-500/40 bg-lime-500/10 px-2 py-1 text-xs text-lime-100 transition hover:bg-lime-500/20"
            onclick={() =>
              model.canMerge
                ? onMergeStage?.(stage.id)
                : onApproveStage?.(stage.id)}
          >
            {model.canMerge ? 'Merge' : 'Approve'}
          </button>
        {/if}
        <button
          type="button"
          class="rounded border border-[var(--stacked-border-soft)] px-2 py-1 text-xs stacked-subtle transition hover:text-[var(--stacked-text)]"
          onclick={() => onOpenReview?.(stage.id)}
        >
          Review
        </button>
      </div>
    {/if}
  </div>
</div>
