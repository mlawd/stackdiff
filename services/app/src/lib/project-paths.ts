export function encodeProjectId(projectId: string): string {
  return encodeURIComponent(projectId);
}

export function projectStacksPath(
  projectId: string,
): `/projects/${string}/stacks` {
  return `/projects/${encodeProjectId(projectId)}/stacks`;
}

export function projectStackPath(
  projectId: string,
  stackId: string,
): `/projects/${string}/stacks/${string}` {
  return `${projectStacksPath(projectId)}/${encodeURIComponent(stackId)}`;
}

export function projectStacksNewPath(
  projectId: string,
): `/projects/${string}/stacks/new` {
  return `${projectStacksPath(projectId)}/new`;
}
