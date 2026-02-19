import { json } from '@sveltejs/kit';

import { getPlanningMessages, savePlanFromSession } from '$lib/server/planning-service';
import { getStackById } from '$lib/server/stack-store';

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'Unknown request failure';
}

export async function POST({ params }) {
	try {
		const stack = await getStackById(params.id);
		if (!stack) {
			return json({ error: 'Feature not found.' }, { status: 404 });
		}

		const result = await savePlanFromSession(params.id);
		const messages = await getPlanningMessages(params.id);

		return json({
			session: result.session,
			messages,
			savedPlanPath: result.savedPlanPath,
			planMarkdown: result.planMarkdown
		});
	} catch (error) {
		return json({ error: toErrorMessage(error) }, { status: 400 });
	}
}
