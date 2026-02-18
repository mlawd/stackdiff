<script lang="ts">
	import { resolve } from '$app/paths';

	import type { StackViewModel } from '$lib/types/stack';
	import type { PageData } from './$types';

	interface ApiStackResponse {
		stack?: StackViewModel;
		error?: string;
	}

	interface UiMessage {
		kind: 'success' | 'error';
		text: string;
	}

	let { data: initialData }: { data: PageData } = $props();

	let stacks = $state<StackViewModel[]>([]);
	let loadedAt = $state('');
	let message = $state<UiMessage | null>(null);
	let activeRowId = $state<string | null>(null);
	let initialized = false;

	const syncColor = {
		clean: 'stacked-chip stacked-chip-success',
		dirty: 'stacked-chip stacked-chip-warning',
		'repo-error': 'stacked-chip stacked-chip-danger'
	} as const;

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

	$effect(() => {
		if (initialized) {
			return;
		}

		stacks = [...initialData.stacks];
		loadedAt = initialData.loadedAt;
		message = initialData.error ? { kind: 'error', text: initialData.error } : null;
		initialized = true;
	});

	function titleCase(value: string): string {
		return value.replace(/-/g, ' ');
	}

	function stackStageLabel(stack: StackViewModel): string {
		if (stack.pullRequest?.state === 'MERGED') {
			return 'Merged';
		}

		if (stack.pullRequest?.state === 'OPEN' && stack.pullRequest.isDraft) {
			return 'PR Open';
		}

		if (stack.pullRequest?.state === 'OPEN') {
			return 'In Review';
		}

		if (stack.syncState === 'dirty') {
			return 'In Progress';
		}

		return 'Planned';
	}

	function stageClass(label: string): string {
		if (label === 'Merged') {
			return 'stacked-chip stacked-chip-success';
		}

		if (label === 'In Review') {
			return 'stacked-chip stacked-chip-review';
		}

		if (label === 'PR Open' || label === 'In Progress') {
			return 'stacked-chip stacked-chip-warning';
		}

		return 'stacked-chip';
	}

	function setMessage(kind: UiMessage['kind'], text: string): void {
		message = { kind, text };
	}

	async function refreshStack(id: string): Promise<void> {
		activeRowId = id;
		message = null;

		try {
			const response = await fetch(`/api/stacks/${id}`);
			const body = (await response.json()) as ApiStackResponse;

			if (!response.ok || !body.stack) {
				throw new Error(body.error ?? 'Unable to refresh feature status.');
			}

			const refreshedStack = body.stack;
			stacks = stacks.map((item) => (item.id === id ? refreshedStack : item));
			loadedAt = new Date().toISOString();
		} catch (error) {
			setMessage('error', error instanceof Error ? error.message : 'Unable to refresh feature status.');
		} finally {
			activeRowId = null;
		}
	}

	async function removeStack(id: string): Promise<void> {
		const target = stacks.find((stack) => stack.id === id);
		if (!target) {
			return;
		}

		const ok = window.confirm(`Delete feature "${target.name}"?`);
		if (!ok) {
			return;
		}

		activeRowId = id;
		message = null;

		try {
			const response = await fetch(`/api/stacks/${id}`, { method: 'DELETE' });
			const body = (await response.json()) as ApiStackResponse;

			if (!response.ok) {
				throw new Error(body.error ?? 'Unable to delete feature.');
			}

			stacks = stacks.filter((stack) => stack.id !== id);
			setMessage('success', `Deleted ${target.name}.`);
			loadedAt = new Date().toISOString();
		} catch (error) {
			setMessage('error', error instanceof Error ? error.message : 'Unable to delete feature.');
		} finally {
			activeRowId = null;
		}
	}
</script>

<main class="stacked-shell mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
	<section class="stacked-panel stacked-fade-in p-4 sm:p-7">
		<div class="mb-7 flex flex-col gap-4 border-b stacked-divider pb-5 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<p class="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--stacked-accent-strong)]">stackdiff</p>
				<h1 class="stacked-title">Feature Pipeline</h1>
				<p class="mt-2 text-sm stacked-subtle">Create a feature, plan it with the agent, then move through branches and PRs.</p>
			</div>
			<div class="flex flex-col gap-3 sm:items-end">
				<p class="text-xs stacked-subtle">Synced {new Date(loadedAt).toLocaleString()}</p>
				<a
					href={resolve('/stacks/new')}
					class="stacked-pulse cursor-pointer rounded-lg border border-[var(--stacked-accent)] bg-[var(--stacked-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2a97ff]"
				>
					Create Feature
				</a>
			</div>
		</div>

		{#if message}
			<div
				class={`mb-5 rounded-xl border px-4 py-3 text-sm ${message.kind === 'error'
					? 'border-red-500/40 bg-red-500/10 text-red-200'
					: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'}`}
			>
				{message.text}
			</div>
		{/if}

		{#if stacks.length === 0}
			<div class="stacked-panel-elevated px-6 py-12 text-center">
				<p class="mb-2 text-lg font-semibold">No features yet.</p>
				<p class="text-sm stacked-subtle">Create one to open a planning chat and start your implementation pipeline.</p>
			</div>
		{:else}
			<div class="space-y-2.5 sm:space-y-3">
				{#each stacks as stack, index (stack.id)}
					<article class="stacked-panel-elevated stacked-fade-in p-3.5 sm:p-5" style={`animation-delay: ${index * 45}ms`}>
						<div class="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
							<div>
								<div class="mb-2 flex flex-wrap items-center gap-2">
									<a href={resolve(`/stacks/${stack.id}`)} class="stacked-link text-base font-semibold">{stack.name}</a>
									<span class={typeClass[stack.type]}>{typeLabel[stack.type]}</span>
									<span class={stageClass(stackStageLabel(stack))}>{stackStageLabel(stack)}</span>
									<span class={syncColor[stack.syncState]}>{titleCase(stack.syncState)}</span>
								</div>
								{#if stack.notes}
									<p class="text-sm stacked-subtle">{stack.notes}</p>
								{/if}
								<p class="mt-2 text-xs text-[var(--stacked-text-muted)]">branch: {stack.currentBranch}</p>
							</div>
							<div class="flex flex-wrap gap-1.5 sm:gap-2 sm:justify-end">
								<button
									type="button"
									onclick={() => refreshStack(stack.id)}
									disabled={activeRowId === stack.id}
									class="cursor-pointer rounded-md border border-[var(--stacked-border-soft)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--stacked-text-muted)] transition hover:border-[var(--stacked-accent)] hover:text-[var(--stacked-text)] sm:px-3 sm:text-xs disabled:cursor-not-allowed disabled:opacity-60"
								>
									Refresh
								</button>
								<a
									href={resolve(`/stacks/${stack.id}/plan`)}
									class="cursor-pointer rounded-md border border-[var(--stacked-accent)] bg-[var(--stacked-accent)] px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#2a97ff] sm:px-3 sm:text-xs"
								>
									Planning Chat
								</a>
								<button
									type="button"
									onclick={() => removeStack(stack.id)}
									disabled={activeRowId === stack.id}
									class="cursor-pointer rounded-md border border-red-500/45 px-2.5 py-1.5 text-[11px] font-semibold text-red-300 transition hover:bg-red-500/10 sm:px-3 sm:text-xs disabled:cursor-not-allowed disabled:opacity-50"
								>
									Delete
								</button>
							</div>
						</div>

						<div class="grid gap-2 border-t stacked-divider pt-3 text-xs sm:grid-cols-[1fr_auto] sm:items-center">
							<div>
								{#if stack.pullRequest}
									<button
										type="button"
										onclick={() => window.open(stack.pullRequest?.url ?? '', '_blank', 'noopener,noreferrer')}
										class="stacked-link text-xs font-medium"
									>
										PR #{stack.pullRequest.number} - {stack.pullRequest.title}
									</button>
									<p class="mt-1 stacked-subtle">
										{stack.pullRequest.state}{stack.pullRequest.isDraft ? ' (draft)' : ''}
									</p>
								{:else}
									<p class="stacked-subtle">No PR linked to this branch yet.</p>
								{/if}
							</div>
							<div class="text-right">
								{#if stack.gitError}
									<p class="text-[11px] text-red-300">Git: {stack.gitError}</p>
								{/if}
								{#if stack.ghError}
									<p class="text-[11px] text-amber-200">GH: {stack.ghError}</p>
								{/if}
							</div>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>
</main>
