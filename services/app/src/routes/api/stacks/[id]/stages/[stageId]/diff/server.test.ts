import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StageDiffPayload } from '$lib/types/stack';

vi.mock('$lib/server/stage-diff-service', () => ({
	getStageDiff: vi.fn(),
	isStageDiffServiceError: vi.fn()
}));

import { getStageDiff, isStageDiffServiceError } from '$lib/server/stage-diff-service';
import { GET } from './+server';

const getStageDiffMock = vi.mocked(getStageDiff);
const isStageDiffServiceErrorMock = vi.mocked(isStageDiffServiceError);

const examplePayload: StageDiffPayload = {
	stackId: 'stack-1',
	stageId: 'stage-1',
	baseRef: 'main',
	targetRef: 'feature/stage-1',
	isTruncated: false,
	summary: {
		filesChanged: 1,
		additions: 1,
		deletions: 1
	},
	files: []
};

describe('GET /api/stacks/[id]/stages/[stageId]/diff', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		isStageDiffServiceErrorMock.mockImplementation((error: unknown) => {
			if (typeof error !== 'object' || error === null) {
				return false;
			}

			const candidate = error as { code?: unknown; message?: unknown };
			return typeof candidate.code === 'string' && typeof candidate.message === 'string';
		});
	});

	it('returns 404 when stack or stage params are missing', async () => {
		const response = await GET({ params: { id: '', stageId: '' } } as never);
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body).toEqual({
			error: {
				code: 'not-found',
				message: 'Feature id and stage id are required.'
			}
		});
	});

	it('returns 200 with diff payload when service succeeds', async () => {
		getStageDiffMock.mockResolvedValue(examplePayload);

		const response = await GET({ params: { id: 'stack-1', stageId: 'stage-1' } } as never);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ diff: examplePayload });
		expect(getStageDiffMock).toHaveBeenCalledWith('stack-1', 'stage-1');
	});

	it('returns 409 for not-diffable service errors', async () => {
		getStageDiffMock.mockRejectedValue({
			code: 'not-diffable',
			message: 'Stage branch is unavailable.'
		});

		const response = await GET({ params: { id: 'stack-1', stageId: 'stage-2' } } as never);
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body).toEqual({
			error: {
				code: 'not-diffable',
				message: 'Stage branch is unavailable.'
			}
		});
	});

	it('returns 500 for parse-failed service errors', async () => {
		getStageDiffMock.mockRejectedValue({
			code: 'parse-failed',
			message: 'Unable to parse git diff output.'
		});

		const response = await GET({ params: { id: 'stack-1', stageId: 'stage-1' } } as never);
		const body = await response.json();

		expect(response.status).toBe(500);
		expect(body).toEqual({
			error: {
				code: 'parse-failed',
				message: 'Unable to parse git diff output.'
			}
		});
	});

	it('returns 500 command-failed payload for unknown errors', async () => {
		isStageDiffServiceErrorMock.mockReturnValue(false);
		getStageDiffMock.mockRejectedValue(new Error('unexpected failure'));

		const response = await GET({ params: { id: 'stack-1', stageId: 'stage-1' } } as never);
		const body = await response.json();

		expect(response.status).toBe(500);
		expect(body).toEqual({
			error: {
				code: 'command-failed',
				message: 'unexpected failure'
			}
		});
	});
});
