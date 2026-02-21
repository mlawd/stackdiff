import type {
  ImplementationStatusResponse,
  StartResponse,
  SyncStackResponse,
} from './contracts';

function messageFromUnknown(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  if ('error' in value && typeof value.error === 'string') {
    return value.error;
  }

  if ('error' in value && value.error && typeof value.error === 'object') {
    const nestedError = value.error as { message?: unknown };
    if (typeof nestedError.message === 'string') {
      return nestedError.message;
    }
  }

  return undefined;
}

async function requestJson<T>(input: RequestInfo | URL, init: RequestInit, fallbackError: string): Promise<T> {
  const response = await fetch(input, init);
  const payload: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(messageFromUnknown(payload) ?? fallbackError);
  }

  return payload as T;
}

export function getImplementationStatus(
  stackId: string,
  stageId: string,
): Promise<ImplementationStatusResponse> {
  return requestJson<ImplementationStatusResponse>(
    `/api/stacks/${stackId}/stages/${stageId}/implementation/status`,
    { method: 'GET' },
    'Unable to load implementation status.',
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
