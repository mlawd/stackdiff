import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadProjectConfig } from '$lib/server/project-config';

const tempDirectories: string[] = [];

async function writeConfig(content: string): Promise<string> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'stacked-config-test-'));
  tempDirectories.push(tempDir);

  const configDir = path.join(tempDir, '.config', 'stacked');
  await mkdir(configDir, { recursive: true });

  const configPath = path.join(configDir, 'config.json');
  await writeFile(configPath, content, 'utf-8');
  return configPath;
}

describe('project-config', () => {
  const originalStackedConfigPath = process.env.STACKED_CONFIG_PATH;

  afterEach(async () => {
    process.env.STACKED_CONFIG_PATH = originalStackedConfigPath;

    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it('loads optional defaultModel when present', async () => {
    const configPath = await writeConfig(
      JSON.stringify(
        {
          version: 1,
          defaultModel: 'anthropic/claude-sonnet-4-6',
          projects: [
            {
              id: 'stacked',
              name: 'stacked',
              repositoryPath: '/tmp/repo',
            },
          ],
        },
        null,
        2,
      ),
    );
    process.env.STACKED_CONFIG_PATH = configPath;

    const config = await loadProjectConfig();

    expect(config.defaultModel).toBe('anthropic/claude-sonnet-4-6');
    expect(config.runtime).toEqual({
      syncMode: 'local',
      pollIntervalMs: 15000,
      prSnapshotTtlMs: 30000,
    });
  });

  it('loads runtime config overrides when present', async () => {
    const configPath = await writeConfig(
      JSON.stringify(
        {
          version: 1,
          runtime: {
            syncMode: 'hybrid',
            pollIntervalMs: 30000,
            prSnapshotTtlMs: 45000,
          },
          projects: [
            {
              id: 'stacked',
              name: 'stacked',
              repositoryPath: '/tmp/repo',
            },
          ],
        },
        null,
        2,
      ),
    );
    process.env.STACKED_CONFIG_PATH = configPath;

    const config = await loadProjectConfig();

    expect(config.runtime).toEqual({
      syncMode: 'hybrid',
      pollIntervalMs: 30000,
      prSnapshotTtlMs: 45000,
    });
  });

  it('rejects defaultModel that is not provider/model format', async () => {
    const configPath = await writeConfig(
      JSON.stringify(
        {
          version: 1,
          defaultModel: 'claude-sonnet-4-6',
          projects: [
            {
              id: 'stacked',
              name: 'stacked',
              repositoryPath: '/tmp/repo',
            },
          ],
        },
        null,
        2,
      ),
    );
    process.env.STACKED_CONFIG_PATH = configPath;

    await expect(loadProjectConfig()).rejects.toMatchObject({
      message:
        'Config defaultModel must be in provider/model format (for example "anthropic/claude-sonnet-4-6").',
    });
  });

  it('rejects runtime sync mode outside allowed values', async () => {
    const configPath = await writeConfig(
      JSON.stringify(
        {
          version: 1,
          runtime: {
            syncMode: 'invalid',
          },
          projects: [
            {
              id: 'stacked',
              name: 'stacked',
              repositoryPath: '/tmp/repo',
            },
          ],
        },
        null,
        2,
      ),
    );
    process.env.STACKED_CONFIG_PATH = configPath;

    await expect(loadProjectConfig()).rejects.toMatchObject({
      message:
        'Config runtime.syncMode must be one of: local, webhook, hybrid.',
    });
  });

  it('rejects non-positive runtime polling values', async () => {
    const configPath = await writeConfig(
      JSON.stringify(
        {
          version: 1,
          runtime: {
            pollIntervalMs: 0,
          },
          projects: [
            {
              id: 'stacked',
              name: 'stacked',
              repositoryPath: '/tmp/repo',
            },
          ],
        },
        null,
        2,
      ),
    );
    process.env.STACKED_CONFIG_PATH = configPath;

    await expect(loadProjectConfig()).rejects.toMatchObject({
      message: 'Config runtime.pollIntervalMs must be a positive integer.',
    });
  });
});
