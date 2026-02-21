<script lang="ts">
  import { Badge, Spinner } from 'flowbite-svelte';
  import { CodeMergeOutline, CodePullRequestOutline } from 'flowbite-svelte-icons';

  import type {
    FeatureStage,
    FeatureStageStatus,
    StageSyncMetadata,
  } from '$lib/types/stack';
  import type { ImplementationStageRuntime } from '../contracts';
  import { implementationStageLabel } from '../behavior';

  let {
    stage,
    runtime,
    syncMetadata,
  }: {
    stage: FeatureStage;
    runtime: ImplementationStageRuntime | undefined;
    syncMetadata: StageSyncMetadata;
  } = $props();

  let currentStageStatus = $derived(runtime?.stageStatus ?? stage.status);
  let currentStagePullRequest = $derived(runtime?.pullRequest ?? stage.pullRequest);
  let stageWorking = $derived(
    currentStageStatus === 'in-progress' &&
      (runtime?.runtimeState === 'busy' || runtime?.runtimeState === 'retry'),
  );

  function openPullRequest(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function stageStatusColor(
    status: FeatureStageStatus,
  ): 'gray' | 'yellow' | 'green' | 'purple' {
    if (status === 'done') {
      return 'green';
    }

    if (status === 'review-ready') {
      return 'purple';
    }

    if (status === 'in-progress') {
      return 'yellow';
    }

    return 'gray';
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
  <div class="flex flex-wrap items-center justify-end gap-2">
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
      color={stageStatusColor(currentStageStatus)}
      class="inline-flex items-center gap-1.5"
    >
      {#if stageWorking}
        <Spinner
          size="4"
          currentFill="var(--stacked-accent)"
          currentColor="color-mix(in oklab, var(--stacked-border-soft) 82%, #9aa3b7 18%)"
          class="opacity-90"
        />
      {/if}
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
          color={currentStagePullRequest.state === 'MERGED' ? 'green' : 'blue'}
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
    {#if currentStageStatus === 'in-progress' && runtime}
      <p class="text-xs stacked-subtle whitespace-nowrap">
        {runtime.todoCompleted}/{runtime.todoTotal} Todos done
      </p>
    {/if}
  </div>
</div>
