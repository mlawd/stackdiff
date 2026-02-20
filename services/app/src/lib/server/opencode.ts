import { env } from '$env/dynamic/private';
import { createOpencode, type OpencodeClient, type Part } from '@opencode-ai/sdk';

import type {
	PlanningMessage,
	PlanningQuestionDialog,
	PlanningQuestionItem,
	PlanningQuestionOption
} from '$lib/types/stack';

export type OpencodeStreamEvent =
	| {
			type: 'delta';
			chunk: string;
	  }
	| {
			type: 'question';
			question: PlanningQuestionDialog;
	  };

export type OpencodeHistoryLoadState = 'loaded' | 'empty' | 'unavailable';
export type OpencodeAgent = 'plan' | 'build';

export interface OpencodeHistoryLoadResult {
	state: OpencodeHistoryLoadState;
	messages: PlanningMessage[];
}

interface OpencodeDirectoryOptions {
	directory?: string;
}

export type OpencodeSessionRuntimeState = 'idle' | 'busy' | 'retry' | 'missing';

export interface OpencodeTodo {
	content: string;
	status: string;
	priority: string;
}

const MAX_ERROR_BODY_LENGTH = 300;

type OpencodeRuntime = {
	client: OpencodeClient;
	close: () => void;
};

declare global {
	// eslint-disable-next-line no-var
	var __stackedOpencodeRuntime: Promise<OpencodeRuntime> | undefined;
}

function isDebugEnabled(): boolean {
	const value = env.OPENCODE_DEBUG?.trim().toLowerCase();
	return value === '1' || value === 'true' || value === 'yes';
}

function debugLog(message: string, details?: unknown): void {
	if (!isDebugEnabled()) {
		return;
	}

	if (details === undefined) {
		console.info(`[opencode] ${message}`);
		return;
	}

	console.info(`[opencode] ${message}`, details);
}

function truncate(value: string): string {
	if (value.length <= MAX_ERROR_BODY_LENGTH) {
		return value;
	}

	return `${value.slice(0, MAX_ERROR_BODY_LENGTH)}...`;
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

function unwrapData<T>(result: {
	data?: T;
	error?: unknown;
	response: Response;
}): T {
	if (result.data !== undefined) {
		return result.data;
	}

	throwFromResultError(result);
	throw new Error('Unexpected opencode response shape.');
}

function throwFromResultError(result: { error?: unknown; response: Response }): never {
	if (typeof result.error === 'object' && result.error !== null) {
		const candidate = result.error as { data?: unknown; message?: unknown };
		if (typeof candidate.message === 'string' && candidate.message.trim().length > 0) {
			throw new Error(candidate.message);
		}

		if (typeof candidate.data === 'object' && candidate.data !== null) {
			const details = candidate.data as { message?: unknown };
			if (typeof details.message === 'string' && details.message.trim().length > 0) {
				throw new Error(details.message);
			}
		}
	}

	throw new Error(`opencode request failed with status ${result.response.status}.`);
}

function assertNoResultError(result: { error?: unknown; response: Response }): void {
	if (result.error !== undefined) {
		throwFromResultError(result);
	}

	if (!result.response.ok) {
		throw new Error(`opencode request failed with status ${result.response.status}.`);
	}
}

function getServerModel(): { providerID: string; modelID: string } | undefined {
	const providerID = env.OPENCODE_PROVIDER_ID?.trim();
	const modelID = env.OPENCODE_MODEL_ID?.trim();

	if (providerID && modelID) {
		return { providerID, modelID };
	}

	const combined = env.OPENCODE_MODEL?.trim();
	if (!combined || !combined.includes('/')) {
		return undefined;
	}

	const [provider, ...rest] = combined.split('/');
	const parsedProvider = provider?.trim();
	const parsedModel = rest.join('/').trim();

	if (!parsedProvider || !parsedModel) {
		return undefined;
	}

	return {
		providerID: parsedProvider,
		modelID: parsedModel
	};
}

function getDirectory(options?: OpencodeDirectoryOptions): string {
	const directory = options?.directory?.trim();
	return directory && directory.length > 0 ? directory : process.cwd();
}

function getServerPort(): number | undefined {
	const value = env.OPENCODE_SERVER_PORT?.trim();
	if (!value) {
		return undefined;
	}

	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return undefined;
	}

	return parsed;
}

function asIsoDate(value: number | undefined): string {
	if (typeof value !== 'number' || Number.isNaN(value)) {
		return new Date().toISOString();
	}

	return new Date(value).toISOString();
}

function textFromParts(parts: Part[]): string {
	const text = parts
		.filter((part): part is Extract<Part, { type: 'text' }> => part.type === 'text')
		.map((part) => part.text.trim())
		.filter((part) => part.length > 0)
		.join('\n\n');

	if (!text) {
		throw new Error('opencode returned no assistant text in message parts.');
	}

	return text;
}

function toPlanningMessages(entries: Array<{ info: { id: string; role: string; time: { created: number } }; parts: Part[] }>): PlanningMessage[] {
	return entries
		.map((entry) => {
			if (entry.info.role !== 'assistant' && entry.info.role !== 'user' && entry.info.role !== 'system') {
				return null;
			}

			const content = entry.parts
				.filter((part): part is Extract<Part, { type: 'text' }> => part.type === 'text')
				.map((part) => part.text.trim())
				.filter((part) => part.length > 0)
				.join('\n\n');

			if (!content) {
				return null;
			}

			return {
				id: entry.info.id,
				role: entry.info.role,
				content,
				createdAt: asIsoDate(entry.info.time.created)
			} as PlanningMessage;
		})
		.filter((message): message is PlanningMessage => message !== null);
}

function normalizeQuestionOption(value: unknown): PlanningQuestionOption | null {
	if (typeof value === 'string') {
		const label = value.trim();
		if (!label) {
			return null;
		}

		return { label };
	}

	if (typeof value !== 'object' || value === null) {
		return null;
	}

	const candidate = value as {
		label?: unknown;
		value?: unknown;
		text?: unknown;
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

function toQuestionItem(value: unknown): PlanningQuestionItem | null {
	if (typeof value !== 'object' || value === null) {
		return null;
	}

	const candidate = value as {
		header?: unknown;
		title?: unknown;
		prompt?: unknown;
		question?: unknown;
		text?: unknown;
		label?: unknown;
		options?: unknown;
		choices?: unknown;
		allowCustom?: unknown;
		custom?: unknown;
		multiple?: unknown;
	};

	const header =
		typeof candidate.header === 'string'
			? candidate.header.trim()
			: typeof candidate.title === 'string'
				? candidate.title.trim()
				: 'Question';

	const promptRaw =
		typeof candidate.prompt === 'string'
			? candidate.prompt
			: typeof candidate.question === 'string'
				? candidate.question
				: typeof candidate.text === 'string'
					? candidate.text
					: typeof candidate.label === 'string'
						? candidate.label
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

	if (!promptRaw.trim() || (options.length === 0 && !allowCustom)) {
		return null;
	}

	return {
		header,
		question: promptRaw.trim(),
		options,
		multiple: candidate.multiple === true,
		allowCustom
	};
}

function toQuestionDialog(payload: unknown): PlanningQuestionDialog | null {
	if (typeof payload !== 'object' || payload === null) {
		return null;
	}

	const candidate = payload as {
		type?: unknown;
		questions?: unknown;
		question?: unknown;
		prompt?: unknown;
		options?: unknown;
		choices?: unknown;
		parts?: unknown;
	};

	if (Array.isArray(candidate.questions)) {
		const questions = candidate.questions
			.map((item) => toQuestionItem(item))
			.filter((item): item is PlanningQuestionItem => item !== null);

		if (questions.length > 0) {
			return { questions };
		}
	}

	if (candidate.type === 'question' || candidate.question || candidate.prompt || candidate.options || candidate.choices) {
		const direct = toQuestionItem(payload);
		if (direct) {
			return {
				questions: [direct]
			};
		}

		const nested = toQuestionItem(candidate.question);
		if (nested) {
			return {
				questions: [nested]
			};
		}
	}

	if (Array.isArray(candidate.parts)) {
		const questions: PlanningQuestionItem[] = [];
		for (const part of candidate.parts) {
			const fromPart = toQuestionItem(part);
			if (fromPart) {
				questions.push(fromPart);
			}
		}

		if (questions.length > 0) {
			return { questions };
		}
	}

	return null;
}

function extractLeadingJsonObject(value: string): { json: string; endIndex: number } | null {
	let depth = 0;
	let inString = false;
	let escaping = false;

	for (let index = 0; index < value.length; index += 1) {
		const char = value[index];

		if (inString) {
			if (escaping) {
				escaping = false;
				continue;
			}

			if (char === '\\') {
				escaping = true;
				continue;
			}

			if (char === '"') {
				inString = false;
			}

			continue;
		}

		if (char === '"') {
			inString = true;
			continue;
		}

		if (char === '{') {
			depth += 1;
			continue;
		}

		if (char === '}') {
			depth -= 1;
			if (depth === 0) {
				return {
					json: value.slice(0, index + 1),
					endIndex: index + 1
				};
			}
		}
	}

	return null;
}

function extractQuestionDialogFromText(value: string): { dialog: PlanningQuestionDialog; consumedLength: number } | null {
	const firstNonWhitespace = value.search(/\S/);
	if (firstNonWhitespace === -1) {
		return null;
	}

	const candidate = value.slice(firstNonWhitespace);
	if (!candidate.startsWith('{')) {
		return null;
	}

	const jsonCandidate = extractLeadingJsonObject(candidate);
	if (!jsonCandidate) {
		return null;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonCandidate.json) as unknown;
	} catch {
		return null;
	}

	const dialog = toQuestionDialog(parsed);
	if (!dialog) {
		return null;
	}

	let consumedLength = firstNonWhitespace + jsonCandidate.endIndex;
	while (consumedLength < value.length && /\s/.test(value[consumedLength])) {
		consumedLength += 1;
	}

	return {
		dialog,
		consumedLength
	};
}

function appendDeltaFromSnapshot(nextSnapshot: string, previousSnapshot: string): string {
	if (!nextSnapshot) {
		return '';
	}

	if (!previousSnapshot) {
		return nextSnapshot;
	}

	if (nextSnapshot.startsWith(previousSnapshot)) {
		return nextSnapshot.slice(previousSnapshot.length);
	}

	return nextSnapshot;
}

async function getRuntime(): Promise<OpencodeRuntime> {
	if (!globalThis.__stackedOpencodeRuntime) {
		globalThis.__stackedOpencodeRuntime = (async () => {
			const started = await createOpencode({
				hostname: env.OPENCODE_SERVER_HOSTNAME?.trim() || '127.0.0.1',
				port: getServerPort()
			});

			const runtime: OpencodeRuntime = {
				client: started.client,
				close: () => started.server.close()
			};

			const shutdown = () => {
				try {
					runtime.close();
				} catch {
					// ignore shutdown errors
				}
			};

			process.once('SIGINT', shutdown);
			process.once('SIGTERM', shutdown);

			return runtime;
		})();
	}

	return globalThis.__stackedOpencodeRuntime;
}

export async function createOpencodeSession(options?: OpencodeDirectoryOptions): Promise<string> {
	const { client } = await getRuntime();
	const created = await client.session.create({
		query: { directory: getDirectory(options) }
	});
	const session = unwrapData(created);

	if (!session.id || typeof session.id !== 'string') {
		throw new Error('opencode session create response did not include an id.');
	}

	return session.id;
}

export async function createAndSeedOpencodeSession(options: {
	prompt: string;
	agent: OpencodeAgent;
	system?: string;
	directory?: string;
}): Promise<string> {
	const sessionId = await createOpencodeSession({ directory: options.directory });
	const { client } = await getRuntime();
	const model = getServerModel();

	const accepted = await client.session.promptAsync({
		path: { id: sessionId },
		query: { directory: getDirectory(options) },
		body: {
			agent: options.agent,
			system: options.system,
			model,
			parts: [{ type: 'text', text: options.prompt }]
		}
	});
	assertNoResultError(accepted);

	return sessionId;
}

export async function sendOpencodeSessionMessage(
	sessionId: string,
	message: string,
	options?: { system?: string; directory?: string; agent?: OpencodeAgent }
): Promise<string> {
	const { client } = await getRuntime();
	const model = getServerModel();

	const prompted = await client.session.prompt({
		path: { id: sessionId },
		query: { directory: getDirectory(options) },
		body: {
			agent: options?.agent ?? 'plan',
			system: options?.system,
			model,
			parts: [{ type: 'text', text: message }]
		}
	});
	const response = unwrapData(prompted);

	return textFromParts(response.parts);
}

export async function getOpencodeSessionMessages(
	sessionId: string,
	options?: OpencodeDirectoryOptions
): Promise<PlanningMessage[]> {
	const result = await loadOpencodeSessionMessages(sessionId, options);
	return result.messages;
}

export async function loadOpencodeSessionMessages(
	sessionId: string,
	options?: OpencodeDirectoryOptions
): Promise<OpencodeHistoryLoadResult> {
	try {
		const { client } = await getRuntime();
		const listed = await client.session.messages({
			path: { id: sessionId },
			query: { directory: getDirectory(options) }
		});
		const entries = unwrapData(listed);

		const messages = toPlanningMessages(entries);
		return {
			state: messages.length > 0 ? 'loaded' : 'empty',
			messages
		};
	} catch (error) {
		debugLog('Failed loading session history', { sessionId, error: toErrorMessage(error) });
		return {
			state: 'unavailable',
			messages: []
		};
	}
}

export async function getOpencodeSessionRuntimeState(
	sessionId: string,
	options?: OpencodeDirectoryOptions
): Promise<OpencodeSessionRuntimeState> {
	const { client } = await getRuntime();
	const statusResult = await client.session.status({
		query: { directory: getDirectory(options) }
	});
	const statuses = unwrapData(statusResult);
	const status = statuses[sessionId];

	if (!status || typeof status !== 'object' || !('type' in status)) {
		return 'missing';
	}

	if (status.type === 'busy' || status.type === 'retry') {
		return status.type;
	}

	return 'idle';
}

export async function getOpencodeSessionTodos(
	sessionId: string,
	options?: OpencodeDirectoryOptions
): Promise<OpencodeTodo[]> {
	const { client } = await getRuntime();
	const todoResult = await client.session.todo({
		path: { id: sessionId },
		query: { directory: getDirectory(options) }
	});
	const todos = unwrapData(todoResult);

	if (!Array.isArray(todos)) {
		return [];
	}

	return todos
		.map((todo) => {
			if (typeof todo !== 'object' || todo === null) {
				return null;
			}

			const candidate = todo as {
				content?: unknown;
				status?: unknown;
				priority?: unknown;
			};

			if (
				typeof candidate.content !== 'string' ||
				typeof candidate.status !== 'string' ||
				typeof candidate.priority !== 'string'
			) {
				return null;
			}

			return {
				content: candidate.content,
				status: candidate.status,
				priority: candidate.priority
			} satisfies OpencodeTodo;
		})
		.filter((todo): todo is OpencodeTodo => todo !== null);
}

async function* streamOpencodeSessionEvents(
	sessionId: string,
	events: AsyncGenerator<unknown, unknown, unknown>
): AsyncGenerator<OpencodeStreamEvent> {
	let activeAssistantMessageId: string | undefined;
	let activeTextMessageId: string | undefined;
	let textSnapshot = '';
	let previousVisibleSnapshot = '';
	let consumedQuestionPrefixLength = 0;
	let emittedQuestionForActiveTextMessage = false;
	let yieldedDelta = false;
	let yieldedQuestion = false;
	const rolesByMessageId = new Map<string, 'assistant' | 'user' | 'system'>();

	for await (const rawEvent of events) {
		if (typeof rawEvent !== 'object' || rawEvent === null || !('type' in rawEvent)) {
			continue;
		}

		const event = rawEvent as {
			type: string;
			properties?: Record<string, unknown>;
		};

		if (event.type === 'message.updated') {
			const infoCandidate = (event.properties as { info?: unknown } | undefined)?.info;
			if (typeof infoCandidate !== 'object' || infoCandidate === null) {
				continue;
			}

			const info = infoCandidate as {
				sessionID?: unknown;
				id?: unknown;
				role?: unknown;
			};

			if (info.sessionID !== sessionId || typeof info.id !== 'string') {
				continue;
			}

			if (info.role === 'assistant' || info.role === 'user' || info.role === 'system') {
				rolesByMessageId.set(info.id, info.role);
			}

			if (info.role === 'assistant') {
				activeAssistantMessageId = info.id;
			}

			continue;
		}

		if (event.type === 'message.part.updated') {
			const properties = event.properties as
				| {
						part?: unknown;
						delta?: unknown;
				  }
				| undefined;
			const partCandidate = properties?.part;
			if (typeof partCandidate !== 'object' || partCandidate === null) {
				continue;
			}

			const part = partCandidate as {
				sessionID?: unknown;
				messageID?: unknown;
				type?: unknown;
				text?: unknown;
				metadata?: unknown;
				state?: unknown;
			};

			if (part.sessionID !== sessionId || typeof part.messageID !== 'string') {
				continue;
			}

			if (activeTextMessageId !== part.messageID) {
				activeTextMessageId = part.messageID;
				textSnapshot = '';
				previousVisibleSnapshot = '';
				consumedQuestionPrefixLength = 0;
				emittedQuestionForActiveTextMessage = false;
			}

			const role = rolesByMessageId.get(part.messageID);
			if (role !== 'assistant' && part.messageID !== activeAssistantMessageId) {
				continue;
			}

			const questionFromPayload =
				toQuestionDialog(properties) ?? toQuestionDialog(part.metadata) ?? toQuestionDialog(part.state);
			if (questionFromPayload && !emittedQuestionForActiveTextMessage) {
				yield {
					type: 'question',
					question: questionFromPayload
				};
				emittedQuestionForActiveTextMessage = true;
				yieldedQuestion = true;
			}

			const eventDelta = properties?.delta;
			if (part.type === 'text' && typeof part.text === 'string') {
				textSnapshot = part.text;
			} else if (typeof eventDelta === 'string' && eventDelta.length > 0) {
				textSnapshot += eventDelta;
			} else {
				continue;
			}

			const questionFromText = extractQuestionDialogFromText(textSnapshot);
			if (questionFromText) {
				consumedQuestionPrefixLength = Math.max(consumedQuestionPrefixLength, questionFromText.consumedLength);
				if (!emittedQuestionForActiveTextMessage) {
					yield {
						type: 'question',
						question: questionFromText.dialog
					};
					emittedQuestionForActiveTextMessage = true;
					yieldedQuestion = true;
				}
			}

			const visibleSnapshot = textSnapshot.slice(consumedQuestionPrefixLength);
			const delta = appendDeltaFromSnapshot(visibleSnapshot, previousVisibleSnapshot);
			if (delta) {
				yield {
					type: 'delta',
					chunk: delta
				};
				yieldedDelta = true;
			}

			previousVisibleSnapshot = visibleSnapshot;

			continue;
		}

		if (event.type === 'session.idle') {
			const sessionIdCandidate = (event.properties as { sessionID?: unknown } | undefined)?.sessionID;
			if (sessionIdCandidate !== sessionId) {
				continue;
			}

			if (!yieldedDelta) {
				const messages = await getOpencodeSessionMessages(sessionId);
				const lastAssistant = [...messages].reverse().find((entry) => entry.role === 'assistant');
				if (lastAssistant?.content) {
					const questionFromText = extractQuestionDialogFromText(lastAssistant.content);
					if (questionFromText && !yieldedQuestion) {
						yield {
							type: 'question',
							question: questionFromText.dialog
						};
					}

					const visibleContent = questionFromText
						? lastAssistant.content.slice(questionFromText.consumedLength)
						: lastAssistant.content;

					if (!visibleContent) {
						break;
					}

					yield {
						type: 'delta',
						chunk: visibleContent
					};
				}
			}

			break;
		}
	}
}

export async function* watchOpencodeSession(
	sessionId: string,
	options?: OpencodeDirectoryOptions
): AsyncGenerator<OpencodeStreamEvent> {
	const { client } = await getRuntime();
	const controller = new AbortController();

	const events = await client.event.subscribe({
		query: { directory: getDirectory(options) },
		signal: controller.signal
	});

	try {
		yield* streamOpencodeSessionEvents(sessionId, events.stream);
	} catch (error) {
		console.error('[opencode] Streaming session watch failed', {
			sessionId,
			error: toErrorMessage(error)
		});
		throw new Error(`opencode streaming failed: ${truncate(toErrorMessage(error))}`);
	} finally {
		controller.abort();
	}
}

export async function* streamOpencodeSessionMessage(
	sessionId: string,
	message: string,
	options?: { system?: string; directory?: string; agent?: OpencodeAgent }
): AsyncGenerator<OpencodeStreamEvent> {
	const { client } = await getRuntime();
	const model = getServerModel();
	const controller = new AbortController();

	const events = await client.event.subscribe({
		query: { directory: getDirectory(options) },
		signal: controller.signal
	});

	const accepted = await client.session.promptAsync({
		path: { id: sessionId },
		query: { directory: getDirectory(options) },
		body: {
			agent: options?.agent ?? 'plan',
			system: options?.system,
			model,
			parts: [{ type: 'text', text: message }]
		}
	});
	assertNoResultError(accepted);

	try {
		yield* streamOpencodeSessionEvents(sessionId, events.stream);
	} catch (error) {
		console.error('[opencode] Streaming session message failed', {
			sessionId,
			error: toErrorMessage(error)
		});
		throw new Error(`opencode streaming failed: ${truncate(toErrorMessage(error))}`);
	} finally {
		controller.abort();
	}
}
