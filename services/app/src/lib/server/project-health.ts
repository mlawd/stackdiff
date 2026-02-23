import { access, constants, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { runCommand } from '$lib/server/command';
import { getConfiguredProjectById } from '$lib/server/project-config';
import type {
  ProjectHealthCheck,
  ProjectHealthSummary,
} from '$lib/types/stack';

async function checkPathExists(
  targetPath: string,
): Promise<ProjectHealthCheck> {
  try {
    await access(targetPath, constants.F_OK);
    return { key: 'path-exists', ok: true };
  } catch {
    return {
      key: 'path-exists',
      ok: false,
      message: `Path does not exist: ${targetPath}`,
    };
  }
}

async function checkPathIsDirectory(
  targetPath: string,
): Promise<ProjectHealthCheck> {
  try {
    const info = await stat(targetPath);
    if (!info.isDirectory()) {
      return {
        key: 'path-is-directory',
        ok: false,
        message: `Path is not a directory: ${targetPath}`,
      };
    }

    return { key: 'path-is-directory', ok: true };
  } catch {
    return {
      key: 'path-is-directory',
      ok: false,
      message: `Cannot stat path: ${targetPath}`,
    };
  }
}

async function checkGitRepository(
  targetPath: string,
): Promise<{ check: ProjectHealthCheck; repositoryRoot?: string }> {
  const result = await runCommand(
    'git',
    ['rev-parse', '--show-toplevel'],
    targetPath,
  );
  if (!result.ok || !result.stdout) {
    return {
      check: {
        key: 'git-repo',
        ok: false,
        message: result.stderr || result.error || 'Not a git repository.',
      },
    };
  }

  return {
    check: { key: 'git-repo', ok: true },
    repositoryRoot: result.stdout,
  };
}

async function checkStackedWritable(
  repositoryRoot: string,
): Promise<ProjectHealthCheck> {
  const probeDirectory = path.join(
    repositoryRoot,
    '.stacked',
    '.health-probe',
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  );

  try {
    await mkdir(probeDirectory, { recursive: true });
    await rm(probeDirectory, { recursive: true, force: true });
    return { key: 'stacked-writable', ok: true };
  } catch (error) {
    return {
      key: 'stacked-writable',
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkGitStatus(
  repositoryRoot: string,
): Promise<ProjectHealthCheck> {
  const result = await runCommand(
    'git',
    ['status', '--porcelain', '--branch'],
    repositoryRoot,
  );
  if (result.ok) {
    return { key: 'git-status', ok: true };
  }

  return {
    key: 'git-status',
    ok: false,
    message: result.stderr || result.error || 'git status failed.',
  };
}

async function checkGhAuth(
  repositoryRoot: string,
): Promise<ProjectHealthCheck> {
  const result = await runCommand('gh', ['auth', 'status'], repositoryRoot);
  if (result.ok) {
    return { key: 'gh-auth', ok: true };
  }

  return {
    key: 'gh-auth',
    ok: false,
    message: result.stderr || result.error || 'gh auth status failed.',
  };
}

export async function getProjectHealth(
  projectId: string,
): Promise<ProjectHealthSummary> {
  const project = await getConfiguredProjectById(projectId);
  const checks: ProjectHealthCheck[] = [];

  const pathExists = await checkPathExists(project.repositoryPath);
  checks.push(pathExists);
  if (!pathExists.ok) {
    return {
      projectId: project.id,
      ok: false,
      checks,
    };
  }

  const isDirectory = await checkPathIsDirectory(project.repositoryPath);
  checks.push(isDirectory);
  if (!isDirectory.ok) {
    return {
      projectId: project.id,
      ok: false,
      checks,
    };
  }

  const repositoryCheck = await checkGitRepository(project.repositoryPath);
  checks.push(repositoryCheck.check);
  if (!repositoryCheck.check.ok || !repositoryCheck.repositoryRoot) {
    return {
      projectId: project.id,
      ok: false,
      checks,
    };
  }

  const repositoryRoot = repositoryCheck.repositoryRoot;
  const [writable, gitStatus, ghAuth] = await Promise.all([
    checkStackedWritable(repositoryRoot),
    checkGitStatus(repositoryRoot),
    checkGhAuth(repositoryRoot),
  ]);

  checks.push(writable, gitStatus, ghAuth);

  return {
    projectId: project.id,
    ok: checks.every((check) => check.ok),
    repositoryRoot,
    checks,
  };
}
