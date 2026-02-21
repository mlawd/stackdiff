import { describe, expect, it } from 'vitest';

import { badRequest, notFound, toApiError, toInternalApiError } from '$lib/server/api-errors';

describe('api-errors', () => {
  it('preserves explicit route errors', () => {
    const resolved = toApiError(notFound('Stack not found.'));
    expect(resolved).toEqual({
      code: 'not-found',
      status: 404,
      message: 'Stack not found.',
    });
  });

  it('maps known service error codes', () => {
    const resolved = toApiError({
      code: 'command-failed',
      message: 'rebase failed',
    });

    expect(resolved).toEqual({
      code: 'command-failed',
      status: 409,
      message: 'rebase failed',
    });
  });

  it('maps unknown errors to invalid input by default', () => {
    const resolved = toApiError(new Error('bad payload'));
    expect(resolved).toEqual({
      code: 'invalid-input',
      status: 400,
      message: 'bad payload',
    });
  });

  it('maps unknown errors to internal for internal handler', () => {
    const resolved = toInternalApiError(new Error('boom'));
    expect(resolved).toEqual({
      code: 'internal',
      status: 500,
      message: 'boom',
    });
  });

  it('keeps bad request errors for internal handler', () => {
    const resolved = toInternalApiError(badRequest('Missing field'));
    expect(resolved).toEqual({
      code: 'invalid-input',
      status: 400,
      message: 'Missing field',
    });
  });
});
