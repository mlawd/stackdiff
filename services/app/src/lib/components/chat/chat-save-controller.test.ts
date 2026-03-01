import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PlanningMessage } from '$lib/types/stack';

import { createChatSaveController } from './chat-save-controller';

describe('chat save controller', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips save when no save url is provided', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const controller = createChatSaveController({
      getSaveUrl: () => undefined,
      getFormatSaveSuccess: undefined,
      getOnSaveResponse: undefined,
      setMessages: vi.fn(),
      setSaving: vi.fn(),
      setErrorMessage: vi.fn(),
      setSuccessMessage: vi.fn(),
    });

    await controller.saveConversation();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('saves conversation and applies callbacks', async () => {
    const messages: PlanningMessage[] = [
      {
        id: '1',
        role: 'assistant',
        content: 'Saved',
        createdAt: new Date().toISOString(),
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          messages,
          savedPath: '/tmp/path',
        },
      }),
    } as Response);

    let saving = false;
    let successMessage: string | null = null;
    let errorMessage: string | null = null;
    let savedMessages: PlanningMessage[] = [];
    const onSaveResponse = vi.fn();

    const controller = createChatSaveController({
      getSaveUrl: () => '/api/save',
      getFormatSaveSuccess: () => () => 'Saved with format',
      getOnSaveResponse: () => onSaveResponse,
      setMessages: (value) => {
        savedMessages = value;
      },
      setSaving: (value) => {
        saving = value;
      },
      setErrorMessage: (value) => {
        errorMessage = value;
      },
      setSuccessMessage: (value) => {
        successMessage = value;
      },
    });

    await controller.saveConversation();

    expect(saving).toBe(false);
    expect(errorMessage).toBeNull();
    expect(savedMessages).toEqual(messages);
    expect(onSaveResponse).toHaveBeenCalledWith(
      expect.objectContaining({ messages }),
    );
    expect(successMessage).toBe('Saved with format');
  });

  it('reports save errors from api responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'Cannot save' } }),
    } as Response);

    let errorMessage: string | null = null;

    const controller = createChatSaveController({
      getSaveUrl: () => '/api/save',
      getFormatSaveSuccess: undefined,
      getOnSaveResponse: undefined,
      setMessages: vi.fn(),
      setSaving: vi.fn(),
      setErrorMessage: (value) => {
        errorMessage = value;
      },
      setSuccessMessage: vi.fn(),
    });

    await controller.saveConversation();
    expect(errorMessage).toBe('Cannot save');
  });
});
