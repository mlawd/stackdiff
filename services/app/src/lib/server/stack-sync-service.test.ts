import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommandResult } from '$lib/server/command';
import type { StackMetadata } from '$lib/types/stack';

vi.mock('$lib/server/command', () => ({
	runCommand: vi.fn()
}));

vi.mock('$lib/server/stack-store', () => ({
	getImplementationSessionsByStackId: vi.fn(),
	getRuntimeRepositoryPath: vi.fn(),
	getStackById: vi.fn()
}));

vi.mock('$lib/server/worktree-service', () => ({
	resolveDefaultBaseBranch: vi.fn(),
	resolveWorktreeAbsolutePath: vi.fn()
}));

import { runCommand } from '$lib/server/command';
import {
	getImplementationSessionsByStackId,
	getRuntimeRepositoryPath,
	getStackById
} from '$lib/server/stack-store';
import { getStageSyncById, isStackSyncServiceError, syncStack } from '$lib/server/stack-sync-service';
import { resolveDefaultBaseBranch, resolveWorktreeAbsolutePath } from '$lib/server/worktree-service';

const runCommandMock = vi.mocked(runCommand);
const getImplementationSessionsByStackIdMock = vi.mocked(getImplementationSessionsByStackId);
const getRuntimeRepositoryPathMock = vi.mocked(getRuntimeRepositoryPath);
const getStackByIdMock = vi.mocked(getStackById);
const resolveDefaultBaseBranchMock = vi.mocked(resolveDefaultBaseBranch);
const resolveWorktreeAbsolutePathMock = vi.mocked(resolveWorktreeAbsolutePath);

function ok(stdout: string): CommandResult {
	return { ok: true, stdout, stderr: '' };
}

function fail(stderr: string): CommandResult {
	return { ok: false, stdout: '', stderr, error: stderr };
}

function createStack(): StackMetadata {
	return {
		id: 'stack-1',
		name: 'Sync flow',
		type: 'feature',
		status: 'started',
		stages: [
			{ id: 'stage-1', title: 'Stage 1', status: 'in-progress' },
			{ id: 'stage-2', title: 'Stage 2', status: 'not-started' }
		]
	};
}

describe('stack-sync-service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getRuntimeRepositoryPathMock.mockResolvedValue('/repo');
		resolveDefaultBaseBranchMock.mockResolvedValue('main');
		resolveWorktreeAbsolutePathMock.mockImplementation((_root, key) => `/repo/${key}`);
		getImplementationSessionsByStackIdMock.mockResolvedValue([
			{
				id: 'impl-1',
				stackId: 'stack-1',
				stageId: 'stage-1',
				branchName: 'feature/stage-1',
				worktreePathKey: '.stacked/worktrees/stage-1',
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z'
			},
			{
				id: 'impl-2',
				stackId: 'stack-1',
				stageId: 'stage-2',
				branchName: 'feature/stage-2',
				worktreePathKey: '.stacked/worktrees/stage-2',
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z'
			}
		]);
	});

	it('marks stages out of sync when branch is behind base', async () => {
		runCommandMock.mockImplementation(async (_command, args) => {
			if (args[0] === 'rev-parse' && args[3] === 'origin/main^{commit}') {
				return ok('');
			}

			if (args[0] === 'rev-parse' && args[3] === 'feature/stage-1^{commit}') {
				return ok('');
			}

			if (args[0] === 'rev-list' && args[2] === 'feature/stage-1..origin/main') {
				return ok('2');
			}

			if (args[0] === 'rev-list' && args[2] === 'feature/stage-2..feature/stage-1') {
				return ok('0');
			}

			return fail(`unexpected command: ${args.join(' ')}`);
		});

		const status = await getStageSyncById(createStack());

		expect(status['stage-1']).toMatchObject({
			isOutOfSync: true,
			behindBy: 2,
			baseRef: 'origin/main'
		});
		expect(status['stage-2']).toMatchObject({
			isOutOfSync: false,
			behindBy: 0,
			baseRef: 'feature/stage-1'
		});
	});

	it('rebases out-of-sync stages in order', async () => {
		getStackByIdMock.mockResolvedValue(createStack());
		runCommandMock.mockImplementation(async (_command, args) => {
			if (args[0] === 'rev-parse' && args[3] === 'origin/main^{commit}') {
				return ok('');
			}

			if (args[0] === 'rev-parse' && args[3] === 'feature/stage-1^{commit}') {
				return ok('');
			}

			if (args[0] === 'rev-list' && args[2] === 'feature/stage-1..origin/main') {
				return ok('1');
			}

			if (args[0] === 'rev-list' && args[2] === 'feature/stage-2..feature/stage-1') {
				return ok('3');
			}

			if (args[0] === 'rebase') {
				return ok('');
			}

			if (args[0] === 'push' && args[1] === '--force-with-lease') {
				return ok('');
			}

			return fail(`unexpected command: ${args.join(' ')}`);
		});

		const result = await syncStack('stack-1');

		expect(result.rebasedStages).toBe(2);
		expect(result.skippedStages).toBe(0);
		expect(runCommandMock).toHaveBeenCalledWith(
			'git',
			['rebase', 'origin/main'],
			'/repo/.stacked/worktrees/stage-1',
			expect.any(Object)
		);
		expect(runCommandMock).toHaveBeenCalledWith(
			'git',
			['rebase', 'feature/stage-1'],
			'/repo/.stacked/worktrees/stage-2',
			expect.any(Object)
		);
		expect(runCommandMock).toHaveBeenCalledWith(
			'git',
			['push', '--force-with-lease', 'origin', 'feature/stage-1'],
			'/repo/.stacked/worktrees/stage-1',
			expect.any(Object)
		);
		expect(runCommandMock).toHaveBeenCalledWith(
			'git',
			['push', '--force-with-lease', 'origin', 'feature/stage-2'],
			'/repo/.stacked/worktrees/stage-2',
			expect.any(Object)
		);
	});

	it('fails when force-with-lease push fails after rebase', async () => {
		getStackByIdMock.mockResolvedValue(createStack());
		runCommandMock.mockImplementation(async (_command, args) => {
			if (args[0] === 'rev-parse' && args[3] === 'origin/main^{commit}') {
				return ok('');
			}

			if (args[0] === 'rev-parse' && args[3] === 'feature/stage-1^{commit}') {
				return ok('');
			}

			if (args[0] === 'rev-list' && args[2] === 'feature/stage-1..origin/main') {
				return ok('1');
			}

			if (args[0] === 'rebase' && args[1] === 'origin/main') {
				return ok('');
			}

			if (args[0] === 'push' && args[1] === '--force-with-lease') {
				return fail('rejected');
			}

			return fail(`unexpected command: ${args.join(' ')}`);
		});

		await expect(syncStack('stack-1')).rejects.toMatchObject({
			code: 'command-failed',
			message: expect.stringContaining('Failed to push synced stage Stage 1')
		});
	});

	it('auto-aborts rebase when stage sync fails', async () => {
		getStackByIdMock.mockResolvedValue(createStack());
		runCommandMock.mockImplementation(async (_command, args) => {
			if (args[0] === 'rev-parse' && args[3] === 'origin/main^{commit}') {
				return ok('');
			}

			if (args[0] === 'rev-parse' && args[3] === 'feature/stage-1^{commit}') {
				return ok('');
			}

			if (args[0] === 'rev-list' && args[2] === 'feature/stage-1..origin/main') {
				return ok('1');
			}

			if (args[0] === 'rebase' && args[1] === 'origin/main') {
				return fail('conflict during rebase');
			}

			if (args[0] === 'rebase' && args[1] === '--abort') {
				return ok('');
			}

			return fail(`unexpected command: ${args.join(' ')}`);
		});

		await expect(syncStack('stack-1')).rejects.toMatchObject({
			code: 'command-failed'
		});
		expect(runCommandMock).toHaveBeenCalledWith(
			'git',
			['rebase', '--abort'],
			'/repo/.stacked/worktrees/stage-1',
			expect.any(Object)
		);
	});

	it('validates sync service error guard', () => {
		expect(isStackSyncServiceError({ code: 'command-failed', message: 'x' })).toBe(true);
		expect(isStackSyncServiceError({ code: 'command-failed' })).toBe(false);
		expect(isStackSyncServiceError('nope')).toBe(false);
	});
});
