import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { createAndSeedOpencodeSession } from '$lib/server/opencode';
import {
  createOrGetImplementationSession,
  getRuntimeRepositoryPath,
  getPlanningSessionByStackId,
  setImplementationSessionOpencodeId,
} from '$lib/server/stack-store';
import type {
  FeatureStage,
  StackImplementationSession,
  StackMetadata,
} from '$lib/types/stack';

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
  planningArtifacts: {
    savedPlanPath?: string;
    savedStageConfigPath?: string;
    savedPlanAbsolutePath?: string;
    savedStageConfigAbsolutePath?: string;
    planMarkdown?: string;
    planMarkdownLoadError?: string;
  },
): string {
  const details =
    stack.notes?.trim() || 'No additional feature notes were provided.';
  const stageDetails =
    stage.details?.trim() || 'No stage details were provided.';

  const lines = [
    `Start implementing stage ${stageNumber} for this stack.`,
    `Feature type: ${stack.type}`,
    `Feature name: ${stack.name}`,
    `Feature notes: ${details}`,
    `Stage number: ${stageNumber}`,
    `Stage id: ${stage.id}`,
    `Stage title: ${stage.title}`,
    `Stage details: ${stageDetails}`,
  ];

  if (planningArtifacts.savedPlanAbsolutePath) {
    lines.push(
      `Plan file (absolute): ${planningArtifacts.savedPlanAbsolutePath}`,
    );
  } else if (planningArtifacts.savedPlanPath) {
    lines.push(`Plan file: ${planningArtifacts.savedPlanPath}`);
  }

  if (planningArtifacts.savedStageConfigAbsolutePath) {
    lines.push(
      `Stage config file (absolute): ${planningArtifacts.savedStageConfigAbsolutePath}`,
    );
  } else if (planningArtifacts.savedStageConfigPath) {
    lines.push(`Stage config file: ${planningArtifacts.savedStageConfigPath}`);
  }

  if (planningArtifacts.planMarkdown) {
    lines.push(
      'Use the saved plan markdown below as authoritative context for this stage.',
    );
    lines.push(
      'Do not search for the plan file using worktree-relative paths.',
    );
    lines.push('--- BEGIN SAVED PLAN MARKDOWN ---');
    lines.push(planningArtifacts.planMarkdown);
    lines.push('--- END SAVED PLAN MARKDOWN ---');
  } else if (planningArtifacts.planMarkdownLoadError) {
    lines.push(
      `Saved plan markdown could not be loaded: ${planningArtifacts.planMarkdownLoadError}`,
    );
  }

  lines.push(
    'Implement the stage in this worktree and keep changes scoped to this stage.',
  );
  lines.push('Keep a todo list updated while you work so progress is visible.');
  lines.push(
    'Before finishing, run relevant validation checks for the changes you made.',
  );
  lines.push(
    'When implementation is complete, commit the changes with a clear message.',
  );
  lines.push('If there are no code changes, do not create an empty commit.');

  return lines.join('\n');
}

function resolvePlanningArtifactPath(
  repositoryRoot: string,
  candidate?: string,
): string | undefined {
  const value = candidate?.trim();
  if (!value) {
    return undefined;
  }

  if (path.isAbsolute(value)) {
    return value;
  }

  return path.resolve(repositoryRoot, value);
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
    input.worktreePathKey,
  );

  let session = ensured.session;
  let reusedSession = !ensured.created;

  if (!session.opencodeSessionId) {
    const planningSession = await getPlanningSessionByStackId(input.stack.id);
    const repositoryRoot = await getRuntimeRepositoryPath();
    const savedPlanAbsolutePath = resolvePlanningArtifactPath(
      repositoryRoot,
      planningSession?.savedPlanPath,
    );
    const savedStageConfigAbsolutePath = resolvePlanningArtifactPath(
      repositoryRoot,
      planningSession?.savedStageConfigPath,
    );

    let planMarkdown: string | undefined;
    let planMarkdownLoadError: string | undefined;
    if (savedPlanAbsolutePath) {
      try {
        const loaded = await readFile(savedPlanAbsolutePath, 'utf-8');
        const trimmed = loaded.trim();
        if (trimmed.length > 0) {
          planMarkdown = trimmed;
        } else {
          planMarkdownLoadError = 'file was empty';
        }
      } catch (error) {
        planMarkdownLoadError =
          error instanceof Error ? error.message : String(error);
      }
    }

    const prompt = buildInitialImplementationPrompt(
      input.stack,
      input.stage,
      parseStageNumber(input.stage, input.stageIndex),
      {
        savedPlanPath: planningSession?.savedPlanPath,
        savedStageConfigPath: planningSession?.savedStageConfigPath,
        savedPlanAbsolutePath,
        savedStageConfigAbsolutePath,
        planMarkdown,
        planMarkdownLoadError,
      },
    );

    const opencodeSessionId = await createAndSeedOpencodeSession({
      prompt,
      agent: 'build',
      directory: input.worktreeAbsolutePath,
    });
    session = await setImplementationSessionOpencodeId(
      input.stack.id,
      input.stage.id,
      opencodeSessionId,
    );
    reusedSession = false;
  }

  return {
    session,
    reusedSession,
  };
}
