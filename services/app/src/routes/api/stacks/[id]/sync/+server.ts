import { json, type RequestHandler } from '@sveltejs/kit';

import { isStackSyncServiceError, syncStack } from '$lib/server/stack-sync-service';

function toStatusCode(errorCode: string): number {
	if (errorCode === 'not-found') {
		return 404;
	}

	if (errorCode === 'invalid-state') {
		return 409;
	}

	if (errorCode === 'command-failed') {
		return 409;
	}

	return 500;
}

export const POST: RequestHandler = async ({ params }) => {
	const stackId = params.id;
	if (!stackId) {
		return json({ error: { code: 'not-found', message: 'Feature id is required.' } }, { status: 404 });
	}

	try {
		const result = await syncStack(stackId);
		return json({ result });
	} catch (error) {
		if (isStackSyncServiceError(error)) {
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
