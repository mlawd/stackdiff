import { runCommand } from '$lib/server/command';
import {
	getImplementationSessionByStackAndStage,
	setStackStagePullRequest
} from '$lib/server/stack-store';
import { resolveDefaultBaseBranch } from '$lib/server/worktree-service';
import type { FeatureStage, StackMetadata, StackPullRequest } from '$lib/types/stack';

interface GitHubPullRequestPayload {
	number: number;
	title: string;
	state: 'OPEN' | 'CLOSED' | 'MERGED';
	isDraft: boolean;
	url: string;
	updatedAt: string;
	comments?: unknown[];
}

function toStackPullRequest(payload: GitHubPullRequestPayload | undefined): StackPullRequest | undefined {
	if (!payload) {
		return undefined;
	}

	return {
		number: payload.number,
		title: payload.title,
		state: payload.state,
		isDraft: payload.isDraft,
		url: payload.url,
		updatedAt: payload.updatedAt,
		commentCount: Array.isArray(payload.comments) ? payload.comments.length : 0
	};
}

function buildStagePullRequestTitle(stack: StackMetadata, stageNumber: number, stage: FeatureStage): string {
	return `${stack.type}: ${stack.name} - ${stageNumber}: ${stage.title}`;
}

function buildStagePullRequestBody(stack: StackMetadata, stage: FeatureStage): string {
	const featureGoal = stack.notes?.trim() || 'No description provided.';
	const stageGoal = stage.details?.trim() || 'No details provided.';

	return [`Feature goal: ${featureGoal}`, `Stage goal: ${stageGoal}`].join('\n');
}

async function lookupPullRequestByHeadBranch(
	repositoryRoot: string,
	headBranch: string
): Promise<StackPullRequest | undefined> {
	const lookup = await runCommand(
		'gh',
		[
			'pr',
			'list',
			'--head',
			headBranch,
			'--state',
			'all',
			'--limit',
			'1',
			'--json',
			'number,title,state,isDraft,url,updatedAt,comments'
		],
		repositoryRoot
	);

	if (!lookup.ok) {
		throw new Error(`Unable to lookup pull request: ${lookup.stderr || lookup.error || 'unknown gh error'}`);
	}

	let parsed: GitHubPullRequestPayload[];
	try {
		parsed = JSON.parse(lookup.stdout || '[]') as GitHubPullRequestPayload[];
	} catch {
		throw new Error('Unable to parse pull request lookup response.');
	}

	return toStackPullRequest(parsed[0]);
}

async function ensureRemoteBranch(repositoryRoot: string, branchName: string): Promise<void> {
	const remoteBranch = await runCommand('git', ['ls-remote', '--heads', 'origin', branchName], repositoryRoot);
	if (!remoteBranch.ok) {
		throw new Error(`Unable to inspect remote branch: ${remoteBranch.stderr || remoteBranch.error || 'unknown git error'}`);
	}

	if (remoteBranch.stdout.trim().length > 0) {
		return;
	}

	const pushed = await runCommand('git', ['push', '-u', 'origin', branchName], repositoryRoot);
	if (!pushed.ok) {
		throw new Error(`Unable to push branch before pull request creation: ${pushed.stderr || pushed.error || 'unknown git error'}`);
	}
}

async function resolvePullRequestBaseBranch(
	stack: StackMetadata,
	stageIndex: number,
	repositoryRoot: string
): Promise<string> {
	if (stageIndex === 0) {
		return resolveDefaultBaseBranch(repositoryRoot);
	}

	const previousStage = (stack.stages ?? [])[stageIndex - 1];
	if (!previousStage) {
		throw new Error('Unable to resolve previous stage for pull request base branch.');
	}

	const previousSession = await getImplementationSessionByStackAndStage(stack.id, previousStage.id);
	if (!previousSession?.branchName) {
		throw new Error('Previous stage branch is missing. Start stages in order from the first stage.');
	}

	return previousSession.branchName;
}

export async function ensureStagePullRequest(input: {
	repositoryRoot: string;
	stack: StackMetadata;
	stage: FeatureStage;
	stageIndex: number;
	branchName: string;
}): Promise<StackPullRequest | undefined> {
	if (input.stage.pullRequest?.number) {
		return input.stage.pullRequest;
	}

	const existing = await lookupPullRequestByHeadBranch(input.repositoryRoot, input.branchName);
	if (existing) {
		await setStackStagePullRequest(input.stack.id, input.stage.id, existing);
		return existing;
	}

	const stageNumber = input.stageIndex + 1;
	const title = buildStagePullRequestTitle(input.stack, stageNumber, input.stage);
	const body = buildStagePullRequestBody(input.stack, input.stage);
	const baseBranch = await resolvePullRequestBaseBranch(input.stack, input.stageIndex, input.repositoryRoot);
	await ensureRemoteBranch(input.repositoryRoot, input.branchName);

	const created = await runCommand(
		'gh',
		[
			'pr',
			'create',
			'--head',
			input.branchName,
			'--base',
			baseBranch,
			'--title',
			title,
			'--body',
			body
		],
		input.repositoryRoot
	);

	if (!created.ok) {
		throw new Error(`Unable to create pull request: ${created.stderr || created.error || 'unknown gh error'}`);
	}

	const resolved = await lookupPullRequestByHeadBranch(input.repositoryRoot, input.branchName);
	if (!resolved) {
		throw new Error('Pull request was created but could not be resolved afterwards.');
	}

	await setStackStagePullRequest(input.stack.id, input.stage.id, resolved);
	return resolved;
}
