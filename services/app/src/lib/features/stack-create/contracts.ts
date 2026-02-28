import type { FeatureType } from '$lib/types/stack';

export interface StackCreateFeatureTypeOption {
  value: FeatureType;
  label: string;
  description: string;
}

export interface StackCreateValues {
  name: string;
  notes: string;
  type: FeatureType | string;
}

export interface StackCreateFieldErrors {
  name?: string;
  type?: string;
}

export interface StackCreateActionFailureData {
  values: StackCreateValues;
  fieldErrors: StackCreateFieldErrors;
  formError?: string;
}

export interface StackCreateFormState {
  values: StackCreateValues;
  fieldErrors: StackCreateFieldErrors;
  formError: string | null;
}
