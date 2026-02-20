import { runCommand } from '$lib/server/command';
import type { StackMergeCheckResult, StackMergeChecksSummary } from '$lib/types/stack';

interface PullRequestLookupPayload {
	number: number;
}

interface GhStatusCheckRun {
	__typename?: string;
	name?: string;
	status?: string;
	conclusion?: string | null;
	detailsUrl?: string | null;
	workflowName?: string | null;
}

interface GhStatusContext {
	__typename?: string;
	context?: string;
	state?: string;
	targetUrl?: string | null;
	description?: string | null;
}

interface PullRequestChecksPayload {
	statusCheckRollup?: unknown;
}

export interface ResolveStagePrChecksInput {
	repositoryPath: string;
	stageId: string;
	branchName: string;
}

export interface ResolveStagePrChecksResult {
	stageId: string;
	branchName: string;
	pullRequestNumber?: number;
	summary: StackMergeChecksSummary;
	isBlocking: boolean;
	lookupError?: string;
}

function createSummary(checks: StackMergeCheckResult[]): StackMergeChecksSummary {
	const counts = {
		passed: 0,
		failed: 0,
		pending: 0,
		skipped: 0,
		unknown: 0
	};

	for (const check of checks) {
		if (check.status === 'passed') {
			counts.passed += 1;
		} else if (check.status === 'failed') {
			counts.failed += 1;
		} else if (check.status === 'pending') {
			counts.pending += 1;
		} else if (check.status === 'skipped') {
			counts.skipped += 1;
		} else {
			counts.unknown += 1;
		}
	}

	return {
		total: checks.length,
		passed: counts.passed,
		failed: counts.failed,
		pending: counts.pending,
		skipped: counts.skipped,
		unknown: counts.unknown,
		checks,
		evaluatedAt: new Date().toISOString()
	};
}

function createLookupFailureResult(
	input: ResolveStagePrChecksInput,
	reason: string,
	pullRequestNumber?: number
): ResolveStagePrChecksResult {
	const checks: StackMergeCheckResult[] = [
		{
			id: `gh:lookup:${input.stageId}`,
			name: 'GitHub PR checks lookup',
			status: 'failed',
			source: 'gh',
			details: reason
		}
	];

	return {
		stageId: input.stageId,
		branchName: input.branchName,
		pullRequestNumber,
		summary: createSummary(checks),
		isBlocking: true,
		lookupError: reason
	};
}

function parsePullRequestNumber(raw: string): number | undefined {
	try {
		const parsed = JSON.parse(raw || '[]') as PullRequestLookupPayload[];
		const candidate = parsed[0]?.number;
		if (typeof candidate === 'number' && Number.isFinite(candidate)) {
			return candidate;
		}
	} catch {
		return undefined;
	}

	return undefined;
}

function toCheckRunStatus(run: GhStatusCheckRun): StackMergeCheckResult['status'] {
	const status = run.status?.toUpperCase();
	if (status && status !== 'COMPLETED') {
		return 'pending';
	}

	const conclusion = run.conclusion?.toUpperCase();
	if (conclusion === 'SUCCESS') {
		return 'passed';
	}

	if (conclusion === 'NEUTRAL' || conclusion === 'SKIPPED') {
		return 'skipped';
	}

	if (
		conclusion === 'FAILURE' ||
		conclusion === 'TIMED_OUT' ||
		conclusion === 'CANCELLED' ||
		conclusion === 'ACTION_REQUIRED' ||
		conclusion === 'STALE' ||
		conclusion === 'STARTUP_FAILURE'
	) {
		return 'failed';
	}

	return 'unknown';
}

function toStatusContextStatus(context: GhStatusContext): StackMergeCheckResult['status'] {
	const state = context.state?.toUpperCase();
	if (state === 'SUCCESS') {
		return 'passed';
	}

	if (state === 'PENDING' || state === 'EXPECTED') {
		return 'pending';
	}

	if (state === 'FAILURE' || state === 'ERROR') {
		return 'failed';
	}

	return 'unknown';
}

function toCheckResult(item: unknown, index: number): StackMergeCheckResult {
	if (typeof item !== 'object' || item === null) {
		return {
			id: `gh:unknown:${index}`,
			name: `Unknown check ${index + 1}`,
			status: 'unknown',
			source: 'gh',
			details: 'Unsupported GitHub check payload.'
		};
	}

	const typed = item as GhStatusCheckRun | GhStatusContext;

	if (typed.__typename === 'CheckRun') {
		const run = typed as GhStatusCheckRun;
		const workflowPrefix = run.workflowName ? `${run.workflowName} / ` : '';
		const name = `${workflowPrefix}${run.name ?? `Check run ${index + 1}`}`;
		return {
			id: `gh:check-run:${name}:${index}`,
			name,
			status: toCheckRunStatus(run),
			source: 'gh',
			url: run.detailsUrl ?? undefined
		};
	}

	if (typed.__typename === 'StatusContext') {
		const context = typed as GhStatusContext;
		const name = context.context ?? `Status context ${index + 1}`;
		return {
			id: `gh:status-context:${name}:${index}`,
			name,
			status: toStatusContextStatus(context),
			source: 'gh',
			details: context.description ?? undefined,
			url: context.targetUrl ?? undefined
		};
	}

	return {
		id: `gh:unknown:${index}`,
		name: `Unknown check ${index + 1}`,
		status: 'unknown',
		source: 'gh',
		details: `Unsupported check type: ${typed.__typename ?? 'unknown'}`
	};
}

function parseChecksRollup(raw: string): StackMergeCheckResult[] | undefined {
	try {
		const payload = JSON.parse(raw || '{}') as PullRequestChecksPayload;
		const rollup = payload.statusCheckRollup;
		if (!Array.isArray(rollup)) {
			return undefined;
		}

		return rollup.map((item, index) => toCheckResult(item, index));
	} catch {
		return undefined;
	}
}

export function hasBlockingStagePrChecks(summary: StackMergeChecksSummary): boolean {
	return summary.total !== summary.passed;
}

export async function resolveStagePrChecks(
	input: ResolveStagePrChecksInput
): Promise<ResolveStagePrChecksResult> {
	const prLookup = await runCommand(
		'gh',
		['pr', 'list', '--head', input.branchName, '--state', 'all', '--limit', '1', '--json', 'number'],
		input.repositoryPath
	);

	if (!prLookup.ok) {
		return createLookupFailureResult(input, prLookup.stderr || prLookup.error || 'Unable to lookup pull request');
	}

	const pullRequestNumber = parsePullRequestNumber(prLookup.stdout);
	if (!pullRequestNumber) {
		return createLookupFailureResult(input, 'No pull request found for branch.');
	}

	const checksLookup = await runCommand(
		'gh',
		['pr', 'view', String(pullRequestNumber), '--json', 'statusCheckRollup'],
		input.repositoryPath
	);

	if (!checksLookup.ok) {
		return createLookupFailureResult(
			input,
			checksLookup.stderr || checksLookup.error || 'Unable to lookup pull request checks',
			pullRequestNumber
		);
	}

	const checks = parseChecksRollup(checksLookup.stdout);
	if (!checks) {
		return createLookupFailureResult(input, 'Unable to parse pull request checks response.', pullRequestNumber);
	}

	const summary = createSummary(checks);

	return {
		stageId: input.stageId,
		branchName: input.branchName,
		pullRequestNumber,
		summary,
		isBlocking: hasBlockingStagePrChecks(summary)
	};
}
