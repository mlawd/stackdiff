import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  ImplementationStatusResponse,
  MergeDownStackResponse,
  ReviewSessionResponse,
  StartResponse,
  SyncStackResponse,
} from './contracts';

function messageFromUnknown(value: unknown, fallbackError: string): string {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return fallbackError;
  }

  const error = (value as ApiErrorEnvelope).error;
  if (!error || typeof error.message !== 'string' || !error.message.trim()) {
    return fallbackError;
  }

  return error.message;
}

async function requestJson<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  fallbackError: string,
): Promise<T> {
  const response = await fetch(input, init);
  const payload: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(messageFromUnknown(payload, fallbackError));
  }

  if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
    throw new Error(fallbackError);
  }

  return (payload as ApiSuccessEnvelope<T>).data;
}

export function getImplementationStatus(
  stackId: string,
  stageId: string,
): Promise<ImplementationStatusResponse> {
  return requestJson<ImplementationStatusResponse>(
    `/api/stacks/${stackId}/stages/${stageId}/implementation/reconcile`,
    { method: 'POST' },
    'Unable to load implementation status.',
  );
}

export function approveStageRequest(
  stackId: string,
  stageId: string,
): Promise<ImplementationStatusResponse> {
  return requestJson<ImplementationStatusResponse>(
    `/api/stacks/${stackId}/stages/${stageId}/approve`,
    { method: 'POST' },
    'Unable to approve stage for merge.',
  );
}

export function startFeatureRequest(stackId: string): Promise<StartResponse> {
  return requestJson<StartResponse>(
    `/api/stacks/${stackId}/start`,
    { method: 'POST' },
    'Unable to start feature.',
  );
}

export function syncStackRequest(stackId: string): Promise<SyncStackResponse> {
  return requestJson<SyncStackResponse>(
    `/api/stacks/${stackId}/sync`,
    { method: 'POST' },
    'Unable to sync stack.',
  );
}

export function mergeDownStackRequest(
  stackId: string,
): Promise<MergeDownStackResponse> {
  return requestJson<MergeDownStackResponse>(
    `/api/stacks/${stackId}/merge-down`,
    { method: 'POST' },
    'Unable to merge down stack.',
  );
}

export function loadStageReviewSession(
  stackId: string,
  stageId: string,
): Promise<ReviewSessionResponse> {
  return requestJson<ReviewSessionResponse>(
    `/api/stacks/${stackId}/stages/${stageId}/review/session`,
    { method: 'POST' },
    'Unable to load review session.',
  );
}
