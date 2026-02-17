import type { StackMetadata, StackPullRequest, StackSyncState, StackViewModel } from '$lib/types/stack';

import { runCommand } from '$lib/server/command';
import { getRuntimeRepositoryPath } from '$lib/server/stack-store';

interface GitHubPullRequestPayload {
	number: number;
	title: string;
	state: 'OPEN' | 'CLOSED' | 'MERGED';
	isDraft: boolean;
	url: string;
	updatedAt: string;
}

function toPullRequest(payload: GitHubPullRequestPayload | undefined): StackPullRequest | undefined {
	if (!payload) {
		return undefined;
	}

	return {
		number: payload.number,
		title: payload.title,
		state: payload.state,
		isDraft: payload.isDraft,
		url: payload.url,
		updatedAt: payload.updatedAt
	};
}

export async function enrichStackStatus(stack: StackMetadata): Promise<StackViewModel> {
	const repositoryAbsolutePath = await getRuntimeRepositoryPath();

	const gitStatus = await runCommand('git', ['status', '--porcelain', '--branch'], repositoryAbsolutePath);
	if (!gitStatus.ok) {
		return {
			...stack,
			repositoryAbsolutePath,
			currentBranch: 'unknown',
			syncState: 'repo-error',
			workingTreeDirty: false,
			gitError: gitStatus.stderr || gitStatus.error
		};
	}

	const currentBranch = await runCommand('git', ['branch', '--show-current'], repositoryAbsolutePath);

	const workingTreeDirty = gitStatus.stdout
		.split('\n')
		.some((line) => line.length > 0 && !line.startsWith('##'));

	let syncState: StackSyncState = 'clean';
	if (!currentBranch.ok) {
		syncState = 'repo-error';
	} else if (workingTreeDirty) {
		syncState = 'dirty';
	}

	const activeBranch = currentBranch.ok ? currentBranch.stdout || 'detached-head' : 'unknown';

	let ghError: string | undefined;
	let pullRequest: StackPullRequest | undefined;

	const ghAuth = await runCommand('gh', ['auth', 'status'], repositoryAbsolutePath);
	if (!ghAuth.ok) {
		ghError = ghAuth.stderr || ghAuth.error;
	} else {
		const prLookup = await runCommand(
			'gh',
			[
				'pr',
				'list',
				'--head',
				activeBranch,
				'--state',
				'all',
				'--limit',
				'1',
				'--json',
				'number,title,state,isDraft,url,updatedAt'
			],
			repositoryAbsolutePath
		);

		if (prLookup.ok) {
			try {
				const parsed = JSON.parse(prLookup.stdout || '[]') as GitHubPullRequestPayload[];
				pullRequest = toPullRequest(parsed[0]);
			} catch {
				ghError = 'Unable to parse gh pr list response';
			}
		} else {
			ghError = prLookup.stderr || prLookup.error;
		}
	}

	return {
		...stack,
		repositoryAbsolutePath,
		currentBranch: activeBranch,
		syncState,
		workingTreeDirty,
		pullRequest,
		ghError
	};
}
