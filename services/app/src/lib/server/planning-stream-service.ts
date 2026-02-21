import { badRequest, notFound } from '$lib/server/api-errors';
import { parsePlanningMessageBody } from '$lib/server/api-validators';
import {
  getOpencodeSessionRuntimeState,
  streamOpencodeSessionMessage,
  watchOpencodeSession,
} from '$lib/server/opencode';
import {
  getPlanningMessages,
  loadExistingPlanningSession,
  PLANNING_SYSTEM_PROMPT,
  savePlanFromSession,
  shouldAutoSavePlan,
} from '$lib/server/planning-service';
import {
  getStackById,
  touchPlanningSessionUpdatedAt,
} from '$lib/server/stack-store';

const STREAM_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
};

function encodeSse(event: string, data: unknown): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

function isDebugEnabled(): boolean {
  return (
    process.env.OPENCODE_DEBUG === '1' || process.env.OPENCODE_DEBUG === 'true'
  );
}

function debugLog(message: string, details?: unknown): void {
  if (!isDebugEnabled()) {
    return;
  }

  if (details === undefined) {
    console.info(`[planning-stream] ${message}`);
    return;
  }

  console.info(`[planning-stream] ${message}`, details);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown request failure';
}

async function createNoOpWatchResponse(stackId: string): Promise<Response> {
  const messages = await getPlanningMessages(stackId);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encodeSse('done', {
          assistantReply: '',
          messages,
        }),
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: STREAM_HEADERS,
  });
}

async function createPlanningStream(input: {
  stackId: string;
  opencodeSessionId: string;
  content: string;
  watch: boolean;
  autoSave: boolean;
}): Promise<ReadableStream<Uint8Array>> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encodeSse('start', { status: 'thinking' }));
        let assistantReply = '';

        const events = input.watch
          ? watchOpencodeSession(input.opencodeSessionId)
          : streamOpencodeSessionMessage(input.opencodeSessionId, input.content, {
              system: PLANNING_SYSTEM_PROMPT,
            });

        for await (const event of events) {
          if (event.type === 'question') {
            const questionCount = event.question.questions.length;
            const multiCount = event.question.questions.filter(
              (item) => item.multiple === true,
            ).length;
            debugLog('Forwarding question event to client', {
              questionCount,
              multiCount,
            });
            controller.enqueue(encodeSse('question', event.question));
            continue;
          }

          assistantReply += event.chunk;
          controller.enqueue(encodeSse('delta', { chunk: event.chunk }));
        }

        await touchPlanningSessionUpdatedAt(input.stackId);

        let autoSavedPlanPath: string | undefined;
        let autoSavedStageConfigPath: string | undefined;
        if (input.autoSave) {
          const saveResult = await savePlanFromSession(input.stackId);
          autoSavedPlanPath = saveResult.savedPlanPath;
          autoSavedStageConfigPath = saveResult.savedStageConfigPath;
        }

        const messages = await getPlanningMessages(input.stackId);
        controller.enqueue(
          encodeSse('done', {
            assistantReply,
            autoSavedPlanPath,
            autoSavedStageConfigPath,
            messages,
          }),
        );
      } catch (error) {
        console.error('[planning-stream] Stream processing failed', {
          stackId: input.stackId,
          error: toErrorMessage(error),
        });
        controller.enqueue(
          encodeSse('error', { message: toErrorMessage(error) }),
        );
      } finally {
        controller.close();
      }
    },
  });
}

export async function handlePlanningMessageStreamRequest(input: {
  stackId: string;
  request: Request;
}): Promise<Response> {
  const stack = await getStackById(input.stackId);
  if (!stack) {
    throw notFound('Stack not found.');
  }

  const parsedBody = parsePlanningMessageBody(
    (await input.request.json()) as unknown,
  );
  const { session } = await loadExistingPlanningSession(input.stackId);

  if (!session.opencodeSessionId) {
    throw badRequest('Planning session is missing an OpenCode session id.');
  }

  const content = parsedBody.content ?? '';
  const autoSave = !parsedBody.watch && shouldAutoSavePlan(content);
  debugLog('Starting stream request', {
    stackId: input.stackId,
    watch: parsedBody.watch,
    autoSave,
  });

  if (parsedBody.watch) {
    const runtimeState = await getOpencodeSessionRuntimeState(
      session.opencodeSessionId,
    );
    if (runtimeState !== 'busy' && runtimeState !== 'retry') {
      return createNoOpWatchResponse(input.stackId);
    }
  }

  const stream = await createPlanningStream({
    stackId: input.stackId,
    opencodeSessionId: session.opencodeSessionId,
    content,
    watch: parsedBody.watch,
    autoSave,
  });

  return new Response(stream, {
    headers: STREAM_HEADERS,
  });
}
