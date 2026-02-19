import { json, type RequestHandler } from '@sveltejs/kit';

import { startFeatureStageOne } from '$lib/server/start-service';

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'Unknown request failure';
}

export const POST: RequestHandler = async ({ params }) => {
	try {
		const stackId = params.id;
		if (!stackId) {
			return json({ error: 'Feature id is required.' }, { status: 400 });
		}

		const result = await startFeatureStageOne(stackId);
		return json(result);
	} catch (error) {
		const message = toErrorMessage(error);
		const status = message === 'Feature not found.' ? 404 : 400;
		return json({ error: message }, { status });
	}
};
