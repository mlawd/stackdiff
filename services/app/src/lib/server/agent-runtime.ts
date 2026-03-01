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

export async function createAgentSession(options?: {
  directory?: string;
}): Promise<string> {
  return createOpencodeSession(options);
}

export async function createAndSeedAgentSession(options: {
  prompt: string;
  agent: AgentRuntimeAgent;
  system?: string;
  directory?: string;
}): Promise<string> {
  return createAndSeedOpencodeSession(options);
}

export async function sendAgentSessionMessage(
  sessionId: string,
  message: string,
  options?: { system?: string; directory?: string; agent?: AgentRuntimeAgent },
): Promise<string> {
  return sendOpencodeSessionMessage(sessionId, message, options);
}

export async function getAgentSessionMessages(
  sessionId: string,
  options?: { directory?: string },
) {
  return getOpencodeSessionMessages(sessionId, options);
}

export async function loadAgentSessionMessages(
  sessionId: string,
  options?: { directory?: string },
): Promise<AgentRuntimeHistoryLoadResult> {
  return loadOpencodeSessionMessages(sessionId, options);
}

export async function getAgentSessionRuntimeState(
  sessionId: string,
  options?: { directory?: string },
): Promise<AgentRuntimeSessionState> {
  return getOpencodeSessionRuntimeState(sessionId, options);
}

export async function getAgentSessionTodos(
  sessionId: string,
  options?: { directory?: string },
): Promise<AgentRuntimeTodo[]> {
  return getOpencodeSessionTodos(sessionId, options);
}

export async function listPendingAgentSessionQuestions(
  sessionId: string,
  options?: { directory?: string },
): Promise<AgentRuntimePendingQuestion[]> {
  return listPendingOpencodeSessionQuestions(sessionId, options);
}

export async function replyAgentQuestion(
  requestId: string,
  answers: string[][],
  options?: { directory?: string },
): Promise<void> {
  return replyOpencodeQuestion(requestId, answers, options);
}

export async function* watchAgentSession(
  sessionId: string,
  options?: { directory?: string },
): AsyncGenerator<AgentRuntimeStreamEvent> {
  yield* watchOpencodeSession(sessionId, options);
}

export async function* streamAgentSessionMessage(
  sessionId: string,
  message: string,
  options?: { system?: string; directory?: string; agent?: AgentRuntimeAgent },
): AsyncGenerator<AgentRuntimeStreamEvent> {
  yield* streamOpencodeSessionMessage(sessionId, message, options);
}
