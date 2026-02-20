<script lang="ts">
	import { Spinner } from 'flowbite-svelte';
	import { implementationStageClass, implementationStageLabel } from '../behavior';
	import type { ImplementationStageRuntime } from '../contracts';
	import type {
		FeatureStageStatus,
		StageDiffabilityMetadata,
		StageSyncMetadata,
		StackPullRequest,
		StackViewModel
	} from '$lib/types/stack';

	let {
		stack,
		syncError,
		syncSuccess,
		startError,
		startSuccess,
		implementationRuntimeByStageId,
		canSyncStack,
		syncStackButtonLabel,
		onSyncStack,
		canStartFeature,
		startButtonLabel,
		onStartFeature,
		stageStatus,
		stagePullRequest,
		isStageAgentWorking,
		canOpenStageDiff,
		stageSyncMetadata,
		stageDiffability,
		onOpenStageDiff,
		onOpenStackPullRequest
	}: {
		stack: StackViewModel;
		syncError: string | null;
		syncSuccess: string | null;
		startError: string | null;
		startSuccess: string | null;
		implementationRuntimeByStageId: Record<string, ImplementationStageRuntime>;
		canSyncStack: () => boolean;
		syncStackButtonLabel: () => string;
		onSyncStack: () => void;
		canStartFeature: () => boolean;
		startButtonLabel: () => string;
		onStartFeature: () => void;
		stageStatus: (stageId: string, fallback: FeatureStageStatus) => FeatureStageStatus;
		stagePullRequest: (stageId: string, fallback?: StackPullRequest) => StackPullRequest | undefined;
		isStageAgentWorking: (stageId: string) => boolean;
		canOpenStageDiff: (stageId: string) => boolean;
		stageSyncMetadata: (stageId: string) => StageSyncMetadata;
		stageDiffability: (stageId: string) => StageDiffabilityMetadata;
		onOpenStageDiff: (stageId: string, stageTitle: string) => void;
		onOpenStackPullRequest: () => void;
	} = $props();
</script>

<div class="space-y-4">
	{#if syncError}
		<div class="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
			{syncError}
		</div>
	{/if}

	{#if syncSuccess}
		<div class="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
			{syncSuccess}
		</div>
	{/if}

	{#if startError}
		<div class="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
			{startError}
		</div>
	{/if}

	{#if startSuccess}
		<div class="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
			{startSuccess}
		</div>
	{/if}

	<div class="stacked-panel-elevated p-4">
		<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
			<p class="text-xs font-semibold uppercase tracking-[0.16em] stacked-subtle">Implementation stages</p>
			<div class="flex flex-wrap items-center gap-2">
				<button
					type="button"
					onclick={onSyncStack}
					disabled={!canSyncStack()}
					class="cursor-pointer rounded-lg border border-[var(--stacked-border-soft)] bg-transparent px-3 py-1.5 text-xs font-semibold text-[var(--stacked-text)] transition hover:border-[var(--stacked-accent)] disabled:cursor-not-allowed disabled:opacity-70"
				>
					{syncStackButtonLabel()}
				</button>
				<button
					type="button"
					onclick={onStartFeature}
					disabled={!canStartFeature()}
					class="cursor-pointer rounded-lg border border-[var(--stacked-accent)] bg-[var(--stacked-accent)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#2a97ff] disabled:cursor-not-allowed disabled:opacity-70"
				>
					{startButtonLabel()}
				</button>
			</div>
		</div>
		{#if stack.stages && stack.stages.length > 0}
			<div class="space-y-2">
				{#each stack.stages as implementationStage (implementationStage.id)}
					{@const stageRuntime = implementationRuntimeByStageId[implementationStage.id]}
					{@const currentStageStatus = stageStatus(implementationStage.id, implementationStage.status)}
					{@const currentStagePullRequest = stagePullRequest(
						implementationStage.id,
						implementationStage.pullRequest
					)}
					{@const stageWorking = currentStageStatus === 'in-progress' && isStageAgentWorking(implementationStage.id)}
					{@const stageCanOpenDiff = canOpenStageDiff(implementationStage.id)}
					{@const stageDiffMeta = stageDiffability(implementationStage.id)}
					{@const stageSyncMeta = stageSyncMetadata(implementationStage.id)}
					<div class="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-3 py-2">
						<div>
							<p class="text-sm font-medium text-[var(--stacked-text)]">{implementationStage.title}</p>
							{#if implementationStage.details}
								<p class="mt-1 text-xs stacked-subtle">{implementationStage.details}</p>
							{/if}
							{#if stageCanOpenDiff}
								<p class="mt-1 text-xs stacked-subtle">Branch: {stageDiffMeta.branchName}</p>
							{:else if currentStageStatus !== 'not-started'}
								<p class="mt-1 text-xs text-amber-300">
									{stageDiffMeta.reasonIfNotDiffable ?? 'Stage diff is unavailable.'}
								</p>
							{/if}
						</div>
						<div class="flex flex-wrap items-center justify-end gap-2">
							{#if stageSyncMeta.isOutOfSync}
								<span
									class="stacked-chip stacked-chip-warning"
									title={`Behind ${stageSyncMeta.baseRef ?? 'base'} by ${stageSyncMeta.behindBy} commit${stageSyncMeta.behindBy === 1 ? '' : 's'}`}
								>
									Out of sync
								</span>
							{/if}
							{#if stageCanOpenDiff}
								<button
									type="button"
									onclick={() => onOpenStageDiff(implementationStage.id, implementationStage.title)}
									title={`Open diff for ${implementationStage.title}`}
									class="stacked-chip stacked-chip-review cursor-pointer"
								>
									View diff
								</button>
							{/if}
							<span class={`${implementationStageClass(currentStageStatus)} ${stageWorking ? 'stacked-chip-no-dot' : ''} inline-flex items-center gap-1.5`}>
								{#if stageWorking}
									<Spinner
										size="4"
										currentFill="var(--stacked-accent)"
										currentColor="color-mix(in oklab, var(--stacked-border-soft) 82%, #9aa3b7 18%)"
										class="opacity-90"
									/>
								{/if}
								<span>{implementationStageLabel(currentStageStatus)}</span>
							</span>
							{#if currentStagePullRequest?.url && currentStagePullRequest.number}
								<a
									href={currentStagePullRequest.url}
									target="_blank"
									rel="noopener noreferrer"
									class="stacked-link text-xs font-medium"
								>
									PR #{currentStagePullRequest.number}
								</a>
							{/if}
							{#if currentStageStatus === 'in-progress' && stageRuntime}
								<p class="text-xs stacked-subtle whitespace-nowrap">{stageRuntime.todoCompleted}/{stageRuntime.todoTotal} Todos done</p>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{:else}
			<p class="text-sm stacked-subtle">Save a plan in planning chat to generate implementation stages.</p>
		{/if}
	</div>

	<div class="stacked-panel-elevated p-4">
		{#if stack.pullRequest}
			<p class="text-xs uppercase tracking-wide stacked-subtle">Current PR</p>
			<p class="mt-1 text-sm font-semibold text-[var(--stacked-text)]">
				#{stack.pullRequest.number} {stack.pullRequest.title}
			</p>
			<p class="mt-1 text-xs stacked-subtle">
				{stack.pullRequest.state}{stack.pullRequest.isDraft ? ' (draft)' : ''}
			</p>
			<button
				type="button"
				onclick={onOpenStackPullRequest}
				class="stacked-link mt-2 cursor-pointer text-sm font-medium"
			>
				Open on GitHub
			</button>
		{:else}
			<p class="text-sm stacked-subtle">No active PR for this branch yet.</p>
		{/if}
	</div>
</div>
