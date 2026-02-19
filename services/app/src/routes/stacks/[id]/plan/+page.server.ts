import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

import { loadExistingPlanningSession } from '$lib/server/planning-service';
import { getStackById } from '$lib/server/stack-store';

export const load: PageServerLoad = async ({ params }) => {
	const stack = await getStackById(params.id);

	if (!stack) {
		throw error(404, 'Feature not found');
	}

	const { session, messages, awaitingResponse } = await loadExistingPlanningSession(params.id);

	return {
		stack,
		session,
		messages,
		awaitingResponse,
		loadedAt: new Date().toISOString()
	};
};
