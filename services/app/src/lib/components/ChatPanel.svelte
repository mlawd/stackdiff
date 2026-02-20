<script lang="ts">
	import { tick } from 'svelte';
	import { Spinner } from 'flowbite-svelte';

	import { renderMarkdown } from '$lib/markdown';
	import type {
		PlanningMessage,
		PlanningQuestionAnswer,
		PlanningQuestionDialog,
		PlanningQuestionItem,
		PlanningQuestionOption
	} from '$lib/types/stack';

	interface StreamDonePayload extends Record<string, unknown> {
		assistantReply: string;
		messages?: PlanningMessage[];
	}

	interface StreamErrorPayload {
		message?: string;
	}

	interface SaveResponseBody extends Record<string, unknown> {
		messages?: PlanningMessage[];
		error?: string;
	}

	interface QuestionAnswerSummaryItem {
		question: string;
		answer: string;
	}

	interface StageSummaryItem {
		stageName: string;
		stageDescription: string;
	}

	interface Props {
		streamUrl: string;
		initialMessages: PlanningMessage[];
		initialAwaitingResponse?: boolean;
		saveUrl?: string;
		inputPlaceholder?: string;
		emptyTitle?: string;
		emptyDescription?: string;
		saveButtonLabel?: string;
		formatDoneSuccess?: (payload: StreamDonePayload) => string | null;
		formatSaveSuccess?: (payload: SaveResponseBody) => string | null;
		onSaveResponse?: (payload: SaveResponseBody) => void;
	}

	let {
		streamUrl,
		initialMessages,
		initialAwaitingResponse = false,
		saveUrl,
		inputPlaceholder = 'Reply to the agent...',
		emptyTitle = 'No messages yet.',
		emptyDescription = 'Start by describing what you want to ship.',
		saveButtonLabel = 'Save',
		formatDoneSuccess,
		formatSaveSuccess,
		onSaveResponse
	}: Props = $props();

	let initialized = false;
	let messages = $state<PlanningMessage[]>([]);
	let messagesViewport = $state<HTMLDivElement | null>(null);
	let messageInput = $state('');
	let sending = $state(false);
	let saving = $state(false);
	let streamingReply = $state('');
	let assistantThinking = $state(false);
	let errorMessage = $state<string | null>(null);
	let successMessage = $state<string | null>(null);
	let resumePendingStream = $state(false);
	let activeQuestionDialog = $state<PlanningQuestionDialog | null>(null);
	let questionSelections = $state<Record<number, string[]>>({});
	let questionCustomAnswers = $state<Record<number, string>>({});

	$effect(() => {
		if (initialized) {
			return;
		}

		messages = initialMessages;
		resumePendingStream = initialAwaitingResponse;
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
		if (!initialized || sending) {
			return;
		}

		const pendingQuestion = findPendingQuestionDialog(messages);
		if (!pendingQuestion) {
			if (activeQuestionDialog) {
				activeQuestionDialog = null;
				questionSelections = {};
				questionCustomAnswers = {};
			}
			return;
		}

		if (questionDialogsEqual(activeQuestionDialog, pendingQuestion)) {
			return;
		}

		activeQuestionDialog = pendingQuestion;
		initializeQuestionResponses(pendingQuestion);
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

	function normalizeQuestionOption(option: unknown): PlanningQuestionOption | null {
		if (typeof option === 'string') {
			const label = option.trim();
			if (!label) {
				return null;
			}

			return { label };
		}

		if (typeof option !== 'object' || option === null) {
			return null;
		}

		const candidate = option as {
			label?: unknown;
			text?: unknown;
			value?: unknown;
			description?: unknown;
		};

		const label =
			typeof candidate.label === 'string'
				? candidate.label.trim()
				: typeof candidate.text === 'string'
					? candidate.text.trim()
					: typeof candidate.value === 'string'
						? candidate.value.trim()
						: '';

		if (!label) {
			return null;
		}

		const description =
			typeof candidate.description === 'string' && candidate.description.trim().length > 0
				? candidate.description.trim()
				: undefined;

		return { label, description };
	}

	function normalizeQuestionItem(item: unknown): PlanningQuestionItem | null {
		if (typeof item !== 'object' || item === null) {
			return null;
		}

		const candidate = item as {
			header?: unknown;
			title?: unknown;
			question?: unknown;
			prompt?: unknown;
			text?: unknown;
			label?: unknown;
			options?: unknown;
			choices?: unknown;
			multiple?: unknown;
			allowCustom?: unknown;
			custom?: unknown;
		};

		const header =
			typeof candidate.header === 'string' && candidate.header.trim().length > 0
				? candidate.header.trim()
				: typeof candidate.title === 'string' && candidate.title.trim().length > 0
					? candidate.title.trim()
					: 'Question';

		const question =
			typeof candidate.question === 'string'
				? candidate.question.trim()
				: typeof candidate.prompt === 'string'
					? candidate.prompt.trim()
					: typeof candidate.text === 'string'
						? candidate.text.trim()
						: typeof candidate.label === 'string'
							? candidate.label.trim()
							: '';

		const optionsRaw = Array.isArray(candidate.options)
			? candidate.options
			: Array.isArray(candidate.choices)
				? candidate.choices
				: [];

		const options = optionsRaw
			.map((option) => normalizeQuestionOption(option))
			.filter((option): option is PlanningQuestionOption => option !== null);

		const allowCustom = candidate.allowCustom === true || candidate.custom === true;

		if (!question || (options.length === 0 && !allowCustom)) {
			return null;
		}

		return {
			header,
			question,
			options,
			multiple: candidate.multiple === true,
			allowCustom
		};
	}

	function normalizeQuestionDialog(payload: unknown): PlanningQuestionDialog | null {
		if (typeof payload !== 'object' || payload === null) {
			return null;
		}

		const candidate = payload as {
			questions?: unknown;
			question?: unknown;
			prompt?: unknown;
			options?: unknown;
			choices?: unknown;
		};

		if (Array.isArray(candidate.questions)) {
			const questions = candidate.questions
				.map((item) => normalizeQuestionItem(item))
				.filter((item): item is PlanningQuestionItem => item !== null);

			if (questions.length > 0) {
				return { questions };
			}
		}

		if (candidate.question || candidate.prompt || candidate.options || candidate.choices) {
			const fallback = normalizeQuestionItem(payload);
			if (fallback) {
				return {
					questions: [fallback]
				};
			}

			const nested = normalizeQuestionItem(candidate.question);
			if (nested) {
				return {
					questions: [nested]
				};
			}
		}

		return null;
	}

	function parseQuestionDialogMessage(content: string): PlanningQuestionDialog | null {
		const trimmed = content.trim();
		if (!trimmed.startsWith('{')) {
			return null;
		}

		try {
			const parsed = JSON.parse(trimmed) as unknown;
			return normalizeQuestionDialog(parsed);
		} catch {
			return null;
		}
	}

	function parseQuestionAnswerSummary(content: string): QuestionAnswerSummaryItem[] | null {
		const trimmed = content.trim();
		if (!trimmed.startsWith('{')) {
			return null;
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed) as unknown;
		} catch {
			return null;
		}

		if (typeof parsed !== 'object' || parsed === null) {
			return null;
		}

		const candidate = parsed as {
			type?: unknown;
			answers?: unknown;
		};

		if (candidate.type !== 'question_answer' || !Array.isArray(candidate.answers)) {
			return null;
		}

		const summary = candidate.answers
			.map((entry) => {
				if (typeof entry !== 'object' || entry === null) {
					return null;
				}

				const answer = entry as {
					header?: unknown;
					question?: unknown;
					selected?: unknown;
					customAnswer?: unknown;
				};

				const question =
					typeof answer.question === 'string' && answer.question.trim().length > 0
						? answer.question.trim()
						: typeof answer.header === 'string' && answer.header.trim().length > 0
							? answer.header.trim()
							: 'Question';

				const selected = Array.isArray(answer.selected)
					? answer.selected
							.map((value) => (typeof value === 'string' ? value.trim() : ''))
							.filter((value) => value.length > 0)
					: [];

				const customAnswer =
					typeof answer.customAnswer === 'string' && answer.customAnswer.trim().length > 0
						? answer.customAnswer.trim()
						: undefined;

				const parts = [...selected, ...(customAnswer ? [customAnswer] : [])];
				if (parts.length === 0) {
					return null;
				}

				return {
					question,
					answer: parts.join(', ')
				};
			})
			.filter((item): item is QuestionAnswerSummaryItem => item !== null);

		return summary.length > 0 ? summary : null;
	}

	function parseStageSummary(content: string): StageSummaryItem[] | null {
		const trimmed = content.trim();
		if (!trimmed.startsWith('{')) {
			return null;
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed) as unknown;
		} catch {
			return null;
		}

		if (typeof parsed !== 'object' || parsed === null) {
			return null;
		}

		const candidate = parsed as {
			stages?: unknown;
		};

		if (!Array.isArray(candidate.stages)) {
			return null;
		}

		const stages = candidate.stages
			.map((entry) => {
				if (typeof entry !== 'object' || entry === null) {
					return null;
				}

				const stage = entry as {
					stageName?: unknown;
					name?: unknown;
					title?: unknown;
					stageDescription?: unknown;
					description?: unknown;
					details?: unknown;
				};

				const stageName =
					typeof stage.stageName === 'string'
						? stage.stageName.trim()
						: typeof stage.name === 'string'
							? stage.name.trim()
							: typeof stage.title === 'string'
								? stage.title.trim()
								: '';

				const stageDescription =
					typeof stage.stageDescription === 'string'
						? stage.stageDescription.trim()
						: typeof stage.description === 'string'
							? stage.description.trim()
							: typeof stage.details === 'string'
								? stage.details.trim()
								: '';

				if (!stageName || !stageDescription) {
					return null;
				}

				return { stageName, stageDescription };
			})
			.filter((item): item is StageSummaryItem => item !== null);

		return stages.length > 0 ? stages : null;
	}

	function findPendingQuestionDialog(history: PlanningMessage[]): PlanningQuestionDialog | null {
		for (let index = history.length - 1; index >= 0; index -= 1) {
			const message = history[index];

			if (message.role === 'user') {
				return null;
			}

			if (message.role !== 'assistant') {
				continue;
			}

			const question = parseQuestionDialogMessage(message.content);
			if (question) {
				return question;
			}
		}

		return null;
	}

	function questionDialogsEqual(
		left: PlanningQuestionDialog | null,
		right: PlanningQuestionDialog | null
	): boolean {
		if (!left || !right) {
			return left === right;
		}

		return JSON.stringify(left) === JSON.stringify(right);
	}

	function initializeQuestionResponses(dialog: PlanningQuestionDialog): void {
		const nextSelections: Record<number, string[]> = {};
		const nextCustomAnswers: Record<number, string> = {};

		dialog.questions.forEach((item, index) => {
			if (item.multiple) {
				nextSelections[index] = [];
			} else {
				nextSelections[index] = item.options[0] ? [item.options[0].label] : [];
			}
			nextCustomAnswers[index] = '';
		});

		questionSelections = nextSelections;
		questionCustomAnswers = nextCustomAnswers;
	}

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

	function applyStreamEvent(eventBlock: string): {
		done?: StreamDonePayload;
		error?: StreamErrorPayload;
		question?: PlanningQuestionDialog;
	} {
		const lines = eventBlock.split('\n');
		const event =
			lines
				.find((line) => line.startsWith('event:'))
				?.slice(6)
				.trim() ?? 'message';
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
				typeof payload === 'object' &&
				payload !== null &&
				'chunk' in payload &&
				typeof payload.chunk === 'string'
					? payload.chunk
					: '';
			if (chunk) {
				assistantThinking = false;
				streamingReply += chunk;
			}
			return {};
		}

		if (event === 'question') {
			const question = normalizeQuestionDialog(payload);
			if (question) {
				return { question };
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

	async function streamMessage(options: { content?: string; watch: boolean }): Promise<boolean> {
		let ok = true;
		sending = true;
		errorMessage = null;
		successMessage = null;
		streamingReply = '';
		assistantThinking = true;
		activeQuestionDialog = null;
		questionSelections = {};
		questionCustomAnswers = {};

		if (!options.watch && options.content) {
			addOptimisticUserMessage(options.content);
		}

		try {
			const response = await fetch(streamUrl, {
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
						activeQuestionDialog = result.question;
						initializeQuestionResponses(result.question);
					}

					if (result.done) {
						if (result.done.messages && result.done.messages.length > 0) {
							messages = result.done.messages;
						} else {
							appendAssistantMessage(result.done.assistantReply);
						}

						if (formatDoneSuccess) {
							const doneSuccessMessage = formatDoneSuccess(result.done);
							if (doneSuccessMessage) {
								successMessage = doneSuccessMessage;
							}
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

	async function sendMessage(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		await submitCurrentMessage();
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

	function isQuestionOptionSelected(questionIndex: number, optionLabel: string): boolean {
		const selected = questionSelections[questionIndex] ?? [];
		return selected.includes(optionLabel);
	}

	function setSingleQuestionOption(questionIndex: number, optionLabel: string): void {
		questionSelections = {
			...questionSelections,
			[questionIndex]: [optionLabel]
		};

		questionCustomAnswers = {
			...questionCustomAnswers,
			[questionIndex]: ''
		};
	}

	function toggleQuestionOption(questionIndex: number, optionLabel: string, checked: boolean): void {
		const selected = questionSelections[questionIndex] ?? [];
		if (checked) {
			questionSelections = {
				...questionSelections,
				[questionIndex]: selected.includes(optionLabel) ? selected : [...selected, optionLabel]
			};
			return;
		}

		questionSelections = {
			...questionSelections,
			[questionIndex]: selected.filter((value) => value !== optionLabel)
		};
	}

	function setQuestionCustomAnswer(questionIndex: number, value: string): void {
		questionCustomAnswers = {
			...questionCustomAnswers,
			[questionIndex]: value
		};

		if (value.trim().length > 0) {
			questionSelections = {
				...questionSelections,
				[questionIndex]: []
			};
		}
	}

	function canSubmitQuestionAnswers(): boolean {
		if (!activeQuestionDialog) {
			return false;
		}

		return activeQuestionDialog.questions.every((item, index) => {
			const selected = questionSelections[index] ?? [];
			const customAnswer = (questionCustomAnswers[index] ?? '').trim();
			return selected.length > 0 || customAnswer.length > 0;
		});
	}

	function buildQuestionAnswers(): PlanningQuestionAnswer[] {
		if (!activeQuestionDialog) {
			return [];
		}

		return activeQuestionDialog.questions.map((item, index) => {
			const selected = questionSelections[index] ?? [];
			const customAnswer = (questionCustomAnswers[index] ?? '').trim();

			return {
				header: item.header,
				question: item.question,
				selected,
				customAnswer: customAnswer.length > 0 ? customAnswer : undefined
			};
		});
	}

	async function submitQuestionAnswer(): Promise<void> {
		if (!activeQuestionDialog || sending || saving || !canSubmitQuestionAnswers()) {
			return;
		}

		const answers = buildQuestionAnswers();
		const content = JSON.stringify({ type: 'question_answer', answers });
		await streamMessage({ content, watch: false });
	}

	async function saveConversation(): Promise<void> {
		if (!saveUrl) {
			return;
		}

		saving = true;
		errorMessage = null;
		successMessage = null;

		try {
			const response = await fetch(saveUrl, {
				method: 'POST'
			});
			const body = (await response.json()) as SaveResponseBody;

			if (!response.ok) {
				throw new Error(body.error ?? 'Unable to save.');
			}

			if (body.messages && body.messages.length > 0) {
				messages = body.messages;
			}

			if (onSaveResponse) {
				onSaveResponse(body);
			}

			if (formatSaveSuccess) {
				const saveSuccessMessage = formatSaveSuccess(body);
				if (saveSuccessMessage) {
					successMessage = saveSuccessMessage;
				}
			} else {
				successMessage = 'Saved.';
			}
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to save.';
		} finally {
			saving = false;
		}
	}
</script>

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

<div
	bind:this={messagesViewport}
	class="stacked-scroll mb-3 h-[26rem] overflow-y-auto p-1 sm:h-[35rem]"
>
	{#if messages.length === 0 && !sending}
		<div class="stacked-chat-font h-full content-center text-sm stacked-subtle">
			<p class="mb-2 font-semibold text-[var(--stacked-text)]">{emptyTitle}</p>
			<p>{emptyDescription}</p>
		</div>
	{:else}
		<div class="space-y-3">
			{#each messages as message (message.id)}
				{@const messageQuestionDialog =
					message.role === 'assistant' ? parseQuestionDialogMessage(message.content) : null}
				{@const messageQuestionAnswers =
					message.role === 'user' ? parseQuestionAnswerSummary(message.content) : null}
				{@const messageStageSummary =
					message.role === 'assistant' ? parseStageSummary(message.content) : null}
				<div
					class={`stacked-chat-font w-fit max-w-[90%] rounded-2xl border px-4 py-3 text-sm ${
						message.role === 'user'
							? 'ml-auto rounded-br-none border-[var(--stacked-accent)] bg-blue-500/20 text-blue-50'
							: 'mr-auto rounded-bl-none border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] text-[var(--stacked-text)]'
					}`}
				>
					<p class="mb-1 text-[11px] uppercase tracking-wide opacity-70">
						{message.role === 'assistant' ? 'agent' : message.role}
					</p>
					{#if messageQuestionDialog}
						<div class="space-y-4">
							{#each messageQuestionDialog.questions as question, questionIndex (`${question.header}-${question.question}-${questionIndex}`)}
								<div
									class="rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)]/60 p-3"
								>
									<p class="text-xs font-semibold uppercase tracking-wide opacity-70">
										{question.header}
									</p>
									<p class="mt-1 text-sm">{question.question}</p>
									<div class="mt-2 space-y-2">
										{#each question.options as option, optionIndex (`${option.label}-${optionIndex}`)}
											<div
												class="rounded-md border border-transparent px-2 py-1.5"
											>
												<span class="leading-snug">
													<span class="block text-sm">{option.label}</span>
													{#if option.description}
														<span class="stacked-subtle block text-xs">{option.description}</span>
													{/if}
												</span>
											</div>
										{/each}
									</div>
									{#if question.allowCustom}
										<p class="mt-3 stacked-subtle text-xs">Custom answer allowed</p>
									{/if}
								</div>
							{/each}
						</div>
					{:else if messageQuestionAnswers}
						<div class="space-y-1.5">
							{#each messageQuestionAnswers as answer, answerIndex (`${answer.question}-${answer.answer}-${answerIndex}`)}
								<p class="leading-snug">
									<span class="stacked-subtle text-xs uppercase tracking-wide">{answer.question}</span>
									<span class="mx-1 opacity-70">:</span>
									<span class="text-sm">{answer.answer}</span>
								</p>
							{/each}
						</div>
					{:else if messageStageSummary}
						<div class="space-y-2">
							<p class="stacked-subtle text-xs uppercase tracking-wide">Stages</p>
							{#each messageStageSummary as stage, stageIndex (`${stage.stageName}-${stageIndex}`)}
								<p class="leading-snug">
									<span class="text-sm font-semibold">{stage.stageName}</span>
									<span class="mx-1 opacity-70">-</span>
									<span class="text-sm">{stage.stageDescription}</span>
								</p>
							{/each}
						</div>
					{:else}
						<div class="stacked-markdown">
							{@html renderMarkdown(message.content)}
						</div>
					{/if}
				</div>
			{/each}

			{#if sending}
				<div
					class="stacked-chat-font mr-auto w-fit max-w-[90%] rounded-2xl rounded-bl-none border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-4 py-3 text-sm text-[var(--stacked-text)]"
				>
					<p class="mb-1 text-[11px] uppercase tracking-wide opacity-70">agent</p>
					{#if assistantThinking && !streamingReply}
						<div class="stacked-subtle flex items-center gap-2">
							<Spinner
								size="4"
								currentFill="var(--stacked-accent)"
								currentColor="color-mix(in oklab, var(--stacked-border-soft) 82%, #9aa3b7 18%)"
								class="opacity-90"
							/>
							<span>Assistant is thinking...</span>
						</div>
					{:else}
						<div class="stacked-markdown">
							{@html renderMarkdown(streamingReply)}
						</div>
					{/if}
				</div>
			{/if}

			{#if activeQuestionDialog}
				<div
					class="stacked-chat-font mr-auto w-fit max-w-[90%] rounded-2xl rounded-bl-none border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-4 py-3 text-sm text-[var(--stacked-text)]"
				>
					<p class="mb-1 text-[11px] uppercase tracking-wide opacity-70">agent</p>
					<div class="space-y-4">
						{#each activeQuestionDialog.questions as question, questionIndex (`${question.header}-${question.question}-${questionIndex}`)}
							<div
								class="rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)]/60 p-3"
							>
								<p class="text-xs font-semibold uppercase tracking-wide opacity-70">
									{question.header}
								</p>
								<p class="mt-1 text-sm">{question.question}</p>
								<div class="mt-2 space-y-2">
									{#each question.options as option, optionIndex (`${option.label}-${optionIndex}`)}
										<label
											class="flex items-start gap-2 rounded-md border border-transparent px-2 py-1.5 transition hover:border-[var(--stacked-border-soft)] hover:bg-[var(--stacked-bg)]/50"
										>
											<input
												type={question.multiple ? 'checkbox' : 'radio'}
												name={`question-${questionIndex}`}
												checked={isQuestionOptionSelected(questionIndex, option.label)}
												onchange={(event) => {
													const target = event.currentTarget as HTMLInputElement;
													if (question.multiple) {
														toggleQuestionOption(questionIndex, option.label, target.checked);
														return;
													}
													setSingleQuestionOption(questionIndex, option.label);
												}}
											/>
											<span class="leading-snug">
												<span class="block text-sm">{option.label}</span>
												{#if option.description}
													<span class="stacked-subtle block text-xs">{option.description}</span>
												{/if}
											</span>
										</label>
									{/each}
								</div>
								{#if question.allowCustom}
									<label class="mt-3 flex flex-col gap-1 text-sm">
										<span class="stacked-subtle text-xs">Type your own answer</span>
										<input
											value={questionCustomAnswers[questionIndex] ?? ''}
											oninput={(event) =>
												setQuestionCustomAnswer(questionIndex, (event.currentTarget as HTMLInputElement).value)}
											placeholder="Type your own answer"
											class="rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-3 py-2 text-sm text-[var(--stacked-text)] outline-none transition focus:border-[var(--stacked-accent)]"
										/>
									</label>
								{/if}
							</div>
						{/each}
					</div>
					<div class="mt-4 flex justify-end">
						<button
							type="button"
							onclick={submitQuestionAnswer}
							disabled={sending || saving || !canSubmitQuestionAnswers()}
							class="cursor-pointer rounded-lg border border-[var(--stacked-accent)] bg-[var(--stacked-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2a97ff] disabled:cursor-not-allowed disabled:opacity-70"
						>
							Send Answers
						</button>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<form
	onsubmit={sendMessage}
	class="stacked-chat-font mt-2 grid gap-2.5 border-t stacked-divider pt-3 sm:grid-cols-[1fr_auto] sm:gap-3 sm:pt-4"
>
	<textarea
		bind:value={messageInput}
		onkeydown={handleInputKeydown}
		rows="3"
		placeholder={inputPlaceholder}
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
		{#if saveUrl}
			<button
				type="button"
				onclick={saveConversation}
				disabled={sending || saving}
				class="cursor-pointer rounded-lg border border-emerald-500/45 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-70"
			>
				{saving ? 'Saving...' : saveButtonLabel}
			</button>
		{/if}
	</div>
	<p class="text-xs stacked-subtle sm:col-span-2">Enter for new line, Cmd/Ctrl+Enter to send</p>
</form>
