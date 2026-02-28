import { describe, expect, it } from 'vitest';

import {
  DEFAULT_STACK_CREATE_VALUES,
  hasStackCreateFieldErrors,
  toStackCreateFormState,
  toStackCreateInput,
  validateStackCreateValues,
  valuesFromStackCreateFormData,
} from './form-state';

describe('stack create form state', () => {
  it('maps form data into values with safe defaults', () => {
    const formData = new FormData();
    formData.set('name', 'Feature title');
    formData.set('notes', 'Initial scope');
    formData.set('type', 'bugfix');

    expect(valuesFromStackCreateFormData(formData)).toEqual({
      name: 'Feature title',
      notes: 'Initial scope',
      type: 'bugfix',
    });
  });

  it('preserves invalid type for server-side validation', () => {
    const formData = new FormData();
    formData.set('name', 'Feature title');
    formData.set('type', 'invalid');

    expect(valuesFromStackCreateFormData(formData).type).toBe('invalid');
  });

  it('returns field errors for invalid values', () => {
    const fieldErrors = validateStackCreateValues({
      name: '   ',
      notes: '',
      type: 'invalid',
    });

    expect(fieldErrors).toEqual({
      name: 'Feature title is required.',
      type: 'Feature type is invalid.',
    });
    expect(hasStackCreateFieldErrors(fieldErrors)).toBe(true);
  });

  it('throws when converting invalid type to stack input', () => {
    expect(() =>
      toStackCreateInput('repo-1', {
        name: 'Feature title',
        notes: '',
        type: 'invalid',
      }),
    ).toThrow('Feature type is invalid.');
  });

  it('maps failure payload to form state and trims create input', () => {
    const formState = toStackCreateFormState({
      values: {
        name: ' Feature title ',
        notes: '  ',
        type: 'feature',
      },
      fieldErrors: {},
      formError: 'Something went wrong.',
    });

    expect(formState.values.name).toBe(' Feature title ');
    expect(formState.formError).toBe('Something went wrong.');
    expect(toStackCreateInput('repo-1', formState.values)).toEqual({
      projectId: 'repo-1',
      name: 'Feature title',
      notes: undefined,
      type: 'feature',
    });
  });
});
