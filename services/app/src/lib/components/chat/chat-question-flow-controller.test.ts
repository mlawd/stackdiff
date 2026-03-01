import { describe, expect, it } from 'vitest';

import type { PlanningQuestionDialog } from '$lib/types/stack';

import { createChatQuestionFlowController } from './chat-question-flow-controller';

function createDialog(): PlanningQuestionDialog {
  return {
    questions: [
      {
        header: 'Scope',
        question: 'What should we build?',
        options: [{ label: 'CLI', description: 'Command line' }],
        multiple: false,
        allowCustom: true,
      },
      {
        header: 'Priority',
        question: 'Which phases?',
        options: [
          { label: 'Phase 1', description: 'Start small' },
          { label: 'Phase 2', description: 'Expand scope' },
        ],
        multiple: true,
        allowCustom: false,
      },
    ],
  };
}

describe('chat question flow controller', () => {
  it('initializes and resets dialog state', () => {
    let activeQuestionDialog: PlanningQuestionDialog | null = null;
    let activeQuestionRequestId: string | null = null;
    let activeQuestionIndex = 9;
    let questionSelections: Record<number, string[]> = { 0: ['x'] };
    let questionCustomAnswers: Record<number, string> = { 0: 'y' };

    const controller = createChatQuestionFlowController({
      getActiveQuestionDialog: () => activeQuestionDialog,
      setActiveQuestionDialog: (value) => {
        activeQuestionDialog = value;
      },
      setActiveQuestionRequestId: (value) => {
        activeQuestionRequestId = value;
      },
      getActiveQuestionIndex: () => activeQuestionIndex,
      setActiveQuestionIndex: (value) => {
        activeQuestionIndex = value;
      },
      getQuestionSelections: () => questionSelections,
      setQuestionSelections: (value) => {
        questionSelections = value;
      },
      getQuestionCustomAnswers: () => questionCustomAnswers,
      setQuestionCustomAnswers: (value) => {
        questionCustomAnswers = value;
      },
    });

    const dialog = createDialog();
    controller.initializeFromDialog(dialog, 'req-1');

    expect(activeQuestionDialog).toBe(dialog);
    expect(activeQuestionRequestId).toBe('req-1');
    expect(activeQuestionIndex).toBe(0);
    expect(questionSelections).toEqual({ 0: [], 1: [] });
    expect(questionCustomAnswers).toEqual({ 0: '', 1: '' });

    controller.reset();

    expect(activeQuestionDialog).toBeNull();
    expect(activeQuestionRequestId).toBeNull();
    expect(activeQuestionIndex).toBe(0);
    expect(questionSelections).toEqual({});
    expect(questionCustomAnswers).toEqual({});
  });

  it('tracks selection, custom answers, and submit eligibility', () => {
    let activeQuestionDialog: PlanningQuestionDialog | null = createDialog();
    let activeQuestionRequestId: string | null = 'req-1';
    let activeQuestionIndex = 0;
    let questionSelections: Record<number, string[]> = { 0: [], 1: [] };
    let questionCustomAnswers: Record<number, string> = { 0: '', 1: '' };

    const controller = createChatQuestionFlowController({
      getActiveQuestionDialog: () => activeQuestionDialog,
      setActiveQuestionDialog: (value) => {
        activeQuestionDialog = value;
      },
      setActiveQuestionRequestId: (value) => {
        activeQuestionRequestId = value;
      },
      getActiveQuestionIndex: () => activeQuestionIndex,
      setActiveQuestionIndex: (value) => {
        activeQuestionIndex = value;
      },
      getQuestionSelections: () => questionSelections,
      setQuestionSelections: (value) => {
        questionSelections = value;
      },
      getQuestionCustomAnswers: () => questionCustomAnswers,
      setQuestionCustomAnswers: (value) => {
        questionCustomAnswers = value;
      },
    });

    expect(controller.canSubmitQuestionAnswers()).toBe(false);

    controller.setSingleQuestionOption(0, 'CLI');
    expect(controller.canAnswerQuestion(0)).toBe(true);
    expect(questionSelections[0]).toEqual(['CLI']);

    controller.toggleQuestionOption(1, 'Phase 1', true);
    controller.toggleQuestionOption(1, 'Phase 1', true);
    controller.toggleQuestionOption(1, 'Phase 2', true);
    expect(questionSelections[1]).toEqual(['Phase 1', 'Phase 2']);
    expect(controller.canSubmitQuestionAnswers()).toBe(true);

    controller.toggleQuestionOption(1, 'Phase 1', false);
    expect(questionSelections[1]).toEqual(['Phase 2']);

    controller.setQuestionCustomAnswer(0, 'Custom answer');
    expect(questionSelections[0]).toEqual([]);
    expect(controller.canAnswerQuestion(0)).toBe(true);

    const toolAnswers = controller.buildToolQuestionAnswers();
    expect(toolAnswers).toEqual([['Custom answer'], ['Phase 2']]);

    const optimistic = controller.buildOptimisticQuestionAnswerMessage(
      activeQuestionDialog!,
    );
    expect(JSON.parse(optimistic)).toEqual({
      type: 'question_answer',
      answers: [
        {
          header: 'Scope',
          question: 'What should we build?',
          selected: [],
          customAnswer: 'Custom answer',
        },
        {
          header: 'Priority',
          question: 'Which phases?',
          selected: ['Phase 2'],
        },
      ],
    });

    expect(activeQuestionRequestId).toBe('req-1');
  });

  it('moves between questions within bounds', () => {
    let activeQuestionDialog: PlanningQuestionDialog | null = createDialog();
    let activeQuestionIndex = 0;
    let questionSelections: Record<number, string[]> = { 0: [], 1: [] };
    let questionCustomAnswers: Record<number, string> = { 0: '', 1: '' };

    const controller = createChatQuestionFlowController({
      getActiveQuestionDialog: () => activeQuestionDialog,
      setActiveQuestionDialog: (value) => {
        activeQuestionDialog = value;
      },
      setActiveQuestionRequestId: () => {},
      getActiveQuestionIndex: () => activeQuestionIndex,
      setActiveQuestionIndex: (value) => {
        activeQuestionIndex = value;
      },
      getQuestionSelections: () => questionSelections,
      setQuestionSelections: (value) => {
        questionSelections = value;
      },
      getQuestionCustomAnswers: () => questionCustomAnswers,
      setQuestionCustomAnswers: (value) => {
        questionCustomAnswers = value;
      },
    });

    controller.goToNextQuestion();
    expect(activeQuestionIndex).toBe(0);

    controller.setSingleQuestionOption(0, 'CLI');
    controller.goToNextQuestion();
    expect(activeQuestionIndex).toBe(1);

    controller.goToNextQuestion();
    expect(activeQuestionIndex).toBe(1);

    controller.goToPreviousQuestion();
    controller.goToPreviousQuestion();
    expect(activeQuestionIndex).toBe(0);
  });
});
