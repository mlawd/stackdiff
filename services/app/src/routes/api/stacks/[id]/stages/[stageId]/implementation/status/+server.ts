import { json, type RequestHandler } from '@sveltejs/kit';

import { getImplementationStageStatusSummary } from '$lib/server/implementation-status-service';

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'Unknown request failure';
}

export const GET: RequestHandler = async ({ params }) => {
	try {
		const stackId = params.id;
		const stageId = params.stageId;

		if (!stackId) {
			return json({ error: 'Feature id is required.' }, { status: 400 });
		}

		if (!stageId) {
			return json({ error: 'Stage id is required.' }, { status: 400 });
		}

		const statusSummary = await getImplementationStageStatusSummary(stackId, stageId);
		return json(statusSummary);
	} catch (error) {
		const message = toErrorMessage(error);
		const status = message === 'Feature not found.' || message === 'Stage not found.' ? 404 : 400;
		return json({ error: message }, { status });
	}
};
