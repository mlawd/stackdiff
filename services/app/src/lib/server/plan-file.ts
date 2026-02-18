import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { getRuntimeRepositoryPath } from '$lib/server/stack-store';

function toRelativePath(repoRoot: string, filePath: string): string {
	return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

export async function writeStackPlanFile(stackId: string, markdownPlan: string): Promise<string> {
	const repositoryRoot = await getRuntimeRepositoryPath();
	const directory = path.join(repositoryRoot, '.stacked', 'plans');
	const filePath = path.join(directory, `${stackId}.md`);

	await mkdir(directory, { recursive: true });
	await writeFile(filePath, `${markdownPlan.trim()}\n`, 'utf-8');

	return toRelativePath(repositoryRoot, filePath);
}
