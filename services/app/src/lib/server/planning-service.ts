import {
  writeStackPlanFile,
  writeStackStageConfigFile,
} from '$lib/server/plan-file';
import {
  createAndSeedOpencodeSession,
  getOpencodeSessionRuntimeState,
  getOpencodeSessionMessages,
  sendOpencodeSessionMessage,
} from '$lib/server/opencode';
import {
  createOrGetPlanningSession,
  getStackById,
  getRuntimeRepositoryPath,
  getPlanningSessionByStackId,
  markPlanningSessionSaved,
  setPlanningSessionOpencodeId,
  setStackStatus,
  setStackStages,
  touchPlanningSessionUpdatedAt,
} from '$lib/server/stack-store';
import type {
  FeatureStage,
  FeatureType,
  PlanningMessage,
  StackMetadata,
  StackPlanningSession,
  StageConfigEntry,
  StageConfigFile,
} from '$lib/types/stack';

export const PLANNING_SYSTEM_PROMPT = `Follow this response contract.
Keep responses concise and planning-focused.
Do not provide implementation code unless explicitly asked.
When context is incomplete, ask targeted clarifying questions.
When asking clarifying questions, use the question tool/interface only.
Do not emit question JSON in assistant text.
After the user answers through the question tool, continue planning using those answers as authoritative context.
When context is sufficient, propose staged implementation guidance with clear assumptions.
Design stages as small, reviewable pull requests where each stage is ideally deployable on its own.
Do not offer to implement the plan.
When the plan is complete and aligned with user feedback, suggest clicking "Save plan".`;

const SAVE_PLAN_PROMPT = `Create a detailed implementation plan and stages config from this conversation.
Return ONLY valid JSON (no prose, no markdown fences) with this exact shape:
{
  "planMarkdown": "# ...",
  "stages": [
    {
      "id": "stage-1",
      "stageName": "...",
      "stageDescription": "...",
      "markdownSection": {
        "heading": "Execution steps",
        "anchor": "execution-steps"
      }
    }
  ]
}
Rules:
- planMarkdown must be detailed markdown with sections: Goal, Scope, Constraints, Proposed changes, Execution steps, Risks and mitigations, Validation checklist.
- stages must be non-empty and map to the plan.
- markdownSection.anchor must be lowercase kebab-case.
- stageName and stageDescription must be specific and non-empty.`;

const STAGE_CONFIG_SCHEMA_VERSION = 1;
const STAGE_ANCHOR_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseSavePlanPayload(content: string): {
  planMarkdown: string;
  stages: StageConfigEntry[];
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new Error('Plan save failed: planner returned invalid JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Plan save failed: planner output must be a JSON object.');
  }

  const candidate = parsed as {
    planMarkdown?: unknown;
    stages?: unknown;
  };

  if (
    typeof candidate.planMarkdown !== 'string' ||
    candidate.planMarkdown.trim().length === 0
  ) {
    throw new Error(
      'Plan save failed: planMarkdown must be a non-empty string.',
    );
  }

  if (!Array.isArray(candidate.stages) || candidate.stages.length === 0) {
    throw new Error('Plan save failed: stages must be a non-empty array.');
  }

  const stages = candidate.stages.map((stage, index) =>
    toStageConfigEntry(stage, index),
  );
  const seenIds = new Set<string>();
  for (const stage of stages) {
    if (seenIds.has(stage.id)) {
      throw new Error(`Plan save failed: duplicate stage id "${stage.id}".`);
    }
    seenIds.add(stage.id);
  }

  return {
    planMarkdown: candidate.planMarkdown.trim(),
    stages,
  };
}

function toStageConfigEntry(value: unknown, index: number): StageConfigEntry {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Plan save failed: stage ${index + 1} must be an object.`);
  }

  const candidate = value as {
    id?: unknown;
    stageName?: unknown;
    stageDescription?: unknown;
    markdownSection?: unknown;
  };

  if (typeof candidate.id !== 'string' || candidate.id.trim().length === 0) {
    throw new Error(
      `Plan save failed: stage ${index + 1} id must be a non-empty string.`,
    );
  }

  if (
    typeof candidate.stageName !== 'string' ||
    candidate.stageName.trim().length === 0
  ) {
    throw new Error(
      `Plan save failed: stage ${index + 1} stageName must be a non-empty string.`,
    );
  }

  if (
    typeof candidate.stageDescription !== 'string' ||
    candidate.stageDescription.trim().length === 0
  ) {
    throw new Error(
      `Plan save failed: stage ${index + 1} stageDescription must be a non-empty string.`,
    );
  }

  if (
    typeof candidate.markdownSection !== 'object' ||
    candidate.markdownSection === null
  ) {
    throw new Error(
      `Plan save failed: stage ${index + 1} markdownSection must be an object.`,
    );
  }

  const markdownSection = candidate.markdownSection as {
    heading?: unknown;
    anchor?: unknown;
  };

  if (
    typeof markdownSection.heading !== 'string' ||
    markdownSection.heading.trim().length === 0
  ) {
    throw new Error(
      `Plan save failed: stage ${index + 1} markdownSection.heading must be a non-empty string.`,
    );
  }

  if (
    typeof markdownSection.anchor !== 'string' ||
    markdownSection.anchor.trim().length === 0
  ) {
    throw new Error(
      `Plan save failed: stage ${index + 1} markdownSection.anchor must be a non-empty string.`,
    );
  }

  const anchor = markdownSection.anchor.trim();
  if (!STAGE_ANCHOR_PATTERN.test(anchor)) {
    throw new Error(
      `Plan save failed: stage ${index + 1} markdownSection.anchor must be lowercase kebab-case.`,
    );
  }

  return {
    id: candidate.id.trim(),
    stageName: candidate.stageName.trim(),
    stageDescription: candidate.stageDescription.trim(),
    markdownSection: {
      heading: markdownSection.heading.trim(),
      anchor,
    },
  };
}

function toFeatureStages(stages: StageConfigEntry[]): FeatureStage[] {
  return stages.map((stage) => ({
    id: stage.id,
    title: stage.stageName,
    details: stage.stageDescription,
    status: 'not-started',
  }));
}

function featureTypeLabel(type: FeatureType): string {
  if (type === 'bugfix') {
    return 'bugfix';
  }

  if (type === 'chore') {
    return 'chore';
  }

  return 'feature';
}

function buildInitialPlanningPrompt(stack: StackMetadata): string {
  const description =
    stack.notes?.trim() || 'No additional description provided.';

  return [
    'Help me create an implementation plan for this work item:',
    `- Type: ${featureTypeLabel(stack.type)}`,
    `- Name: ${stack.name}`,
    `- Description: ${description}`,
    '',
    'Please ask any important clarifying questions, then propose a staged implementation approach where each stage is a small, reviewable PR that is ideally deployable on its own.',
    'Do not offer to implement the plan; once I am satisfied, direct me to click "Save plan".',
  ].join('\n');
}

async function getPlanningDirectory(stackId: string): Promise<string> {
  return getRuntimeRepositoryPath({ stackId });
}

export function getInitialPlanningPrompt(stack: StackMetadata): string {
  return buildInitialPlanningPrompt(stack);
}

export function shouldAutoSavePlan(content: string): boolean {
  return /\bsave (the )?plan\b/i.test(content.trim());
}

async function requireSessionWithOpencodeId(
  stackId: string,
): Promise<StackPlanningSession> {
  const session = await getPlanningSessionByStackId(stackId);
  if (!session) {
    throw new Error(
      'Planning session not found. Recreate the feature to initialize planning.',
    );
  }

  if (!session.opencodeSessionId) {
    throw new Error(
      'Planning session is missing an OpenCode session id. Recreate the feature to reinitialize planning.',
    );
  }

  return session;
}

export async function createAndSeedPlanningSessionForStack(
  stack: StackMetadata,
): Promise<{ session: StackPlanningSession; messages: PlanningMessage[] }> {
  const session = await createOrGetPlanningSession(stack.id);
  const directory = await getPlanningDirectory(stack.id);
  if (session.opencodeSessionId) {
    const messages = await getOpencodeSessionMessages(
      session.opencodeSessionId as string,
      { directory },
    );
    return { session, messages };
  }

  const opencodeSessionId = await createAndSeedOpencodeSession({
    prompt: buildInitialPlanningPrompt(stack),
    agent: 'plan',
    system: PLANNING_SYSTEM_PROMPT,
    directory,
  });
  const seededSession = await setPlanningSessionOpencodeId(
    stack.id,
    opencodeSessionId,
  );
  const messages = await getOpencodeSessionMessages(
    seededSession.opencodeSessionId as string,
    { directory },
  );

  return {
    session: seededSession,
    messages,
  };
}

export async function getPlanningMessages(
  stackId: string,
): Promise<PlanningMessage[]> {
  const session = await requireSessionWithOpencodeId(stackId);
  const directory = await getPlanningDirectory(stackId);
  return getOpencodeSessionMessages(session.opencodeSessionId as string, {
    directory,
  });
}

export async function loadExistingPlanningSession(stackId: string): Promise<{
  session: StackPlanningSession;
  messages: PlanningMessage[];
  awaitingResponse: boolean;
}> {
  const session = await requireSessionWithOpencodeId(stackId);
  const directory = await getPlanningDirectory(stackId);
  const messages = await getOpencodeSessionMessages(
    session.opencodeSessionId as string,
    { directory },
  );
  const runtimeState = await getOpencodeSessionRuntimeState(
    session.opencodeSessionId as string,
    { directory },
  );

  return {
    session,
    messages,
    awaitingResponse: runtimeState === 'busy' || runtimeState === 'retry',
  };
}

export async function sendPlanningMessage(
  stackId: string,
  content: string,
): Promise<{
  session: StackPlanningSession;
  assistantReply: string;
  autoSavedPlanPath?: string;
  autoSavedStageConfigPath?: string;
}> {
  const session = await requireSessionWithOpencodeId(stackId);
  const directory = await getPlanningDirectory(stackId);
  const assistantReply = await sendOpencodeSessionMessage(
    session.opencodeSessionId as string,
    content,
    {
      system: PLANNING_SYSTEM_PROMPT,
      directory,
    },
  );
  await touchPlanningSessionUpdatedAt(stackId);

  if (!shouldAutoSavePlan(content)) {
    return { session, assistantReply };
  }

  const saveResult = await savePlanFromSession(stackId);
  return {
    session: saveResult.session,
    assistantReply,
    autoSavedPlanPath: saveResult.savedPlanPath,
    autoSavedStageConfigPath: saveResult.savedStageConfigPath,
  };
}

export async function savePlanFromSession(stackId: string): Promise<{
  session: StackPlanningSession;
  savedPlanPath: string;
  savedStageConfigPath: string;
  planMarkdown: string;
}> {
  const session = await requireSessionWithOpencodeId(stackId);
  const directory = await getPlanningDirectory(stackId);
  const messages = await getOpencodeSessionMessages(
    session.opencodeSessionId as string,
    { directory },
  );

  if (messages.filter((message) => message.role === 'user').length === 0) {
    throw new Error('Add at least one planning message before saving a plan.');
  }

  const savePayload = await sendOpencodeSessionMessage(
    session.opencodeSessionId as string,
    SAVE_PLAN_PROMPT,
    {
      system: PLANNING_SYSTEM_PROMPT,
      directory,
    },
  );
  const parsed = parseSavePlanPayload(savePayload);

  const savedPlanPath = await writeStackPlanFile(stackId, parsed.planMarkdown);
  const stageConfig: StageConfigFile = {
    schemaVersion: STAGE_CONFIG_SCHEMA_VERSION,
    stackId,
    generatedAt: new Date().toISOString(),
    planMarkdownPath: savedPlanPath,
    stages: parsed.stages,
  };
  const savedStageConfigPath = await writeStackStageConfigFile(
    stackId,
    stageConfig,
  );
  const sessionWithSave = await markPlanningSessionSaved(
    stackId,
    savedPlanPath,
    savedStageConfigPath,
  );
  const stages = toFeatureStages(parsed.stages);
  await setStackStages(stackId, stages);
  const stack = await getStackById(stackId);
  if (stack?.status === 'created') {
    await setStackStatus(stackId, 'planned');
  }

  return {
    session: sessionWithSave,
    savedPlanPath,
    savedStageConfigPath,
    planMarkdown: parsed.planMarkdown,
  };
}
