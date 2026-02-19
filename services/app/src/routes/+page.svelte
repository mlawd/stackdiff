<script lang="ts">
	import { resolve } from '$app/paths';

	import type { StackStatus, StackViewModel } from '$lib/types/stack';
	import type { PageData } from './$types';

	interface UiMessage {
		kind: 'success' | 'error';
		text: string;
	}

	let { data }: { data: PageData } = $props();
	let initialized = false;
	let stacks = $state<StackViewModel[]>([]);
	let loadedAt = $state('');
	let message = $state<UiMessage | null>(null);

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

	$effect(() => {
		if (initialized) {
			return;
		}

		stacks = [...data.stacks];
		loadedAt = data.loadedAt;
		message = data.error ? { kind: 'error', text: data.error } : null;
		initialized = true;
	});
</script>

<main class="stacked-shell mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-6">
	<div class="stacked-fade-in">
		<div class="mb-5 border-b stacked-divider pb-4">
			<p class="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--stacked-accent-strong)]">stackdiff</p>
			<h1 class="stacked-title">Feature Pipeline</h1>
			<p class="mt-2 text-sm stacked-subtle">Track feature progress from creation to completion.</p>
			<p class="mt-2 text-xs stacked-subtle">Synced {new Date(loadedAt).toLocaleString()}</p>
		</div>

		{#if message}
			<div
				class={`mb-4 rounded-xl border px-4 py-3 text-sm ${message.kind === 'error'
					? 'border-red-500/40 bg-red-500/10 text-red-200'
					: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'}`}
			>
				{message.text}
			</div>
		{/if}

		{#if stacks.length === 0}
			<div class="stacked-panel-elevated px-6 py-10 text-center">
				<p class="mb-2 text-lg font-semibold">No features yet.</p>
				<p class="text-sm stacked-subtle">Create one from the header to start planning.</p>
			</div>
		{:else}
			<div class="space-y-2">
				{#each stacks as stack, index (stack.id)}
					<a
						href={resolve(`/stacks/${stack.id}`)}
						class="stacked-panel-elevated stacked-fade-in block p-3.5 sm:p-4"
						style={`animation-delay: ${index * 35}ms`}
					>
						<div class="flex items-start justify-between gap-3">
							<div>
								<p class="text-base font-semibold text-[var(--stacked-text)]">{stack.name}</p>
								{#if stack.notes}
									<p class="mt-1 text-sm stacked-subtle">{stack.notes}</p>
								{/if}
							</div>
							<p class="text-xs stacked-subtle">Open</p>
						</div>
						<div class="mt-3 flex flex-wrap items-center gap-2">
							<span class={typeClass[stack.type]}>{typeLabel[stack.type]}</span>
							<span class={statusClass[stack.status]}>{statusLabel[stack.status]}</span>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</div>
</main>
