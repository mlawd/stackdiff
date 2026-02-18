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
	setPlanningSessionOpencodeId
} from '$lib/server/stack-store';
import type { StackPlanningSession } from '$lib/types/stack';

const PLANNING_SYSTEM_PROMPT =
	'You are a pragmatic software planning partner. Ask clarifying questions when needed, identify risks, and help shape an implementation plan iteratively.';

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

export async function ensurePlanningSession(stackId: string): Promise<StackPlanningSession> {
	return createOrGetPlanningSession(stackId);
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
