import type { FeatureType } from '$lib/types/stack';

import type { StackCreateFeatureTypeOption } from './contracts';

export const STACK_CREATE_FEATURE_TYPE_OPTIONS: StackCreateFeatureTypeOption[] =
  [
    {
      value: 'feature',
      label: 'Feature',
      description: 'New capability or user-facing enhancement.',
    },
    {
      value: 'bugfix',
      label: 'Bugfix',
      description: 'Fixes incorrect behavior or regressions.',
    },
    {
      value: 'chore',
      label: 'Chore',
      description: 'Maintenance, tooling, or cleanup work.',
    },
  ];

export const STACK_CREATE_FEATURE_TYPES = new Set<FeatureType>(
  STACK_CREATE_FEATURE_TYPE_OPTIONS.map((option) => option.value),
);
