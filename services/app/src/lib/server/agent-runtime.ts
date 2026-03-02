import {
  createAndSeedClaudeSession,
  createClaudeSession,
  getClaudeSessionMessages,
  getClaudeSessionRuntimeState,
  getClaudeSessionTodos,
  listPendingClaudeSessionQuestions,
  loadClaudeSessionMessages,
  replyClaudeQuestion,
  sendClaudeSessionMessage,
  streamClaudeSessionMessage,
  watchClaudeSession,
} from '$lib/server/claude';
import {
  createAndSeedOpencodeSession,
  createOpencodeSession,
  getOpencodeSessionMessages,
  getOpencodeSessionRuntimeState,
  getOpencodeSessionTodos,
  listPendingOpencodeSessionQuestions,
  loadOpencodeSessionMessages,
  replyOpencodeQuestion,
  sendOpencodeSessionMessage,
  streamOpencodeSessionMessage,
  watchOpencodeSession,
  type OpencodeAgent,
  type OpencodeHistoryLoadResult,
  type OpencodePendingQuestion,
  type OpencodeSessionRuntimeState,
  type OpencodeStreamEvent,
  type OpencodeTodo,
} from '$lib/server/opencode';

export type AgentRuntimeAgent = OpencodeAgent;
export type AgentRuntimeStreamEvent = OpencodeStreamEvent;
export type AgentRuntimeHistoryLoadResult = OpencodeHistoryLoadResult;
export type AgentRuntimeSessionState = OpencodeSessionRuntimeState;
export type AgentRuntimeTodo = OpencodeTodo;
export type AgentRuntimePendingQuestion = OpencodePendingQuestion;

function useClaudeRuntime(): boolean {
  return process.env.STACKED_AGENT_RUNTIME?.trim().toLowerCase() === 'claude';
}

export async function createAgentSession(options?: {
  directory?: string;
}): Promise<string> {
  if (useClaudeRuntime()) {
    return createClaudeSession(options);
  }

  return createOpencodeSession(options);
}

export async function createAndSeedAgentSession(options: {
  prompt: string;
  agent: AgentRuntimeAgent;
  system?: string;
  directory?: string;
}): Promise<string> {
  if (useClaudeRuntime()) {
    return createAndSeedClaudeSession(options);
  }

  return createAndSeedOpencodeSession(options);
}

export async function sendAgentSessionMessage(
  sessionId: string,
  message: string,
  options?: { system?: string; directory?: string; agent?: AgentRuntimeAgent },
): Promise<string> {
  if (useClaudeRuntime()) {
    return sendClaudeSessionMessage(sessionId, message, options);
  }

  return sendOpencodeSessionMessage(sessionId, message, options);
}

export async function getAgentSessionMessages(
  sessionId: string,
  options?: { directory?: string },
) {
  if (useClaudeRuntime()) {
    return getClaudeSessionMessages(sessionId, options);
  }

  return getOpencodeSessionMessages(sessionId, options);
}

export async function loadAgentSessionMessages(
  sessionId: string,
  options?: { directory?: string },
): Promise<AgentRuntimeHistoryLoadResult> {
  if (useClaudeRuntime()) {
    return loadClaudeSessionMessages(sessionId, options);
  }

  return loadOpencodeSessionMessages(sessionId, options);
}

export async function getAgentSessionRuntimeState(
  sessionId: string,
  options?: { directory?: string },
): Promise<AgentRuntimeSessionState> {
  if (useClaudeRuntime()) {
    return getClaudeSessionRuntimeState(sessionId, options);
  }

  return getOpencodeSessionRuntimeState(sessionId, options);
}

export async function getAgentSessionTodos(
  sessionId: string,
  options?: { directory?: string },
): Promise<AgentRuntimeTodo[]> {
  if (useClaudeRuntime()) {
    return getClaudeSessionTodos(sessionId, options);
  }

  return getOpencodeSessionTodos(sessionId, options);
}

export async function listPendingAgentSessionQuestions(
  sessionId: string,
  options?: { directory?: string },
): Promise<AgentRuntimePendingQuestion[]> {
  if (useClaudeRuntime()) {
    return listPendingClaudeSessionQuestions(sessionId, options);
  }

  return listPendingOpencodeSessionQuestions(sessionId, options);
}

export async function replyAgentQuestion(
  requestId: string,
  answers: string[][],
  options?: { directory?: string },
): Promise<void> {
  if (useClaudeRuntime()) {
    return replyClaudeQuestion(requestId, answers, options);
  }

  return replyOpencodeQuestion(requestId, answers, options);
}

export async function* watchAgentSession(
  sessionId: string,
  options?: { directory?: string },
): AsyncGenerator<AgentRuntimeStreamEvent> {
  if (useClaudeRuntime()) {
    yield* watchClaudeSession(sessionId, options);
    return;
  }

  yield* watchOpencodeSession(sessionId, options);
}

export async function* streamAgentSessionMessage(
  sessionId: string,
  message: string,
  options?: { system?: string; directory?: string; agent?: AgentRuntimeAgent },
): AsyncGenerator<AgentRuntimeStreamEvent> {
  if (useClaudeRuntime()) {
    yield* streamClaudeSessionMessage(sessionId, message, options);
    return;
  }

  yield* streamOpencodeSessionMessage(sessionId, message, options);
}
