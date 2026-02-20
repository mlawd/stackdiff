import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StageDiffPayload } from '$lib/types/stack';

vi.mock('$lib/server/stage-diff-service', () => ({
	getStageDiff: vi.fn(),
	isStageDiffServiceError: vi.fn()
}));

vi.mock('$lib/server/stack-store', () => ({
	getImplementationSessionByStackAndStage: vi.fn(),
	getRuntimeRepositoryPath: vi.fn(),
	touchImplementationSessionUpdatedAt: vi.fn()
}));

vi.mock('$lib/server/worktree-service', () => ({
	resolveWorktreeAbsolutePath: vi.fn()
}));

vi.mock('$lib/server/opencode', () => ({
	sendOpencodeSessionMessage: vi.fn()
}));

import { sendOpencodeSessionMessage } from '$lib/server/opencode';
import { getStageDiff, isStageDiffServiceError } from '$lib/server/stage-diff-service';
import {
	getImplementationSessionByStackAndStage,
	getRuntimeRepositoryPath,
	touchImplementationSessionUpdatedAt
} from '$lib/server/stack-store';
import { startStageDiffChat } from '$lib/server/stage-diff-chat-service';
import { resolveWorktreeAbsolutePath } from '$lib/server/worktree-service';

const getStageDiffMock = vi.mocked(getStageDiff);
const isStageDiffServiceErrorMock = vi.mocked(isStageDiffServiceError);
const getImplementationSessionByStackAndStageMock = vi.mocked(getImplementationSessionByStackAndStage);
const getRuntimeRepositoryPathMock = vi.mocked(getRuntimeRepositoryPath);
const touchImplementationSessionUpdatedAtMock = vi.mocked(touchImplementationSessionUpdatedAt);
const resolveWorktreeAbsolutePathMock = vi.mocked(resolveWorktreeAbsolutePath);
const sendOpencodeSessionMessageMock = vi.mocked(sendOpencodeSessionMessage);

const diffPayload: StageDiffPayload = {
	stackId: 'stack-1',
	stageId: 'stage-7',
	baseRef: 'main',
	targetRef: 'feature/stage-7',
	isTruncated: false,
	summary: {
		filesChanged: 1,
		additions: 1,
		deletions: 1
	},
	files: [
		{
			path: 'src/file.ts',
			changeType: 'modified',
			isBinary: false,
			additions: 1,
			deletions: 1,
			hunks: [
				{
					header: '@@ -1,2 +1,2 @@',
					oldStart: 1,
					oldLines: 2,
					newStart: 1,
					newLines: 2,
					lines: [
						{
							lineId: 'line-del',
							type: 'del',
							content: 'const oldValue = 1;',
							oldLineNumber: 1,
							newLineNumber: null
						},
						{
							lineId: 'line-add',
							type: 'add',
							content: 'const newValue = 2;',
							oldLineNumber: null,
							newLineNumber: 1
						}
					]
				}
			]
		}
	]
};

describe('stage-diff-chat-service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getStageDiffMock.mockResolvedValue(diffPayload);
		getImplementationSessionByStackAndStageMock.mockResolvedValue({
			id: 'impl-1',
			stackId: 'stack-1',
			stageId: 'stage-7',
			branchName: 'feature/stage-7',
			worktreePathKey: '.stacked/worktrees/feature-stage-7',
			opencodeSessionId: 'session-1',
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z'
		});
		getRuntimeRepositoryPathMock.mockResolvedValue('/repo');
		resolveWorktreeAbsolutePathMock.mockReturnValue('/repo/.stacked/worktrees/feature-stage-7');
		sendOpencodeSessionMessageMock.mockResolvedValue('Focused response');
		isStageDiffServiceErrorMock.mockImplementation((error: unknown) => {
			if (typeof error !== 'object' || error === null) {
				return false;
			}

			const candidate = error as { code?: unknown; message?: unknown };
			return typeof candidate.code === 'string' && typeof candidate.message === 'string';
		});
	});

	it('starts focused chat with canonical ordered selected lines and snippet', async () => {
		const result = await startStageDiffChat({
			stackId: 'stack-1',
			stageId: 'stage-7',
			selection: {
				refs: {
					baseRef: 'main',
					targetRef: 'feature/stage-7'
				},
				filePath: 'src/file.ts',
				selectedLineIds: ['line-add', 'line-del'],
				snippet: 'ignored'
			},
			message: 'Help me reason about this change.'
		});

		expect(result.selection.selectedLineIds).toEqual(['line-del', 'line-add']);
		expect(result.selection.snippet).toBe('-const oldValue = 1;\n+const newValue = 2;');
		expect(sendOpencodeSessionMessageMock).toHaveBeenCalledWith(
			'session-1',
			expect.stringContaining('Help me reason about this change.'),
			{
				agent: 'build',
				directory: '/repo/.stacked/worktrees/feature-stage-7'
			}
		);
		expect(touchImplementationSessionUpdatedAtMock).toHaveBeenCalledWith('stack-1', 'stage-7');
	});

	it('rejects stale refs as invalid selection', async () => {
		await expect(
			startStageDiffChat({
				stackId: 'stack-1',
				stageId: 'stage-7',
				selection: {
					refs: {
						baseRef: 'stale-base',
						targetRef: 'feature/stage-7'
					},
					filePath: 'src/file.ts',
					selectedLineIds: ['line-del'],
					snippet: ''
				}
			})
		).rejects.toMatchObject({
			code: 'invalid-selection'
		});
	});

	it('rejects missing implementation opencode session as not-diffable', async () => {
		getImplementationSessionByStackAndStageMock.mockResolvedValue({
			id: 'impl-1',
			stackId: 'stack-1',
			stageId: 'stage-7',
			branchName: 'feature/stage-7',
			worktreePathKey: '.stacked/worktrees/feature-stage-7',
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z'
		});

		await expect(
			startStageDiffChat({
				stackId: 'stack-1',
				stageId: 'stage-7',
				selection: {
					refs: {
						baseRef: 'main',
						targetRef: 'feature/stage-7'
					},
					filePath: 'src/file.ts',
					selectedLineIds: ['line-del'],
					snippet: ''
				}
			})
		).rejects.toMatchObject({
			code: 'not-diffable'
		});
	});
});
