import type { StackUpsertInput } from '$lib/types/stack';

import {
  STACK_CREATE_FEATURE_TYPES,
  STACK_CREATE_FEATURE_TYPE_OPTIONS,
} from './feature-type-options';
import type {
  StackCreateActionFailureData,
  StackCreateFieldErrors,
  StackCreateFormState,
  StackCreateValues,
} from './contracts';

export const DEFAULT_STACK_CREATE_VALUES: StackCreateValues = {
  name: '',
  notes: '',
  type: STACK_CREATE_FEATURE_TYPE_OPTIONS[0]?.value ?? 'feature',
};

function isFeatureType(value: string): value is StackUpsertInput['type'] {
  return STACK_CREATE_FEATURE_TYPES.has(value as StackUpsertInput['type']);
}

function normalizeString(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
}

function normalizeFeatureType(value: string): StackCreateValues['type'] {
  if (isFeatureType(value)) {
    return value;
  }

  return DEFAULT_STACK_CREATE_VALUES.type;
}

export function valuesFromStackCreateFormData(
  formData: FormData,
): StackCreateValues {
  return {
    name: normalizeString(formData.get('name')),
    notes: normalizeString(formData.get('notes')),
    type: normalizeString(formData.get('type')),
  };
}

export function validateStackCreateValues(
  values: StackCreateValues,
): StackCreateFieldErrors {
  const fieldErrors: StackCreateFieldErrors = {};

  if (!values.name.trim()) {
    fieldErrors.name = 'Feature title is required.';
  }

  if (!isFeatureType(values.type)) {
    fieldErrors.type = 'Feature type is invalid.';
  }

  return fieldErrors;
}

export function hasStackCreateFieldErrors(
  fieldErrors: StackCreateFieldErrors,
): boolean {
  return Object.values(fieldErrors).some((message) => Boolean(message));
}

export function toStackCreateInput(
  projectId: string,
  values: StackCreateValues,
): StackUpsertInput {
  const notes = values.notes.trim();
  const type = values.type;

  if (!isFeatureType(type)) {
    throw new Error('Feature type is invalid.');
  }

  return {
    projectId,
    name: values.name.trim(),
    notes: notes.length > 0 ? notes : undefined,
    type,
  };
}

export function toStackCreateFormState(
  data: Partial<StackCreateActionFailureData> | null | undefined,
): StackCreateFormState {
  const values = data?.values;

  return {
    values: {
      name: values?.name ?? DEFAULT_STACK_CREATE_VALUES.name,
      notes: values?.notes ?? DEFAULT_STACK_CREATE_VALUES.notes,
      type: normalizeFeatureType(
        values?.type ?? DEFAULT_STACK_CREATE_VALUES.type,
      ),
    },
    fieldErrors: data?.fieldErrors ?? {},
    formError: data?.formError ?? null,
  };
}
