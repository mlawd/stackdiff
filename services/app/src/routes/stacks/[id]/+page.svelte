<script lang="ts">
	import { resolve } from '$app/paths';

	import type { StackStatus } from '$lib/types/stack';
	import type { PageData } from './$types';

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

	const pipelineStages = ['Planned', 'In Progress', 'PR Open', 'In Review', 'Merged'] as const;

	type TabKey = 'plan' | 'stack';
	let tabInitialized = false;
	let activeTab = $state<TabKey>('plan');

	$effect(() => {
		if (tabInitialized) {
			return;
		}

		activeTab = data.stack.status === 'created' ? 'plan' : 'stack';
		tabInitialized = true;
	});

	function currentPipelineStage(): (typeof pipelineStages)[number] {
		if (data.stack.pullRequest?.state === 'MERGED') {
			return 'Merged';
		}

		if (data.stack.pullRequest?.state === 'OPEN' && data.stack.pullRequest.isDraft) {
			return 'PR Open';
		}

		if (data.stack.pullRequest?.state === 'OPEN') {
			return 'In Review';
		}

		if (data.stack.syncState === 'dirty') {
			return 'In Progress';
		}

		return 'Planned';
	}

	function pipelineChipClass(stage: (typeof pipelineStages)[number]): string {
		if (stage === 'Merged') {
			return 'stacked-chip stacked-chip-success';
		}

		if (stage === 'In Review') {
			return 'stacked-chip stacked-chip-review';
		}

		if (stage === 'PR Open' || stage === 'In Progress') {
			return 'stacked-chip stacked-chip-warning';
		}

		return 'stacked-chip';
	}

	function implementationStageClass(status: string): string {
		if (status === 'done') {
			return 'stacked-chip stacked-chip-success';
		}

		if (status === 'in-progress') {
			return 'stacked-chip stacked-chip-warning';
		}

		return 'stacked-chip';
	}

	function implementationStageLabel(status: string): string {
		if (status === 'done') {
			return 'Done';
		}

		if (status === 'in-progress') {
			return 'In progress';
		}

		return 'Not started';
	}

	function stageContainerClass(stage: (typeof pipelineStages)[number]): string {
		const active = pipelineStages.indexOf(currentPipelineStage());
		const index = pipelineStages.indexOf(stage);

		if (index < active) {
			return 'stacked-stage stacked-stage-past';
		}

		if (index === active) {
			return 'stacked-stage stacked-stage-current';
		}

		return 'stacked-stage';
	}
</script>

<main class="stacked-shell mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-6">
	<div class="stacked-fade-in">
		<div class="mb-4 flex flex-wrap items-center justify-between gap-3 border-b stacked-divider pb-3">
			<a href={resolve('/')} class="stacked-link text-sm font-semibold">Back to features</a>
			<p class="text-xs stacked-subtle">Loaded {new Date(data.loadedAt).toLocaleString()}</p>
		</div>

		<div class="mb-4">
			<p class="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--stacked-accent-strong)]">Feature</p>
			<h1 class="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{data.stack.name}</h1>
			<p class="mt-2 text-sm stacked-subtle">{data.stack.notes ?? 'No description provided for this feature yet.'}</p>
			<div class="mt-3 flex flex-wrap items-center gap-2">
				<span class={typeClass[data.stack.type]}>{typeLabel[data.stack.type]}</span>
				<span class={statusClass[data.stack.status]}>{statusLabel[data.stack.status]}</span>
			</div>
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
				<p class="mb-2 text-xs font-semibold uppercase tracking-[0.16em] stacked-subtle">Planning chat</p>
				{#if data.stack.status === 'created'}
					<p class="text-sm stacked-subtle">This feature is not planned yet. Open planning chat to define scope and save the plan.</p>
				{:else}
					<p class="text-sm stacked-subtle">You can revisit planning chat anytime to refine scope and update implementation stages.</p>
				{/if}
				<a
					href={resolve(`/stacks/${data.stack.id}/plan`)}
					class="mt-3 inline-flex rounded-md border border-[var(--stacked-accent)] bg-[var(--stacked-accent)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#2a97ff]"
				>
					Open planning chat
				</a>
			</div>
		{:else}
			<div class="space-y-4">
				<div class="stacked-panel-elevated p-4">
					<p class="mb-3 text-xs font-semibold uppercase tracking-[0.16em] stacked-subtle">Pipeline</p>
					<div class="grid gap-2 sm:grid-cols-5">
						{#each pipelineStages as stage (stage)}
							<div class={`rounded-lg border bg-[var(--stacked-bg-soft)] px-3 py-2 text-center ${stageContainerClass(stage)}`}>
								<span class={pipelineChipClass(stage)}>{stage}</span>
							</div>
						{/each}
					</div>
				</div>

				<div class="stacked-panel-elevated p-4">
					<p class="mb-3 text-xs font-semibold uppercase tracking-[0.16em] stacked-subtle">Implementation stages</p>
					{#if data.stack.stages && data.stack.stages.length > 0}
						<div class="space-y-2">
							{#each data.stack.stages as implementationStage (implementationStage.id)}
								<div class="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-3 py-2">
									<div>
										<p class="text-sm font-medium text-[var(--stacked-text)]">{implementationStage.title}</p>
										{#if implementationStage.details}
											<p class="mt-1 text-xs stacked-subtle">{implementationStage.details}</p>
										{/if}
									</div>
									<span class={implementationStageClass(implementationStage.status)}>{implementationStageLabel(implementationStage.status)}</span>
								</div>
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
