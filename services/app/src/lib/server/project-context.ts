import type { Cookies } from '@sveltejs/kit';

import type { StackedProject } from '$lib/types/stack';

export const SELECTED_PROJECT_COOKIE = 'stacked_project_id';

function hasProject(projects: StackedProject[], projectId: string): boolean {
  return projects.some((project) => project.id === projectId);
}

export function resolveSelectedProjectId(input: {
  projects: StackedProject[];
  urlProjectId?: string | null;
  cookieProjectId?: string | null;
}): string {
  const fromUrl = input.urlProjectId?.trim();
  if (fromUrl && hasProject(input.projects, fromUrl)) {
    return fromUrl;
  }

  const fromCookie = input.cookieProjectId?.trim();
  if (fromCookie && hasProject(input.projects, fromCookie)) {
    return fromCookie;
  }

  return input.projects[0]?.id ?? '';
}

export function persistSelectedProjectId(
  cookies: Cookies,
  projectId: string,
): void {
  cookies.set(SELECTED_PROJECT_COOKIE, projectId, {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    secure: false,
    maxAge: 60 * 60 * 24 * 365,
  });
}
