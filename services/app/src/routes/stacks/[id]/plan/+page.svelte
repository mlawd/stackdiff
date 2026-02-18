<script lang="ts">
	import { resolve } from '$app/paths';

	import { renderMarkdown } from '$lib/markdown';
	import type { StackPlanningSession } from '$lib/types/stack';
	import type { PageData } from './$types';

	interface MessageResponse {
		session?: StackPlanningSession;
		assistantReply?: string;
		autoSavedPlanPath?: string;
		error?: string;
	}

	interface SaveResponse {
		session?: StackPlanningSession;
		savedPlanPath?: string;
		error?: string;
	}

	let { data }: { data: PageData } = $props();

	let session = $state<StackPlanningSession>({
		id: '',
		stackId: '',
		messages: [],
		createdAt: '',
		updatedAt: ''
	});
	let messageInput = $state('');
	let sending = $state(false);
	let saving = $state(false);
	let errorMessage = $state<string | null>(null);
	let successMessage = $state<string | null>(null);
	let initialized = false;

	$effect(() => {
		if (initialized) {
			return;
		}

		session = data.session;
		initialized = true;
	});

	async function sendMessage(event: SubmitEvent): Promise<void> {
		event.preventDefault();

		const content = messageInput.trim();
		if (!content) {
			return;
		}

		sending = true;
		errorMessage = null;
		successMessage = null;

		try {
			const response = await fetch(`/api/stacks/${data.stack.id}/plan/message`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content })
			});

			const body = (await response.json()) as MessageResponse;

			if (!response.ok || !body.session) {
				throw new Error(body.error ?? 'Unable to send message.');
			}

			session = body.session;
			messageInput = '';

			if (body.autoSavedPlanPath) {
				successMessage = `Saved plan to ${body.autoSavedPlanPath} and generated implementation stages.`;
			}
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to send message.';
		} finally {
			sending = false;
		}
	}

	async function savePlan(): Promise<void> {
		saving = true;
		errorMessage = null;
		successMessage = null;

		try {
			const response = await fetch(`/api/stacks/${data.stack.id}/plan/save`, { method: 'POST' });
			const body = (await response.json()) as SaveResponse;

			if (!response.ok || !body.session || !body.savedPlanPath) {
				throw new Error(body.error ?? 'Unable to save plan.');
			}

			session = body.session;
			successMessage = `Saved plan to ${body.savedPlanPath} and generated implementation stages.`;
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to save plan.';
		} finally {
			saving = false;
		}
	}
</script>

<main class="stacked-shell w-full px-3 py-5 sm:px-6 sm:py-7 lg:px-8">
	<section class="stacked-panel stacked-fade-in p-4 sm:p-7">
		<div class="mb-6 flex flex-wrap items-center justify-between gap-3 border-b stacked-divider pb-4">
			<div>
				<a href={resolve(`/stacks/${data.stack.id}`)} class="stacked-link text-sm font-semibold">Return to feature</a>
				<h1 class="mt-2 text-3xl font-semibold tracking-tight">Planning Chat - {data.stack.name}</h1>
				<p class="mt-1 text-sm stacked-subtle">Talk through requirements, lock the implementation plan, then ship by stages.</p>
				<div class="mt-3">
					<span class="stacked-chip stacked-chip-review">Planning Mode</span>
				</div>
			</div>
			<div class="text-right">
				<p class="text-xs stacked-subtle">Session {session.id}</p>
				{#if session.savedAt && session.savedPlanPath}
					<p class="mt-1 text-xs text-emerald-200">
						Saved {new Date(session.savedAt).toLocaleString()} at {session.savedPlanPath}
					</p>
				{/if}
			</div>
		</div>

		{#if errorMessage}
			<div class="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
				{errorMessage}
			</div>
		{/if}

		{#if successMessage}
			<div class="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
				{successMessage}
			</div>
		{/if}

		<div>
			<div class="stacked-panel-elevated stacked-scroll mb-3 h-[26rem] overflow-y-auto p-3.5 sm:h-[35rem] sm:p-5">
					{#if session.messages.length === 0}
						<div class="stacked-chat-font h-full content-center text-sm stacked-subtle">
							<p class="mb-2 font-semibold text-[var(--stacked-text)]">No stages yet.</p>
							<p>Start by describing what you want to ship. Ask questions and iterate until the plan is clear.</p>
						</div>
					{:else}
						<div class="space-y-3">
							{#each session.messages as message (message.id)}
								<div class={`stacked-chat-font max-w-[90%] rounded-2xl border px-4 py-3 text-sm ${message.role === 'user'
									? 'ml-auto border-[var(--stacked-accent)] bg-blue-500/20 text-blue-50'
									: 'mr-auto border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] text-[var(--stacked-text)]'}`}>
									<p class="mb-1 text-[11px] uppercase tracking-wide opacity-70">{message.role === 'assistant' ? 'agent' : message.role}</p>
									<div class="stacked-markdown">
										{@html renderMarkdown(message.content)}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>

			<form onsubmit={sendMessage} class="stacked-panel-elevated stacked-chat-font grid gap-2.5 p-3 sm:gap-3 sm:grid-cols-[1fr_auto] sm:p-4">
					<textarea
						bind:value={messageInput}
						rows="3"
						placeholder="Reply to the agent..."
						class="rounded-xl border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-3 py-2 text-[0.95rem] text-[var(--stacked-text)] outline-none transition focus:border-[var(--stacked-accent)]"
					></textarea>
					<div class="flex gap-2 sm:flex-col sm:items-stretch">
						<button
							type="submit"
							disabled={sending || saving}
							class="cursor-pointer rounded-lg border border-[var(--stacked-accent)] bg-[var(--stacked-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2a97ff] disabled:cursor-not-allowed disabled:opacity-70"
						>
							{sending ? 'Sending...' : 'Send'}
						</button>
						<button
							type="button"
							onclick={savePlan}
							disabled={sending || saving}
							class="cursor-pointer rounded-lg border border-emerald-500/45 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-70"
						>
							{saving ? 'Saving...' : 'Save Plan'}
						</button>
					</div>
					<p class="text-xs stacked-subtle sm:col-span-2">Shift+Enter for new line - Enter to send</p>
				</form>

			<div class="stacked-panel-elevated mt-3 p-4 text-sm">
				<p class="mb-2 text-xs font-semibold uppercase tracking-[0.16em] stacked-subtle">Workflow</p>
				<ol class="stacked-chat-font space-y-1.5 text-sm stacked-subtle">
					<li>1. Clarify requirements with the agent.</li>
					<li>2. Save the plan when scope is locked.</li>
					<li>3. Implement stage-by-stage on branch.</li>
					<li>4. Open PR and progress to review.</li>
				</ol>
				{#if session.savedPlanPath}
					<div class="mt-4 rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] p-3">
						<p class="mb-1 text-[11px] uppercase tracking-wide stacked-subtle">Saved plan path</p>
						<p class="stacked-chat-font break-all text-sm text-[var(--stacked-text)]">{session.savedPlanPath}</p>
					</div>
				{/if}
			</div>
		</div>
	</section>
</main>
