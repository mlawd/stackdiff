import { json } from '@sveltejs/kit';

import { sendPlanningMessage } from '$lib/server/planning-service';
import { getStackById } from '$lib/server/stack-store';

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'Unknown request failure';
}

function parseContent(body: unknown): string {
	if (typeof body !== 'object' || body === null) {
		throw new Error('Invalid request body.');
	}

	const candidate = body as { content?: unknown };
	const content = String(candidate.content ?? '').trim();

	if (!content) {
		throw new Error('Message content is required.');
	}

	return content;
}

export async function POST({ params, request }) {
	try {
		const stack = await getStackById(params.id);
		if (!stack) {
			return json({ error: 'Feature not found.' }, { status: 404 });
		}

		const body = (await request.json()) as unknown;
		const content = parseContent(body);
		const result = await sendPlanningMessage(params.id, content);

		return json({
			session: result.session,
			assistantReply: result.assistantReply,
			autoSavedPlanPath: result.autoSavedPlanPath
		});
	} catch (error) {
		return json({ error: toErrorMessage(error) }, { status: 400 });
	}
}
