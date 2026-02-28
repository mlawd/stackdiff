import type { PlanningMessage, PlanningQuestionDialog } from '$lib/types/stack';

export type ChatAgent = 'plan' | 'build';

export interface StreamDonePayload extends Record<string, unknown> {
  assistantReply: string;
  messages?: PlanningMessage[];
}

export interface StreamQuestionPayload extends Record<string, unknown> {
  requestId?: string;
}

export interface StreamDeltaPayload extends Record<string, unknown> {
  chunk?: string;
  messageId?: string;
}

export interface StreamErrorPayload {
  message?: string;
}

export interface StreamEventResult {
  done?: StreamDonePayload;
  error?: StreamErrorPayload;
  delta?: {
    messageId: string;
    chunk: string;
  };
  question?: {
    dialog: PlanningQuestionDialog;
    requestId: string | null;
  };
}

export interface SaveResponseBody extends Record<string, unknown> {
  messages?: PlanningMessage[];
}

export interface ApiErrorEnvelope {
  error?: {
    message?: string;
  };
}

export interface ApiSuccessEnvelope<T> {
  data?: T;
}

export interface StageSummaryItem {
  stageName: string;
  stageDescription: string;
}

export interface QuestionAnswerItem {
  question: string;
  selected: string[];
  customAnswer?: string;
}

export interface StreamingAssistantMessage {
  key: string;
  content: string;
}
