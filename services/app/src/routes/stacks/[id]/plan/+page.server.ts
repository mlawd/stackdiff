import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

import { ensurePlanningSession } from '$lib/server/planning-service';
import { getStackById } from '$lib/server/stack-store';

export const load: PageServerLoad = async ({ params }) => {
	const stack = await getStackById(params.id);

	if (!stack) {
		throw error(404, 'Feature not found');
	}

	const session = await ensurePlanningSession(params.id);

	return {
		stack,
		session,
		loadedAt: new Date().toISOString()
	};
};
