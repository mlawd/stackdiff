import { access, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { badRequest, notFound } from '$lib/server/api-errors';
import { runCommand } from '$lib/server/command';
import type { StackedProject, StackedProjectConfig } from '$lib/types/stack';

const CONFIG_VERSION = 1;

function defaultConfigPath(): string {
  return path.join(os.homedir(), '.config', 'stacked', 'config.json');
}

export function getProjectConfigPath(): string {
  const overridePath = process.env.STACKED_CONFIG_PATH?.trim();
  if (overridePath && overridePath.length > 0) {
    return overridePath;
  }

  return defaultConfigPath();
}

function normalizeProject(value: unknown, index: number): StackedProject {
  if (typeof value !== 'object' || value === null) {
    throw badRequest(`Invalid project config at index ${index}.`);
  }

  const candidate = value as Partial<StackedProject>;
  const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  const repositoryPath =
    typeof candidate.repositoryPath === 'string'
      ? candidate.repositoryPath.trim()
      : '';

  if (!id) {
    throw badRequest(`Project at index ${index} is missing id.`);
  }

  if (!name) {
    throw badRequest(`Project ${id} is missing name.`);
  }

  if (!repositoryPath) {
    throw badRequest(`Project ${id} is missing repositoryPath.`);
  }

  if (!path.isAbsolute(repositoryPath)) {
    throw badRequest(`Project ${id} repositoryPath must be absolute.`);
  }

  return {
    id,
    name,
    repositoryPath: path.resolve(repositoryPath),
  };
}

function normalizeConfig(raw: unknown): StackedProjectConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw badRequest('Invalid config shape. Expected JSON object.');
  }

  const candidate = raw as {
    version?: unknown;
    projects?: unknown;
  };

  if (candidate.version !== CONFIG_VERSION) {
    throw badRequest(`Config version must be ${CONFIG_VERSION}.`);
  }

  if (!Array.isArray(candidate.projects)) {
    throw badRequest('Config projects must be an array.');
  }

  const projects = candidate.projects.map((entry, index) =>
    normalizeProject(entry, index),
  );
  if (projects.length === 0) {
    throw badRequest('Config must include at least one project.');
  }

  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  for (const project of projects) {
    if (seenIds.has(project.id)) {
      throw badRequest(`Duplicate project id: ${project.id}.`);
    }

    if (seenPaths.has(project.repositoryPath)) {
      throw badRequest(
        `Duplicate project repositoryPath: ${project.repositoryPath}.`,
      );
    }

    seenIds.add(project.id);
    seenPaths.add(project.repositoryPath);
  }

  return {
    version: CONFIG_VERSION,
    projects,
  };
}

export async function loadProjectConfig(): Promise<StackedProjectConfig> {
  const configPath = getProjectConfigPath();

  try {
    await access(configPath);
  } catch {
    throw notFound(
      `Project config not found at ${configPath}. Create it with { "version": 1, "projects": [{ "id": "my-repo", "name": "My Repo", "repositoryPath": "/absolute/path/to/repo" }] }`,
    );
  }

  const raw = await readFile(configPath, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw badRequest(`Project config at ${configPath} is not valid JSON.`);
  }

  return normalizeConfig(parsed);
}

export async function listConfiguredProjects(): Promise<StackedProject[]> {
  const config = await loadProjectConfig();
  return config.projects;
}

export async function getConfiguredProjectById(
  projectId: string,
): Promise<StackedProject> {
  const id = projectId.trim();
  if (!id) {
    throw badRequest('Project id is required.');
  }

  const projects = await listConfiguredProjects();
  const project = projects.find((entry) => entry.id === id);
  if (!project) {
    throw notFound(`Project ${id} is not configured.`);
  }

  return project;
}

export async function getDefaultProject(): Promise<StackedProject> {
  const projects = await listConfiguredProjects();
  return projects[0] as StackedProject;
}

export async function resolveProjectRepositoryRoot(
  projectId: string,
): Promise<string> {
  const project = await getConfiguredProjectById(projectId);
  const repoRootResult = await runCommand(
    'git',
    ['rev-parse', '--show-toplevel'],
    project.repositoryPath,
  );

  if (!repoRootResult.ok || !repoRootResult.stdout) {
    throw badRequest(
      `Configured project path is not a git repository: ${project.repositoryPath}`,
    );
  }

  return repoRootResult.stdout;
}
