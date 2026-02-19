import { json } from '@sveltejs/kit';

import { createAndSeedPlanningSessionForStack } from '$lib/server/planning-service';
import { createStack, deleteStack, readStacksFromFile } from '$lib/server/stack-store';
import { enrichStackStatus } from '$lib/server/stack-status';
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

export async function GET() {
	try {
		const stacks = await readStacksFromFile();
		return json({ stacks });
	} catch (error) {
		return json({ error: toErrorMessage(error) }, { status: 500 });
	}
}

export async function POST({ request }) {
	try {
		const body = (await request.json()) as unknown;
		const input = parseUpsertInput(body);
		const created = await createStack(input);

		try {
			await createAndSeedPlanningSessionForStack(created);
		} catch (error) {
			try {
				await deleteStack(created.id);
			} catch {
				// Keep original bootstrap error.
			}

			throw error;
		}

		const enriched = await enrichStackStatus(created);

		return json({ stack: enriched }, { status: 201 });
	} catch (error) {
		return json({ error: toErrorMessage(error) }, { status: 400 });
	}
}
