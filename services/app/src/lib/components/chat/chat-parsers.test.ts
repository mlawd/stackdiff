import { describe, expect, it } from 'vitest';

import type { PlanningMessage } from '$lib/types/stack';

import {
  findPreviousQuestionDialog,
  getDisplayMessageContent,
  isJsonObjectOrArray,
  isSavePlanPromptMessage,
  parseQuestionAnswerMessage,
  parseQuestionDialogMessage,
  parseStageSummary,
  SAVE_PLAN_PROMPT_PREFIX,
} from './chat-parsers';

describe('chat parsers', () => {
  it('parses question dialogs from normalized json payloads', () => {
    const dialog = parseQuestionDialogMessage(
      JSON.stringify({
        questions: [
          {
            header: 'Scope',
            question: 'What should we do?',
            options: ['A', 'B'],
            multiple: true,
          },
        ],
      }),
    );

    expect(dialog?.questions).toHaveLength(1);
    expect(dialog?.questions[0]?.header).toBe('Scope');
    expect(dialog?.questions[0]?.options.map((option) => option.label)).toEqual(
      ['A', 'B'],
    );
  });

  it('parses question answers from object envelopes', () => {
    const answers = parseQuestionAnswerMessage(
      JSON.stringify({
        type: 'question_answer',
        answers: [
          {
            header: 'Scope',
            question: 'What should we do?',
            selected: ['A'],
            customAnswer: 'Custom',
          },
        ],
      }),
    );

    expect(answers).toEqual([
      {
        question: 'What should we do?',
        selected: ['A'],
        customAnswer: 'Custom',
      },
    ]);
  });

  it('finds the previous assistant question dialog for answer messages', () => {
    const history: PlanningMessage[] = [
      {
        id: '1',
        role: 'assistant',
        content: JSON.stringify({
          questions: [
            {
              header: 'Scope',
              question: 'What should we do?',
              options: ['A'],
            },
          ],
        }),
        createdAt: new Date().toISOString(),
      },
      {
        id: '2',
        role: 'user',
        content: JSON.stringify({
          type: 'question_answer',
          answers: [{ selected: ['A'] }],
        }),
        createdAt: new Date().toISOString(),
      },
    ];

    const dialog = findPreviousQuestionDialog(history, 1);
    expect(dialog?.questions[0]?.header).toBe('Scope');
  });

  it('parses stage summary payloads', () => {
    const summary = parseStageSummary(
      JSON.stringify({
        stages: [
          {
            stageName: 'Plan',
            stageDescription: 'Define milestones',
          },
        ],
      }),
    );

    expect(summary).toEqual([
      {
        stageName: 'Plan',
        stageDescription: 'Define milestones',
      },
    ]);
  });

  it('normalizes save plan prompt messages for display', () => {
    const message: PlanningMessage = {
      id: 'save-1',
      role: 'user',
      content: `${SAVE_PLAN_PROMPT_PREFIX} Return ONLY valid JSON`,
      createdAt: new Date().toISOString(),
    };

    expect(getDisplayMessageContent(message)).toBe('Save plan');
    expect(isSavePlanPromptMessage(message)).toBe(true);
  });

  it('detects json object and array payload strings', () => {
    expect(isJsonObjectOrArray('{"ok":true}')).toBe(true);
    expect(isJsonObjectOrArray('["ok"]')).toBe(true);
    expect(isJsonObjectOrArray('not json')).toBe(false);
  });
});
