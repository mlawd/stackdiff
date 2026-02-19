import { writeStackPlanFile } from '$lib/server/plan-file';
import {
	createOpencodeSession,
	getOpencodeSessionRuntimeState,
	getOpencodeSessionMessages,
	sendOpencodeSessionMessage
} from '$lib/server/opencode';
import {
	createOrGetPlanningSession,
	getStackById,
	getPlanningSessionByStackId,
	markPlanningSessionSaved,
	markPlanningSessionSeeded,
	setPlanningSessionOpencodeId,
	setStackStatus,
	setStackStages,
	touchPlanningSessionUpdatedAt
} from '$lib/server/stack-store';
import type { FeatureStage, FeatureType, PlanningMessage, StackMetadata, StackPlanningSession } from '$lib/types/stack';

export const PLANNING_SYSTEM_PROMPT = `Follow this response contract.
Keep responses concise and planning-focused.
Do not provide implementation code unless explicitly asked.
When context is incomplete, ask targeted clarifying questions.
When asking clarifying questions, emit ONLY this JSON payload shape (no prose, markdown, or code fences):
{"questions":[{"header":"...","question":"...","options":[{"label":"...","description":"..."}],"multiple":false,"allowCustom":true}]}
For free-text-only questions, set allowCustom=true and use an empty options array.
Use multiple=true when more than one option can be selected.
When the user replies with JSON like {"type":"question_answer","answers":[...]}, treat it as authoritative responses.
When context is sufficient, propose staged implementation guidance with clear assumptions.`;

const SAVE_PLAN_PROMPT = `Create a high-quality markdown implementation plan from this conversation.
Return markdown only.
Use this structure:
- Title
- Goal
- Scope
- Constraints
- Proposed changes
- Execution steps (numbered)
- Risks and mitigations
- Validation checklist`;

function toStageId(index: number): string {
	return `stage-${index + 1}`;
}

function cleanStageTitle(value: string): string {
	return value
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/[.;:,\-\s]+$/g, '');
}

function extractSection(markdown: string, sectionName: string): string {
	const lines = markdown.split(/\r?\n/);
	const target = sectionName.toLowerCase();
	let start = -1;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index].trim();
		const headingMatch = line.match(/^#{1,6}\s+(.*)$/);
		if (!headingMatch) {
			continue;
		}

		const normalized = headingMatch[1].toLowerCase();
		if (normalized.includes(target)) {
			start = index + 1;
			break;
		}
	}

	if (start === -1) {
		return '';
	}

	const collected: string[] = [];
	for (let index = start; index < lines.length; index += 1) {
		if (/^#{1,6}\s+/.test(lines[index].trim())) {
			break;
		}

		collected.push(lines[index]);
	}

	return collected.join('\n').trim();
}

function collectNumberedItems(section: string): string[] {
	return section
		.split(/\r?\n/)
		.map((line) => line.match(/^\s*\d+[.)]\s+(.+)$/)?.[1] ?? '')
		.map(cleanStageTitle)
		.filter((line) => line.length > 0);
}

function collectBullets(section: string): string[] {
	return section
		.split(/\r?\n/)
		.map((line) => line.match(/^\s*[-*+]\s+(.+)$/)?.[1] ?? '')
		.map(cleanStageTitle)
		.filter((line) => line.length > 0);
}

function toStages(titles: string[]): FeatureStage[] {
	const unique = Array.from(new Set(titles.map(cleanStageTitle).filter((title) => title.length > 0)));

	return unique.map((title, index) => ({
		id: toStageId(index),
		title,
		status: 'not-started'
	}));
}

function deriveFallbackStages(markdownPlan: string): FeatureStage[] {
	const proposedChanges = extractSection(markdownPlan, 'proposed changes');
	const bullets = collectBullets(proposedChanges);

	if (bullets.length > 0) {
		return toStages(bullets.slice(0, 5));
	}

	const generic = ['Prepare implementation approach', 'Implement core changes', 'Validate and finalize'];
	return toStages(generic);
}

function extractStagesFromPlan(markdownPlan: string): FeatureStage[] {
	const execution = extractSection(markdownPlan, 'execution steps');
	const numbered = collectNumberedItems(execution);

	if (numbered.length > 0) {
		return toStages(numbered);
	}

	return deriveFallbackStages(markdownPlan);
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
	const description = stack.notes?.trim() || 'No additional description provided.';

	return [
		'Help me create an implementation plan for this work item:',
		`- Type: ${featureTypeLabel(stack.type)}`,
		`- Name: ${stack.name}`,
		`- Description: ${description}`,
		'',
		'Please ask any important clarifying questions, then propose a staged implementation approach.'
	].join('\n');
}

export function getInitialPlanningPrompt(stack: StackMetadata): string {
	return buildInitialPlanningPrompt(stack);
}

export function shouldAutoSavePlan(content: string): boolean {
	return /\bsave (the )?plan\b/i.test(content.trim());
}

async function ensureSessionWithOpencodeId(
	stackId: string
): Promise<{ session: StackPlanningSession; createdOpencodeSession: boolean }> {
	const session = await createOrGetPlanningSession(stackId);

	if (session.opencodeSessionId) {
		return {
			session,
			createdOpencodeSession: false
		};
	}

	const opencodeSessionId = await createOpencodeSession();
	const updated = await setPlanningSessionOpencodeId(stackId, opencodeSessionId);

	return {
		session: updated,
		createdOpencodeSession: true
	};
}

async function requireSessionWithOpencodeId(stackId: string): Promise<StackPlanningSession> {
	const session = await getPlanningSessionByStackId(stackId);
	if (!session) {
		throw new Error('Planning session not found. Recreate the feature to initialize planning.');
	}

	if (!session.opencodeSessionId) {
		throw new Error('Planning session is missing an OpenCode session id. Recreate the feature to reinitialize planning.');
	}

	return session;
}

export async function createAndSeedPlanningSessionForStack(
	stack: StackMetadata
): Promise<{ session: StackPlanningSession; messages: PlanningMessage[] }> {
	const { session } = await ensureSessionWithOpencodeId(stack.id);
	if (session.seededAt) {
		const messages = await getOpencodeSessionMessages(session.opencodeSessionId as string);
		return { session, messages };
	}

	await sendOpencodeSessionMessage(session.opencodeSessionId as string, buildInitialPlanningPrompt(stack), {
		system: PLANNING_SYSTEM_PROMPT
	});

	const seededSession = await markPlanningSessionSeeded(stack.id);
	const messages = await getOpencodeSessionMessages(seededSession.opencodeSessionId as string);

	return {
		session: seededSession,
		messages
	};
}

export async function getPlanningMessages(stackId: string): Promise<PlanningMessage[]> {
	const session = await requireSessionWithOpencodeId(stackId);
	return getOpencodeSessionMessages(session.opencodeSessionId as string);
}

export async function loadExistingPlanningSession(stackId: string): Promise<{
	session: StackPlanningSession;
	messages: PlanningMessage[];
	awaitingResponse: boolean;
}> {
	const session = await requireSessionWithOpencodeId(stackId);
	const messages = await getOpencodeSessionMessages(session.opencodeSessionId as string);
	const runtimeState = await getOpencodeSessionRuntimeState(session.opencodeSessionId as string);

	return {
		session,
		messages,
		awaitingResponse: runtimeState === 'busy' || runtimeState === 'retry'
	};
}

export async function markPlanningSessionSeededState(stackId: string): Promise<void> {
	await markPlanningSessionSeeded(stackId);
}

export async function sendPlanningMessage(stackId: string, content: string): Promise<{
	session: StackPlanningSession;
	assistantReply: string;
	autoSavedPlanPath?: string;
}> {
	const session = await requireSessionWithOpencodeId(stackId);
	const assistantReply = await sendOpencodeSessionMessage(session.opencodeSessionId as string, content, {
		system: PLANNING_SYSTEM_PROMPT
	});
	await touchPlanningSessionUpdatedAt(stackId);

	if (!shouldAutoSavePlan(content)) {
		return { session, assistantReply };
	}

	const saveResult = await savePlanFromSession(stackId);
	return {
		session: saveResult.session,
		assistantReply,
		autoSavedPlanPath: saveResult.savedPlanPath
	};
}

export async function savePlanFromSession(stackId: string): Promise<{
	session: StackPlanningSession;
	savedPlanPath: string;
	planMarkdown: string;
}> {
	const session = await requireSessionWithOpencodeId(stackId);
	const messages = await getOpencodeSessionMessages(session.opencodeSessionId as string);

	if (messages.filter((message) => message.role === 'user').length === 0) {
		throw new Error('Add at least one planning message before saving a plan.');
	}

	const markdownPlan = await sendOpencodeSessionMessage(session.opencodeSessionId as string, SAVE_PLAN_PROMPT, {
		system: PLANNING_SYSTEM_PROMPT
	});

	const savedPlanPath = await writeStackPlanFile(stackId, markdownPlan);
	const sessionWithSave = await markPlanningSessionSaved(stackId, savedPlanPath);
	const stages = extractStagesFromPlan(markdownPlan);
	await setStackStages(stackId, stages);
	const stack = await getStackById(stackId);
	if (stack?.status === 'created') {
		await setStackStatus(stackId, 'planned');
	}

	return {
		session: sessionWithSave,
		savedPlanPath,
		planMarkdown: markdownPlan
	};
}
