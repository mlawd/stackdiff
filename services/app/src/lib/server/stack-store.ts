import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import type { StackFile, StackMetadata, StackUpsertInput } from '$lib/types/stack';

const STACKS_FILE = new URL('../../../data/stacks.json', import.meta.url);
const APP_ROOT = new URL('../../../', import.meta.url);

function isStackMetadata(value: unknown): value is StackMetadata {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const stack = value as Partial<StackMetadata>;

	return (
		typeof stack.id === 'string' &&
		typeof stack.name === 'string' &&
		typeof stack.repositoryPath === 'string' &&
		Array.isArray(stack.branches) &&
		stack.branches.every((branch) => typeof branch === 'string' && branch.length > 0)
	);
}

function isStackFile(value: unknown): value is StackFile {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const file = value as Partial<StackFile>;

	return typeof file.version === 'number' && Array.isArray(file.stacks) && file.stacks.every(isStackMetadata);
}

export async function readStacksFromFile(): Promise<StackMetadata[]> {
	const file = await readStackFile();
	return file.stacks;
}

async function readStackFile(): Promise<StackFile> {
	const raw = await readFile(STACKS_FILE, 'utf-8');
	const parsed = JSON.parse(raw) as unknown;

	if (!isStackFile(parsed)) {
		throw new Error('Invalid stacks.json shape. Expected { version: number, stacks: StackMetadata[] }.');
	}

	return parsed;
}

async function writeStackFile(file: StackFile): Promise<void> {
	await writeFile(STACKS_FILE, `${JSON.stringify(file, null, '\t')}\n`, 'utf-8');
}

function createId(name: string): string {
	const base = name
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48);

	const seed = Math.random().toString(36).slice(2, 8);
	return `${base || 'stack'}-${seed}`;
}

function normalizeInput(input: StackUpsertInput): StackUpsertInput {
	return {
		name: input.name.trim(),
		repositoryPath: input.repositoryPath.trim(),
		branches: input.branches.map((branch) => branch.trim()).filter(Boolean),
		notes: input.notes?.trim() || undefined
	};
}

function validateUpsertInput(input: StackUpsertInput): void {
	if (!input.name) {
		throw new Error('Stack name is required.');
	}

	if (!input.repositoryPath) {
		throw new Error('Repository path is required.');
	}

	if (input.branches.length === 0) {
		throw new Error('At least one branch is required.');
	}
}

export async function getStackById(id: string): Promise<StackMetadata | undefined> {
	const file = await readStackFile();
	return file.stacks.find((stack) => stack.id === id);
}

export async function createStack(input: StackUpsertInput): Promise<StackMetadata> {
	const normalized = normalizeInput(input);
	validateUpsertInput(normalized);

	const file = await readStackFile();
	const created: StackMetadata = {
		id: createId(normalized.name),
		...normalized
	};

	file.stacks.push(created);
	await writeStackFile(file);

	return created;
}

export async function updateStack(id: string, input: StackUpsertInput): Promise<StackMetadata> {
	const normalized = normalizeInput(input);
	validateUpsertInput(normalized);

	const file = await readStackFile();
	const index = file.stacks.findIndex((stack) => stack.id === id);

	if (index === -1) {
		throw new Error('Stack not found.');
	}

	const updated: StackMetadata = {
		id,
		...normalized
	};

	file.stacks[index] = updated;
	await writeStackFile(file);

	return updated;
}

export async function deleteStack(id: string): Promise<void> {
	const file = await readStackFile();
	const nextStacks = file.stacks.filter((stack) => stack.id !== id);

	if (nextStacks.length === file.stacks.length) {
		throw new Error('Stack not found.');
	}

	await writeStackFile({
		...file,
		stacks: nextStacks
	});
}

export function resolveRepoPath(repositoryPath: string): string {
	return resolve(fileURLToPath(APP_ROOT), repositoryPath);
}
