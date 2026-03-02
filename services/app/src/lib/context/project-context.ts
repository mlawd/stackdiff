import { getContext, setContext } from 'svelte';

const PROJECT_CONTEXT_KEY = Symbol('project-context');

export interface ProjectContextValue {
  id: string;
  name: string;
}

type ProjectContextGetter = () => ProjectContextValue;

export function setProjectContext(getProject: ProjectContextGetter): void {
  setContext(PROJECT_CONTEXT_KEY, getProject);
}

export function getProjectContext(): ProjectContextGetter {
  return getContext<ProjectContextGetter>(PROJECT_CONTEXT_KEY);
}
