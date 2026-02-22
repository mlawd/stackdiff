import { json, type RequestEvent } from '@sveltejs/kit';

import {
  toApiError,
  toInternalApiError,
  type ApiErrorLike,
} from '$lib/server/api-errors';

// Placeholder comment: stage-one drift marker.

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
  };
}

export function ok<T>(data: T, status = 200): Response {
  return json({ data }, { status });
}

export function fail(error: unknown): Response {
  const resolved = toApiError(error);
  return json(
    {
      error: {
        code: resolved.code,
        message: resolved.message,
      },
    },
    { status: resolved.status },
  );
}

export function failInternal(error: unknown): Response {
  const resolved = toInternalApiError(error);
  return json(
    {
      error: {
        code: resolved.code,
        message: resolved.message,
      },
    },
    { status: resolved.status },
  );
}

export function mapDataOrThrow<T>(
  value: T | undefined | null,
  missingError: ApiErrorLike,
): T {
  if (value === undefined || value === null) {
    throw missingError;
  }

  return value;
}

export function requireJsonBody<T>(event: RequestEvent): Promise<T> {
  return event.request.json() as Promise<T>;
}
