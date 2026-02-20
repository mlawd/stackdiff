import { createAndSeedOpencodeSession } from '$lib/server/opencode';
import {
	createOrGetImplementationSession,
	getPlanningSessionByStackId,
	setImplementationSessionOpencodeId
} from '$lib/server/stack-store';
import type { FeatureStage, StackImplementationSession, StackMetadata } from '$lib/types/stack';

function parseStageNumber(stage: FeatureStage, index: number): number {
	const matched = stage.id.match(/(\d+)/);
	if (!matched) {
		return index + 1;
	}

	const parsed = Number(matched[1]);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return index + 1;
	}

	return parsed;
}

function buildInitialImplementationPrompt(
	stack: StackMetadata,
	stage: FeatureStage,
	stageNumber: number,
	planningArtifacts: { savedPlanPath?: string; savedStageConfigPath?: string }
): string {
	const details = stack.notes?.trim() || 'No additional feature notes were provided.';
	const stageDetails = stage.details?.trim() || 'No stage details were provided.';

	const lines = [
		`Start implementing stage ${stageNumber} for this stack.`,
		`Feature type: ${stack.type}`,
		`Feature name: ${stack.name}`,
		`Feature notes: ${details}`,
		`Stage number: ${stageNumber}`,
		`Stage id: ${stage.id}`,
		`Stage title: ${stage.title}`,
		`Stage details: ${stageDetails}`
	];

	if (planningArtifacts.savedPlanPath) {
		lines.push(`Plan file: ${planningArtifacts.savedPlanPath}`);
	}

	if (planningArtifacts.savedStageConfigPath) {
		lines.push(`Stage config file: ${planningArtifacts.savedStageConfigPath}`);
	}

	lines.push('Implement the stage in this worktree and keep changes scoped to this stage.');
	lines.push('Keep a todo list updated while you work so progress is visible.');
	lines.push('Before finishing, run relevant validation checks for the changes you made.');
	lines.push('When implementation is complete, commit the changes with a clear message.');
	lines.push('If there are no code changes, do not create an empty commit.');

	return lines.join('\n');
}

export async function ensureImplementationSessionBootstrap(input: {
	stack: StackMetadata;
	stage: FeatureStage;
	stageIndex: number;
	branchName: string;
	worktreePathKey: string;
	worktreeAbsolutePath: string;
}): Promise<{ session: StackImplementationSession; reusedSession: boolean }> {
	const ensured = await createOrGetImplementationSession(
		input.stack.id,
		input.stage.id,
		input.branchName,
		input.worktreePathKey
	);

	let session = ensured.session;
	let reusedSession = !ensured.created;

	if (!session.opencodeSessionId) {
		const planningSession = await getPlanningSessionByStackId(input.stack.id);
		const prompt = buildInitialImplementationPrompt(
			input.stack,
			input.stage,
			parseStageNumber(input.stage, input.stageIndex),
			{
				savedPlanPath: planningSession?.savedPlanPath,
				savedStageConfigPath: planningSession?.savedStageConfigPath
			}
		);

		const opencodeSessionId = await createAndSeedOpencodeSession({
			prompt,
			agent: 'build',
			directory: input.worktreeAbsolutePath
		});
		session = await setImplementationSessionOpencodeId(input.stack.id, input.stage.id, opencodeSessionId);
		reusedSession = false;
	}

	return {
		session,
		reusedSession
	};
}
