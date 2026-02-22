import { badRequest, notFound } from '$lib/server/api-errors';
import { parsePlanningMessageBody } from '$lib/server/api-validators';
import {
  getOpencodeSessionMessages,
  getOpencodeSessionRuntimeState,
  listPendingOpencodeSessionQuestions,
  replyOpencodeQuestion,
  streamOpencodeSessionMessage,
  watchOpencodeSession,
} from '$lib/server/opencode';
import {
  getExistingStageReviewSession,
  REVIEW_SYSTEM_PROMPT,
} from '$lib/server/stage-review-service';
import {
  getStackById,
  touchReviewSessionUpdatedAt,
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

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown request failure';
}

async function createNoOpWatchResponse(input: {
  sessionId: string;
  worktreeAbsolutePath: string;
}): Promise<Response> {
  const messages = await getOpencodeSessionMessages(input.sessionId, {
    directory: input.worktreeAbsolutePath,
  });
  const pendingQuestions = await listPendingOpencodeSessionQuestions(
    input.sessionId,
    {
      directory: input.worktreeAbsolutePath,
    },
  );
  const firstPendingQuestion = pendingQuestions[0];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (firstPendingQuestion) {
        controller.enqueue(
          encodeSse('question', {
            ...firstPendingQuestion.question,
            requestId: firstPendingQuestion.requestId,
            source: 'tool',
          }),
        );
      }
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

async function createReviewStream(input: {
  stackId: string;
  stageId: string;
  sessionId: string;
  worktreeAbsolutePath: string;
  content?: string;
  questionReply?: {
    requestId: string;
    answers: string[][];
  };
  watch: boolean;
}): Promise<ReadableStream<Uint8Array>> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encodeSse('start', { status: 'thinking' }));
        let assistantReply = '';

        if (input.questionReply) {
          await replyOpencodeQuestion(
            input.questionReply.requestId,
            input.questionReply.answers,
            {
              directory: input.worktreeAbsolutePath,
            },
          );
        }

        const events =
          input.watch || input.questionReply
            ? watchOpencodeSession(input.sessionId, {
                directory: input.worktreeAbsolutePath,
              })
            : streamOpencodeSessionMessage(
                input.sessionId,
                input.content ?? '',
                {
                  system: REVIEW_SYSTEM_PROMPT,
                  directory: input.worktreeAbsolutePath,
                  agent: 'build',
                },
              );

        for await (const event of events) {
          if (event.type === 'question') {
            controller.enqueue(
              encodeSse('question', {
                ...event.question,
                requestId: event.requestId,
                source: event.source,
              }),
            );
            await touchReviewSessionUpdatedAt(input.stackId, input.stageId);
            const messages = await getOpencodeSessionMessages(input.sessionId, {
              directory: input.worktreeAbsolutePath,
            });
            controller.enqueue(
              encodeSse('done', {
                assistantReply,
                messages,
              }),
            );
            return;
          }

          assistantReply += event.chunk;
          controller.enqueue(encodeSse('delta', { chunk: event.chunk }));
        }

        await touchReviewSessionUpdatedAt(input.stackId, input.stageId);
        const messages = await getOpencodeSessionMessages(input.sessionId, {
          directory: input.worktreeAbsolutePath,
        });
        controller.enqueue(
          encodeSse('done', {
            assistantReply,
            messages,
          }),
        );
      } catch (error) {
        console.error('[review-stream] Stream processing failed', {
          stackId: input.stackId,
          stageId: input.stageId,
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

export async function handleStageReviewMessageStreamRequest(input: {
  stackId: string;
  stageId: string;
  request: Request;
}): Promise<Response> {
  const stack = await getStackById(input.stackId);
  if (!stack) {
    throw notFound('Stack not found.');
  }

  const stage = (stack.stages ?? []).find((item) => item.id === input.stageId);
  if (!stage) {
    throw notFound('Stage not found.');
  }

  const parsedBody = parsePlanningMessageBody(
    (await input.request.json()) as unknown,
  );
  const { session, worktreeAbsolutePath } = await getExistingStageReviewSession(
    {
      stackId: input.stackId,
      stageId: input.stageId,
    },
  );

  if (!session.opencodeSessionId) {
    throw badRequest('Review session is missing an OpenCode session id.');
  }

  if (parsedBody.watch) {
    const runtimeState = await getOpencodeSessionRuntimeState(
      session.opencodeSessionId,
      {
        directory: worktreeAbsolutePath,
      },
    );
    if (runtimeState !== 'busy' && runtimeState !== 'retry') {
      return createNoOpWatchResponse({
        sessionId: session.opencodeSessionId,
        worktreeAbsolutePath,
      });
    }
  }

  const stream = await createReviewStream({
    stackId: input.stackId,
    stageId: input.stageId,
    sessionId: session.opencodeSessionId,
    worktreeAbsolutePath,
    content: parsedBody.content ?? '',
    questionReply: parsedBody.questionReply,
    watch: parsedBody.watch,
  });

  return new Response(stream, {
    headers: STREAM_HEADERS,
  });
}
