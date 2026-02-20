import { readFile, writeFile } from 'node:fs/promises';

import type {
	FeatureStage,
	FeatureStageStatus,
	FeatureType,
	StackImplementationSession,
	StackStatus,
	StackFile,
	StackMetadata,
	StackPlanningSession,
	StackUpsertInput
} from '$lib/types/stack';
import { runCommand } from '$lib/server/command';

const STACKS_FILE = new URL('../../../data/stacks.json', import.meta.url);
const STACK_FILE_VERSION = 2;

function isFeatureType(value: unknown): value is FeatureType {
	return value === 'feature' || value === 'bugfix' || value === 'chore';
}

function isStackStatus(value: unknown): value is StackStatus {
	return value === 'created' || value === 'planned' || value === 'started' || value === 'complete';
}

function isFeatureStageStatus(value: unknown): value is FeatureStageStatus {
	return value === 'not-started' || value === 'in-progress' || value === 'done';
}

function isFeatureStage(value: unknown): value is FeatureStage {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const stage = value as Partial<FeatureStage>;

	return (
		typeof stage.id === 'string' &&
		typeof stage.title === 'string' &&
		(stage.details === undefined || typeof stage.details === 'string') &&
		isFeatureStageStatus(stage.status)
	);
}

function isStackMetadata(value: unknown): value is StackMetadata {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const stack = value as Partial<StackMetadata>;

	return (
		typeof stack.id === 'string' &&
		typeof stack.name === 'string' &&
		isFeatureType(stack.type) &&
		(stack.status === undefined || isStackStatus(stack.status)) &&
		(stack.notes === undefined || typeof stack.notes === 'string') &&
		(stack.stages === undefined || (Array.isArray(stack.stages) && stack.stages.every(isFeatureStage)))
	);
}

function isStackFile(value: unknown): value is StackFile {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const file = value as Partial<StackFile>;

	return (
		file.version === STACK_FILE_VERSION &&
		Array.isArray(file.stacks) &&
		file.stacks.every(isStackMetadata) &&
		(file.planningSessions === undefined ||
			(Array.isArray(file.planningSessions) && file.planningSessions.every(isStackPlanningSession))) &&
		(file.implementationSessions === undefined ||
			(Array.isArray(file.implementationSessions) &&
				file.implementationSessions.every(isStackImplementationSession)))
	);
}

function isStackPlanningSession(value: unknown): value is StackPlanningSession {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const session = value as Partial<StackPlanningSession>;

	return (
		typeof session.id === 'string' &&
		typeof session.stackId === 'string' &&
		(session.opencodeSessionId === undefined || typeof session.opencodeSessionId === 'string') &&
		typeof session.createdAt === 'string' &&
		typeof session.updatedAt === 'string' &&
		(session.savedPlanPath === undefined || typeof session.savedPlanPath === 'string') &&
		(session.savedStageConfigPath === undefined || typeof session.savedStageConfigPath === 'string') &&
		(session.savedAt === undefined || typeof session.savedAt === 'string')
	);
}

function isStackImplementationSession(value: unknown): value is StackImplementationSession {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const session = value as Partial<StackImplementationSession>;

	return (
		typeof session.id === 'string' &&
		typeof session.stackId === 'string' &&
		typeof session.stageId === 'string' &&
		typeof session.branchName === 'string' &&
		typeof session.worktreePathKey === 'string' &&
		(session.opencodeSessionId === undefined || typeof session.opencodeSessionId === 'string') &&
		typeof session.createdAt === 'string' &&
		typeof session.updatedAt === 'string'
	);
}

function normalizeStackFile(file: StackFile): StackFile {
	return {
		...file,
		stacks: file.stacks.map((stack) => ({
			...stack,
			type: isFeatureType((stack as { type?: unknown }).type) ? stack.type : 'feature',
			status: isStackStatus((stack as { status?: unknown }).status) ? stack.status : 'created',
			stages: stack.stages ?? []
		})),
		planningSessions: file.planningSessions ?? [],
		implementationSessions: file.implementationSessions ?? []
	};
}

export async function readStacksFromFile(): Promise<StackMetadata[]> {
	const file = await readStackFile();
	return file.stacks;
}

async function readStackFile(): Promise<StackFile> {
	const raw = await readFile(STACKS_FILE, 'utf-8');
	const parsed = JSON.parse(raw) as unknown;

	if (!isStackFile(parsed)) {
		throw new Error(`Invalid stacks.json shape. Expected version ${STACK_FILE_VERSION} with valid stacks and planningSessions.`);
	}

	return normalizeStackFile(parsed);
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
	return `${base || 'feature'}-${seed}`;
}

function createSessionId(): string {
	return `session-${Math.random().toString(36).slice(2, 10)}`;
}

function createImplementationSessionId(): string {
	return `impl-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeInput(input: StackUpsertInput): StackUpsertInput {
	return {
		name: input.name.trim(),
		notes: input.notes?.trim() || undefined,
		type: input.type
	};
}

function validateUpsertInput(input: StackUpsertInput): void {
	if (!input.name) {
		throw new Error('Feature name is required.');
	}

	if (!isFeatureType(input.type)) {
		throw new Error('Feature type must be one of: feature, bugfix, chore.');
	}

}

export async function getStackById(id: string): Promise<StackMetadata | undefined> {
	const file = await readStackFile();
	return file.stacks.find((stack) => stack.id === id);
}

export async function getRuntimeRepositoryPath(): Promise<string> {
	const cwd = process.cwd();
	const repoRootResult = await runCommand('git', ['rev-parse', '--show-toplevel'], cwd);

	if (repoRootResult.ok && repoRootResult.stdout) {
		return repoRootResult.stdout;
	}

	return cwd;
}

export async function createStack(input: StackUpsertInput): Promise<StackMetadata> {
	const normalized = normalizeInput(input);
	validateUpsertInput(normalized);

	const file = await readStackFile();
	const created: StackMetadata = {
		id: createId(normalized.name),
		status: 'created',
		stages: [],
		...normalized
	};

	file.stacks.push(created);
	await writeStackFile(file);

	return created;
}

export async function getPlanningSessionByStackId(id: string): Promise<StackPlanningSession | undefined> {
	const file = await readStackFile();
	return file.planningSessions?.find((session) => session.stackId === id);
}

export async function getImplementationSessionByStackAndStage(
	stackId: string,
	stageId: string
): Promise<StackImplementationSession | undefined> {
	const file = await readStackFile();
	return file.implementationSessions?.find(
		(session) => session.stackId === stackId && session.stageId === stageId
	);
}

export async function getImplementationSessionsByStackId(stackId: string): Promise<StackImplementationSession[]> {
	const file = await readStackFile();
	return (file.implementationSessions ?? []).filter((session) => session.stackId === stackId);
}

export async function createOrGetImplementationSession(
	stackId: string,
	stageId: string,
	branchName: string,
	worktreePathKey: string
): Promise<{ session: StackImplementationSession; created: boolean }> {
	const file = await readStackFile();
	const existing = file.implementationSessions?.find(
		(session) => session.stackId === stackId && session.stageId === stageId
	);

	if (existing) {
		let changed = false;
		if (existing.branchName !== branchName) {
			existing.branchName = branchName;
			changed = true;
		}

		if (existing.worktreePathKey !== worktreePathKey) {
			existing.worktreePathKey = worktreePathKey;
			changed = true;
		}

		if (changed) {
			existing.updatedAt = new Date().toISOString();
			await writeStackFile(file);
		}

		return { session: existing, created: false };
	}

	const now = new Date().toISOString();
	const created: StackImplementationSession = {
		id: createImplementationSessionId(),
		stackId,
		stageId,
		branchName,
		worktreePathKey,
		opencodeSessionId: undefined,
		createdAt: now,
		updatedAt: now
	};

	file.implementationSessions = [...(file.implementationSessions ?? []), created];
	await writeStackFile(file);

	return { session: created, created: true };
}

export async function setImplementationSessionOpencodeId(
	stackId: string,
	stageId: string,
	opencodeSessionId: string
): Promise<StackImplementationSession> {
	const file = await readStackFile();
	const session = file.implementationSessions?.find(
		(candidate) => candidate.stackId === stackId && candidate.stageId === stageId
	);

	if (!session) {
		throw new Error('Implementation session not found.');
	}

	session.opencodeSessionId = opencodeSessionId;
	session.updatedAt = new Date().toISOString();
	await writeStackFile(file);

	return session;
}

export async function createOrGetPlanningSession(id: string): Promise<StackPlanningSession> {
	const file = await readStackFile();
	const existing = file.planningSessions?.find((session) => session.stackId === id);

	if (existing) {
		return existing;
	}

	const now = new Date().toISOString();
	const created: StackPlanningSession = {
		id: createSessionId(),
		stackId: id,
		opencodeSessionId: undefined,
		createdAt: now,
		updatedAt: now
	};

	file.planningSessions = [...(file.planningSessions ?? []), created];
	await writeStackFile(file);

	return created;
}
export async function setPlanningSessionOpencodeId(
	id: string,
	opencodeSessionId: string
): Promise<StackPlanningSession> {
	const file = await readStackFile();
	const session = file.planningSessions?.find((candidate) => candidate.stackId === id);

	if (!session) {
		throw new Error('Planning session not found.');
	}

	session.opencodeSessionId = opencodeSessionId;
	session.updatedAt = new Date().toISOString();

	await writeStackFile(file);

	return session;
}

export async function touchPlanningSessionUpdatedAt(id: string): Promise<StackPlanningSession> {
	const file = await readStackFile();
	const session = file.planningSessions?.find((candidate) => candidate.stackId === id);

	if (!session) {
		throw new Error('Planning session not found.');
	}

	session.updatedAt = new Date().toISOString();
	await writeStackFile(file);

	return session;
}

export async function markPlanningSessionSaved(
	id: string,
	savedPlanPath: string,
	savedStageConfigPath: string
): Promise<StackPlanningSession> {
	const file = await readStackFile();
	const session = file.planningSessions?.find((candidate) => candidate.stackId === id);

	if (!session) {
		throw new Error('Planning session not found.');
	}

	const now = new Date().toISOString();
	session.savedPlanPath = savedPlanPath;
	session.savedStageConfigPath = savedStageConfigPath;
	session.savedAt = now;
	session.updatedAt = now;

	await writeStackFile(file);

	return session;
}

export async function updateStack(id: string, input: StackUpsertInput): Promise<StackMetadata> {
	const normalized = normalizeInput(input);
	validateUpsertInput(normalized);

	const file = await readStackFile();
	const index = file.stacks.findIndex((stack) => stack.id === id);

	if (index === -1) {
		throw new Error('Feature not found.');
	}

	const existing = file.stacks[index];
	const updated: StackMetadata = {
		id,
		status: existing.status,
		stages: existing.stages ?? [],
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
		throw new Error('Feature not found.');
	}

	await writeStackFile({
		...file,
		stacks: nextStacks,
		planningSessions: (file.planningSessions ?? []).filter((session) => session.stackId !== id),
		implementationSessions: (file.implementationSessions ?? []).filter((session) => session.stackId !== id)
	});
}

export async function setStackStages(id: string, stages: FeatureStage[]): Promise<StackMetadata> {
	const file = await readStackFile();
	const index = file.stacks.findIndex((stack) => stack.id === id);

	if (index === -1) {
		throw new Error('Feature not found.');
	}

	const next: StackMetadata = {
		...file.stacks[index],
		stages
	};

	file.stacks[index] = next;
	await writeStackFile(file);

	return next;
}

export async function setStackStatus(id: string, status: StackStatus): Promise<StackMetadata> {
	const file = await readStackFile();
	const index = file.stacks.findIndex((stack) => stack.id === id);

	if (index === -1) {
		throw new Error('Feature not found.');
	}

	const next: StackMetadata = {
		...file.stacks[index],
		status
	};

	file.stacks[index] = next;
	await writeStackFile(file);

	return next;
}

export async function setStackStartedWithStageInProgress(
	id: string,
	stageId: string
): Promise<{ stack: StackMetadata; startedNow: boolean }> {
	const file = await readStackFile();
	const index = file.stacks.findIndex((stack) => stack.id === id);

	if (index === -1) {
		throw new Error('Feature not found.');
	}

	const stack = file.stacks[index];
	const stages = stack.stages ?? [];
	const stageIndex = stages.findIndex((stage) => stage.id === stageId);

	if (stageIndex === -1) {
		throw new Error('Stage not found.');
	}

	let startedNow = false;
	const nextStages = stages.map((stage, indexCandidate) => {
		if (indexCandidate !== stageIndex) {
			return stage;
		}

		if (stage.status === 'in-progress' || stage.status === 'done') {
			return stage;
		}

		startedNow = true;
		return {
			...stage,
			status: 'in-progress' as const
		};
	});

	let nextStatus = stack.status;
	if (stack.status === 'created' || stack.status === 'planned') {
		nextStatus = 'started';
		startedNow = true;
	}

	const next: StackMetadata = {
		...stack,
		status: nextStatus,
		stages: nextStages
	};

	file.stacks[index] = next;
	await writeStackFile(file);

	return {
		stack: next,
		startedNow
	};
}
