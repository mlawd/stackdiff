import { env } from '$env/dynamic/private';
import { query } from '@anthropic-ai/claude-agent-sdk';

import type {
  PlanningMessage,
  PlanningQuestionDialog,
  PlanningQuestionItem,
  PlanningQuestionOption,
} from '$lib/types/stack';

export type ClaudeAgent = 'plan' | 'build';
export type ClaudeSessionRuntimeState = 'idle' | 'busy' | 'retry' | 'missing';

export interface ClaudeTodo {
  content: string;
  status: string;
  priority: string;
}

export interface ClaudePendingQuestion {
  requestId: string;
  question: PlanningQuestionDialog;
}

export type ClaudeStreamEvent =
  | {
      type: 'delta';
      chunk: string;
      messageId?: string;
    }
  | {
      type: 'question';
      question: PlanningQuestionDialog;
      requestId?: string;
      source?: 'tool';
    };

export type ClaudeHistoryLoadState = 'loaded' | 'empty' | 'unavailable';

export interface ClaudeHistoryLoadResult {
  state: ClaudeHistoryLoadState;
  messages: PlanningMessage[];
}

interface ClaudeDirectoryOptions {
  directory?: string;
}

interface SessionState {
  sessionId: string;
  runtimeState: ClaudeSessionRuntimeState;
  messages: PlanningMessage[];
  todos: ClaudeTodo[];
  pendingQuestions: ClaudePendingQuestion[];
  activeRun?: ActiveRun;
}

interface ActiveRun {
  queue: RunItem[];
  waiters: Array<(item: RunItem) => void>;
  ended: boolean;
}

interface PendingQuestionResolver {
  sessionId: string;
  requestId: string;
  question: PlanningQuestionDialog;
  resolve: (value: Record<string, string>) => void;
}

type RunItem =
  | {
      type: 'event';
      event: ClaudeStreamEvent;
    }
  | {
      type: 'end';
    }
  | {
      type: 'error';
      message: string;
    };

const sessions = new Map<string, SessionState>();
const pendingQuestionResolvers = new Map<string, PendingQuestionResolver>();

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function getDirectory(options?: ClaudeDirectoryOptions): string {
  const directory = options?.directory?.trim();
  return directory && directory.length > 0 ? directory : process.cwd();
}

function normalizeQuestionOption(
  value: unknown,
): PlanningQuestionOption | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const candidate = value as {
    label?: unknown;
    description?: unknown;
  };

  if (
    typeof candidate.label !== 'string' ||
    candidate.label.trim().length === 0
  ) {
    return null;
  }

  return {
    label: candidate.label.trim(),
    description:
      typeof candidate.description === 'string' &&
      candidate.description.trim().length > 0
        ? candidate.description.trim()
        : undefined,
  };
}

function normalizeAskUserQuestionInput(
  payload: unknown,
): PlanningQuestionDialog | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const candidate = payload as {
    questions?: unknown;
  };

  if (!Array.isArray(candidate.questions)) {
    return null;
  }

  const questions = candidate.questions
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null) {
        return null;
      }

      const item = entry as {
        question?: unknown;
        header?: unknown;
        options?: unknown;
        multiSelect?: unknown;
      };

      if (
        typeof item.question !== 'string' ||
        item.question.trim().length === 0
      ) {
        return null;
      }

      if (!Array.isArray(item.options) || item.options.length === 0) {
        return null;
      }

      const options = item.options
        .map((option) => normalizeQuestionOption(option))
        .filter((option): option is PlanningQuestionOption => option !== null);

      if (options.length === 0) {
        return null;
      }

      const normalized: PlanningQuestionItem = {
        header:
          typeof item.header === 'string' && item.header.trim().length > 0
            ? item.header.trim()
            : 'Question',
        question: item.question.trim(),
        options,
        multiple: item.multiSelect === true,
        allowCustom: true,
      };

      return normalized;
    })
    .filter((entry): entry is PlanningQuestionItem => entry !== null);

  if (questions.length === 0) {
    return null;
  }

  return { questions };
}

function extractAssistantText(message: unknown): string {
  if (typeof message !== 'object' || message === null) {
    return '';
  }

  const candidate = message as {
    type?: unknown;
    message?: {
      content?: unknown;
    };
  };

  if (candidate.type !== 'assistant') {
    return '';
  }

  const content = candidate.message?.content;
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((block) => {
      if (typeof block !== 'object' || block === null) {
        return '';
      }

      const textBlock = block as {
        type?: unknown;
        text?: unknown;
      };

      if (textBlock.type !== 'text' || typeof textBlock.text !== 'string') {
        return '';
      }

      return textBlock.text;
    })
    .join('');
}

function extractDelta(
  message: unknown,
): { chunk: string; messageId?: string } | null {
  if (typeof message !== 'object' || message === null) {
    return null;
  }

  const candidate = message as {
    type?: unknown;
    event?: unknown;
    uuid?: unknown;
  };

  if (candidate.type !== 'stream_event') {
    return null;
  }

  if (typeof candidate.event !== 'object' || candidate.event === null) {
    return null;
  }

  const event = candidate.event as {
    type?: unknown;
    delta?: unknown;
    message?: unknown;
  };

  if (event.type !== 'content_block_delta') {
    return null;
  }

  if (typeof event.delta !== 'object' || event.delta === null) {
    return null;
  }

  const delta = event.delta as {
    type?: unknown;
    text?: unknown;
  };

  if (delta.type !== 'text_delta' || typeof delta.text !== 'string') {
    return null;
  }

  const messageIdCandidate =
    typeof event.message === 'object' && event.message !== null
      ? (event.message as { id?: unknown }).id
      : undefined;

  return {
    chunk: delta.text,
    messageId:
      typeof messageIdCandidate === 'string'
        ? messageIdCandidate
        : typeof candidate.uuid === 'string'
          ? candidate.uuid
          : undefined,
  };
}

function extractSessionId(message: unknown): string | null {
  if (typeof message !== 'object' || message === null) {
    return null;
  }

  const candidate = message as { session_id?: unknown };
  return typeof candidate.session_id === 'string' ? candidate.session_id : null;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ensureSession(sessionId: string): SessionState {
  const existing = sessions.get(sessionId);
  if (existing) {
    return existing;
  }

  const created: SessionState = {
    sessionId,
    runtimeState: 'idle',
    messages: [],
    todos: [],
    pendingQuestions: [],
  };

  sessions.set(sessionId, created);
  return created;
}

function enqueueRunItem(run: ActiveRun, item: RunItem): void {
  const waiter = run.waiters.shift();
  if (waiter) {
    waiter(item);
    return;
  }

  run.queue.push(item);
}

function closeRun(session: SessionState, item?: RunItem): void {
  if (!session.activeRun) {
    return;
  }

  const run = session.activeRun;
  if (run.ended) {
    session.activeRun = undefined;
    return;
  }

  if (item) {
    enqueueRunItem(run, item);
  }

  enqueueRunItem(run, { type: 'end' });
  run.ended = true;
  session.activeRun = undefined;
}

function dequeueRunItem(run: ActiveRun): Promise<RunItem> {
  const next = run.queue.shift();
  if (next) {
    return Promise.resolve(next);
  }

  return new Promise((resolve) => {
    run.waiters.push(resolve);
  });
}

function appendMessage(
  session: SessionState,
  role: PlanningMessage['role'],
  content: string,
): void {
  const trimmed = content.trim();
  if (!trimmed) {
    return;
  }

  session.messages.push({
    id: makeId(role),
    role,
    content: trimmed,
    createdAt: nowIso(),
  });
}

function answersToMap(
  dialog: PlanningQuestionDialog,
  answers: string[][],
): Record<string, string> {
  const mapped: Record<string, string> = {};

  dialog.questions.forEach((question, index) => {
    const values = answers[index] ?? [];
    const normalized = values
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (normalized.length === 0) {
      return;
    }

    mapped[question.question] = normalized.join(', ');
  });

  return mapped;
}

function getPermissionMode(): {
  permissionMode: 'bypassPermissions';
  allowDangerouslySkipPermissions: true;
} {
  return {
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
  };
}

function getSystemPrompt(options?: { system?: string }):
  | string
  | {
      type: 'preset';
      preset: 'claude_code';
    } {
  const explicit = options?.system?.trim();
  if (explicit && explicit.length > 0) {
    return explicit;
  }

  return {
    type: 'preset',
    preset: 'claude_code',
  };
}

async function startRun(input: {
  sessionId?: string;
  prompt: string;
  directory: string;
  system?: string;
}): Promise<{ sessionId: string; run: ActiveRun }> {
  if (input.sessionId) {
    const existing = ensureSession(input.sessionId);
    if (existing.activeRun) {
      throw new Error('Session is already running.');
    }
  }

  let initializedSessionId: string | null = null;
  let sessionState: SessionState | null =
    input.sessionId !== undefined ? ensureSession(input.sessionId) : null;
  let userMessageAppended = false;

  if (sessionState) {
    appendMessage(sessionState, 'user', input.prompt);
    userMessageAppended = true;
  }

  const run: ActiveRun = {
    queue: [],
    waiters: [],
    ended: false,
  };

  const iterator = query({
    prompt: input.prompt,
    options: {
      cwd: input.directory,
      model: env.ANTHROPIC_MODEL?.trim() || undefined,
      resume: input.sessionId,
      includePartialMessages: true,
      maxTurns: 50,
      settingSources: ['project'],
      systemPrompt: getSystemPrompt({ system: input.system }),
      tools: {
        type: 'preset',
        preset: 'claude_code',
      },
      ...getPermissionMode(),
      canUseTool: async (
        toolName: string,
        toolInput: Record<string, unknown>,
        toolOptions: { toolUseID?: string },
      ) => {
        if (toolName !== 'AskUserQuestion') {
          return {
            behavior: 'allow' as const,
            updatedInput: toolInput,
          };
        }

        const dialog = normalizeAskUserQuestionInput(toolInput);
        if (!dialog) {
          return {
            behavior: 'deny' as const,
            message: 'Invalid AskUserQuestion payload.',
          };
        }

        const sessionId = initializedSessionId ?? input.sessionId;
        if (!sessionId) {
          return {
            behavior: 'deny' as const,
            message: 'Session id unavailable while asking question.',
          };
        }

        const state = ensureSession(sessionId);
        const requestId =
          typeof toolOptions.toolUseID === 'string' &&
          toolOptions.toolUseID.trim().length > 0
            ? toolOptions.toolUseID
            : makeId('question');
        state.pendingQuestions = [
          ...state.pendingQuestions.filter(
            (entry) => entry.requestId !== requestId,
          ),
          {
            requestId,
            question: dialog,
          },
        ];
        appendMessage(
          state,
          'assistant',
          JSON.stringify({
            type: 'question',
            questions: dialog.questions,
          }),
        );

        enqueueRunItem(run, {
          type: 'event',
          event: {
            type: 'question',
            question: dialog,
            requestId,
            source: 'tool',
          },
        });

        const answerMap = await new Promise<Record<string, string>>(
          (resolve) => {
            pendingQuestionResolvers.set(requestId, {
              requestId,
              sessionId,
              question: dialog,
              resolve,
            });
          },
        );

        state.pendingQuestions = state.pendingQuestions.filter(
          (entry) => entry.requestId !== requestId,
        );

        return {
          behavior: 'allow' as const,
          updatedInput: {
            questions: toolInput.questions,
            answers: answerMap,
          },
        };
      },
    },
  });

  const started = new Promise<string>((resolve, reject) => {
    let assistantBuffer = '';
    let yieldedDelta = false;
    let assistantMessageId: string | undefined;

    void (async () => {
      try {
        for await (const message of iterator) {
          const discoveredSessionId = extractSessionId(message);
          if (discoveredSessionId && !initializedSessionId) {
            initializedSessionId = discoveredSessionId;
            sessionState = ensureSession(discoveredSessionId);
            sessionState.runtimeState = 'busy';
            sessionState.activeRun = run;
            if (!userMessageAppended) {
              appendMessage(sessionState, 'user', input.prompt);
              userMessageAppended = true;
            }
            resolve(discoveredSessionId);
          }

          const delta = extractDelta(message);
          if (delta) {
            assistantBuffer += delta.chunk;
            yieldedDelta = true;
            assistantMessageId = delta.messageId ?? assistantMessageId;
            enqueueRunItem(run, {
              type: 'event',
              event: {
                type: 'delta',
                chunk: delta.chunk,
                messageId: delta.messageId,
              },
            });
            continue;
          }

          const assistantText = extractAssistantText(message);
          if (assistantText.length > 0) {
            assistantMessageId =
              assistantMessageId ??
              (typeof (message as { uuid?: unknown }).uuid === 'string'
                ? ((message as { uuid: string }).uuid as string)
                : makeId('assistant'));

            if (!yieldedDelta) {
              assistantBuffer += assistantText;
              enqueueRunItem(run, {
                type: 'event',
                event: {
                  type: 'delta',
                  chunk: assistantText,
                  messageId: assistantMessageId,
                },
              });
            }
          }

          if (
            typeof message === 'object' &&
            message !== null &&
            (message as { type?: unknown }).type === 'result'
          ) {
            const resultMessage = message as {
              subtype?: unknown;
              result?: unknown;
              session_id?: unknown;
            };

            if (!yieldedDelta && typeof resultMessage.result === 'string') {
              assistantBuffer += resultMessage.result;
              enqueueRunItem(run, {
                type: 'event',
                event: {
                  type: 'delta',
                  chunk: resultMessage.result,
                  messageId: assistantMessageId,
                },
              });
            }

            if (resultMessage.subtype !== 'success') {
              throw new Error('Claude run failed.');
            }

            break;
          }

          if (
            typeof message === 'object' &&
            message !== null &&
            (message as { type?: unknown }).type === 'tool_use_summary'
          ) {
            const summaries = (message as { tools?: unknown }).tools;
            if (!Array.isArray(summaries) || !sessionState) {
              continue;
            }

            for (const summary of summaries) {
              if (typeof summary !== 'object' || summary === null) {
                continue;
              }

              const candidate = summary as {
                name?: unknown;
                output?: unknown;
              };

              if (candidate.name !== 'TodoWrite') {
                continue;
              }

              const output = candidate.output as
                | { newTodos?: unknown }
                | undefined;
              if (!Array.isArray(output?.newTodos)) {
                continue;
              }

              sessionState.todos = output.newTodos
                .map((todo) => {
                  if (typeof todo !== 'object' || todo === null) {
                    return null;
                  }

                  const value = todo as {
                    content?: unknown;
                    status?: unknown;
                    priority?: unknown;
                  };

                  if (
                    typeof value.content !== 'string' ||
                    typeof value.status !== 'string'
                  ) {
                    return null;
                  }

                  return {
                    content: value.content,
                    status: value.status,
                    priority:
                      typeof value.priority === 'string'
                        ? value.priority
                        : 'medium',
                  } satisfies ClaudeTodo;
                })
                .filter((todo): todo is ClaudeTodo => todo !== null);
            }
          }
        }

        const finalSessionId = initializedSessionId ?? input.sessionId;
        if (!finalSessionId) {
          throw new Error('Claude session id was not initialized.');
        }

        const finalState = ensureSession(finalSessionId);
        appendMessage(finalState, 'assistant', assistantBuffer);
        finalState.runtimeState = 'idle';
        closeRun(finalState);
      } catch (error) {
        const message = toErrorMessage(error);
        if (!initializedSessionId && input.sessionId) {
          initializedSessionId = input.sessionId;
          const fallback = ensureSession(input.sessionId);
          fallback.runtimeState = 'idle';
          fallback.activeRun = run;
          resolve(input.sessionId);
        }

        const finalSessionId = initializedSessionId;
        if (!finalSessionId) {
          reject(new Error(message));
          return;
        }

        const failedState = ensureSession(finalSessionId);
        failedState.runtimeState = 'idle';
        closeRun(failedState, {
          type: 'error',
          message,
        });
      }
    })();
  });

  const sessionId = await started;
  return {
    sessionId,
    run,
  };
}

async function* consumeRun(run: ActiveRun): AsyncGenerator<ClaudeStreamEvent> {
  while (true) {
    const item = await dequeueRunItem(run);
    if (item.type === 'end') {
      return;
    }

    if (item.type === 'error') {
      throw new Error(item.message);
    }

    yield item.event;
  }
}

export async function createClaudeSession(
  options?: ClaudeDirectoryOptions,
): Promise<string> {
  const started = await startRun({
    prompt: 'Initialize a new coding session.',
    directory: getDirectory(options),
  });

  const state = ensureSession(started.sessionId);
  closeRun(state);
  return started.sessionId;
}

export async function createAndSeedClaudeSession(options: {
  prompt: string;
  agent: ClaudeAgent;
  system?: string;
  directory?: string;
}): Promise<string> {
  const started = await startRun({
    prompt: options.prompt,
    directory: getDirectory(options),
    system: options.system,
  });

  return started.sessionId;
}

export async function sendClaudeSessionMessage(
  sessionId: string,
  message: string,
  options?: { system?: string; directory?: string; agent?: ClaudeAgent },
): Promise<string> {
  const started = await startRun({
    sessionId,
    prompt: message,
    directory: getDirectory(options),
    system: options?.system,
  });

  let assistantReply = '';
  for await (const event of consumeRun(started.run)) {
    if (event.type === 'delta') {
      assistantReply += event.chunk;
      continue;
    }

    throw new Error(
      'Claude requested clarifying input during send message flow.',
    );
  }

  return assistantReply;
}

export async function getClaudeSessionMessages(
  sessionId: string,
  _options?: ClaudeDirectoryOptions,
): Promise<PlanningMessage[]> {
  const state = sessions.get(sessionId);
  return state ? [...state.messages] : [];
}

export async function loadClaudeSessionMessages(
  sessionId: string,
  _options?: ClaudeDirectoryOptions,
): Promise<ClaudeHistoryLoadResult> {
  const state = sessions.get(sessionId);
  if (!state) {
    return {
      state: 'empty',
      messages: [],
    };
  }

  return {
    state: state.messages.length > 0 ? 'loaded' : 'empty',
    messages: [...state.messages],
  };
}

export async function getClaudeSessionRuntimeState(
  sessionId: string,
  _options?: ClaudeDirectoryOptions,
): Promise<ClaudeSessionRuntimeState> {
  const state = sessions.get(sessionId);
  if (!state) {
    return 'missing';
  }

  return state.runtimeState;
}

export async function getClaudeSessionTodos(
  sessionId: string,
  _options?: ClaudeDirectoryOptions,
): Promise<ClaudeTodo[]> {
  const state = sessions.get(sessionId);
  return state ? [...state.todos] : [];
}

export async function listPendingClaudeSessionQuestions(
  sessionId: string,
  _options?: ClaudeDirectoryOptions,
): Promise<ClaudePendingQuestion[]> {
  const state = sessions.get(sessionId);
  if (!state) {
    return [];
  }

  return [...state.pendingQuestions];
}

export async function replyClaudeQuestion(
  requestId: string,
  answers: string[][],
  _options?: ClaudeDirectoryOptions,
): Promise<void> {
  const pending = pendingQuestionResolvers.get(requestId);
  if (!pending) {
    throw new Error(`Unknown question request id: ${requestId}`);
  }

  const session = ensureSession(pending.sessionId);
  appendMessage(
    session,
    'tool',
    JSON.stringify({
      type: 'question_answer',
      answers,
    }),
  );
  pending.resolve(answersToMap(pending.question, answers));
  pendingQuestionResolvers.delete(requestId);
}

export async function* watchClaudeSession(
  sessionId: string,
  _options?: ClaudeDirectoryOptions,
): AsyncGenerator<ClaudeStreamEvent> {
  const state = sessions.get(sessionId);
  if (!state?.activeRun) {
    return;
  }

  yield* consumeRun(state.activeRun);
}

export async function* streamClaudeSessionMessage(
  sessionId: string,
  message: string,
  options?: { system?: string; directory?: string; agent?: ClaudeAgent },
): AsyncGenerator<ClaudeStreamEvent> {
  const started = await startRun({
    sessionId,
    prompt: message,
    directory: getDirectory(options),
    system: options?.system,
  });

  yield* consumeRun(started.run);
}
