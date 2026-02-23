<script lang="ts">
  import { Badge, Spinner } from 'flowbite-svelte';
  import {
    AnnotationOutline,
    CodeMergeOutline,
    CodePullRequestOutline,
  } from 'flowbite-svelte-icons';

  import type { FeatureStage, StageSyncMetadata } from '$lib/types/stack';
  import type { ImplementationStageRuntime } from '../contracts';
  import {
    implementationStageColor,
    implementationStageLabel,
  } from '../behavior';

  let {
    stage,
    runtime,
    syncMetadata,
    onOpenReview,
  }: {
    stage: FeatureStage;
    runtime: ImplementationStageRuntime | undefined;
    syncMetadata: StageSyncMetadata;
    onOpenReview?: (stageId: string) => void;
  } = $props();

  let currentStageStatus = $derived(runtime?.stageStatus ?? stage.status);
  let currentStagePullRequest = $derived(
    runtime?.pullRequest ?? stage.pullRequest,
  );
  let canOpenReview = $derived(Boolean(currentStagePullRequest?.number));
  let stageWorking = $derived(
    currentStageStatus === 'in-progress' &&
      (runtime?.runtimeState === 'busy' || runtime?.runtimeState === 'retry'),
  );

  function openPullRequest(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
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
        <Badge
          rounded
          color="yellow"
          title={`Behind ${syncMetadata.baseRef ?? 'base'} by ${syncMetadata.behindBy} commit${syncMetadata.behindBy === 1 ? '' : 's'}`}
        >
          Out of sync
        </Badge>
      {/if}
      <Badge
        rounded
        color={implementationStageColor(currentStageStatus)}
        class="inline-flex items-center"
      >
        <span>{implementationStageLabel(currentStageStatus)}</span>
      </Badge>
      {#if currentStagePullRequest?.url && currentStagePullRequest.number}
        <button
          type="button"
          class="inline-flex cursor-pointer"
          onclick={() => openPullRequest(currentStagePullRequest.url)}
          aria-label={`Open pull request #${currentStagePullRequest.number} on GitHub`}
        >
          <Badge
            rounded
            color={currentStagePullRequest.state === 'MERGED'
              ? 'green'
              : 'blue'}
            class="inline-flex items-center gap-1"
          >
            {#if currentStagePullRequest.state === 'MERGED'}
              <CodeMergeOutline class="h-3.5 w-3.5" />
            {:else}
              <CodePullRequestOutline class="h-3.5 w-3.5" />
            {/if}
            <span>#{currentStagePullRequest.number}</span>
          </Badge>
        </button>
      {/if}
      {#if currentStagePullRequest?.number && currentStagePullRequest.commentCount !== undefined}
        <Badge
          rounded
          color="lime"
          class="inline-flex items-center gap-1"
          title="Review comments"
        >
          <AnnotationOutline class="h-3.5 w-3.5" />
          <span>{currentStagePullRequest.commentCount}</span>
        </Badge>
      {/if}
      {#if currentStageStatus === 'in-progress' && runtime}
        <p
          class="inline-flex items-center gap-1.5 whitespace-nowrap text-xs stacked-subtle"
        >
          {#if stageWorking}
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
    </div>
    {#if canOpenReview}
      <button
        type="button"
        class="rounded border border-[var(--stacked-border-soft)] px-2 py-1 text-xs stacked-subtle transition hover:text-[var(--stacked-text)]"
        onclick={() => onOpenReview?.(stage.id)}
      >
        Review
      </button>
    {/if}
  </div>
</div>
