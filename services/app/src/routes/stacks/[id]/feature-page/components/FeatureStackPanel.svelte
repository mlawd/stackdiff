<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Spinner } from 'flowbite-svelte';
	import {
		canStartFeature as canStartFeatureWithRuntime,
		implementationStageClass,
		implementationStageLabel,
		stagePullRequest as resolveStagePullRequest,
		stageStatus as resolveStageStatus,
		startButtonLabel as startButtonLabelWithRuntime
	} from '../behavior';
	import type {
		ImplementationStageRuntime,
		ImplementationStatusResponse,
		StartResponse
	} from '../contracts';
	import type { FeatureStageStatus, StageSyncMetadata, StackPullRequest, StackViewModel } from '$lib/types/stack';

	interface SyncStackResponse {
		result?: {
			totalStages: number;
			rebasedStages: number;
			skippedStages: number;
		};
		error?: {
			code?: string;
			message?: string;
		};
	}

	let { stack }: { stack: StackViewModel } = $props();

	let startPending = $state(false);
	let startError = $state<string | null>(null);
	let startSuccess = $state<string | null>(null);
	let syncPending = $state(false);
	let syncError = $state<string | null>(null);
	let syncSuccess = $state<string | null>(null);
	let implementationRuntimeByStageId = $state<Record<string, ImplementationStageRuntime>>({});
	let runtimeInvalidating = false;

	function stageSyncMetadata(stageId: string): StageSyncMetadata {
		return (
			stack.stageSyncById?.[stageId] ?? {
				isOutOfSync: false,
				behindBy: 0,
				reasonIfUnavailable: 'Stage sync status is unavailable.'
			}
		);
	}

	function hasOutOfSyncStages(): boolean {
		return (stack.stages ?? []).some((stage) => stageSyncMetadata(stage.id).isOutOfSync);
	}

	function canSyncStack(): boolean {
		return hasOutOfSyncStages() && !syncPending && !startPending;
	}

	function syncStackButtonLabel(): string {
		if (syncPending) {
			return 'Syncing...';
		}

		return 'Sync Stack';
	}

	function canStartFeature(): boolean {
		return (
			canStartFeatureWithRuntime({
				stages: stack.stages ?? [],
				implementationRuntimeByStageId,
				startPending
			}) && !syncPending
		);
	}

	function startButtonLabel(): string {
		return startButtonLabelWithRuntime({
			stages: stack.stages ?? [],
			implementationRuntimeByStageId,
			startPending
		});
	}

	function stageStatus(stageId: string, fallback: FeatureStageStatus): FeatureStageStatus {
		return resolveStageStatus(implementationRuntimeByStageId, stageId, fallback);
	}

	function stagePullRequest(stageId: string, fallback?: StackPullRequest): StackPullRequest | undefined {
		return resolveStagePullRequest(implementationRuntimeByStageId, stageId, fallback);
	}

	function stageIdsForRuntimePolling(): string[] {
		return (stack.stages ?? [])
			.filter((stage) => {
				const currentStatus = stageStatus(stage.id, stage.status);
				const currentPullRequest = stagePullRequest(stage.id, stage.pullRequest);
				return currentStatus === 'in-progress' || (currentStatus === 'review-ready' && !currentPullRequest?.number);
			})
			.map((stage) => stage.id);
	}

	function isStageAgentWorking(stageId: string): boolean {
		const runtime = implementationRuntimeByStageId[stageId];
		return runtime?.runtimeState === 'busy' || runtime?.runtimeState === 'retry';
	}

	async function refreshImplementationRuntime(): Promise<void> {
		const stageIds = stageIdsForRuntimePolling();
		if (stageIds.length === 0) {
			return;
		}

		let shouldInvalidate = false;

		const entries = await Promise.all(
			stageIds.map(async (stageId) => {
				const stageEntry = (stack.stages ?? []).find((stage) => stage.id === stageId);
				const fallbackStatus = stageEntry ? stageStatus(stageId, stageEntry.status) : 'in-progress';

				try {
					const response = await fetch(`/api/stacks/${stack.id}/stages/${stageId}/implementation/status`);
					const payload = (await response.json()) as ImplementationStatusResponse;
					if (!response.ok) {
						throw new Error(payload.error ?? 'Unable to load implementation status.');
					}

					return [
						stageId,
						{
							stageStatus: payload.stageStatus ?? fallbackStatus,
							runtimeState: payload.runtimeState ?? 'missing',
							todoCompleted: payload.todoCompleted ?? 0,
							todoTotal: payload.todoTotal ?? 0,
							pullRequest: payload.pullRequest
						} satisfies ImplementationStageRuntime
					] as const;
				} catch {
					return [
						stageId,
						{
							stageStatus: fallbackStatus,
							runtimeState: 'missing',
							todoCompleted: 0,
							todoTotal: 0,
							pullRequest: undefined
						} satisfies ImplementationStageRuntime
					] as const;
				}
			})
		);

		implementationRuntimeByStageId = {
			...implementationRuntimeByStageId,
			...Object.fromEntries(entries)
		};

		for (const [stageId, runtime] of entries) {
			const stageEntry = (stack.stages ?? []).find((stage) => stage.id === stageId);
			if (!stageEntry) {
				continue;
			}

			if (stageEntry.status === 'in-progress' && runtime.stageStatus !== 'in-progress') {
				shouldInvalidate = true;
			}

			if (runtime.pullRequest && !stageEntry.pullRequest?.number) {
				shouldInvalidate = true;
			}
		}

		if (shouldInvalidate && !runtimeInvalidating) {
			runtimeInvalidating = true;
			try {
				await invalidateAll();
			} finally {
				runtimeInvalidating = false;
			}
		}
	}

	$effect(() => {
		const stageIds = stageIdsForRuntimePolling();
		if (stageIds.length === 0) {
			return;
		}

		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const poll = async () => {
			await refreshImplementationRuntime();
			if (cancelled) {
				return;
			}

			timer = setTimeout(poll, 2000);
		};

		void poll();

		return () => {
			cancelled = true;
			if (timer !== undefined) {
				clearTimeout(timer);
			}
		};
	});

	function openStackPullRequest(): void {
		const pullRequestUrl = stack.pullRequest?.url;
		if (!pullRequestUrl) {
			return;
		}

		window.open(pullRequestUrl, '_blank', 'noopener,noreferrer');
	}

	async function startFeature(): Promise<void> {
		if (!canStartFeature()) {
			return;
		}

		startPending = true;
		startError = null;
		startSuccess = null;
		syncError = null;

		try {
			const response = await fetch(`/api/stacks/${stack.id}/start`, { method: 'POST' });
			const body = (await response.json()) as StartResponse;
			if (!response.ok) {
				throw new Error(body.error ?? 'Unable to start feature.');
			}

			const titledStage = body.stageTitle?.trim();
			const stageLabel = body.stageNumber
				? titledStage
					? `stage ${body.stageNumber}: ${titledStage}`
					: `stage ${body.stageNumber}`
				: 'next stage';
			const mode = body.startedNow ? `Started ${stageLabel}.` : `${stageLabel} is already running.`;
			const worktreeState = body.reusedWorktree ? 'Reused existing worktree.' : 'Created worktree.';
			const sessionState = body.reusedSession ? 'Reused implementation session.' : 'Created implementation session.';
			startSuccess = `${mode} ${worktreeState} ${sessionState}`;
			await invalidateAll();
		} catch (error) {
			startError = error instanceof Error ? error.message : 'Unable to start feature.';
		} finally {
			startPending = false;
		}
	}

	async function syncStack(): Promise<void> {
		if (!canSyncStack()) {
			return;
		}

		syncPending = true;
		syncError = null;
		syncSuccess = null;
		startError = null;

		try {
			const response = await fetch(`/api/stacks/${stack.id}/sync`, { method: 'POST' });
			const body = (await response.json()) as SyncStackResponse;
			if (!response.ok) {
				throw new Error(body.error?.message ?? 'Unable to sync stack.');
			}

			const rebased = body.result?.rebasedStages ?? 0;
			const skipped = body.result?.skippedStages ?? 0;
			syncSuccess = `Stack sync complete. Rebases: ${rebased}. Skipped: ${skipped}.`;
			await invalidateAll();
		} catch (error) {
			syncError = error instanceof Error ? error.message : 'Unable to sync stack.';
		} finally {
			syncPending = false;
		}
	}
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
					onclick={syncStack}
					disabled={!canSyncStack()}
					class="cursor-pointer rounded-lg border border-[var(--stacked-border-soft)] bg-transparent px-3 py-1.5 text-xs font-semibold text-[var(--stacked-text)] transition hover:border-[var(--stacked-accent)] disabled:cursor-not-allowed disabled:opacity-70"
				>
					{syncStackButtonLabel()}
				</button>
				<button
					type="button"
					onclick={startFeature}
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
					{@const stageSyncMeta = stageSyncMetadata(implementationStage.id)}
					<div class="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-3 py-2">
						<div>
							<p class="text-sm font-medium text-[var(--stacked-text)]">{implementationStage.title}</p>
							{#if implementationStage.details}
								<p class="mt-1 text-xs stacked-subtle">{implementationStage.details}</p>
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
				onclick={openStackPullRequest}
				class="stacked-link mt-2 cursor-pointer text-sm font-medium"
			>
				Open on GitHub
			</button>
		{:else}
			<p class="text-sm stacked-subtle">No active PR for this branch yet.</p>
		{/if}
	</div>
</div>
