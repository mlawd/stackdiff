import { json, type RequestHandler } from '@sveltejs/kit';

import { getPlanningMessages, savePlanFromSession } from '$lib/server/planning-service';
import { getStackById } from '$lib/server/stack-store';

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'Unknown request failure';
}

export const POST: RequestHandler = async ({ params }) => {
	try {
		const stackId = params.id;
		if (!stackId) {
			return json({ error: 'Feature id is required.' }, { status: 400 });
		}

		const stack = await getStackById(stackId);
		if (!stack) {
			return json({ error: 'Feature not found.' }, { status: 404 });
		}

		const result = await savePlanFromSession(stackId);
		const messages = await getPlanningMessages(stackId);

		return json({
			session: result.session,
			messages,
			savedPlanPath: result.savedPlanPath,
			savedStageConfigPath: result.savedStageConfigPath,
			planMarkdown: result.planMarkdown
		});
	} catch (error) {
		return json({ error: toErrorMessage(error) }, { status: 400 });
	}
};
