import { json, type RequestHandler } from '@sveltejs/kit';

import {
  getOpencodeSessionRuntimeState,
  streamOpencodeSessionMessage,
  watchOpencodeSession,
} from '$lib/server/opencode';
import {
  PLANNING_SYSTEM_PROMPT,
  loadExistingPlanningSession,
  getPlanningMessages,
  savePlanFromSession,
  shouldAutoSavePlan,
} from '$lib/server/planning-service';
import {
  getStackById,
  touchPlanningSessionUpdatedAt,
} from '$lib/server/stack-store';

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown request failure';
}

function parseBody(body: unknown): { content?: string; watch: boolean } {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Invalid request body.');
  }

  const candidate = body as { content?: unknown; watch?: unknown };
  const watch = candidate.watch === true;
  if (watch) {
    return { watch: true };
  }

  const content = String(candidate.content ?? '').trim();

  if (!content) {
    throw new Error('Message content is required.');
  }

  return { content, watch: false };
}

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

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const stackId = params.id;
    if (!stackId) {
      return json({ error: 'Feature id is required.' }, { status: 400 });
    }

    const stack = await getStackById(stackId);
    if (!stack) {
      return json({ error: 'Feature not found.' }, { status: 404 });
    }

    const body = (await request.json()) as unknown;
    const parsed = parseBody(body);
    const { session } = await loadExistingPlanningSession(stackId);

    if (!session.opencodeSessionId) {
      throw new Error('Planning session is missing an OpenCode session id.');
    }

    const content = parsed.content ?? '';
    debugLog('Starting stream request', {
      stackId,
      watch: parsed.watch,
      autoSave: shouldAutoSavePlan(content),
    });

    const autoSave = !parsed.watch && shouldAutoSavePlan(content);
    if (parsed.watch) {
      const runtimeState = await getOpencodeSessionRuntimeState(
        session.opencodeSessionId as string,
      );
      if (runtimeState !== 'busy' && runtimeState !== 'retry') {
        const messages = await getPlanningMessages(stackId);
        const noOpStream = new ReadableStream<Uint8Array>({
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

        return new Response(noOpStream, {
          headers: {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache, no-transform',
            connection: 'keep-alive',
          },
        });
      }
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          controller.enqueue(encodeSse('start', { status: 'thinking' }));
          let assistantReply = '';

          const streamEvents = parsed.watch
            ? watchOpencodeSession(session.opencodeSessionId as string)
            : streamOpencodeSessionMessage(
                session.opencodeSessionId as string,
                content,
                {
                  system: PLANNING_SYSTEM_PROMPT,
                },
              );

          for await (const event of streamEvents) {
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

          await touchPlanningSessionUpdatedAt(stackId);

          let autoSavedPlanPath: string | undefined;
          let autoSavedStageConfigPath: string | undefined;
          if (autoSave) {
            const saveResult = await savePlanFromSession(stackId);
            autoSavedPlanPath = saveResult.savedPlanPath;
            autoSavedStageConfigPath = saveResult.savedStageConfigPath;
          }

          const messages = await getPlanningMessages(stackId);
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
            stackId,
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

    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[planning-stream] Request failed', {
      stackId: params.id,
      error: toErrorMessage(error),
    });
    return json({ error: toErrorMessage(error) }, { status: 400 });
  }
};
