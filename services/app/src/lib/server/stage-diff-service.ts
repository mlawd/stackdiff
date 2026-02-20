import { runCommand } from '$lib/server/command';
import {
	getImplementationSessionByStackAndStage,
	getRuntimeRepositoryPath,
	getStackById
} from '$lib/server/stack-store';
import { resolveDefaultBaseBranch } from '$lib/server/worktree-service';
import type {
	StageDiffErrorCode,
	StageDiffFile,
	StageDiffFileChangeType,
	StageDiffHunk,
	StageDiffLine,
	StageDiffPayload,
	StageDiffServiceErrorShape,
	StackMetadata
} from '$lib/types/stack';

interface ParsedFileState {
	diffHeaderOldPath: string;
	diffHeaderNewPath: string;
	renameFrom?: string;
	renameTo?: string;
	oldPath?: string;
	newPath?: string;
	isBinary: boolean;
	additions: number;
	deletions: number;
	hunks: StageDiffHunk[];
}

class StageDiffServiceError extends Error implements StageDiffServiceErrorShape {
	code: StageDiffErrorCode;

	constructor(code: StageDiffErrorCode, message: string) {
		super(message);
		this.code = code;
	}
}

function buildLineId(input: {
	filePath: string;
	hunkIndex: number;
	lineIndex: number;
	type: StageDiffLine['type'];
	oldLineNumber: number | null;
	newLineNumber: number | null;
}): string {
	const oldToken = input.oldLineNumber === null ? 'n' : `${input.oldLineNumber}`;
	const newToken = input.newLineNumber === null ? 'n' : `${input.newLineNumber}`;

	return `${input.filePath}:${input.hunkIndex}:${input.lineIndex}:${input.type}:${oldToken}:${newToken}`;
}

function parseDiffHunkHeader(line: string): { oldStart: number; oldLines: number; newStart: number; newLines: number } {
	const matched = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
	if (!matched) {
		throw new StageDiffServiceError('parse-failed', `Unable to parse diff hunk header: ${line}`);
	}

	return {
		oldStart: Number(matched[1]),
		oldLines: matched[2] ? Number(matched[2]) : 1,
		newStart: Number(matched[3]),
		newLines: matched[4] ? Number(matched[4]) : 1
	};
}

function toFinalPath(file: ParsedFileState): string {
	if (file.renameTo) {
		return file.renameTo;
	}

	if (file.newPath && file.newPath !== '/dev/null') {
		return file.newPath;
	}

	if (file.oldPath && file.oldPath !== '/dev/null') {
		return file.oldPath;
	}

	return file.diffHeaderNewPath;
}

function toChangeType(file: ParsedFileState): StageDiffFileChangeType {
	if (file.renameFrom && file.renameTo) {
		return 'renamed';
	}

	if ((file.oldPath === '/dev/null' || !file.oldPath) && file.newPath && file.newPath !== '/dev/null') {
		return 'added';
	}

	if ((file.newPath === '/dev/null' || !file.newPath) && file.oldPath && file.oldPath !== '/dev/null') {
		return 'deleted';
	}

	return 'modified';
}

function finalizeFile(file: ParsedFileState): StageDiffFile {
	const changeType = toChangeType(file);
	const path = toFinalPath(file);

	let previousPath: string | undefined;
	if (changeType === 'renamed' && file.renameFrom) {
		previousPath = file.renameFrom;
	} else if (changeType === 'deleted' && file.oldPath && file.oldPath !== '/dev/null') {
		previousPath = file.oldPath;
	}

	return {
		path,
		previousPath,
		changeType,
		isBinary: file.isBinary,
		additions: file.additions,
		deletions: file.deletions,
		hunks: file.hunks
	};
}

function parsePathLine(line: string, prefix: string): string {
	const raw = line.slice(prefix.length).trim();
	if (raw === '/dev/null') {
		return raw;
	}

	if (raw.startsWith('a/') || raw.startsWith('b/')) {
		return raw.slice(2);
	}

	return raw;
}

function parseDiffOutput(rawDiff: string): StageDiffFile[] {
	if (!rawDiff.trim()) {
		return [];
	}

	const lines = rawDiff.split('\n');
	const files: StageDiffFile[] = [];
	let currentFile: ParsedFileState | null = null;
	let currentHunk: StageDiffHunk | null = null;
	let hunkIndex = -1;
	let oldLineNumber = 0;
	let newLineNumber = 0;

	for (const line of lines) {
		if (line.startsWith('diff --git ')) {
			if (currentHunk && currentFile) {
				currentFile.hunks.push(currentHunk);
				currentHunk = null;
			}

			if (currentFile) {
				files.push(finalizeFile(currentFile));
			}

			const matched = line.match(/^diff --git a\/(.+) b\/(.+)$/);
			if (!matched) {
				throw new StageDiffServiceError('parse-failed', `Unable to parse diff file header: ${line}`);
			}

			currentFile = {
				diffHeaderOldPath: matched[1],
				diffHeaderNewPath: matched[2],
				isBinary: false,
				additions: 0,
				deletions: 0,
				hunks: []
			};
			hunkIndex = -1;
			continue;
		}

		if (!currentFile) {
			continue;
		}

		if (line.startsWith('rename from ')) {
			currentFile.renameFrom = line.slice('rename from '.length).trim();
			continue;
		}

		if (line.startsWith('rename to ')) {
			currentFile.renameTo = line.slice('rename to '.length).trim();
			continue;
		}

		if (line.startsWith('--- ')) {
			currentFile.oldPath = parsePathLine(line, '--- ');
			continue;
		}

		if (line.startsWith('+++ ')) {
			currentFile.newPath = parsePathLine(line, '+++ ');
			continue;
		}

		if (line.startsWith('Binary files ')) {
			currentFile.isBinary = true;
			continue;
		}

		if (line.startsWith('@@ ')) {
			if (currentHunk) {
				currentFile.hunks.push(currentHunk);
			}

			hunkIndex += 1;
			const hunkInfo = parseDiffHunkHeader(line);
			oldLineNumber = hunkInfo.oldStart;
			newLineNumber = hunkInfo.newStart;
			currentHunk = {
				header: line,
				oldStart: hunkInfo.oldStart,
				oldLines: hunkInfo.oldLines,
				newStart: hunkInfo.newStart,
				newLines: hunkInfo.newLines,
				lines: []
			};
			continue;
		}

		if (!currentHunk) {
			continue;
		}

		const lineIndex = currentHunk.lines.length;
		const filePath = toFinalPath(currentFile);

		if (line.startsWith('+')) {
			currentFile.additions += 1;
			const parsedLine: StageDiffLine = {
				lineId: buildLineId({
					filePath,
					hunkIndex,
					lineIndex,
					type: 'add',
					oldLineNumber: null,
					newLineNumber
				}),
				type: 'add',
				content: line.slice(1),
				oldLineNumber: null,
				newLineNumber
			};
			currentHunk.lines.push(parsedLine);
			newLineNumber += 1;
			continue;
		}

		if (line.startsWith('-')) {
			currentFile.deletions += 1;
			const parsedLine: StageDiffLine = {
				lineId: buildLineId({
					filePath,
					hunkIndex,
					lineIndex,
					type: 'del',
					oldLineNumber,
					newLineNumber: null
				}),
				type: 'del',
				content: line.slice(1),
				oldLineNumber,
				newLineNumber: null
			};
			currentHunk.lines.push(parsedLine);
			oldLineNumber += 1;
			continue;
		}

		if (line.startsWith(' ')) {
			const parsedLine: StageDiffLine = {
				lineId: buildLineId({
					filePath,
					hunkIndex,
					lineIndex,
					type: 'context',
					oldLineNumber,
					newLineNumber
				}),
				type: 'context',
				content: line.slice(1),
				oldLineNumber,
				newLineNumber
			};
			currentHunk.lines.push(parsedLine);
			oldLineNumber += 1;
			newLineNumber += 1;
			continue;
		}

		if (line.startsWith('\\')) {
			const parsedLine: StageDiffLine = {
				lineId: buildLineId({
					filePath,
					hunkIndex,
					lineIndex,
					type: 'context',
					oldLineNumber: null,
					newLineNumber: null
				}),
				type: 'context',
				content: line,
				oldLineNumber: null,
				newLineNumber: null
			};
			currentHunk.lines.push(parsedLine);
			continue;
		}
	}

	if (currentHunk && currentFile) {
		currentFile.hunks.push(currentHunk);
	}

	if (currentFile) {
		files.push(finalizeFile(currentFile));
	}

	return files;
}

async function resolveExistingRef(repositoryRoot: string, ref: string): Promise<string> {
	const direct = await runCommand('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], repositoryRoot);
	if (direct.ok) {
		return ref;
	}

	if (!ref.startsWith('origin/')) {
		const remoteRef = `origin/${ref}`;
		const remote = await runCommand('git', ['rev-parse', '--verify', '--quiet', `${remoteRef}^{commit}`], repositoryRoot);
		if (remote.ok) {
			return remoteRef;
		}
	}

	throw new StageDiffServiceError('not-diffable', `Git ref not found: ${ref}`);
}

function findStageOrThrow(stack: StackMetadata, stageId: string): { stageIndex: number } {
	const stages = stack.stages ?? [];
	let stageIndex = -1;
	for (let index = 0; index < stages.length; index += 1) {
		if (stages[index]?.id === stageId) {
			stageIndex = index;
			break;
		}
	}

	if (stageIndex === -1) {
		throw new StageDiffServiceError('not-found', 'Stage not found.');
	}

	return { stageIndex };
}

async function resolveBaseRef(input: {
	stack: StackMetadata;
	stageIndex: number;
	repositoryRoot: string;
}): Promise<string> {
	if (input.stageIndex === 0) {
		return resolveDefaultBaseBranch(input.repositoryRoot);
	}

	const previousStage = (input.stack.stages ?? [])[input.stageIndex - 1];
	if (!previousStage) {
		throw new StageDiffServiceError('not-diffable', 'Previous stage branch is unavailable for diff baseline.');
	}

	const previousSession = await getImplementationSessionByStackAndStage(input.stack.id, previousStage.id);
	if (!previousSession?.branchName) {
		throw new StageDiffServiceError('not-diffable', 'Previous stage branch is unavailable for diff baseline.');
	}

	return previousSession.branchName;
}

export async function getStageDiff(stackId: string, stageId: string): Promise<StageDiffPayload> {
	const stack = await getStackById(stackId);
	if (!stack) {
		throw new StageDiffServiceError('not-found', 'Feature not found.');
	}

	const { stageIndex } = findStageOrThrow(stack, stageId);
	const repositoryRoot = await getRuntimeRepositoryPath();

	const targetSession = await getImplementationSessionByStackAndStage(stack.id, stageId);
	if (!targetSession?.branchName) {
		throw new StageDiffServiceError('not-diffable', 'Stage branch is unavailable. Start implementation for this stage first.');
	}

	const unresolvedBaseRef = await resolveBaseRef({
		stack,
		stageIndex,
		repositoryRoot
	});

	const baseRef = await resolveExistingRef(repositoryRoot, unresolvedBaseRef);
	const targetRef = await resolveExistingRef(repositoryRoot, targetSession.branchName);

	const diffResult = await runCommand(
		'git',
		['diff', '--find-renames', '--no-color', '--no-ext-diff', '--unified=3', `${baseRef}..${targetRef}`],
		repositoryRoot
	);

	if (!diffResult.ok) {
		throw new StageDiffServiceError(
			'command-failed',
			`Unable to read git diff for ${stageId}: ${diffResult.stderr || diffResult.error || 'unknown git failure'}`
		);
	}

	let files: StageDiffFile[];
	try {
		files = parseDiffOutput(diffResult.stdout);
	} catch (error) {
		if (error instanceof StageDiffServiceError) {
			throw error;
		}

		throw new StageDiffServiceError('parse-failed', 'Unable to parse git diff output.');
	}

	const summary = files.reduce(
		(accumulator, file) => ({
			filesChanged: accumulator.filesChanged + 1,
			additions: accumulator.additions + file.additions,
			deletions: accumulator.deletions + file.deletions
		}),
		{ filesChanged: 0, additions: 0, deletions: 0 }
	);

	return {
		stackId,
		stageId,
		baseRef,
		targetRef,
		isTruncated: false,
		summary,
		files
	};
}

export function isStageDiffServiceError(error: unknown): error is StageDiffServiceErrorShape {
	if (typeof error !== 'object' || error === null) {
		return false;
	}

	const candidate = error as Partial<StageDiffServiceErrorShape>;
	return typeof candidate.code === 'string' && typeof candidate.message === 'string';
}
