import { getOpencodeSessionRuntimeState, getOpencodeSessionTodos } from '$lib/server/opencode';
import { runCommand } from '$lib/server/command';
import {
	getImplementationSessionByStackAndStage,
	getRuntimeRepositoryPath,
	getStackById,
	setStackStageStatus
} from '$lib/server/stack-store';
import { resolveDefaultBaseBranch, resolveWorktreeAbsolutePath } from '$lib/server/worktree-service';
import type { FeatureStageStatus } from '$lib/types/stack';

export interface ImplementationStageStatusSummary {
	stageStatus: FeatureStageStatus;
	runtimeState: 'idle' | 'busy' | 'retry' | 'missing';
	todoCompleted: number;
	todoTotal: number;
}

function summarizeTodos(todos: Array<{ status: string }>): { completed: number; total: number } {
	const activeTodos = todos.filter((todo) => todo.status !== 'cancelled');
	const completed = activeTodos.filter((todo) => todo.status === 'completed').length;

	return {
		completed,
		total: activeTodos.length
	};
}

async function isWorktreeClean(worktreeAbsolutePath: string): Promise<boolean> {
	const status = await runCommand('git', ['status', '--porcelain'], worktreeAbsolutePath);
	return status.ok && status.stdout.length === 0;
}

async function branchHasCommitsAheadOfBase(
	repositoryRoot: string,
	worktreeAbsolutePath: string
): Promise<boolean> {
	try {
		const baseBranch = await resolveDefaultBaseBranch(repositoryRoot);
		const ahead = await runCommand('git', ['rev-list', '--count', `${baseBranch}..HEAD`], worktreeAbsolutePath);
		if (!ahead.ok || !ahead.stdout) {
			return false;
		}

		const parsed = Number.parseInt(ahead.stdout.trim(), 10);
		return Number.isFinite(parsed) && parsed > 0;
	} catch {
		return false;
	}
}

export async function getImplementationStageStatusSummary(
	stackId: string,
	stageId: string
): Promise<ImplementationStageStatusSummary> {
	const stack = await getStackById(stackId);
	if (!stack) {
		throw new Error('Feature not found.');
	}

	const stage = (stack.stages ?? []).find((item) => item.id === stageId);
	if (!stage) {
		throw new Error('Stage not found.');
	}

	const implementationSession = await getImplementationSessionByStackAndStage(stackId, stageId);
	if (!implementationSession?.opencodeSessionId) {
		return {
			stageStatus: stage.status,
			runtimeState: 'missing',
			todoCompleted: 0,
			todoTotal: 0
		};
	}

	const repositoryRoot = await getRuntimeRepositoryPath();
	const worktreeAbsolutePath = resolveWorktreeAbsolutePath(
		repositoryRoot,
		implementationSession.worktreePathKey
	);

	const runtimeState = await getOpencodeSessionRuntimeState(implementationSession.opencodeSessionId, {
		directory: worktreeAbsolutePath
	});
	const todos = await getOpencodeSessionTodos(implementationSession.opencodeSessionId, {
		directory: worktreeAbsolutePath
	});
	const todoSummary = summarizeTodos(todos);

	let stageStatus = stage.status;
	if (stageStatus === 'in-progress' && runtimeState === 'idle') {
		const [clean, ahead] = await Promise.all([
			isWorktreeClean(worktreeAbsolutePath),
			branchHasCommitsAheadOfBase(repositoryRoot, worktreeAbsolutePath)
		]);

		if (clean && ahead) {
			const updatedStack = await setStackStageStatus(stackId, stageId, 'review-ready');
			const updatedStage = (updatedStack.stages ?? []).find((item) => item.id === stageId);
			if (updatedStage) {
				stageStatus = updatedStage.status;
			}
		}
	}

	return {
		stageStatus,
		runtimeState,
		todoCompleted: todoSummary.completed,
		todoTotal: todoSummary.total
	};
}
