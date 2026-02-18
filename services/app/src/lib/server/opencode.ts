import { env } from '$env/dynamic/private';

export interface OpencodeMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

type OpencodeApiMode = 'server' | 'openai';

interface OpenAiChatResponse {
	choices?: Array<{
		message?: {
			content?: string | Array<{ type?: string; text?: string }>;
		};
	}>;
	error?: {
		message?: string;
	};
}

interface OpencodeServerSessionResponse {
	id?: string;
}

interface OpencodeServerMessageResponse {
	parts?: unknown[];
}

const MAX_ERROR_BODY_LENGTH = 300;

function truncate(value: string): string {
	if (value.length <= MAX_ERROR_BODY_LENGTH) {
		return value;
	}

	return `${value.slice(0, MAX_ERROR_BODY_LENGTH)}...`;
}

function isLikelyHtml(value: string): boolean {
	const trimmed = value.trim().toLowerCase();
	return trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html');
}

function getBaseUrl(): string {
	const baseUrl = env.OPENCODE_BASE_URL?.trim();
	if (!baseUrl) {
		throw new Error('Missing OPENCODE_BASE_URL server environment variable.');
	}

	return baseUrl;
}

export function getOpencodeApiMode(): OpencodeApiMode {
	const mode = env.OPENCODE_API_MODE?.trim().toLowerCase();
	if (mode === 'openai') {
		return 'openai';
	}

	return 'server';
}

function getModel(): string {
	return env.OPENCODE_MODEL?.trim() || 'openai/gpt-5.3-codex';
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

function getServerPathPrefix(): string {
	return (env.OPENCODE_SERVER_PATH_PREFIX?.trim() || '').replace(/^\/+|\/+$/g, '');
}

function getOpenAiChatPath(): string {
	return (env.OPENCODE_CHAT_PATH?.trim() || 'v1/chat/completions').replace(/^\/+/, '');
}

function joinUrl(baseUrl: string, relativePath: string): URL {
	const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
	return new URL(relativePath, normalizedBase);
}

function toOpenAiChatUrl(baseUrl: string): URL {
	return joinUrl(baseUrl, getOpenAiChatPath());
}

function toServerUrl(baseUrl: string, path: string): URL {
	const prefix = getServerPathPrefix();
	const normalizedPath = path.replace(/^\/+/, '');
	if (!prefix) {
		return joinUrl(baseUrl, normalizedPath);
	}

	return joinUrl(baseUrl, `${prefix}/${normalizedPath}`);
}

function buildHeaders(): Record<string, string> {
	const headers: Record<string, string> = {
		'content-type': 'application/json',
		accept: 'application/json'
	};

	const apiKey = env.OPENCODE_API_KEY?.trim();
	if (apiKey) {
		headers.authorization = `Bearer ${apiKey}`;
		return headers;
	}

	const password = env.OPENCODE_SERVER_PASSWORD?.trim();
	if (password) {
		const username = env.OPENCODE_SERVER_USERNAME?.trim() || 'opencode';
		headers.authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
	}

	return headers;
}

async function parseResponseText(response: Response, url: URL): Promise<string> {
	const raw = await response.text();
	const text = raw.trim();

	if (isLikelyHtml(text)) {
		throw new Error(
			`opencode returned HTML from ${url.toString()}. OPENCODE_BASE_URL likely points at the web app, not the API server.`
		);
	}

	if (!response.ok) {
		throw new Error(text || `opencode request failed with status ${response.status}.`);
	}

	return text;
}

function parseJsonObject<T>(value: string): T {
	try {
		return JSON.parse(value) as T;
	} catch {
		throw new Error(`opencode returned invalid JSON: ${truncate(value)}`);
	}
}

function toOpenAiAssistantText(payload: OpenAiChatResponse): string {
	const content = payload.choices?.[0]?.message?.content;

	if (typeof content === 'string' && content.trim()) {
		return content.trim();
	}

	if (Array.isArray(content)) {
		const text = content
			.filter((part) => part.type === 'text' && typeof part.text === 'string')
			.map((part) => part.text?.trim() ?? '')
			.filter((part) => part.length > 0)
			.join('\n\n');

		if (text) {
			return text;
		}
	}

	throw new Error('opencode returned an empty assistant response.');
}

function toServerAssistantText(payload: OpencodeServerMessageResponse): string {
	const parts = Array.isArray(payload.parts) ? payload.parts : [];
	const textParts = parts
		.map((part) => {
			if (typeof part !== 'object' || part === null) {
				return '';
			}

			const candidate = part as {
				type?: unknown;
				text?: unknown;
				content?: unknown;
			};

			if (candidate.type === 'text' && typeof candidate.text === 'string') {
				return candidate.text;
			}

			if (typeof candidate.content === 'string') {
				return candidate.content;
			}

			return '';
		})
		.map((part) => part.trim())
		.filter((part) => part.length > 0);

	if (textParts.length === 0) {
		throw new Error('opencode returned no assistant text in message parts.');
	}

	return textParts.join('\n\n');
}

export async function createOpencodeSession(): Promise<string> {
	const baseUrl = getBaseUrl();
	const url = toServerUrl(baseUrl, 'session');
	const response = await fetch(url, {
		method: 'POST',
		headers: buildHeaders(),
		body: JSON.stringify({})
	});

	const text = await parseResponseText(response, url);
	const payload = parseJsonObject<OpencodeServerSessionResponse>(text);

	if (!payload.id || typeof payload.id !== 'string') {
		throw new Error('opencode session create response did not include an id.');
	}

	return payload.id;
}

export async function sendOpencodeSessionMessage(
	sessionId: string,
	message: string,
	options?: { system?: string }
): Promise<string> {
	const baseUrl = getBaseUrl();
	const url = toServerUrl(baseUrl, `session/${encodeURIComponent(sessionId)}/message`);
	const model = getServerModel();
	const requestPayload: {
		model?: { providerID: string; modelID: string };
		system?: string;
		parts: Array<{ type: 'text'; text: string }>;
	} = {
		system: options?.system,
		parts: [{ type: 'text', text: message }]
	};

	if (model) {
		requestPayload.model = model;
	}

	const response = await fetch(url, {
		method: 'POST',
		headers: buildHeaders(),
		body: JSON.stringify(requestPayload)
	});

	const text = await parseResponseText(response, url);
	const payload = parseJsonObject<OpencodeServerMessageResponse>(text);

	return toServerAssistantText(payload);
}

export async function requestOpencodeChat(messages: OpencodeMessage[]): Promise<string> {
	const baseUrl = getBaseUrl();
	const chatUrl = toOpenAiChatUrl(baseUrl);

	const response = await fetch(chatUrl, {
		method: 'POST',
		headers: buildHeaders(),
		body: JSON.stringify({
			model: getModel(),
			messages,
			temperature: 0.2,
			stream: false
		})
	});

	const text = await parseResponseText(response, chatUrl);
	const payload = parseJsonObject<OpenAiChatResponse>(text);

	if (payload.error?.message) {
		throw new Error(payload.error.message);
	}

	return toOpenAiAssistantText(payload);
}
