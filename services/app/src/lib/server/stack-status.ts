import type { StackMetadata, StackPullRequest, StackSyncState, StackViewModel } from '$lib/types/stack';

import { runCommand } from '$lib/server/command';
import { resolveRepoPath } from '$lib/server/stack-store';

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
	const repositoryAbsolutePath = resolveRepoPath(stack.repositoryPath);
	const tipBranch = stack.branches.at(-1) ?? 'unknown';

	const gitStatus = await runCommand('git', ['status', '--porcelain', '--branch'], repositoryAbsolutePath);
	if (!gitStatus.ok) {
		return {
			...stack,
			repositoryAbsolutePath,
			tipBranch,
			syncState: 'repo-error',
			workingTreeDirty: false,
			gitError: gitStatus.stderr || gitStatus.error
		};
	}

	const branchCheck = await runCommand('git', ['rev-parse', '--verify', tipBranch], repositoryAbsolutePath);
	const currentBranch = await runCommand('git', ['branch', '--show-current'], repositoryAbsolutePath);

	const workingTreeDirty = gitStatus.stdout
		.split('\n')
		.some((line) => line.length > 0 && !line.startsWith('##'));

	let syncState: StackSyncState = 'clean';
	if (!branchCheck.ok) {
		syncState = 'missing-branch';
	} else if (workingTreeDirty || currentBranch.stdout !== tipBranch) {
		syncState = 'dirty';
	}

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
				tipBranch,
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
		tipBranch,
		syncState,
		workingTreeDirty,
		pullRequest,
		ghError
	};
}
