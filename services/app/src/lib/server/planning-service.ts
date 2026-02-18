import type { OpencodeMessage } from '$lib/server/opencode';
import { writeStackPlanFile } from '$lib/server/plan-file';
import {
	createOpencodeSession,
	getOpencodeApiMode,
	requestOpencodeChat,
	sendOpencodeSessionMessage
} from '$lib/server/opencode';
import {
	appendPlanningMessage,
	createOrGetPlanningSession,
	getPlanningSessionByStackId,
	markPlanningSessionSaved,
	setStackStages,
	setPlanningSessionOpencodeId
} from '$lib/server/stack-store';
import type { FeatureStage, FeatureType, StackMetadata, StackPlanningSession } from '$lib/types/stack';

const PLANNING_SYSTEM_PROMPT = `You are in Planning Mode for software work.
Focus only on planning, scope, sequencing, risks, and validation.
Do not provide implementation code unless explicitly asked.
Use concise, structured responses.
When context is incomplete, ask targeted clarifying questions first.
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

function toConversationMessages(session: StackPlanningSession): OpencodeMessage[] {
	const conversation = session.messages
		.filter(
			(message): message is StackPlanningSession['messages'][number] & { role: 'user' | 'assistant' } =>
				message.role === 'user' || message.role === 'assistant'
		)
		.map((message) => ({
			role: message.role,
			content: message.content
		}));

	return [{ role: 'system', content: PLANNING_SYSTEM_PROMPT }, ...conversation];
}

export function shouldAutoSavePlan(content: string): boolean {
	return /\bsave (the )?plan\b/i.test(content.trim());
}

export async function ensurePlanningSession(
	stackId: string,
	stackContext?: StackMetadata
): Promise<StackPlanningSession> {
	const session = await createOrGetPlanningSession(stackId);

	if (!stackContext || session.messages.length > 0) {
		return session;
	}

	const seededPrompt = buildInitialPlanningPrompt(stackContext);
	const seeded = await sendPlanningMessage(stackId, seededPrompt);

	return seeded.session;
}

export async function sendPlanningMessage(stackId: string, content: string): Promise<{
	session: StackPlanningSession;
	assistantReply: string;
	autoSavedPlanPath?: string;
}> {
	await createOrGetPlanningSession(stackId);
	await appendPlanningMessage(stackId, 'user', content);

	const latestSession = await getPlanningSessionByStackId(stackId);
	if (!latestSession) {
		throw new Error('Planning session not found.');
	}

	const assistantReply =
		getOpencodeApiMode() === 'openai'
			? await requestOpencodeChat(toConversationMessages(latestSession))
			: await sendWithServerSession(latestSession, content);
	const updatedSession = await appendPlanningMessage(stackId, 'assistant', assistantReply);

	if (!shouldAutoSavePlan(content)) {
		return {
			session: updatedSession,
			assistantReply
		};
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
	const session = await getPlanningSessionByStackId(stackId);
	if (!session) {
		throw new Error('Planning session not found.');
	}

	if (session.messages.filter((message) => message.role === 'user').length === 0) {
		throw new Error('Add at least one planning message before saving a plan.');
	}

	const markdownPlan =
		getOpencodeApiMode() === 'openai'
			? await requestOpencodeChat([
					...toConversationMessages(session),
					{ role: 'user', content: SAVE_PLAN_PROMPT }
				])
			: await sendWithServerSession(session, SAVE_PLAN_PROMPT);

	const savedPlanPath = await writeStackPlanFile(stackId, markdownPlan);
	const sessionWithSave = await markPlanningSessionSaved(stackId, savedPlanPath);
	const stages = extractStagesFromPlan(markdownPlan);
	await setStackStages(stackId, stages);

	return {
		session: sessionWithSave,
		savedPlanPath,
		planMarkdown: markdownPlan
	};
}

async function sendWithServerSession(session: StackPlanningSession, content: string): Promise<string> {
	let opencodeSessionId = session.opencodeSessionId;
	if (!opencodeSessionId) {
		opencodeSessionId = await createOpencodeSession();
		await setPlanningSessionOpencodeId(session.stackId, opencodeSessionId);
	}

	return sendOpencodeSessionMessage(opencodeSessionId, content, {
		system: PLANNING_SYSTEM_PROMPT
	});
}
