<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from 'flowbite-svelte';

	import type { FeatureType, StackUpsertInput, StackViewModel } from '$lib/types/stack';

	interface ApiStackResponse {
		stack?: StackViewModel;
		error?: string;
	}

	const featureTypeOptions: Array<{ value: FeatureType; label: string; description: string }> = [
		{ value: 'feature', label: 'Feature', description: 'New capability or user-facing enhancement.' },
		{ value: 'bugfix', label: 'Bugfix', description: 'Fixes incorrect behavior or regressions.' },
		{ value: 'chore', label: 'Chore', description: 'Maintenance, tooling, or cleanup work.' }
	];

	let formName = $state('');
	let formNotes = $state('');
	let formType = $state<FeatureType>('feature');
	let submitting = $state(false);
	let message = $state<string | null>(null);

	function toPayload(): StackUpsertInput {
		return {
			name: formName,
			notes: formNotes,
			type: formType
		};
	}

	async function submitFeature(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		submitting = true;
		message = null;

		try {
			const response = await fetch('/api/stacks', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(toPayload())
			});

			const body = (await response.json()) as ApiStackResponse;
			if (!response.ok || !body.stack) {
				throw new Error(body.error ?? 'Unable to create feature.');
			}

			await goto(resolve(`/stacks/${body.stack.id}`));
		} catch (error) {
			message = error instanceof Error ? error.message : 'Unable to create feature.';
		} finally {
			submitting = false;
		}
	}
</script>

<main class="stacked-shell mx-auto w-full max-w-3xl px-4 py-6 sm:px-8 sm:py-8">
	<section class="stacked-panel stacked-fade-in p-4 sm:p-7">
		<div class="mb-6 border-b stacked-divider pb-4">
			<a href={resolve('/')} class="stacked-link text-sm font-semibold">Back to feature pipeline</a>
			<h1 class="mt-2 text-3xl font-semibold tracking-tight">Create New Feature</h1>
			<p class="mt-2 text-sm stacked-subtle">Define the work item, pick its type, then continue in the feature workspace.</p>
		</div>

		{#if message}
			<div class="mb-5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
				{message}
			</div>
		{/if}

		<form onsubmit={submitFeature} class="stacked-panel-elevated grid gap-4 p-4 sm:p-5">
			<label class="flex flex-col gap-2 text-sm">
				<span class="font-medium text-[var(--stacked-text)]">Feature Title</span>
				<input
					bind:value={formName}
					required
					placeholder="e.g. User authentication system"
					class="rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-3 py-2 text-sm text-[var(--stacked-text)] outline-none ring-0 transition focus:border-[var(--stacked-accent)]"
				/>
			</label>

			<fieldset class="border-0 p-0">
				<legend class="mb-2 text-sm font-medium text-[var(--stacked-text)]">Feature Type</legend>
				<div class="grid gap-2 sm:grid-cols-3">
					{#each featureTypeOptions as option (option.value)}
						<label
							class={`cursor-pointer rounded-lg border bg-[var(--stacked-bg-soft)] p-3 transition hover:border-[var(--stacked-accent)] ${formType === option.value
								? 'border-[var(--stacked-accent)]'
								: 'border-[var(--stacked-border-soft)]'}`}
						>
							<input bind:group={formType} type="radio" class="sr-only" value={option.value} />
							<p class="text-sm font-semibold text-[var(--stacked-text)]">{option.label}</p>
							<p class="mt-1 text-xs stacked-subtle">{option.description}</p>
						</label>
					{/each}
				</div>
			</fieldset>

			<label class="flex flex-col gap-2 text-sm">
				<span class="font-medium text-[var(--stacked-text)]">Description</span>
				<textarea
					bind:value={formNotes}
					rows="4"
					placeholder="Scope, constraints, and intended outcome"
					class="rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-3 py-2 text-sm text-[var(--stacked-text)] outline-none ring-0 transition focus:border-[var(--stacked-accent)]"
				></textarea>
			</label>

			<div class="flex flex-wrap items-center justify-end gap-2">
				<Button href={resolve('/')} size="sm" color="alternative">
					Cancel
				</Button>
				<Button type="submit" size="sm" color="primary" disabled={submitting}>
					{submitting ? 'Creating...' : 'Create Feature'}
				</Button>
			</div>
		</form>
	</section>
</main>
