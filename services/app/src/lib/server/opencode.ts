import { env } from '$env/dynamic/private';
import {
  createOpencode,
  type OpencodeClient,
  type Part,
} from '@opencode-ai/sdk/v2';

import { loadProjectConfig } from '$lib/server/project-config';
import type {
  PlanningMessage,
  PlanningQuestionDialog,
  PlanningQuestionItem,
  PlanningQuestionOption,
} from '$lib/types/stack';

export type OpencodeStreamEvent =
  | {
      type: 'delta';
      chunk: string;
    }
  | {
      type: 'question';
      question: PlanningQuestionDialog;
      requestId?: string;
      source?: 'tool';
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

export interface OpencodePendingQuestion {
  requestId: string;
  question: PlanningQuestionDialog;
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

function extractErrorMessage(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const directMessage =
    extractErrorMessage(candidate.message) ??
    extractErrorMessage(candidate.error);
  if (directMessage) {
    return directMessage;
  }

  for (const nestedValue of Object.values(candidate)) {
    const nestedMessage = extractErrorMessage(nestedValue);
    if (nestedMessage) {
      return nestedMessage;
    }
  }

  return null;
}

function throwFromResultError(result: {
  error?: unknown;
  response: Response;
}): never {
  const parsedError = extractErrorMessage(result.error);
  if (parsedError) {
    throw new Error(parsedError);
  }

  if (result.response.statusText.trim().length > 0) {
    throw new Error(
      `opencode request failed with status ${result.response.status}: ${result.response.statusText}.`,
    );
  }

  throw new Error(
    `opencode request failed with status ${result.response.status}.`,
  );
}

function assertNoResultError(result: {
  error?: unknown;
  response: Response;
}): void {
  if (result.error !== undefined) {
    throwFromResultError(result);
  }

  if (!result.response.ok) {
    throw new Error(
      `opencode request failed with status ${result.response.status}.`,
    );
  }
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
    .filter(
      (part): part is Extract<Part, { type: 'text' }> => part.type === 'text',
    )
    .map((part) => part.text.trim())
    .filter((part) => part.length > 0)
    .join('\n\n');

  if (!text) {
    throw new Error('opencode returned no assistant text in message parts.');
  }

  return text;
}

function questionMessagesFromParts(input: {
  parts: Part[];
  role: PlanningMessage['role'];
  messageId: string;
  createdAt: string;
}): PlanningMessage[] {
  const extracted: PlanningMessage[] = [];

  input.parts.forEach((part, index) => {
    if (part.type !== 'tool') {
      return;
    }

    const toolName = part.tool.trim().toLowerCase();
    if (!toolName.includes('question')) {
      return;
    }

    const candidateInput =
      part.state && 'input' in part.state ? part.state.input : undefined;
    if (typeof candidateInput !== 'object' || candidateInput === null) {
      return;
    }

    const payload = candidateInput as {
      questions?: unknown;
    };

    const candidateMetadata =
      part.state && 'metadata' in part.state ? part.state.metadata : undefined;
    const metadata =
      typeof candidateMetadata === 'object' && candidateMetadata !== null
        ? (candidateMetadata as { answers?: unknown })
        : undefined;

    if (Array.isArray(payload.questions) && payload.questions.length > 0) {
      extracted.push({
        id: `${input.messageId}-question-${index}`,
        role: 'assistant',
        content: JSON.stringify({
          type: 'question',
          questions: payload.questions,
        }),
        createdAt: input.createdAt,
      });
    }

    const answers =
      Array.isArray(metadata?.answers) && metadata.answers.length > 0
        ? metadata.answers
        : undefined;

    if (answers) {
      extracted.push({
        id: `${input.messageId}-answer-${index}`,
        role: input.role === 'assistant' ? 'tool' : input.role,
        content: JSON.stringify({
          type: 'question_answer',
          answers,
        }),
        createdAt: input.createdAt,
      });
    }
  });

  return extracted;
}

function toPlanningMessages(
  entries: Array<{
    info: { id: string; role: string; time: { created: number } };
    parts: Part[];
  }>,
): PlanningMessage[] {
  return entries
    .flatMap((entry) => {
      if (
        entry.info.role !== 'assistant' &&
        entry.info.role !== 'user' &&
        entry.info.role !== 'system' &&
        entry.info.role !== 'tool'
      ) {
        return [];
      }

      const createdAt = asIsoDate(entry.info.time.created);

      const content = entry.parts
        .filter(
          (part): part is Extract<Part, { type: 'text' }> =>
            part.type === 'text',
        )
        .map((part) => part.text.trim())
        .filter((part) => part.length > 0)
        .join('\n\n');

      const extractedQuestionMessages = questionMessagesFromParts({
        parts: entry.parts,
        role: entry.info.role,
        messageId: entry.info.id,
        createdAt,
      });

      if (!content) {
        return extractedQuestionMessages;
      }

      return [
        {
          id: entry.info.id,
          role: entry.info.role,
          content,
          createdAt,
        } as PlanningMessage,
        ...extractedQuestionMessages,
      ];
    })
    .filter((message): message is PlanningMessage => message !== null);
}

function normalizeQuestionOption(
  value: unknown,
): PlanningQuestionOption | null {
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
    typeof candidate.description === 'string' &&
    candidate.description.trim().length > 0
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

  const allowCustom =
    candidate.allowCustom === true ||
    candidate.custom === true ||
    (candidate.allowCustom === undefined &&
      candidate.custom === undefined &&
      options.length === 0);

  if (!promptRaw.trim() || (options.length === 0 && !allowCustom)) {
    return null;
  }

  return {
    header,
    question: promptRaw.trim(),
    options,
    multiple: candidate.multiple === true,
    allowCustom,
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

  if (
    candidate.type === 'question' ||
    candidate.question ||
    candidate.prompt ||
    candidate.options ||
    candidate.choices
  ) {
    const direct = toQuestionItem(payload);
    if (direct) {
      return {
        questions: [direct],
      };
    }

    const nested = toQuestionItem(candidate.question);
    if (nested) {
      return {
        questions: [nested],
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

function appendDeltaFromSnapshot(
  nextSnapshot: string,
  previousSnapshot: string,
): string {
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
      const projectConfig = await loadProjectConfig();
      const defaultModel = projectConfig.defaultModel?.trim();
      const started = await createOpencode({
        hostname: env.OPENCODE_SERVER_HOSTNAME?.trim() || '127.0.0.1',
        port: getServerPort(),
        config: defaultModel ? { model: defaultModel } : undefined,
      });

      const runtime: OpencodeRuntime = {
        client: started.client,
        close: () => started.server.close(),
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

export async function createOpencodeSession(
  options?: OpencodeDirectoryOptions,
): Promise<string> {
  const { client } = await getRuntime();
  const created = await client.session.create({
    directory: getDirectory(options),
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
  const sessionId = await createOpencodeSession({
    directory: options.directory,
  });
  const { client } = await getRuntime();
  const accepted = await client.session.promptAsync({
    sessionID: sessionId,
    directory: getDirectory(options),
    agent: options.agent,
    system: options.system,
    parts: [{ type: 'text', text: options.prompt }],
  });
  assertNoResultError(accepted);

  return sessionId;
}

export async function sendOpencodeSessionMessage(
  sessionId: string,
  message: string,
  options?: { system?: string; directory?: string; agent?: OpencodeAgent },
): Promise<string> {
  const { client } = await getRuntime();

  const prompted = await client.session.prompt({
    sessionID: sessionId,
    directory: getDirectory(options),
    agent: options?.agent ?? 'plan',
    system: options?.system,
    parts: [{ type: 'text', text: message }],
  });
  const response = unwrapData(prompted);

  return textFromParts(response.parts);
}

export async function getOpencodeSessionMessages(
  sessionId: string,
  options?: OpencodeDirectoryOptions,
): Promise<PlanningMessage[]> {
  const result = await loadOpencodeSessionMessages(sessionId, options);
  return result.messages;
}

export async function loadOpencodeSessionMessages(
  sessionId: string,
  options?: OpencodeDirectoryOptions,
): Promise<OpencodeHistoryLoadResult> {
  try {
    const { client } = await getRuntime();
    const listed = await client.session.messages({
      sessionID: sessionId,
      directory: getDirectory(options),
    });
    const entries = unwrapData(listed);

    const messages = toPlanningMessages(entries);
    return {
      state: messages.length > 0 ? 'loaded' : 'empty',
      messages,
    };
  } catch (error) {
    debugLog('Failed loading session history', {
      sessionId,
      error: toErrorMessage(error),
    });
    return {
      state: 'unavailable',
      messages: [],
    };
  }
}

export async function getOpencodeSessionRuntimeState(
  sessionId: string,
  options?: OpencodeDirectoryOptions,
): Promise<OpencodeSessionRuntimeState> {
  const { client } = await getRuntime();
  const statusResult = await client.session.status({
    directory: getDirectory(options),
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
  options?: OpencodeDirectoryOptions,
): Promise<OpencodeTodo[]> {
  const { client } = await getRuntime();
  const todoResult = await client.session.todo({
    sessionID: sessionId,
    directory: getDirectory(options),
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
        priority: candidate.priority,
      } satisfies OpencodeTodo;
    })
    .filter((todo): todo is OpencodeTodo => todo !== null);
}

export async function listPendingOpencodeSessionQuestions(
  sessionId: string,
  options?: OpencodeDirectoryOptions,
): Promise<OpencodePendingQuestion[]> {
  const { client } = await getRuntime();
  const listed = await client.question.list({
    directory: getDirectory(options),
  });
  const requests = unwrapData(listed);

  if (!Array.isArray(requests)) {
    return [];
  }

  return requests
    .map((request) => {
      if (typeof request !== 'object' || request === null) {
        return null;
      }

      const candidate = request as {
        id?: unknown;
        sessionID?: unknown;
      };

      if (
        candidate.sessionID !== sessionId ||
        typeof candidate.id !== 'string'
      ) {
        return null;
      }

      const question = toQuestionDialog(request);
      if (!question) {
        return null;
      }

      return {
        requestId: candidate.id,
        question,
      } satisfies OpencodePendingQuestion;
    })
    .filter((entry): entry is OpencodePendingQuestion => entry !== null);
}

export async function replyOpencodeQuestion(
  requestId: string,
  answers: string[][],
  options?: OpencodeDirectoryOptions,
): Promise<void> {
  const { client } = await getRuntime();
  const replied = await client.question.reply({
    requestID: requestId,
    directory: getDirectory(options),
    answers,
  });
  assertNoResultError(replied);
}

async function* streamOpencodeSessionEvents(
  sessionId: string,
  events: AsyncGenerator<unknown, unknown, unknown>,
  options?: OpencodeDirectoryOptions,
): AsyncGenerator<OpencodeStreamEvent> {
  let activeAssistantMessageId: string | undefined;
  let activeTextMessageId: string | undefined;
  let textSnapshot = '';
  let previousVisibleSnapshot = '';
  let emittedQuestion = false;
  let yieldedDelta = false;
  const rolesByMessageId = new Map<string, 'assistant' | 'user' | 'system'>();

  for await (const rawEvent of events) {
    if (
      typeof rawEvent !== 'object' ||
      rawEvent === null ||
      !('type' in rawEvent)
    ) {
      continue;
    }

    const event = rawEvent as {
      type: string;
      properties?: Record<string, unknown>;
    };

    if (event.type === 'question.asked') {
      const questionRequest = event.properties as
        | {
            id?: unknown;
            sessionID?: unknown;
          }
        | undefined;

      if (
        typeof questionRequest?.id !== 'string' ||
        questionRequest.sessionID !== sessionId
      ) {
        continue;
      }

      const question = toQuestionDialog(event.properties);
      if (!question) {
        continue;
      }

      yield {
        type: 'question',
        question,
        requestId: questionRequest.id,
        source: 'tool',
      };
      emittedQuestion = true;
      continue;
    }

    if (event.type === 'message.updated') {
      const infoCandidate = (event.properties as { info?: unknown } | undefined)
        ?.info;
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

      if (
        info.role === 'assistant' ||
        info.role === 'user' ||
        info.role === 'system'
      ) {
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
      }

      const role = rolesByMessageId.get(part.messageID);
      if (role !== 'assistant' && part.messageID !== activeAssistantMessageId) {
        continue;
      }

      const eventDelta = properties?.delta;
      if (part.type === 'text' && typeof part.text === 'string') {
        textSnapshot = part.text;
      } else if (typeof eventDelta === 'string' && eventDelta.length > 0) {
        textSnapshot += eventDelta;
      } else {
        continue;
      }

      const delta = appendDeltaFromSnapshot(
        textSnapshot,
        previousVisibleSnapshot,
      );
      if (delta) {
        yield {
          type: 'delta',
          chunk: delta,
        };
        yieldedDelta = true;
      }

      previousVisibleSnapshot = textSnapshot;

      continue;
    }

    if (event.type === 'session.idle') {
      const sessionIdCandidate = (
        event.properties as { sessionID?: unknown } | undefined
      )?.sessionID;
      if (sessionIdCandidate !== sessionId) {
        continue;
      }

      if (!yieldedDelta) {
        const pendingQuestions = await listPendingOpencodeSessionQuestions(
          sessionId,
          options,
        );
        const firstPendingQuestion = pendingQuestions[0];
        if (firstPendingQuestion && !emittedQuestion) {
          yield {
            type: 'question',
            question: firstPendingQuestion.question,
            requestId: firstPendingQuestion.requestId,
            source: 'tool',
          };
          emittedQuestion = true;
        }

        const messages = await getOpencodeSessionMessages(sessionId, options);
        const lastAssistant = [...messages]
          .reverse()
          .find((entry) => entry.role === 'assistant');
        if (lastAssistant?.content) {
          if (!lastAssistant.content) {
            break;
          }

          yield {
            type: 'delta',
            chunk: lastAssistant.content,
          };
        }
      }

      break;
    }
  }
}

export async function* watchOpencodeSession(
  sessionId: string,
  options?: OpencodeDirectoryOptions,
): AsyncGenerator<OpencodeStreamEvent> {
  const { client } = await getRuntime();
  const pendingQuestions = await listPendingOpencodeSessionQuestions(
    sessionId,
    options,
  );
  const firstPendingQuestion = pendingQuestions[0];
  if (firstPendingQuestion) {
    yield {
      type: 'question',
      question: firstPendingQuestion.question,
      requestId: firstPendingQuestion.requestId,
      source: 'tool',
    };
    return;
  }

  const controller = new AbortController();

  const events = await client.event.subscribe(
    { directory: getDirectory(options) },
    { signal: controller.signal },
  );

  try {
    yield* streamOpencodeSessionEvents(sessionId, events.stream, options);
  } catch (error) {
    console.error('[opencode] Streaming session watch failed', {
      sessionId,
      error: toErrorMessage(error),
    });
    throw new Error(
      `opencode streaming failed: ${truncate(toErrorMessage(error))}`,
    );
  } finally {
    controller.abort();
  }
}

export async function* streamOpencodeSessionMessage(
  sessionId: string,
  message: string,
  options?: { system?: string; directory?: string; agent?: OpencodeAgent },
): AsyncGenerator<OpencodeStreamEvent> {
  const { client } = await getRuntime();
  const controller = new AbortController();

  const events = await client.event.subscribe(
    { directory: getDirectory(options) },
    { signal: controller.signal },
  );

  const accepted = await client.session.promptAsync({
    sessionID: sessionId,
    directory: getDirectory(options),
    agent: options?.agent ?? 'plan',
    system: options?.system,
    parts: [{ type: 'text', text: message }],
  });
  assertNoResultError(accepted);

  try {
    yield* streamOpencodeSessionEvents(sessionId, events.stream, options);
  } catch (error) {
    console.error('[opencode] Streaming session message failed', {
      sessionId,
      error: toErrorMessage(error),
    });
    throw new Error(
      `opencode streaming failed: ${truncate(toErrorMessage(error))}`,
    );
  } finally {
    controller.abort();
  }
}
