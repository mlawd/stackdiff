export type ApiErrorCode =
  | 'not-found'
  | 'invalid-input'
  | 'conflict'
  | 'command-failed'
  | 'internal';

export interface ApiErrorLike {
  code: ApiErrorCode;
  status: number;
  message: string;
}

export class ApiRouteError extends Error implements ApiErrorLike {
  code: ApiErrorCode;
  status: number;

  constructor(code: ApiErrorCode, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function messageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown request failure';
}

export function badRequest(message: string): ApiRouteError {
  return new ApiRouteError('invalid-input', 400, message);
}

export function notFound(message: string): ApiRouteError {
  return new ApiRouteError('not-found', 404, message);
}

export function conflict(message: string): ApiRouteError {
  return new ApiRouteError('conflict', 409, message);
}

export function internal(message: string): ApiRouteError {
  return new ApiRouteError('internal', 500, message);
}

export function toApiError(error: unknown): ApiErrorLike {
  if (error instanceof ApiRouteError) {
    return {
      code: error.code,
      status: error.status,
      message: error.message,
    };
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as Partial<{ code: string; message: string }>;

    if (candidate.code === 'not-found') {
      return { code: 'not-found', status: 404, message: candidate.message ?? 'Resource not found.' };
    }

    if (candidate.code === 'invalid-state') {
      return { code: 'conflict', status: 409, message: candidate.message ?? 'Resource state is invalid for this operation.' };
    }

    if (candidate.code === 'command-failed') {
      return { code: 'command-failed', status: 409, message: candidate.message ?? 'Command execution failed.' };
    }
  }

  const message = messageFromUnknown(error);
  if (message === 'Feature not found.' || message === 'Stack not found.') {
    return { code: 'not-found', status: 404, message: 'Stack not found.' };
  }

  if (message === 'Stage not found.') {
    return { code: 'not-found', status: 404, message: 'Stage not found.' };
  }

  return {
    code: 'invalid-input',
    status: 400,
    message,
  };
}

export function toInternalApiError(error: unknown): ApiErrorLike {
  if (error instanceof ApiRouteError) {
    return {
      code: error.code,
      status: error.status,
      message: error.message,
    };
  }

  return {
    code: 'internal',
    status: 500,
    message: messageFromUnknown(error),
  };
}
