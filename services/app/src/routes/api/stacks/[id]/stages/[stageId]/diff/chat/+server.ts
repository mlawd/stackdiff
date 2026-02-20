import { json, type RequestHandler } from '@sveltejs/kit';

import {
	isStageDiffChatError,
	startStageDiffChat
} from '$lib/server/stage-diff-chat-service';
import type { DiffSelection } from '$lib/types/stack';

interface StageDiffChatRequest {
	selection?: DiffSelection;
	message?: string;
}

function toStatusCode(errorCode: string): number {
	if (errorCode === 'not-found') {
		return 404;
	}

	if (errorCode === 'not-diffable') {
		return 409;
	}

	if (errorCode === 'invalid-selection') {
		return 400;
	}

	return 500;
}

export const POST: RequestHandler = async ({ params, request }) => {
	const stackId = params.id;
	const stageId = params.stageId;

	if (!stackId || !stageId) {
		return json({ error: { code: 'not-found', message: 'Feature id and stage id are required.' } }, { status: 404 });
	}

	let body: StageDiffChatRequest;
	try {
		body = (await request.json()) as StageDiffChatRequest;
	} catch {
		return json(
			{ error: { code: 'invalid-selection', message: 'Request body must be valid JSON.' } },
			{ status: 400 }
		);
	}

	if (!body.selection) {
		return json(
			{ error: { code: 'invalid-selection', message: 'Selection payload is required.' } },
			{ status: 400 }
		);
	}

	try {
		const result = await startStageDiffChat({
			stackId,
			stageId,
			selection: body.selection,
			message: body.message
		});

		return json({ result });
	} catch (error) {
		if (isStageDiffChatError(error)) {
			return json(
				{
					error: {
						code: error.code,
						message: error.message
					}
				},
				{ status: toStatusCode(error.code) }
			);
		}

		return json(
			{
				error: {
					code: 'command-failed',
					message: error instanceof Error ? error.message : 'Unknown request failure'
				}
			},
			{ status: 500 }
		);
	}
};
