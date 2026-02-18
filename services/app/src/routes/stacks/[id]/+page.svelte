<script lang="ts">
	import { resolve } from '$app/paths';

	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const syncClass = {
		clean: 'stacked-chip stacked-chip-success',
		dirty: 'stacked-chip stacked-chip-warning',
		'repo-error': 'stacked-chip stacked-chip-danger'
	} as const;

	const stages = ['Planned', 'In Progress', 'PR Open', 'In Review', 'Merged'] as const;

	function currentStage(): (typeof stages)[number] {
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

	function stageClass(stage: (typeof stages)[number]): string {
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

	function stageContainerClass(stage: (typeof stages)[number]): string {
		const active = stages.indexOf(currentStage());
		const index = stages.indexOf(stage);

		if (index < active) {
			return 'stacked-stage stacked-stage-past';
		}

		if (index === active) {
			return 'stacked-stage stacked-stage-current';
		}

		return 'stacked-stage';
	}
</script>

<main class="stacked-shell mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-8">
	<section class="stacked-panel stacked-fade-in p-4 sm:p-7">
		<div class="mb-6 flex flex-wrap items-center justify-between gap-3 border-b stacked-divider pb-4">
			<a href={resolve('/')} class="stacked-link text-sm font-semibold">Back to features</a>
			<div class="flex flex-wrap items-center gap-2.5 sm:gap-3">
				<a
					href={resolve(`/stacks/${data.stack.id}/plan`)}
					class="cursor-pointer rounded-md border border-[var(--stacked-accent)] bg-[var(--stacked-accent)] px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#2a97ff] sm:px-3 sm:text-xs"
				>
					Open Planning Chat
				</a>
				<p class="text-xs stacked-subtle">Loaded {new Date(data.loadedAt).toLocaleString()}</p>
			</div>
		</div>

		<div class="mb-5">
			<p class="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--stacked-accent-strong)]">Feature</p>
			<h1 class="stacked-title">{data.stack.name}</h1>
			<p class="mt-2 text-sm stacked-subtle">{data.stack.notes ?? 'No description provided for this feature yet.'}</p>
		</div>

		<div class="mb-6 flex flex-wrap items-center gap-2">
			<span class={syncClass[data.stack.syncState]}>{data.stack.syncState.replace(/-/g, ' ')}</span>
			<span class="stacked-chip">branch {data.stack.currentBranch}</span>
			<span class={stageClass(currentStage())}>{currentStage()}</span>
		</div>

		<div class="stacked-panel-elevated mb-6 p-4">
			<p class="mb-3 text-xs font-semibold uppercase tracking-[0.16em] stacked-subtle">Pipeline</p>
			<div class="grid gap-2 sm:grid-cols-5">
				{#each stages as stage (stage)}
					<div class={`rounded-lg border bg-[var(--stacked-bg-soft)] px-3 py-2 text-center ${stageContainerClass(stage)}`}>
						<span class={stageClass(stage)}>{stage}</span>
					</div>
				{/each}
			</div>
		</div>

		{#if data.stack.pullRequest}
			<div class="stacked-panel-elevated mb-5 p-4">
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
					class="stacked-link mt-3 cursor-pointer text-sm font-medium"
				>
					Open on GitHub
				</button>
			</div>
		{:else}
			<div class="stacked-panel-elevated mb-5 p-4">
				<p class="text-sm stacked-subtle">No active PR for this branch yet. Open the planning chat to define the next stage before implementation.</p>
			</div>
		{/if}

		<p class="text-sm stacked-subtle">
			Feature entries are metadata labels for now. Runtime status is derived from the repository where the server is running.
		</p>
	</section>
</main>
