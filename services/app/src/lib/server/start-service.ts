import { ensureImplementationSessionBootstrap } from '$lib/server/implementation-service';
import {
	getRuntimeRepositoryPath,
	getStackById,
	setStackStartedWithStageInProgress
} from '$lib/server/stack-store';
import {
	createStageBranchIdentity,
	ensureStageBranchWorktree,
	resolveDefaultBaseBranch
} from '$lib/server/worktree-service';
import type { StackImplementationSession, StackMetadata } from '$lib/types/stack';

export interface StartFeatureResult {
	stack: StackMetadata;
	implementationSession: StackImplementationSession;
	branchName: string;
	worktreePathKey: string;
	worktreeAbsolutePath: string;
	reusedWorktree: boolean;
	reusedSession: boolean;
	startedNow: boolean;
}

function assertStartPreconditions(stack: StackMetadata): { stageId: string; stageTitle: string; stageIndex: number } {
	const stages = stack.stages ?? [];
	if (stages.length === 0) {
		throw new Error('Save a plan with at least one stage before starting implementation.');
	}

	const firstStage = stages[0];
	if (!firstStage) {
		throw new Error('Stage 1 is missing. Save the plan again to regenerate stages.');
	}

	if (firstStage.status === 'done') {
		throw new Error('Stage 1 is already done. Starting is only supported for unfinished stage 1.');
	}

	return {
		stageId: firstStage.id,
		stageTitle: firstStage.title,
		stageIndex: 0
	};
}

export async function startFeatureStageOne(stackId: string): Promise<StartFeatureResult> {
	const stack = await getStackById(stackId);
	if (!stack) {
		throw new Error('Feature not found.');
	}

	const stage = assertStartPreconditions(stack);
	const identity = createStageBranchIdentity({
		featureType: stack.type,
		featureName: stack.name,
		stageNumber: stage.stageIndex + 1,
		stageName: stage.stageTitle
	});

	const repositoryRoot = await getRuntimeRepositoryPath();
	const baseBranch = await resolveDefaultBaseBranch(repositoryRoot);
	const worktree = await ensureStageBranchWorktree({
		repositoryRoot,
		baseBranch,
		branchName: identity.branchName,
		worktreePathKey: identity.worktreePathKey
	});

	const stageEntry = (stack.stages ?? [])[stage.stageIndex];
	if (!stageEntry) {
		throw new Error('Stage 1 is missing. Save the plan again to regenerate stages.');
	}

	const implementation = await ensureImplementationSessionBootstrap({
		stack,
		stage: stageEntry,
		stageIndex: stage.stageIndex,
		branchName: worktree.branchName,
		worktreePathKey: worktree.worktreePathKey,
		worktreeAbsolutePath: worktree.worktreeAbsolutePath
	});

	const updated = await setStackStartedWithStageInProgress(stack.id, stage.stageId);

	return {
		stack: updated.stack,
		implementationSession: implementation.session,
		branchName: worktree.branchName,
		worktreePathKey: worktree.worktreePathKey,
		worktreeAbsolutePath: worktree.worktreeAbsolutePath,
		reusedWorktree: worktree.reusedWorktree,
		reusedSession: implementation.reusedSession,
		startedNow: updated.startedNow
	};
}
