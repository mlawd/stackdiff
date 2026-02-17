import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

import { enrichStackStatus } from '$lib/server/stack-status';
import { getStackById } from '$lib/server/stack-store';

export const load: PageServerLoad = async ({ params }) => {
	const stack = await getStackById(params.id);

	if (!stack) {
		throw error(404, 'Stack not found');
	}

	const enriched = await enrichStackStatus(stack);

	return {
		stack: enriched,
		loadedAt: new Date().toISOString()
	};
};
