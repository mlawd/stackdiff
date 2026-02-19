import { env } from '$env/dynamic/private';
import { createOpencode, type OpencodeClient, type Part } from '@opencode-ai/sdk';

import type { PlanningMessage } from '$lib/types/stack';

export interface OpencodeQuestionPrompt {
	prompt: string;
	options: string[];
	allowCustom: boolean;
}

export type OpencodeStreamEvent =
	| {
			type: 'delta';
			chunk: string;
	  }
	| {
			type: 'question';
			question: OpencodeQuestionPrompt;
	  };

export type OpencodeHistoryLoadState = 'loaded' | 'empty' | 'unavailable';

export interface OpencodeHistoryLoadResult {
	state: OpencodeHistoryLoadState;
	messages: PlanningMessage[];
}

export type OpencodeSessionRuntimeState = 'idle' | 'busy' | 'retry' | 'missing';

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

function getDirectory(): string {
	return process.cwd();
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

function toQuestionPrompt(value: unknown): OpencodeQuestionPrompt | null {
	if (typeof value !== 'object' || value === null) {
		return null;
	}

	const candidate = value as {
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

	if (candidate.multiple === true) {
		return null;
	}

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
		.map((option) => {
			if (typeof option === 'string') {
				return option.trim();
			}

			if (typeof option === 'object' && option !== null) {
				const objectOption = option as { label?: unknown; value?: unknown; text?: unknown };
				if (typeof objectOption.label === 'string') {
					return objectOption.label.trim();
				}
				if (typeof objectOption.text === 'string') {
					return objectOption.text.trim();
				}
				if (typeof objectOption.value === 'string') {
					return objectOption.value.trim();
				}
			}

			return '';
		})
		.filter((option) => option.length > 0);

	if (!promptRaw.trim() || options.length === 0) {
		return null;
	}

	return {
		prompt: promptRaw.trim(),
		options,
		allowCustom: candidate.allowCustom === true || candidate.custom === true
	};
}

function extractQuestionPrompt(payload: unknown): OpencodeQuestionPrompt | null {
	if (typeof payload !== 'object' || payload === null) {
		return null;
	}

	const candidate = payload as {
		type?: unknown;
		question?: unknown;
		prompt?: unknown;
		options?: unknown;
		choices?: unknown;
		parts?: unknown;
	};

	if (candidate.type === 'question') {
		return toQuestionPrompt(payload);
	}

	if (candidate.question || candidate.prompt || candidate.options || candidate.choices) {
		const direct = toQuestionPrompt(payload);
		if (direct) {
			return direct;
		}
	}

	if (Array.isArray(candidate.parts)) {
		for (const part of candidate.parts) {
			const fromPart = toQuestionPrompt(part);
			if (fromPart) {
				return fromPart;
			}
		}
	}

	return null;
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

export async function createOpencodeSession(): Promise<string> {
	const { client } = await getRuntime();
	const created = await client.session.create({
		query: { directory: getDirectory() }
	});
	const session = unwrapData(created);

	if (!session.id || typeof session.id !== 'string') {
		throw new Error('opencode session create response did not include an id.');
	}

	return session.id;
}

export async function sendOpencodeSessionMessage(
	sessionId: string,
	message: string,
	options?: { system?: string }
): Promise<string> {
	const { client } = await getRuntime();
	const model = getServerModel();

	const prompted = await client.session.prompt({
		path: { id: sessionId },
		query: { directory: getDirectory() },
		body: {
			agent: 'plan',
			system: options?.system,
			model,
			parts: [{ type: 'text', text: message }]
		}
	});
	const response = unwrapData(prompted);

	return textFromParts(response.parts);
}

export async function getOpencodeSessionMessages(sessionId: string): Promise<PlanningMessage[]> {
	const result = await loadOpencodeSessionMessages(sessionId);
	return result.messages;
}

export async function loadOpencodeSessionMessages(sessionId: string): Promise<OpencodeHistoryLoadResult> {
	try {
		const { client } = await getRuntime();
		const listed = await client.session.messages({
			path: { id: sessionId },
			query: { directory: getDirectory() }
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
	sessionId: string
): Promise<OpencodeSessionRuntimeState> {
	const { client } = await getRuntime();
	const statusResult = await client.session.status({
		query: { directory: getDirectory() }
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

async function* streamOpencodeSessionEvents(
	sessionId: string,
	events: AsyncGenerator<unknown, unknown, unknown>
): AsyncGenerator<OpencodeStreamEvent> {
	let activeAssistantMessageId: string | undefined;
	let previousSnapshot = '';
	let yieldedDelta = false;
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

			const role = rolesByMessageId.get(part.messageID);
			if (role !== 'assistant' && part.messageID !== activeAssistantMessageId) {
				continue;
			}

			const question =
				extractQuestionPrompt(properties) ??
				extractQuestionPrompt(part.metadata) ??
				extractQuestionPrompt(part.state);
			if (question) {
				yield {
					type: 'question',
					question
				};
			}

			const eventDelta = properties?.delta;
			if (typeof eventDelta === 'string' && eventDelta.length > 0) {
				yield {
					type: 'delta',
					chunk: eventDelta
				};
				yieldedDelta = true;
				continue;
			}

			if (part.type === 'text' && typeof part.text === 'string') {
				const delta = appendDeltaFromSnapshot(part.text, previousSnapshot);
				if (delta) {
					yield {
						type: 'delta',
						chunk: delta
					};
					yieldedDelta = true;
				}

				previousSnapshot = part.text;
			}

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
					yield {
						type: 'delta',
						chunk: lastAssistant.content
					};
				}
			}

			break;
		}
	}
}

export async function* watchOpencodeSession(
	sessionId: string
): AsyncGenerator<OpencodeStreamEvent> {
	const { client } = await getRuntime();
	const controller = new AbortController();

	const events = await client.event.subscribe({
		query: { directory: getDirectory() },
		signal: controller.signal
	});

	try {
		yield* streamOpencodeSessionEvents(sessionId, events.stream);
	} catch (error) {
		throw new Error(`opencode streaming failed: ${truncate(toErrorMessage(error))}`);
	} finally {
		controller.abort();
	}
}

export async function* streamOpencodeSessionMessage(
	sessionId: string,
	message: string,
	options?: { system?: string }
): AsyncGenerator<OpencodeStreamEvent> {
	const { client } = await getRuntime();
	const model = getServerModel();
	const controller = new AbortController();

	const events = await client.event.subscribe({
		query: { directory: getDirectory() },
		signal: controller.signal
	});

	const accepted = await client.session.promptAsync({
		path: { id: sessionId },
		query: { directory: getDirectory() },
		body: {
			agent: 'plan',
			system: options?.system,
			model,
			parts: [{ type: 'text', text: message }]
		}
	});
	assertNoResultError(accepted);

	try {
		yield* streamOpencodeSessionEvents(sessionId, events.stream);
	} catch (error) {
		throw new Error(`opencode streaming failed: ${truncate(toErrorMessage(error))}`);
	} finally {
		controller.abort();
	}
}
