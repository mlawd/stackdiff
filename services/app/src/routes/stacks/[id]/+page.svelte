<script lang="ts">
	import { resolve } from '$app/paths';
	import { Badge } from 'flowbite-svelte';

	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const syncColor = {
		clean: 'green',
		dirty: 'yellow',
		'missing-branch': 'indigo',
		'repo-error': 'red'
	} as const;
</script>

<main class="mx-auto w-full max-w-4xl px-4 py-8 sm:px-8">
	<section class="rounded-3xl border border-[var(--stacked-border)] bg-[var(--stacked-surface)]/90 p-6 shadow-sm sm:p-8">
		<div class="mb-5 flex items-center justify-between">
			<a href={resolve('/')} class="text-sm font-medium text-teal-700 hover:underline">Back to stacks</a>
			<p class="text-xs text-slate-500">Loaded at {new Date(data.loadedAt).toLocaleString()}</p>
		</div>

		<h1 class="text-3xl font-semibold tracking-tight text-slate-800">{data.stack.name}</h1>
		<p class="mt-2 text-sm text-slate-600">{data.stack.notes ?? 'No notes for this stack yet.'}</p>

		<div class="mt-5 flex flex-wrap gap-3 text-sm">
			<Badge color={syncColor[data.stack.syncState]}>{data.stack.syncState.replace(/-/g, ' ')}</Badge>
			<span class="rounded-lg bg-slate-100 px-3 py-1 font-mono text-xs text-slate-700">{data.stack.repositoryPath}</span>
			<span class="rounded-lg bg-slate-100 px-3 py-1 text-xs text-slate-700">Tip: {data.stack.tipBranch}</span>
		</div>

		{#if data.stack.pullRequest}
			<div class="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
				<p class="text-xs uppercase tracking-wide text-emerald-700">Top PR</p>
				<p class="mt-1 text-sm font-semibold text-emerald-900">
					#{data.stack.pullRequest.number} {data.stack.pullRequest.title}
				</p>
				<p class="mt-1 text-xs text-emerald-700">
					{data.stack.pullRequest.state}{data.stack.pullRequest.isDraft ? ' (draft)' : ''}
				</p>
				<button
					type="button"
					onclick={() => window.open(data.stack.pullRequest?.url ?? '', '_blank', 'noopener,noreferrer')}
					class="mt-3 cursor-pointer text-sm font-medium text-emerald-800 hover:underline"
				>
					Open on GitHub
				</button>
			</div>
		{/if}

		<div class="mt-6 rounded-2xl border border-[var(--stacked-border)] bg-white/80 p-4">
			<p class="mb-3 text-xs uppercase tracking-wide text-slate-500">Branch hierarchy</p>
			<ol class="space-y-2">
				{#each data.stack.branches as branch, index (`${branch}-${index}`)}
					<li class="flex items-center gap-2 text-sm">
						<span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-700">
							{index + 1}
						</span>
						<span class="font-mono text-slate-800">{branch}</span>
					</li>
				{/each}
			</ol>
		</div>
	</section>
</main>
