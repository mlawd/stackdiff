<script lang="ts">
	import { resolve } from '$app/paths';
	import { tick } from 'svelte';

	import { renderMarkdown } from '$lib/markdown';
	import type { PlanningMessage, StackPlanningSession } from '$lib/types/stack';
	import type { PageData } from './$types';

	interface SaveResponse {
		session?: StackPlanningSession;
		messages?: PlanningMessage[];
		savedPlanPath?: string;
		error?: string;
	}

	interface StreamDonePayload {
		assistantReply: string;
		autoSavedPlanPath?: string;
		messages?: PlanningMessage[];
	}

interface StreamErrorPayload {
		message?: string;
	}

	interface StreamQuestionPayload {
		prompt: string;
		options: string[];
		allowCustom?: boolean;
	}

	let { data }: { data: PageData } = $props();

	let session = $state<StackPlanningSession>({
		id: '',
		stackId: '',
		createdAt: '',
		updatedAt: ''
	});
	let messages = $state<PlanningMessage[]>([]);
	let messagesViewport = $state<HTMLDivElement | null>(null);
	let messageInput = $state('');
	let sending = $state(false);
	let saving = $state(false);
	let streamingReply = $state('');
	let assistantThinking = $state(false);
	let errorMessage = $state<string | null>(null);
	let successMessage = $state<string | null>(null);
	let initialized = false;
	let resumePendingStream = $state(false);
	let activeQuestion = $state<StreamQuestionPayload | null>(null);
	let selectedQuestionAnswer = $state('');
	let customQuestionAnswer = $state('');

	$effect(() => {
		if (initialized) {
			return;
		}

		session = data.session;
		messages = data.messages;
		resumePendingStream = data.awaitingResponse;
		initialized = true;
	});

	$effect(() => {
		if (!initialized || !resumePendingStream || sending) {
			return;
		}

		resumePendingStream = false;
		void streamMessage({ watch: true });
	});

	$effect(() => {
		messages.length;
		streamingReply;
		assistantThinking;

		if (!initialized) {
			return;
		}

		void scrollChatToBottom();
	});

	function addOptimisticUserMessage(content: string): void {
		messages = [
			...messages,
			{
				id: `optimistic-${crypto.randomUUID()}`,
				role: 'user',
				content,
				createdAt: new Date().toISOString()
			}
		];
	}

	function appendAssistantMessage(content: string): void {
		const trimmed = content.trim();
		if (!trimmed) {
			return;
		}

		messages = [
			...messages,
			{
				id: `optimistic-assistant-${crypto.randomUUID()}`,
				role: 'assistant',
				content: trimmed,
				createdAt: new Date().toISOString()
			}
		];
	}

	async function streamMessage(options: {
		content?: string;
		watch: boolean;
	}): Promise<boolean> {
		let ok = true;
		sending = true;
		errorMessage = null;
		successMessage = null;
		streamingReply = '';
		assistantThinking = true;
		activeQuestion = null;
		selectedQuestionAnswer = '';
		customQuestionAnswer = '';

		if (!options.watch && options.content) {
			addOptimisticUserMessage(options.content);
		}

		try {
			const response = await fetch(`/api/stacks/${data.stack.id}/plan/message/stream`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(options.watch ? { watch: true } : { content: options.content })
			});

			if (!response.ok) {
				const body = (await response.json()) as { error?: string };
				throw new Error(body.error ?? 'Unable to send message.');
			}

			if (!response.body) {
				throw new Error('Streaming response body missing.');
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffered = '';

			while (true) {
				const { value, done } = await reader.read();
				if (done) {
					break;
				}

				buffered += decoder.decode(value, { stream: true });

				while (buffered.includes('\n\n')) {
					const splitAt = buffered.indexOf('\n\n');
					const eventBlock = buffered.slice(0, splitAt);
					buffered = buffered.slice(splitAt + 2);

					const result = applyStreamEvent(eventBlock);
					if (result.error) {
						throw new Error(result.error.message ?? 'Streaming failed.');
					}

					if (result.question) {
						activeQuestion = result.question;
						selectedQuestionAnswer = result.question.options[0] ?? '';
						customQuestionAnswer = '';
					}

					if (result.done) {
						if (result.done.messages && result.done.messages.length > 0) {
							messages = result.done.messages;
						} else {
							appendAssistantMessage(result.done.assistantReply);
						}
						if (result.done.autoSavedPlanPath) {
							successMessage = `Saved plan to ${result.done.autoSavedPlanPath} and generated implementation stages.`;
						}
					}
				}
			}
		} catch (error) {
			ok = false;
			errorMessage = error instanceof Error ? error.message : 'Unable to send message.';
		} finally {
			sending = false;
			assistantThinking = false;
			streamingReply = '';
		}

		return ok;
	}

	function applyStreamEvent(eventBlock: string): {
		done?: StreamDonePayload;
		error?: StreamErrorPayload;
		question?: StreamQuestionPayload;
	} {
		const lines = eventBlock.split('\n');
		const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() ?? 'message';
		const dataLine = lines
			.filter((line) => line.startsWith('data:'))
			.map((line) => line.slice(5).trim())
			.join('');

		if (!dataLine) {
			return {};
		}

		let payload: unknown;
		try {
			payload = JSON.parse(dataLine) as unknown;
		} catch {
			return {};
		}

		if (event === 'start') {
			assistantThinking = true;
			return {};
		}

		if (event === 'delta') {
			const chunk =
				typeof payload === 'object' && payload !== null && 'chunk' in payload && typeof payload.chunk === 'string'
					? payload.chunk
					: '';
			if (chunk) {
				assistantThinking = false;
				streamingReply += chunk;
			}
			return {};
		}

		if (event === 'question' && typeof payload === 'object' && payload !== null) {
			const candidate = payload as Partial<StreamQuestionPayload>;
			if (typeof candidate.prompt === 'string' && Array.isArray(candidate.options)) {
				const normalizedOptions = candidate.options.filter(
					(option): option is string => typeof option === 'string' && option.trim().length > 0
				);
				if (normalizedOptions.length === 0) {
					return {};
				}

				return {
					question: {
						prompt: candidate.prompt,
						options: normalizedOptions,
						allowCustom: candidate.allowCustom === true
					}
				};
			}
		}

		if (event === 'done' && typeof payload === 'object' && payload !== null) {
			return { done: payload as StreamDonePayload };
		}

		if (event === 'error' && typeof payload === 'object' && payload !== null) {
			return { error: payload as StreamErrorPayload };
		}

		return {};
	}

	async function sendMessage(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		await submitCurrentMessage();
	}

	async function submitCurrentMessage(): Promise<void> {
		if (sending || saving) {
			return;
		}

		const content = messageInput.trim();
		if (!content) {
			return;
		}

		messageInput = '';

		const ok = await streamMessage({ content, watch: false });
		if (!ok) {
			messageInput = content;
		}
	}

	async function handleInputKeydown(event: KeyboardEvent): Promise<void> {
		if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) {
			return;
		}

		event.preventDefault();
		await submitCurrentMessage();
	}

	async function scrollChatToBottom(): Promise<void> {
		await tick();
		if (!messagesViewport) {
			return;
		}

		messagesViewport.scrollTop = messagesViewport.scrollHeight;
	}

	async function submitQuestionAnswer(): Promise<void> {
		if (!activeQuestion || sending || saving) {
			return;
		}

		const custom = customQuestionAnswer.trim();
		const answer = custom.length > 0 ? custom : selectedQuestionAnswer;
		if (!answer.trim()) {
			return;
		}

		await streamMessage({ content: answer.trim(), watch: false });
	}

	async function savePlan(): Promise<void> {
		saving = true;
		errorMessage = null;
		successMessage = null;

		try {
			const response = await fetch(`/api/stacks/${data.stack.id}/plan/save`, { method: 'POST' });
			const body = (await response.json()) as SaveResponse;

			if (!response.ok || !body.session || !body.savedPlanPath || !body.messages) {
				throw new Error(body.error ?? 'Unable to save plan.');
			}

			session = body.session;
			messages = body.messages;
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
			<div bind:this={messagesViewport} class="stacked-panel-elevated stacked-scroll mb-3 h-[26rem] overflow-y-auto p-3.5 sm:h-[35rem] sm:p-5">
				{#if messages.length === 0 && !sending}
					<div class="stacked-chat-font h-full content-center text-sm stacked-subtle">
						<p class="mb-2 font-semibold text-[var(--stacked-text)]">No stages yet.</p>
						<p>Start by describing what you want to ship. Ask questions and iterate until the plan is clear.</p>
					</div>
				{:else}
					<div class="space-y-3">
						{#each messages as message (message.id)}
							<div class={`stacked-chat-font max-w-[90%] rounded-2xl border px-4 py-3 text-sm ${message.role === 'user'
								? 'ml-auto border-[var(--stacked-accent)] bg-blue-500/20 text-blue-50'
								: 'mr-auto border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] text-[var(--stacked-text)]'}`}>
								<p class="mb-1 text-[11px] uppercase tracking-wide opacity-70">{message.role === 'assistant' ? 'agent' : message.role}</p>
								<div class="stacked-markdown">
									{@html renderMarkdown(message.content)}
								</div>
							</div>
						{/each}

						{#if sending}
							<div class="stacked-chat-font mr-auto max-w-[90%] rounded-2xl border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-4 py-3 text-sm text-[var(--stacked-text)]">
								<p class="mb-1 text-[11px] uppercase tracking-wide opacity-70">agent</p>
								{#if assistantThinking && !streamingReply}
									<p class="stacked-subtle">Assistant is thinking...</p>
								{:else}
									<div class="stacked-markdown">{@html renderMarkdown(streamingReply)}</div>
								{/if}
							</div>
						{/if}

						{#if activeQuestion}
							<div class="stacked-chat-font mr-auto max-w-[90%] rounded-2xl border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-4 py-3 text-sm text-[var(--stacked-text)]">
								<p class="mb-1 text-[11px] uppercase tracking-wide opacity-70">agent</p>
								<p class="mb-3 text-sm text-[var(--stacked-text)]">{activeQuestion.prompt}</p>
								<div class="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
									<label class="flex flex-col gap-1 text-sm">
										<span class="stacked-subtle text-xs">Choose an answer</span>
										<select
											bind:value={selectedQuestionAnswer}
											class="rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-3 py-2 text-sm text-[var(--stacked-text)] outline-none transition focus:border-[var(--stacked-accent)]"
										>
											{#each activeQuestion.options as option (option)}
												<option value={option}>{option}</option>
											{/each}
										</select>
									</label>
									<button
										type="button"
										onclick={submitQuestionAnswer}
										disabled={sending || saving || (!selectedQuestionAnswer && !customQuestionAnswer.trim())}
										class="cursor-pointer rounded-lg border border-[var(--stacked-accent)] bg-[var(--stacked-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2a97ff] disabled:cursor-not-allowed disabled:opacity-70"
									>
										Send Answer
									</button>
								</div>
								{#if activeQuestion.allowCustom}
									<label class="mt-3 flex flex-col gap-1 text-sm">
										<span class="stacked-subtle text-xs">Or type a custom answer</span>
										<input
											bind:value={customQuestionAnswer}
											placeholder="Type your own answer"
											class="rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-3 py-2 text-sm text-[var(--stacked-text)] outline-none transition focus:border-[var(--stacked-accent)]"
										/>
									</label>
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<form onsubmit={sendMessage} class="stacked-panel-elevated stacked-chat-font grid gap-2.5 p-3 sm:grid-cols-[1fr_auto] sm:gap-3 sm:p-4">
				<textarea
					bind:value={messageInput}
					onkeydown={handleInputKeydown}
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
						{sending ? 'Streaming...' : 'Send'}
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
				<p class="text-xs stacked-subtle sm:col-span-2">Enter for new line, Cmd/Ctrl+Enter to send</p>
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
