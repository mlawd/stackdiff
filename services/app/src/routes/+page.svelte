<script lang="ts">
	import { resolve } from '$app/paths';
	import { Badge } from 'flowbite-svelte';

	import type { StackUpsertInput, StackViewModel } from '$lib/types/stack';
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
	let submitting = $state(false);
	let activeRowId = $state<string | null>(null);
	let initialized = false;

	let isFormOpen = $state(false);
	let editingId = $state<string | null>(null);
	let formName = $state('');
	let formRepoPath = $state('');
	let formBranches = $state('main');
	let formNotes = $state('');

	const syncColor = {
		clean: 'green',
		dirty: 'yellow',
		'missing-branch': 'indigo',
		'repo-error': 'red'
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

	function setMessage(kind: UiMessage['kind'], text: string): void {
		message = { kind, text };
	}

	function resetForm(): void {
		editingId = null;
		formName = '';
		formRepoPath = '';
		formBranches = 'main';
		formNotes = '';
	}

	function openCreateForm(): void {
		resetForm();
		isFormOpen = true;
	}

	function openEditForm(stack: StackViewModel): void {
		editingId = stack.id;
		formName = stack.name;
		formRepoPath = stack.repositoryPath;
		formBranches = stack.branches.join('\n');
		formNotes = stack.notes ?? '';
		isFormOpen = true;
	}

	function toUpsertInput(): StackUpsertInput {
		const branches = formBranches
			.split(/\n|,/g)
			.map((value) => value.trim())
			.filter(Boolean);

		return {
			name: formName,
			repositoryPath: formRepoPath,
			branches,
			notes: formNotes
		};
	}

	async function submitStackForm(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		submitting = true;
		message = null;

		try {
			const payload = toUpsertInput();
			const url = editingId ? `/api/stacks/${editingId}` : '/api/stacks';
			const method = editingId ? 'PATCH' : 'POST';

			const response = await fetch(url, {
				method,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});

			const body = (await response.json()) as ApiStackResponse;
			if (!response.ok || !body.stack) {
				throw new Error(body.error ?? 'Unable to save stack.');
			}

			const savedStack = body.stack;

			if (editingId) {
				stacks = stacks.map((item) => (item.id === savedStack.id ? savedStack : item));
				setMessage('success', `Updated ${savedStack.name}.`);
			} else {
				stacks = [savedStack, ...stacks];
				setMessage('success', `Created ${savedStack.name}.`);
			}

			loadedAt = new Date().toISOString();
			isFormOpen = false;
			resetForm();
		} catch (error) {
			setMessage('error', error instanceof Error ? error.message : 'Unable to save stack.');
		} finally {
			submitting = false;
		}
	}

	async function refreshStack(id: string): Promise<void> {
		activeRowId = id;
		message = null;

		try {
			const response = await fetch(`/api/stacks/${id}`);
			const body = (await response.json()) as ApiStackResponse;

			if (!response.ok || !body.stack) {
				throw new Error(body.error ?? 'Unable to refresh stack status.');
			}

			const refreshedStack = body.stack;
			stacks = stacks.map((item) => (item.id === id ? refreshedStack : item));
			loadedAt = new Date().toISOString();
		} catch (error) {
			setMessage('error', error instanceof Error ? error.message : 'Unable to refresh stack status.');
		} finally {
			activeRowId = null;
		}
	}

	async function removeStack(id: string): Promise<void> {
		const target = stacks.find((stack) => stack.id === id);
		if (!target) {
			return;
		}

		const ok = window.confirm(`Delete stack "${target.name}"?`);
		if (!ok) {
			return;
		}

		activeRowId = id;
		message = null;

		try {
			const response = await fetch(`/api/stacks/${id}`, { method: 'DELETE' });
			const body = (await response.json()) as ApiStackResponse;

			if (!response.ok) {
				throw new Error(body.error ?? 'Unable to delete stack.');
			}

			stacks = stacks.filter((stack) => stack.id !== id);
			setMessage('success', `Deleted ${target.name}.`);
			loadedAt = new Date().toISOString();
		} catch (error) {
			setMessage('error', error instanceof Error ? error.message : 'Unable to delete stack.');
		} finally {
			activeRowId = null;
		}
	}
</script>

<main class="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8">
	<section class="rounded-3xl border border-[var(--stacked-border)] bg-[var(--stacked-surface)]/90 p-6 shadow-sm backdrop-blur-sm sm:p-8">
		<div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<p class="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">stacked</p>
				<h1 class="text-3xl font-semibold tracking-tight text-slate-800">Available stacks</h1>
			</div>
			<div class="flex items-center gap-3">
				<p class="text-sm text-slate-600">Loaded at {new Date(loadedAt).toLocaleString()}</p>
				<button
					type="button"
					onclick={openCreateForm}
					class="cursor-pointer rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800"
				>
					New stack
				</button>
			</div>
		</div>

		{#if message}
			<div
				class={`mb-5 rounded-xl px-4 py-3 text-sm ${message.kind === 'error'
					? 'border border-red-200 bg-red-50 text-red-700'
					: 'border border-emerald-200 bg-emerald-50 text-emerald-800'}`}
			>
				{message.text}
			</div>
		{/if}

		{#if isFormOpen}
			<form
				onsubmit={submitStackForm}
				class="mb-6 grid gap-4 rounded-2xl border border-[var(--stacked-border)] bg-white/85 p-4 sm:grid-cols-2"
			>
				<label class="flex flex-col gap-1 text-sm sm:col-span-1">
					<span class="font-medium text-slate-700">Name</span>
					<input bind:value={formName} required class="rounded-lg border border-slate-300 px-3 py-2" />
				</label>
				<label class="flex flex-col gap-1 text-sm sm:col-span-1">
					<span class="font-medium text-slate-700">Repository path</span>
					<input bind:value={formRepoPath} required class="rounded-lg border border-slate-300 px-3 py-2" />
				</label>
				<label class="flex flex-col gap-1 text-sm sm:col-span-2">
					<span class="font-medium text-slate-700">Branches (comma or newline separated)</span>
					<textarea bind:value={formBranches} rows="4" required class="rounded-lg border border-slate-300 px-3 py-2"></textarea>
				</label>
				<label class="flex flex-col gap-1 text-sm sm:col-span-2">
					<span class="font-medium text-slate-700">Notes</span>
					<textarea bind:value={formNotes} rows="2" class="rounded-lg border border-slate-300 px-3 py-2"></textarea>
				</label>
				<div class="flex items-center justify-end gap-3 sm:col-span-2">
					<button
						type="button"
						onclick={() => {
							isFormOpen = false;
							resetForm();
						}}
						class="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={submitting}
						class="cursor-pointer rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-teal-500"
					>
						{submitting ? 'Saving...' : editingId ? 'Update stack' : 'Create stack'}
					</button>
				</div>
			</form>
		{/if}

		{#if stacks.length === 0}
			<div class="rounded-2xl border border-dashed border-[var(--stacked-border)] bg-white/60 p-10 text-center">
				<p class="text-lg font-medium text-slate-700">No stacks configured yet.</p>
				<p class="mt-2 text-sm text-slate-500">Use the New stack button to add your first hierarchy.</p>
			</div>
		{:else}
			<div class="overflow-x-auto rounded-2xl border border-[var(--stacked-border)] bg-white/85">
				<table class="min-w-full divide-y divide-[var(--stacked-border)] text-left text-sm">
					<thead class="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
						<tr>
							<th class="px-4 py-3">Stack</th>
							<th class="px-4 py-3">Hierarchy</th>
							<th class="px-4 py-3">Sync</th>
							<th class="px-4 py-3">Top PR</th>
							<th class="px-4 py-3">Actions</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-[var(--stacked-border)] text-slate-700">
						{#each stacks as stack (stack.id)}
							<tr class="transition-colors hover:bg-teal-50/50">
								<td class="px-4 py-3 align-top">
									<a href={resolve(`/stacks/${stack.id}`)} class="font-semibold text-teal-800 hover:underline">
										{stack.name}
									</a>
									{#if stack.notes}
										<p class="mt-1 text-xs text-slate-500">{stack.notes}</p>
									{/if}
									<p class="mt-1 font-mono text-[11px] text-slate-500">{stack.repositoryPath}</p>
								</td>
								<td class="px-4 py-3 align-top">
									<p class="font-mono text-xs text-slate-600">{stack.branches.join(' -> ')}</p>
									<p class="mt-1 text-xs text-slate-500">Depth {stack.branches.length}</p>
								</td>
								<td class="px-4 py-3 align-top">
									<Badge color={syncColor[stack.syncState]}>{titleCase(stack.syncState)}</Badge>
									{#if stack.gitError}
										<p class="mt-1 text-xs text-red-600">{stack.gitError}</p>
									{/if}
									{#if stack.ghError}
										<p class="mt-1 text-xs text-amber-700">{stack.ghError}</p>
									{/if}
								</td>
								<td class="px-4 py-3 align-top">
									{#if stack.pullRequest}
										<button
											type="button"
											onclick={() => window.open(stack.pullRequest?.url ?? '', '_blank', 'noopener,noreferrer')}
											class="cursor-pointer font-medium text-teal-700 underline-offset-2 hover:underline"
										>
											#{stack.pullRequest.number} {stack.pullRequest.title}
										</button>
										<p class="mt-1 text-xs text-slate-500">
											{stack.pullRequest.state}{stack.pullRequest.isDraft ? ' (draft)' : ''}
										</p>
									{:else}
										<p class="text-slate-500">No PR linked to {stack.tipBranch}</p>
									{/if}
								</td>
								<td class="px-4 py-3 align-top">
									<div class="flex flex-wrap gap-2">
										<button
											type="button"
											onclick={() => refreshStack(stack.id)}
											disabled={activeRowId === stack.id}
											class="cursor-pointer rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed"
										>
											Refresh
										</button>
										<button
											type="button"
											onclick={() => openEditForm(stack)}
											class="cursor-pointer rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
										>
											Edit
										</button>
										<button
											type="button"
											onclick={() => removeStack(stack.id)}
											disabled={activeRowId === stack.id}
											class="cursor-pointer rounded-md border border-red-300 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed"
										>
											Delete
										</button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</main>
