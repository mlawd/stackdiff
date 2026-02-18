import { json } from '@sveltejs/kit';

import { ensurePlanningSession } from '$lib/server/planning-service';
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

		const session = await ensurePlanningSession(params.id);
		return json({ session });
	} catch (error) {
		return json({ error: toErrorMessage(error) }, { status: 400 });
	}
}
