import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommandResult } from '$lib/server/command';
import type { StackMetadata } from '$lib/types/stack';

vi.mock('$lib/server/command', () => ({
	runCommand: vi.fn()
}));

vi.mock('$lib/server/stack-store', () => ({
	getStackById: vi.fn(),
	getRuntimeRepositoryPath: vi.fn(),
	getImplementationSessionByStackAndStage: vi.fn()
}));

vi.mock('$lib/server/worktree-service', () => ({
	resolveDefaultBaseBranch: vi.fn()
}));

import { runCommand } from '$lib/server/command';
import {
	getImplementationSessionByStackAndStage,
	getRuntimeRepositoryPath,
	getStackById
} from '$lib/server/stack-store';
import { getStageDiff, isStageDiffServiceError } from '$lib/server/stage-diff-service';
import { resolveDefaultBaseBranch } from '$lib/server/worktree-service';

const runCommandMock = vi.mocked(runCommand);
const getStackByIdMock = vi.mocked(getStackById);
const getRuntimeRepositoryPathMock = vi.mocked(getRuntimeRepositoryPath);
const getImplementationSessionByStackAndStageMock = vi.mocked(getImplementationSessionByStackAndStage);
const resolveDefaultBaseBranchMock = vi.mocked(resolveDefaultBaseBranch);

function ok(stdout: string): CommandResult {
	return { ok: true, stdout, stderr: '' };
}

function fail(stderr: string): CommandResult {
	return { ok: false, stdout: '', stderr, error: stderr };
}

function createStack(stages: Array<{ id: string; title: string }>): StackMetadata {
	return {
		id: 'stack-1',
		name: 'Branch diff',
		type: 'feature',
		status: 'started',
		stages: stages.map((stage) => ({
			...stage,
			status: 'in-progress'
		}))
	};
}

describe('stage-diff-service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getRuntimeRepositoryPathMock.mockResolvedValue('/repo');
		resolveDefaultBaseBranchMock.mockResolvedValue('main');
	});

	it('resolves stage-1 base ref with origin fallback', async () => {
		getStackByIdMock.mockResolvedValue(createStack([{ id: 'stage-1', title: 'Stage 1' }]));
		getImplementationSessionByStackAndStageMock.mockResolvedValue({
			id: 'session-1',
			stackId: 'stack-1',
			stageId: 'stage-1',
			branchName: 'feature/stage-1',
			worktreePathKey: 'wt/stage-1',
			createdAt: '2026-02-19T00:00:00.000Z',
			updatedAt: '2026-02-19T00:00:00.000Z'
		});

		runCommandMock.mockImplementation(async (_command, args) => {
			const ref = args[3];
			if (args[0] === 'rev-parse' && ref === 'main^{commit}') {
				return fail('missing local base');
			}

			if (args[0] === 'rev-parse' && ref === 'origin/main^{commit}') {
				return ok('');
			}

			if (args[0] === 'rev-parse' && ref === 'feature/stage-1^{commit}') {
				return ok('');
			}

			if (args[0] === 'diff') {
				return ok(
					[
						'diff --git a/src/file.ts b/src/file.ts',
						'--- a/src/file.ts',
						'+++ b/src/file.ts',
						'@@ -1,1 +1,1 @@',
						'-old',
						'+new'
					].join('\n')
				);
			}

			return fail(`unexpected command: ${args.join(' ')}`);
		});

		const payload = await getStageDiff('stack-1', 'stage-1');

		expect(payload.baseRef).toBe('origin/main');
		expect(payload.targetRef).toBe('feature/stage-1');
		expect(payload.summary).toEqual({ filesChanged: 1, additions: 1, deletions: 1 });
	});

	it('returns not-diffable when previous stage baseline is unavailable', async () => {
		getStackByIdMock.mockResolvedValue(
			createStack([
				{ id: 'stage-1', title: 'Stage 1' },
				{ id: 'stage-2', title: 'Stage 2' }
			])
		);
		getImplementationSessionByStackAndStageMock.mockImplementation(async (_stackId, stageId) => {
			if (stageId === 'stage-2') {
				return {
					id: 'session-2',
					stackId: 'stack-1',
					stageId: 'stage-2',
					branchName: 'feature/stage-2',
					worktreePathKey: 'wt/stage-2',
					createdAt: '2026-02-19T00:00:00.000Z',
					updatedAt: '2026-02-19T00:00:00.000Z'
				};
			}

			return undefined;
		});

		await expect(getStageDiff('stack-1', 'stage-2')).rejects.toMatchObject({
			code: 'not-diffable',
			message: 'Previous stage branch is unavailable for diff baseline.'
		});
	});

	it('maps git diff command failure to command-failed', async () => {
		getStackByIdMock.mockResolvedValue(createStack([{ id: 'stage-1', title: 'Stage 1' }]));
		getImplementationSessionByStackAndStageMock.mockResolvedValue({
			id: 'session-1',
			stackId: 'stack-1',
			stageId: 'stage-1',
			branchName: 'feature/stage-1',
			worktreePathKey: 'wt/stage-1',
			createdAt: '2026-02-19T00:00:00.000Z',
			updatedAt: '2026-02-19T00:00:00.000Z'
		});

		runCommandMock.mockImplementation(async (_command, args) => {
			if (args[0] === 'rev-parse') {
				return ok('');
			}

			if (args[0] === 'diff') {
				return fail('fatal: bad revision');
			}

			return fail('unexpected command');
		});

		await expect(getStageDiff('stack-1', 'stage-1')).rejects.toMatchObject({
			code: 'command-failed'
		});
	});

	it('maps malformed hunk headers to parse-failed', async () => {
		getStackByIdMock.mockResolvedValue(createStack([{ id: 'stage-1', title: 'Stage 1' }]));
		getImplementationSessionByStackAndStageMock.mockResolvedValue({
			id: 'session-1',
			stackId: 'stack-1',
			stageId: 'stage-1',
			branchName: 'feature/stage-1',
			worktreePathKey: 'wt/stage-1',
			createdAt: '2026-02-19T00:00:00.000Z',
			updatedAt: '2026-02-19T00:00:00.000Z'
		});

		runCommandMock.mockImplementation(async (_command, args) => {
			if (args[0] === 'rev-parse') {
				return ok('');
			}

			if (args[0] === 'diff') {
				return ok(['diff --git a/src/file.ts b/src/file.ts', '@@ bad @@', '-a', '+b'].join('\n'));
			}

			return fail('unexpected command');
		});

		await expect(getStageDiff('stack-1', 'stage-1')).rejects.toMatchObject({
			code: 'parse-failed'
		});
	});

	it('parses rename and binary diff edge cases', async () => {
		getStackByIdMock.mockResolvedValue(createStack([{ id: 'stage-1', title: 'Stage 1' }]));
		getImplementationSessionByStackAndStageMock.mockResolvedValue({
			id: 'session-1',
			stackId: 'stack-1',
			stageId: 'stage-1',
			branchName: 'feature/stage-1',
			worktreePathKey: 'wt/stage-1',
			createdAt: '2026-02-19T00:00:00.000Z',
			updatedAt: '2026-02-19T00:00:00.000Z'
		});

		runCommandMock.mockImplementation(async (_command, args) => {
			if (args[0] === 'rev-parse') {
				return ok('');
			}

			if (args[0] === 'diff') {
				return ok(
					[
						'diff --git a/old.txt b/new.txt',
						'rename from old.txt',
						'rename to new.txt',
						'--- a/old.txt',
						'+++ b/new.txt',
						'@@ -1 +1 @@',
						'-old line',
						'+new line',
						'\\ No newline at end of file',
						'diff --git a/image.png b/image.png',
						'Binary files a/image.png and b/image.png differ'
					].join('\n')
				);
			}

			return fail('unexpected command');
		});

		const payload = await getStageDiff('stack-1', 'stage-1');

		expect(payload.files).toHaveLength(2);
		expect(payload.files[0]).toMatchObject({
			path: 'new.txt',
			previousPath: 'old.txt',
			changeType: 'renamed',
			additions: 1,
			deletions: 1
		});
		expect(payload.files[1]).toMatchObject({
			path: 'image.png',
			changeType: 'modified',
			isBinary: true
		});
	});

	it('returns not-found when stage does not exist', async () => {
		getStackByIdMock.mockResolvedValue(createStack([{ id: 'stage-1', title: 'Stage 1' }]));

		await expect(getStageDiff('stack-1', 'missing-stage')).rejects.toMatchObject({
			code: 'not-found',
			message: 'Stage not found.'
		});
	});

	it('validates stage diff service error shape guard', () => {
		expect(isStageDiffServiceError({ code: 'not-found', message: 'x' })).toBe(true);
		expect(isStageDiffServiceError({ code: 'not-found' })).toBe(false);
		expect(isStageDiffServiceError('nope')).toBe(false);
	});
});
