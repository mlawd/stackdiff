import { json } from '@sveltejs/kit';

import { enrichStackStatus } from '$lib/server/stack-status';
import { deleteStack, getStackById, updateStack } from '$lib/server/stack-store';
import type { StackUpsertInput } from '$lib/types/stack';

function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'Unknown request failure';
}

function parseUpsertInput(body: unknown): StackUpsertInput {
	if (typeof body !== 'object' || body === null) {
		throw new Error('Invalid request body.');
	}

	const candidate = body as Partial<StackUpsertInput>;

	return {
		name: String(candidate.name ?? ''),
		notes: candidate.notes ? String(candidate.notes) : undefined,
		type: String(candidate.type ?? 'feature') as StackUpsertInput['type']
	};
}

export async function PATCH({ params, request }) {
	try {
		const body = (await request.json()) as unknown;
		const input = parseUpsertInput(body);
		const updated = await updateStack(params.id, input);
		const enriched = await enrichStackStatus(updated);

		return json({ stack: enriched });
	} catch (error) {
		const message = toErrorMessage(error);
		const status = message === 'Feature not found.' ? 404 : 400;
		return json({ error: message }, { status });
	}
}

export async function DELETE({ params }) {
	try {
		await deleteStack(params.id);
		return json({ ok: true });
	} catch (error) {
		const message = toErrorMessage(error);
		const status = message === 'Feature not found.' ? 404 : 400;
		return json({ error: message }, { status });
	}
}

export async function GET({ params }) {
	try {
		const stack = await getStackById(params.id);
		if (!stack) {
			return json({ error: 'Feature not found.' }, { status: 404 });
		}

		const enriched = await enrichStackStatus(stack);
		return json({ stack: enriched });
	} catch (error) {
		return json({ error: toErrorMessage(error) }, { status: 500 });
	}
}
