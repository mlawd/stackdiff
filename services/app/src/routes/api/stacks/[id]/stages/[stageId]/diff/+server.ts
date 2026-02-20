import { json, type RequestHandler } from '@sveltejs/kit';

import { getStageDiff, isStageDiffServiceError } from '$lib/server/stage-diff-service';

function toStatusCode(errorCode: string): number {
	if (errorCode === 'not-found') {
		return 404;
	}

	if (errorCode === 'not-diffable') {
		return 409;
	}

	return 500;
}

export const GET: RequestHandler = async ({ params }) => {
	const stackId = params.id;
	const stageId = params.stageId;

	if (!stackId || !stageId) {
		return json({ error: { code: 'not-found', message: 'Feature id and stage id are required.' } }, { status: 404 });
	}

	try {
		const diff = await getStageDiff(stackId, stageId);
		return json({ diff });
	} catch (error) {
		if (isStageDiffServiceError(error)) {
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
