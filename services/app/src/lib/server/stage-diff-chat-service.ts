import { sendOpencodeSessionMessage } from '$lib/server/opencode';
import { getStageDiff, isStageDiffServiceError } from '$lib/server/stage-diff-service';
import {
	getImplementationSessionByStackAndStage,
	getRuntimeRepositoryPath,
	touchImplementationSessionUpdatedAt
} from '$lib/server/stack-store';
import { resolveWorktreeAbsolutePath } from '$lib/server/worktree-service';
import type {
	DiffSelection,
	StageDiffChatErrorCode,
	StageDiffChatErrorShape,
	StageDiffChatResult,
	StageDiffLine
} from '$lib/types/stack';

class StageDiffChatError extends Error implements StageDiffChatErrorShape {
	code: StageDiffChatErrorCode;

	constructor(code: StageDiffChatErrorCode, message: string) {
		super(message);
		this.code = code;
	}
}

function linePrefix(type: StageDiffLine['type']): string {
	if (type === 'add') {
		return '+';
	}

	if (type === 'del') {
		return '-';
	}

	return ' ';
}

function buildFocusedPrompt(input: {
	stackId: string;
	stageId: string;
	selection: DiffSelection;
	message?: string;
}): string {
	const lines = [
		'Start focused AI discussion for this selected diff range.',
		`Feature id: ${input.stackId}`,
		`Stage id: ${input.stageId}`,
		`Diff refs: ${input.selection.refs.baseRef} -> ${input.selection.refs.targetRef}`,
		`File path: ${input.selection.filePath}`,
		`Selected line IDs (${input.selection.selectedLineIds.length}): ${input.selection.selectedLineIds.join(', ')}`,
		'Selected snippet:',
		'```diff',
		input.selection.snippet,
		'```'
	];

	if (input.message && input.message.trim().length > 0) {
		lines.push(`User request: ${input.message.trim()}`);
	} else {
		lines.push('User request: Explain the selected change and recommend the next implementation steps.');
	}

	return lines.join('\n');
}

function normalizeSelection(selection: DiffSelection): DiffSelection {
	return {
		refs: {
			baseRef: selection.refs.baseRef.trim(),
			targetRef: selection.refs.targetRef.trim()
		},
		filePath: selection.filePath.trim(),
		selectedLineIds: Array.from(
			new Set(
				selection.selectedLineIds
					.map((lineId) => lineId.trim())
					.filter((lineId) => lineId.length > 0)
			)
		),
		snippet: selection.snippet
	};
}

function assertBasicSelectionShape(selection: DiffSelection): void {
	if (!selection.refs.baseRef || !selection.refs.targetRef) {
		throw new StageDiffChatError('invalid-selection', 'Selection refs are required. Reload the diff and try again.');
	}

	if (!selection.filePath) {
		throw new StageDiffChatError('invalid-selection', 'Selection file path is required.');
	}

	if (selection.selectedLineIds.length === 0) {
		throw new StageDiffChatError('invalid-selection', 'Select at least one diff line to start focused chat.');
	}
}

export async function startStageDiffChat(input: {
	stackId: string;
	stageId: string;
	selection: DiffSelection;
	message?: string;
}): Promise<StageDiffChatResult> {
	const normalizedSelection = normalizeSelection(input.selection);
	assertBasicSelectionShape(normalizedSelection);

	let diff;
	try {
		diff = await getStageDiff(input.stackId, input.stageId);
	} catch (error) {
		if (isStageDiffServiceError(error)) {
			if (error.code === 'not-found' || error.code === 'not-diffable') {
				throw new StageDiffChatError(error.code, error.message);
			}

			throw new StageDiffChatError('command-failed', error.message);
		}

		throw new StageDiffChatError(
			'command-failed',
			error instanceof Error ? error.message : 'Unable to load stage diff context.'
		);
	}

	if (
		normalizedSelection.refs.baseRef !== diff.baseRef ||
		normalizedSelection.refs.targetRef !== diff.targetRef
	) {
		throw new StageDiffChatError(
			'invalid-selection',
			'Selection refs are stale. Reload this stage diff and select lines again.'
		);
	}

	const selectedFile = diff.files.find((file) => file.path === normalizedSelection.filePath);
	if (!selectedFile) {
		throw new StageDiffChatError(
			'invalid-selection',
			'Selection file is not present in the current diff. Reload and try again.'
		);
	}

	const selectedLineIdSet = new Set(normalizedSelection.selectedLineIds);
	const orderedSelectedLines: StageDiffLine[] = [];
	for (const hunk of selectedFile.hunks) {
		for (const line of hunk.lines) {
			if (selectedLineIdSet.has(line.lineId)) {
				orderedSelectedLines.push(line);
			}
		}
	}

	if (orderedSelectedLines.length !== selectedLineIdSet.size) {
		throw new StageDiffChatError(
			'invalid-selection',
			'One or more selected lines are no longer available in this diff. Reload and try again.'
		);
	}

	const resolvedSelection: DiffSelection = {
		refs: {
			baseRef: diff.baseRef,
			targetRef: diff.targetRef
		},
		filePath: selectedFile.path,
		selectedLineIds: orderedSelectedLines.map((line) => line.lineId),
		snippet: orderedSelectedLines.map((line) => `${linePrefix(line.type)}${line.content}`).join('\n')
	};

	const implementationSession = await getImplementationSessionByStackAndStage(input.stackId, input.stageId);
	if (!implementationSession?.opencodeSessionId) {
		throw new StageDiffChatError(
			'not-diffable',
			'Stage implementation chat is unavailable. Start this stage implementation first.'
		);
	}

	const repositoryRoot = await getRuntimeRepositoryPath();
	const worktreeAbsolutePath = resolveWorktreeAbsolutePath(repositoryRoot, implementationSession.worktreePathKey);
	const prompt = buildFocusedPrompt({
		stackId: input.stackId,
		stageId: input.stageId,
		selection: resolvedSelection,
		message: input.message
	});

	let assistantReply: string;
	try {
		assistantReply = await sendOpencodeSessionMessage(implementationSession.opencodeSessionId, prompt, {
			agent: 'build',
			directory: worktreeAbsolutePath
		});
	} catch (error) {
		throw new StageDiffChatError(
			'command-failed',
			error instanceof Error ? error.message : 'Unable to start focused stage chat.'
		);
	}

	await touchImplementationSessionUpdatedAt(input.stackId, input.stageId);

	return {
		stackId: input.stackId,
		stageId: input.stageId,
		selection: resolvedSelection,
		assistantReply
	};
}

export function isStageDiffChatError(error: unknown): error is StageDiffChatErrorShape {
	if (typeof error !== 'object' || error === null) {
		return false;
	}

	const candidate = error as Partial<StageDiffChatErrorShape>;
	return typeof candidate.code === 'string' && typeof candidate.message === 'string';
}
