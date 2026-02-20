import path from 'node:path';

import {
	getImplementationSessionsByStackId,
	getRuntimeRepositoryPath
} from '$lib/server/stack-store';
import { runCommand } from '$lib/server/command';
import { resolveDefaultBaseBranch, resolveWorktreeAbsolutePath } from '$lib/server/worktree-service';
import type { StageDiffabilityMetadata, StackImplementationSession, StackMetadata } from '$lib/types/stack';

interface ParsedWorktree {
	path: string;
	branchRef?: string;
}

function parseWorktreeList(raw: string): ParsedWorktree[] {
	const lines = raw.split('\n');
	const parsed: ParsedWorktree[] = [];
	let current: ParsedWorktree | null = null;

	for (const line of lines) {
		if (!line.trim()) {
			if (current) {
				parsed.push(current);
				current = null;
			}
			continue;
		}

		if (line.startsWith('worktree ')) {
			if (current) {
				parsed.push(current);
			}

			current = { path: line.slice('worktree '.length).trim() };
			continue;
		}

		if (!current) {
			continue;
		}

		if (line.startsWith('branch ')) {
			current.branchRef = line.slice('branch '.length).trim();
		}
	}

	if (current) {
		parsed.push(current);
	}

	return parsed;
}

async function branchRefExists(repositoryRoot: string, branchName: string): Promise<boolean> {
	const local = await runCommand('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`], repositoryRoot);
	if (local.ok) {
		return true;
	}

	const remote = await runCommand(
		'git',
		['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branchName}`],
		repositoryRoot
	);

	return remote.ok;
}

async function listWorktrees(repositoryRoot: string): Promise<ParsedWorktree[]> {
	const listed = await runCommand('git', ['worktree', 'list', '--porcelain'], repositoryRoot);
	if (!listed.ok) {
		return [];
	}

	return parseWorktreeList(listed.stdout);
}

async function getStageDiffabilityReason(input: {
	stack: StackMetadata;
	stageIndex: number;
	repositoryRoot: string;
	sessionsByStageId: Map<string, StackImplementationSession>;
	worktrees: ParsedWorktree[];
}): Promise<StageDiffabilityMetadata> {
	const stage = (input.stack.stages ?? [])[input.stageIndex];
	if (!stage) {
		return {
			isDiffable: false,
			reasonIfNotDiffable: 'Stage not found.'
		};
	}

	const session = input.sessionsByStageId.get(stage.id);
	if (!session) {
		return {
			isDiffable: false,
			reasonIfNotDiffable: 'Stage branch is unavailable. Start implementation for this stage first.'
		};
	}

	if (!session.branchName) {
		return {
			isDiffable: false,
			reasonIfNotDiffable: 'Stage branch is unavailable. Start implementation for this stage first.'
		};
	}

	if (!session.worktreePathKey) {
		return {
			isDiffable: false,
			branchName: session.branchName,
			reasonIfNotDiffable: 'Stage worktree is unavailable. Restart this stage to recreate it.'
		};
	}

	const branchExists = await branchRefExists(input.repositoryRoot, session.branchName);
	if (!branchExists) {
		return {
			isDiffable: false,
			branchName: session.branchName,
			reasonIfNotDiffable: `Stage branch ${session.branchName} no longer exists in this repository.`
		};
	}

	const expectedWorktreePath = resolveWorktreeAbsolutePath(input.repositoryRoot, session.worktreePathKey);
	const expectedResolvedPath = path.resolve(expectedWorktreePath);
	const expectedBranchRef = `refs/heads/${session.branchName}`;
	const hasWorktree = input.worktrees.some((worktree) => {
		if (!worktree.branchRef || worktree.branchRef !== expectedBranchRef) {
			return false;
		}

		return path.resolve(worktree.path) === expectedResolvedPath;
	});

	if (!hasWorktree) {
		return {
			isDiffable: false,
			branchName: session.branchName,
			reasonIfNotDiffable: 'Stage worktree is unavailable. Restart this stage to recreate it.'
		};
	}

	if (input.stageIndex === 0) {
		try {
			const baseBranch = await resolveDefaultBaseBranch(input.repositoryRoot);
			const baseExists = await branchRefExists(input.repositoryRoot, baseBranch);
			if (!baseExists) {
				return {
					isDiffable: false,
					branchName: session.branchName,
					reasonIfNotDiffable: 'Default base branch is unavailable for stage diff baseline.'
				};
			}
		} catch {
			return {
				isDiffable: false,
				branchName: session.branchName,
				reasonIfNotDiffable: 'Default base branch is unavailable for stage diff baseline.'
			};
		}
	} else {
		const previousStage = (input.stack.stages ?? [])[input.stageIndex - 1];
		if (!previousStage) {
			return {
				isDiffable: false,
				branchName: session.branchName,
				reasonIfNotDiffable: 'Previous stage branch is unavailable for diff baseline.'
			};
		}

		const previousSession = input.sessionsByStageId.get(previousStage.id);
		if (!previousSession?.branchName) {
			return {
				isDiffable: false,
				branchName: session.branchName,
				reasonIfNotDiffable: 'Previous stage branch is unavailable for diff baseline.'
			};
		}

		const previousBranchExists = await branchRefExists(input.repositoryRoot, previousSession.branchName);
		if (!previousBranchExists) {
			return {
				isDiffable: false,
				branchName: session.branchName,
				reasonIfNotDiffable: 'Previous stage branch is unavailable for diff baseline.'
			};
		}
	}

	return {
		isDiffable: true,
		branchName: session.branchName
	};
}

export async function getStageDiffabilityById(stack: StackMetadata): Promise<Record<string, StageDiffabilityMetadata>> {
	const stages = stack.stages ?? [];
	if (stages.length === 0) {
		return {};
	}

	const repositoryRoot = await getRuntimeRepositoryPath();
	const sessions = await getImplementationSessionsByStackId(stack.id);
	const sessionsByStageId = new Map<string, StackImplementationSession>();
	for (const session of sessions) {
		sessionsByStageId.set(session.stageId, session);
	}
	const worktrees = await listWorktrees(repositoryRoot);

	const entries = await Promise.all(
		stages.map(async (stage, stageIndex) => {
			const metadata = await getStageDiffabilityReason({
				stack,
				stageIndex,
				repositoryRoot,
				sessionsByStageId,
				worktrees
			});

			return [stage.id, metadata] as const;
		})
	);

	return Object.fromEntries(entries);
}
