import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DiffSelection, StageDiffChatResult } from '$lib/types/stack';

vi.mock('$lib/server/stage-diff-chat-service', () => ({
	startStageDiffChat: vi.fn(),
	isStageDiffChatError: vi.fn()
}));

import { isStageDiffChatError, startStageDiffChat } from '$lib/server/stage-diff-chat-service';
import { POST } from './+server';

const startStageDiffChatMock = vi.mocked(startStageDiffChat);
const isStageDiffChatErrorMock = vi.mocked(isStageDiffChatError);

const selection: DiffSelection = {
	refs: {
		baseRef: 'main',
		targetRef: 'feature/stage-7'
	},
	filePath: 'src/routes/stacks/[id]/+page.svelte',
	selectedLineIds: ['line-1', 'line-2'],
	snippet: '+new line'
};

const result: StageDiffChatResult = {
	stackId: 'stack-1',
	stageId: 'stage-7',
	selection,
	assistantReply: 'Focus on extracting the selection state into a store.'
};

describe('POST /api/stacks/[id]/stages/[stageId]/diff/chat', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		isStageDiffChatErrorMock.mockImplementation((error: unknown) => {
			if (typeof error !== 'object' || error === null) {
				return false;
			}

			const candidate = error as { code?: unknown; message?: unknown };
			return typeof candidate.code === 'string' && typeof candidate.message === 'string';
		});
	});

	it('returns 404 when stack or stage params are missing', async () => {
		const request = new Request('http://localhost/test', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ selection })
		});

		const response = await POST({ params: { id: '', stageId: '' }, request } as never);
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body).toEqual({
			error: {
				code: 'not-found',
				message: 'Feature id and stage id are required.'
			}
		});
	});

	it('returns 400 when selection payload is missing', async () => {
		const request = new Request('http://localhost/test', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ message: 'hello' })
		});

		const response = await POST({ params: { id: 'stack-1', stageId: 'stage-7' }, request } as never);
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body).toEqual({
			error: {
				code: 'invalid-selection',
				message: 'Selection payload is required.'
			}
		});
	});

	it('returns 200 with focused chat result when service succeeds', async () => {
		startStageDiffChatMock.mockResolvedValue(result);
		const request = new Request('http://localhost/test', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ selection, message: 'help me review this change' })
		});

		const response = await POST({ params: { id: 'stack-1', stageId: 'stage-7' }, request } as never);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({ result });
		expect(startStageDiffChatMock).toHaveBeenCalledWith({
			stackId: 'stack-1',
			stageId: 'stage-7',
			selection,
			message: 'help me review this change'
		});
	});

	it('returns 409 for not-diffable service errors', async () => {
		startStageDiffChatMock.mockRejectedValue({
			code: 'not-diffable',
			message: 'Stage implementation chat is unavailable.'
		});
		const request = new Request('http://localhost/test', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ selection })
		});

		const response = await POST({ params: { id: 'stack-1', stageId: 'stage-7' }, request } as never);
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body).toEqual({
			error: {
				code: 'not-diffable',
				message: 'Stage implementation chat is unavailable.'
			}
		});
	});

	it('returns 500 command-failed payload for unknown errors', async () => {
		isStageDiffChatErrorMock.mockReturnValue(false);
		startStageDiffChatMock.mockRejectedValue(new Error('unexpected failure'));
		const request = new Request('http://localhost/test', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ selection })
		});

		const response = await POST({ params: { id: 'stack-1', stageId: 'stage-7' }, request } as never);
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
