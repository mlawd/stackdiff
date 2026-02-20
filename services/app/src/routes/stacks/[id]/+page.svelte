<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Spinner } from 'flowbite-svelte';
	import PlanningChat from '$lib/components/PlanningChat.svelte';

	import type {
		FeatureStageStatus,
		StageDiffPayload,
		StageDiffabilityMetadata,
		StackStatus
	} from '$lib/types/stack';
	import type { PageData } from './$types';

	interface StartResponse {
		reusedWorktree?: boolean;
		reusedSession?: boolean;
		startedNow?: boolean;
		error?: string;
	}

	interface StageDiffSuccessResponse {
		diff: StageDiffPayload;
	}

	interface StageDiffErrorResponse {
			error?: {
			code?: string;
			message?: string;
		};
	}

	interface ImplementationStatusResponse {
		stageStatus?: FeatureStageStatus;
		runtimeState?: 'idle' | 'busy' | 'retry' | 'missing';
		todoCompleted?: number;
		todoTotal?: number;
		error?: string;
	}

	interface ImplementationStageRuntime {
		stageStatus: FeatureStageStatus;
		runtimeState: 'idle' | 'busy' | 'retry' | 'missing';
		todoCompleted: number;
		todoTotal: number;
	}

	let { data }: { data: PageData } = $props();

	const typeLabel = {
		feature: 'Feature',
		bugfix: 'Bugfix',
		chore: 'Chore'
	} as const;

	const typeClass = {
		feature: 'stacked-chip stacked-chip-review',
		bugfix: 'stacked-chip stacked-chip-danger',
		chore: 'stacked-chip'
	} as const;

	const statusLabel: Record<StackStatus, string> = {
		created: 'Created',
		planned: 'Planned',
		started: 'Started',
		complete: 'Complete'
	};

	const statusClass: Record<StackStatus, string> = {
		created: 'stacked-chip',
		planned: 'stacked-chip stacked-chip-warning',
		started: 'stacked-chip stacked-chip-review',
		complete: 'stacked-chip stacked-chip-success'
	};

	type TabKey = 'plan' | 'stack';
	let tabInitialized = false;
	let activeTab = $state<TabKey>('plan');
	let startPending = $state(false);
	let startError = $state<string | null>(null);
	let startSuccess = $state<string | null>(null);
	let implementationRuntimeByStageId = $state<Record<string, ImplementationStageRuntime>>({});
	let isStageDiffPanelOpen = $state(false);
	let activeDiffStageId = $state<string | null>(null);
	let activeDiffStageTitle = $state<string | null>(null);
	let stageDiffCache = $state<Record<string, StageDiffPayload>>({});
	let stageDiffErrors = $state<Record<string, string>>({});
	let loadingDiffStageId = $state<string | null>(null);
	let stageDiffAbortController: AbortController | null = null;

	$effect(() => {
		if (tabInitialized) {
			return;
		}

		activeTab = data.stack.status === 'created' ? 'plan' : 'stack';
		tabInitialized = true;
	});

	function implementationStageClass(status: FeatureStageStatus): string {
		if (status === 'done') {
			return 'stacked-chip stacked-chip-success';
		}

		if (status === 'review-ready') {
			return 'stacked-chip stacked-chip-review';
		}

		if (status === 'in-progress') {
			return 'stacked-chip stacked-chip-warning';
		}

		return 'stacked-chip';
	}

	function implementationStageLabel(status: FeatureStageStatus): string {
		if (status === 'done') {
			return 'Done';
		}

		if (status === 'review-ready') {
			return 'Review ready';
		}

		if (status === 'in-progress') {
			return 'In progress';
		}

		return 'Not started';
	}

	function canStartFeature(): boolean {
		return (data.stack.stages?.length ?? 0) > 0 && !startPending;
	}

	function stageStatus(stageId: string, fallback: FeatureStageStatus): FeatureStageStatus {
		return implementationRuntimeByStageId[stageId]?.stageStatus ?? fallback;
	}

	function inProgressStageIds(): string[] {
		return (data.stack.stages ?? [])
			.filter((stage) => stageStatus(stage.id, stage.status) === 'in-progress')
			.map((stage) => stage.id);
	}

	function isStageAgentWorking(stageId: string): boolean {
		const runtime = implementationRuntimeByStageId[stageId];
		return runtime?.runtimeState === 'busy' || runtime?.runtimeState === 'retry';
	}

	async function refreshImplementationRuntime(): Promise<void> {
		const stageIds = inProgressStageIds();
		if (stageIds.length === 0) {
			implementationRuntimeByStageId = {};
			return;
		}

		const entries = await Promise.all(
			stageIds.map(async (stageId) => {
				const stageEntry = (data.stack.stages ?? []).find((stage) => stage.id === stageId);
				const fallbackStatus = stageEntry ? stageStatus(stageId, stageEntry.status) : 'in-progress';

				try {
					const response = await fetch(`/api/stacks/${data.stack.id}/stages/${stageId}/implementation/status`);
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
							todoTotal: payload.todoTotal ?? 0
						} satisfies ImplementationStageRuntime
					] as const;
				} catch {
					return [
						stageId,
						{
							stageStatus: fallbackStatus,
							runtimeState: 'missing',
							todoCompleted: 0,
							todoTotal: 0
						} satisfies ImplementationStageRuntime
					] as const;
				}
			})
		);

		implementationRuntimeByStageId = Object.fromEntries(entries);
	}

	$effect(() => {
		if (activeTab !== 'stack') {
			return;
		}

		const stageIds = inProgressStageIds();
		if (stageIds.length === 0) {
			implementationRuntimeByStageId = {};
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

	function stageDiffability(stageId: string): StageDiffabilityMetadata {
		return (
			data.stack.stageDiffabilityById?.[stageId] ?? {
				isDiffable: false,
				reasonIfNotDiffable: 'Stage diff is unavailable.'
			}
		);
	}

	function canOpenStageDiff(stageId: string): boolean {
		return stageDiffability(stageId).isDiffable;
	}

	function implementationStageRowClass(stageId: string): string {
		if (canOpenStageDiff(stageId)) {
			return 'cursor-pointer transition hover:border-[var(--stacked-accent)] hover:bg-[color-mix(in_oklab,var(--stacked-bg-soft)_80%,var(--stacked-accent)_20%)]';
		}

		return 'cursor-not-allowed opacity-80';
	}

	async function loadStageDiff(stageId: string): Promise<void> {
		if (stageDiffCache[stageId]) {
			return;
		}

		if (loadingDiffStageId === stageId) {
			return;
		}

		loadingDiffStageId = stageId;
		delete stageDiffErrors[stageId];

		stageDiffAbortController?.abort();
		stageDiffAbortController = new AbortController();

		try {
			const response = await fetch(`/api/stacks/${data.stack.id}/stages/${stageId}/diff`, {
				method: 'GET',
				signal: stageDiffAbortController.signal
			});
			if (!response.ok) {
				const body = (await response.json()) as StageDiffErrorResponse;
				throw new Error(body.error?.message ?? 'Unable to load stage diff.');
			}

			const body = (await response.json()) as StageDiffSuccessResponse;
			stageDiffCache[stageId] = body.diff;
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				return;
			}

			stageDiffErrors[stageId] =
				error instanceof Error ? error.message : 'Unable to load stage diff.';
		} finally {
			if (loadingDiffStageId === stageId) {
				loadingDiffStageId = null;
			}
		}
	}

	function openStageDiff(stageId: string, stageTitle: string): void {
		if (!canOpenStageDiff(stageId)) {
			return;
		}

		activeDiffStageId = stageId;
		activeDiffStageTitle = stageTitle;
		isStageDiffPanelOpen = true;

		void loadStageDiff(stageId);
	}

	function closeStageDiffPanel(): void {
		isStageDiffPanelOpen = false;
	}

	function handleWindowKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape' || !isStageDiffPanelOpen) {
			return;
		}

		closeStageDiffPanel();
	}

	async function startFeature(): Promise<void> {
		if (!canStartFeature()) {
			return;
		}

		startPending = true;
		startError = null;
		startSuccess = null;

		try {
			const response = await fetch(`/api/stacks/${data.stack.id}/start`, { method: 'POST' });
			const body = (await response.json()) as StartResponse;
			if (!response.ok) {
				throw new Error(body.error ?? 'Unable to start feature.');
			}

			const mode = body.startedNow ? 'Started stage 1.' : 'Stage 1 is already running.';
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

	const activeStageDiff = $derived(activeDiffStageId ? stageDiffCache[activeDiffStageId] : null);
	const activeStageDiffError = $derived(activeDiffStageId ? stageDiffErrors[activeDiffStageId] : null);
	const activeStageDiffLoading = $derived(
		activeDiffStageId ? loadingDiffStageId === activeDiffStageId : false
	);
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<main class="stacked-shell mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-6">
	<div class="stacked-fade-in">
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3 border-b stacked-divider pb-3">
			<a href={resolve('/')} class="stacked-link text-sm font-semibold">Back to features</a>
			<p class="text-xs stacked-subtle">Loaded {new Date(data.loadedAt).toLocaleString()}</p>
		</div>

		<div class="mb-4">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">{data.stack.name}</h1>
				<div class="flex flex-wrap items-center gap-2">
					<span class={typeClass[data.stack.type]}>{typeLabel[data.stack.type]}</span>
					<span class={statusClass[data.stack.status]}>{statusLabel[data.stack.status]}</span>
				</div>
			</div>
			<p class="mt-2 text-sm stacked-subtle">{data.stack.notes ?? 'No description provided for this feature yet.'}</p>
		</div>

		<div class="mb-4 border-b stacked-divider">
			<div class="flex flex-wrap gap-1.5">
				<button
					type="button"
					onclick={() => (activeTab = 'plan')}
					class={`rounded-t-md border border-b-0 px-3 py-2 text-sm font-medium transition ${activeTab === 'plan'
						? 'border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] text-[var(--stacked-text)]'
						: 'border-transparent text-[var(--stacked-text-muted)] hover:text-[var(--stacked-text)]'}`}
				>
					Plan
				</button>
				<button
					type="button"
					onclick={() => (activeTab = 'stack')}
					class={`rounded-t-md border border-b-0 px-3 py-2 text-sm font-medium transition ${activeTab === 'stack'
						? 'border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] text-[var(--stacked-text)]'
						: 'border-transparent text-[var(--stacked-text-muted)] hover:text-[var(--stacked-text)]'}`}
				>
					Stack
				</button>
			</div>
		</div>

		{#if activeTab === 'plan'}
			<div class="stacked-panel-elevated p-4">
				<PlanningChat
					stackId={data.stack.id}
					session={data.session}
					messages={data.messages}
					awaitingResponse={data.awaitingResponse}
				/>
			</div>
		{:else}
			<div class="space-y-4">
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
						<button
							type="button"
							onclick={startFeature}
							disabled={!canStartFeature()}
							class="cursor-pointer rounded-lg border border-[var(--stacked-accent)] bg-[var(--stacked-accent)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#2a97ff] disabled:cursor-not-allowed disabled:opacity-70"
						>
							{startPending ? 'Starting...' : 'Start feature'}
						</button>
					</div>
					{#if data.stack.stages && data.stack.stages.length > 0}
						<div class="space-y-2">
						{#each data.stack.stages as implementationStage (implementationStage.id)}
							{@const stageRuntime = implementationRuntimeByStageId[implementationStage.id]}
							{@const currentStageStatus = stageStatus(implementationStage.id, implementationStage.status)}
							{@const stageWorking = currentStageStatus === 'in-progress' && isStageAgentWorking(implementationStage.id)}
							<button
								type="button"
								onclick={() => openStageDiff(implementationStage.id, implementationStage.title)}
									disabled={!canOpenStageDiff(implementationStage.id)}
									title={
										canOpenStageDiff(implementationStage.id)
											? `Open diff for ${implementationStage.title}`
											: stageDiffability(implementationStage.id).reasonIfNotDiffable ??
												'Stage diff is unavailable.'
									}
									class={`w-full rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-3 py-2 text-left ${implementationStageRowClass(implementationStage.id)}`}
								>
									<div class="flex flex-wrap items-start justify-between gap-2">
										<div>
											<p class="text-sm font-medium text-[var(--stacked-text)]">{implementationStage.title}</p>
											{#if implementationStage.details}
												<p class="mt-1 text-xs stacked-subtle">{implementationStage.details}</p>
											{/if}
											{#if canOpenStageDiff(implementationStage.id)}
												<p class="mt-1 text-xs stacked-subtle">
													Branch: {stageDiffability(implementationStage.id).branchName}
												</p>
											{:else}
												<p class="mt-1 text-xs text-amber-300">
													{stageDiffability(implementationStage.id).reasonIfNotDiffable ??
														'Stage diff is unavailable.'}
												</p>
											{/if}
										</div>
									<div class="flex flex-wrap items-center justify-end gap-2">
										{#if canOpenStageDiff(implementationStage.id)}
											<span class="stacked-chip stacked-chip-review">View diff</span>
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
										{#if currentStageStatus === 'in-progress' && stageRuntime}
											<p class="text-xs stacked-subtle whitespace-nowrap">{stageRuntime.todoCompleted}/{stageRuntime.todoTotal} Todos done</p>
										{/if}
									</div>
								</div>
							</button>
						{/each}
						</div>
					{:else}
						<p class="text-sm stacked-subtle">Save a plan in planning chat to generate implementation stages.</p>
					{/if}
				</div>

				<div class="stacked-panel-elevated p-4">
					{#if data.stack.pullRequest}
						<p class="text-xs uppercase tracking-wide stacked-subtle">Current PR</p>
						<p class="mt-1 text-sm font-semibold text-[var(--stacked-text)]">
							#{data.stack.pullRequest.number} {data.stack.pullRequest.title}
						</p>
						<p class="mt-1 text-xs stacked-subtle">
							{data.stack.pullRequest.state}{data.stack.pullRequest.isDraft ? ' (draft)' : ''}
						</p>
						<button
							type="button"
							onclick={() => window.open(data.stack.pullRequest?.url ?? '', '_blank', 'noopener,noreferrer')}
							class="stacked-link mt-2 cursor-pointer text-sm font-medium"
						>
							Open on GitHub
						</button>
					{:else}
						<p class="text-sm stacked-subtle">No active PR for this branch yet.</p>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</main>

<div class={`stage-diff-drawer ${isStageDiffPanelOpen ? 'is-open' : ''}`} aria-hidden={!isStageDiffPanelOpen}>
	<button
		type="button"
		class="stage-diff-backdrop"
		onclick={closeStageDiffPanel}
		aria-label="Close stage diff panel"
		tabindex={isStageDiffPanelOpen ? 0 : -1}
	></button>
	<div
		class="stage-diff-panel stacked-panel"
		role="dialog"
		aria-modal="true"
		aria-labelledby="stage-diff-panel-title"
	>
		<div class="stage-diff-panel-header">
			<div>
				<p class="text-xs font-semibold uppercase tracking-[0.16em] stacked-subtle">Branch diff</p>
				<h2 id="stage-diff-panel-title" class="mt-1 text-lg font-semibold text-[var(--stacked-text)]">
					{activeDiffStageTitle ?? 'Stage diff'}
				</h2>
			</div>
			<button
				type="button"
				onclick={closeStageDiffPanel}
				class="rounded-md border border-[var(--stacked-border-soft)] px-2 py-1 text-xs font-semibold text-[var(--stacked-text-muted)] transition hover:text-[var(--stacked-text)]"
			>
				Close
			</button>
		</div>
		<div class="stage-diff-panel-body stacked-scroll">
			{#if !activeDiffStageId}
				<p class="text-sm stacked-subtle">Select a diffable implementation stage to load changes.</p>
			{:else if activeStageDiffLoading}
				<div class="rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-3 py-2 text-sm stacked-subtle">
					Loading stage diff...
				</div>
			{:else if activeStageDiffError}
				<div class="rounded-lg border border-red-500/45 bg-red-500/10 px-3 py-2 text-sm text-red-200">
					{activeStageDiffError}
				</div>
			{:else if activeStageDiff}
				<div class="space-y-3">
					<div class="rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-3 py-3">
						<div class="mb-2 flex flex-wrap gap-2">
							<span class="stacked-chip">Files {activeStageDiff.summary.filesChanged}</span>
							<span class="stacked-chip stacked-chip-success">+{activeStageDiff.summary.additions}</span>
							<span class="stacked-chip stacked-chip-danger">-{activeStageDiff.summary.deletions}</span>
						</div>
						<p class="text-xs stacked-subtle">Comparing {activeStageDiff.baseRef} -> {activeStageDiff.targetRef}</p>
					</div>

					{#if activeStageDiff.files.length === 0}
						<div class="rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-3 py-3 text-sm stacked-subtle">
							No committed changes found for this stage branch.
						</div>
					{:else}
						<div class="rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-3 py-3">
							<p class="text-sm font-medium text-[var(--stacked-text)]">Diff content loads in stage 4.</p>
							<p class="mt-1 text-xs stacked-subtle">
								Fetched {activeStageDiff.files.length} file{activeStageDiff.files.length === 1 ? '' : 's'} for this stage.
							</p>
						</div>
					{/if}
				</div>
			{:else}
				<p class="text-sm stacked-subtle">Select a diffable implementation stage to load changes.</p>
			{/if}
		</div>
	</div>
</div>

<style>
	.stage-diff-drawer {
		position: fixed;
		inset: 0;
		z-index: 40;
		pointer-events: none;
	}

	.stage-diff-drawer.is-open {
		pointer-events: auto;
	}

	.stage-diff-backdrop {
		position: absolute;
		inset: 0;
		border: 0;
		background: rgba(4, 6, 10, 0.52);
		opacity: 0;
		transition: opacity 180ms ease;
	}

	.stage-diff-drawer.is-open .stage-diff-backdrop {
		opacity: 1;
	}

	.stage-diff-panel {
		position: absolute;
		top: 0;
		right: 0;
		height: 100%;
		width: min(880px, 100vw);
		display: flex;
		flex-direction: column;
		transform: translateX(100%);
		transition: transform 230ms cubic-bezier(0.16, 1, 0.3, 1);
		border-radius: 0;
	}

	.stage-diff-drawer.is-open .stage-diff-panel {
		transform: translateX(0);
	}

	.stage-diff-panel-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 1rem;
		border-bottom: 1px solid var(--stacked-border-soft);
	}

	.stage-diff-panel-body {
		padding: 1rem;
		overflow: auto;
	}

	@media (max-width: 640px) {
		.stage-diff-panel {
			width: 100vw;
		}
	}
</style>
