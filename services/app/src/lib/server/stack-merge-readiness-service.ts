import { resolveStagePrChecks, type ResolveStagePrChecksResult } from '$lib/server/pr-checks-resolver';
import {
	getImplementationSessionsByStackId,
	getRuntimeRepositoryPath,
	getStackById
} from '$lib/server/stack-store';
import type {
	StackMergeCheckResult,
	StackMergeChecksSummary,
	StackMergeReadiness,
	StackMergeReadinessBlocker
} from '$lib/types/stack';

function createChecksSummary(checks: StackMergeCheckResult[], evaluatedAt: string): StackMergeChecksSummary {
	const summary: StackMergeChecksSummary = {
		total: checks.length,
		passed: 0,
		failed: 0,
		pending: 0,
		skipped: 0,
		unknown: 0,
		checks,
		evaluatedAt
	};

	for (const check of checks) {
		if (check.status === 'passed') {
			summary.passed += 1;
		} else if (check.status === 'failed') {
			summary.failed += 1;
		} else if (check.status === 'pending') {
			summary.pending += 1;
		} else if (check.status === 'skipped') {
			summary.skipped += 1;
		} else {
			summary.unknown += 1;
		}
	}

	return summary;
}

function isBlockingChecksSummary(summary: StackMergeChecksSummary): boolean {
	return summary.total !== summary.passed;
}

function createPrMissingBlocker(input: {
	stageId: string;
	stageTitle: string;
	branchName?: string;
	reason?: string;
}): StackMergeReadinessBlocker {
	const reasonSuffix = input.reason ? ` ${input.reason}` : '';

	return {
		code: 'PULL_REQUEST_NOT_READY',
		message: `Stage \"${input.stageTitle}\" is missing an open or closed pull request for merge validation.${reasonSuffix}`,
		stageId: input.stageId,
		branchName: input.branchName
	};
}

function createRepositoryErrorBlocker(input: {
	stageId: string;
	stageTitle: string;
	branchName: string;
	reason: string;
}): StackMergeReadinessBlocker {
	return {
		code: 'REPOSITORY_ERROR',
		message: `Stage \"${input.stageTitle}\" checks could not be resolved from GitHub. ${input.reason}`,
		stageId: input.stageId,
		branchName: input.branchName
	};
}

function createReadiness(blockers: StackMergeReadinessBlocker[], checks: StackMergeCheckResult[]): StackMergeReadiness {
	const evaluatedAt = new Date().toISOString();
	const checksSummary = createChecksSummary(checks, evaluatedAt);

	if (checksSummary.failed > 0) {
		blockers.push({
			code: 'CHECKS_FAILED',
			message: `${checksSummary.failed} merge check${checksSummary.failed === 1 ? '' : 's'} failed across stage pull requests.`
		});
	}

	if (isBlockingChecksSummary(checksSummary) && checksSummary.failed === 0) {
		blockers.push({
			code: 'CHECKS_PENDING',
			message: 'Stage pull request checks must all pass before merging the full stack.'
		});
	}

	return {
		isReady: blockers.length === 0,
		blockers,
		checksSummary,
		evaluatedAt
	};
}

function stageChecksToAggregate(result: ResolveStagePrChecksResult): StackMergeCheckResult[] {
	return result.summary.checks.map((check, index) => ({
		...check,
		id: `${result.stageId}:${index}:${check.id}`,
		name: `[${result.stageId}] ${check.name}`
	}));
}

export interface EvaluateStackMergeReadinessResult {
	stackId: string;
	readiness: StackMergeReadiness;
	stageChecks: ResolveStagePrChecksResult[];
}

interface StageChecksInput {
	stageId: string;
	stageTitle: string;
	branchName: string;
}

export async function evaluateStackMergeReadiness(stackId: string): Promise<EvaluateStackMergeReadinessResult> {
	const stack = await getStackById(stackId);
	if (!stack) {
		throw new Error('Feature not found.');
	}

	const blockers: StackMergeReadinessBlocker[] = [];
	const stages = stack.stages ?? [];

	if (stages.length === 0) {
		blockers.push({
			code: 'NO_STAGES',
			message: 'Feature does not have any stages to merge.'
		});

		return {
			stackId,
			readiness: createReadiness(blockers, []),
			stageChecks: []
		};
	}

	const implementationSessions = await getImplementationSessionsByStackId(stackId);
	const sessionByStageId = new Map(implementationSessions.map((session) => [session.stageId, session]));

	for (const stage of stages) {
		if (stage.status !== 'done') {
			blockers.push({
				code: 'STAGE_NOT_DONE',
				message: `Stage \"${stage.title}\" is ${stage.status} and must be done before stack merge.`,
				stageId: stage.id
			});
		}

		const session = sessionByStageId.get(stage.id);
		if (!session) {
			blockers.push(createPrMissingBlocker({ stageId: stage.id, stageTitle: stage.title }));
		}
	}

	const checksInputs: StageChecksInput[] = [];
	for (const stage of stages) {
		const session = sessionByStageId.get(stage.id);
		if (!session) {
			continue;
		}

		checksInputs.push({
			stageId: stage.id,
			stageTitle: stage.title,
			branchName: session.branchName
		});
	}

	if (checksInputs.length === 0) {
		return {
			stackId,
			readiness: createReadiness(blockers, []),
			stageChecks: []
		};
	}

	const repositoryPath = await getRuntimeRepositoryPath();
	const stageChecks = await Promise.all(
		checksInputs.map((input) =>
			resolveStagePrChecks({
				repositoryPath,
				stageId: input.stageId,
				branchName: input.branchName
			})
		)
	);

	for (const stageCheck of stageChecks) {
		const input = checksInputs.find((candidate) => candidate.stageId === stageCheck.stageId);
		const stageTitle = input?.stageTitle ?? stageCheck.stageId;

		if (stageCheck.lookupError) {
			if (stageCheck.lookupError === 'No pull request found for branch.') {
				blockers.push(
					createPrMissingBlocker({
						stageId: stageCheck.stageId,
						stageTitle,
						branchName: stageCheck.branchName
					})
				);
			} else {
				blockers.push(
					createRepositoryErrorBlocker({
						stageId: stageCheck.stageId,
						stageTitle,
						branchName: stageCheck.branchName,
						reason: stageCheck.lookupError
					})
				);
			}
		}
	}

	const aggregatedChecks = stageChecks.flatMap(stageChecksToAggregate);

	return {
		stackId,
		readiness: createReadiness(blockers, aggregatedChecks),
		stageChecks
	};
}
