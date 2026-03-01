import type { PlanningMessage } from '$lib/types/stack';

import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  SaveResponseBody,
} from '$lib/components/chat/chat-types';

export interface ChatSaveController {
  saveConversation: () => Promise<void>;
}

export function createChatSaveController(input: {
  getSaveUrl: () => string | undefined;
  getFormatSaveSuccess:
    | (() => ((payload: SaveResponseBody) => string | null) | undefined)
    | undefined;
  getOnSaveResponse:
    | (() => ((payload: SaveResponseBody) => void) | undefined)
    | undefined;
  setMessages: (value: PlanningMessage[]) => void;
  setSaving: (value: boolean) => void;
  setErrorMessage: (value: string | null) => void;
  setSuccessMessage: (value: string | null) => void;
}): ChatSaveController {
  async function saveConversation(): Promise<void> {
    const saveUrl = input.getSaveUrl();
    if (!saveUrl) {
      return;
    }

    input.setSaving(true);
    input.setErrorMessage(null);
    input.setSuccessMessage(null);

    try {
      const response = await fetch(saveUrl, {
        method: 'POST',
      });
      const body = (await response.json()) as
        | ApiSuccessEnvelope<SaveResponseBody>
        | ApiErrorEnvelope;

      if (!response.ok) {
        throw new Error(
          (body as ApiErrorEnvelope).error?.message ?? 'Unable to save.',
        );
      }

      const payload = (body as ApiSuccessEnvelope<SaveResponseBody>).data;
      if (!payload) {
        throw new Error('Unable to save.');
      }

      if (payload.messages && payload.messages.length > 0) {
        input.setMessages(payload.messages);
      }

      const onSaveResponse = input.getOnSaveResponse?.();
      if (onSaveResponse) {
        onSaveResponse(payload);
      }

      const formatSaveSuccess = input.getFormatSaveSuccess?.();
      if (formatSaveSuccess) {
        const saveSuccessMessage = formatSaveSuccess(payload);
        if (saveSuccessMessage) {
          input.setSuccessMessage(saveSuccessMessage);
        }
      } else {
        input.setSuccessMessage('Saved.');
      }
    } catch (error) {
      input.setErrorMessage(
        error instanceof Error ? error.message : 'Unable to save.',
      );
    } finally {
      input.setSaving(false);
    }
  }

  return {
    saveConversation,
  };
}
