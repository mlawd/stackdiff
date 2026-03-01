import type { PlanningQuestionDialog } from '$lib/types/stack';

export interface ChatQuestionFlowController {
  reset: () => void;
  initializeFromDialog: (
    dialog: PlanningQuestionDialog,
    requestId: string | null,
  ) => void;
  setSingleQuestionOption: (questionIndex: number, optionLabel: string) => void;
  toggleQuestionOption: (
    questionIndex: number,
    optionLabel: string,
    checked: boolean,
  ) => void;
  setQuestionCustomAnswer: (questionIndex: number, value: string) => void;
  canAnswerQuestion: (questionIndex: number) => boolean;
  canSubmitQuestionAnswers: () => boolean;
  goToPreviousQuestion: () => void;
  goToNextQuestion: () => void;
  buildToolQuestionAnswers: () => string[][];
  buildOptimisticQuestionAnswerMessage: (
    dialog: PlanningQuestionDialog,
  ) => string;
}

export function createChatQuestionFlowController(input: {
  getActiveQuestionDialog: () => PlanningQuestionDialog | null;
  setActiveQuestionDialog: (value: PlanningQuestionDialog | null) => void;
  setActiveQuestionRequestId: (value: string | null) => void;
  getActiveQuestionIndex: () => number;
  setActiveQuestionIndex: (value: number) => void;
  getQuestionSelections: () => Record<number, string[]>;
  setQuestionSelections: (value: Record<number, string[]>) => void;
  getQuestionCustomAnswers: () => Record<number, string>;
  setQuestionCustomAnswers: (value: Record<number, string>) => void;
}): ChatQuestionFlowController {
  function initializeQuestionResponses(dialog: PlanningQuestionDialog): void {
    const nextSelections: Record<number, string[]> = {};
    const nextCustomAnswers: Record<number, string> = {};

    dialog.questions.forEach((_item, index) => {
      nextSelections[index] = [];
      nextCustomAnswers[index] = '';
    });

    input.setActiveQuestionIndex(0);
    input.setQuestionSelections(nextSelections);
    input.setQuestionCustomAnswers(nextCustomAnswers);
  }

  function reset(): void {
    input.setActiveQuestionDialog(null);
    input.setActiveQuestionRequestId(null);
    input.setActiveQuestionIndex(0);
    input.setQuestionSelections({});
    input.setQuestionCustomAnswers({});
  }

  function initializeFromDialog(
    dialog: PlanningQuestionDialog,
    requestId: string | null,
  ): void {
    input.setActiveQuestionDialog(dialog);
    input.setActiveQuestionRequestId(requestId);
    initializeQuestionResponses(dialog);
  }

  function setSingleQuestionOption(
    questionIndex: number,
    optionLabel: string,
  ): void {
    input.setQuestionSelections({
      ...input.getQuestionSelections(),
      [questionIndex]: [optionLabel],
    });

    input.setQuestionCustomAnswers({
      ...input.getQuestionCustomAnswers(),
      [questionIndex]: '',
    });
  }

  function toggleQuestionOption(
    questionIndex: number,
    optionLabel: string,
    checked: boolean,
  ): void {
    const selected = input.getQuestionSelections()[questionIndex] ?? [];
    if (checked) {
      input.setQuestionSelections({
        ...input.getQuestionSelections(),
        [questionIndex]: selected.includes(optionLabel)
          ? selected
          : [...selected, optionLabel],
      });
      return;
    }

    input.setQuestionSelections({
      ...input.getQuestionSelections(),
      [questionIndex]: selected.filter((value) => value !== optionLabel),
    });
  }

  function setQuestionCustomAnswer(questionIndex: number, value: string): void {
    input.setQuestionCustomAnswers({
      ...input.getQuestionCustomAnswers(),
      [questionIndex]: value,
    });

    if (value.trim().length > 0) {
      input.setQuestionSelections({
        ...input.getQuestionSelections(),
        [questionIndex]: [],
      });
    }
  }

  function canAnswerQuestion(questionIndex: number): boolean {
    const selected = (
      input.getQuestionSelections()[questionIndex] ?? []
    ).filter((value) => value.trim().length > 0);
    const customAnswer = (
      input.getQuestionCustomAnswers()[questionIndex] ?? ''
    ).trim();
    return selected.length > 0 || customAnswer.length > 0;
  }

  function canSubmitQuestionAnswers(): boolean {
    const activeQuestionDialog = input.getActiveQuestionDialog();
    if (!activeQuestionDialog) {
      return false;
    }

    return activeQuestionDialog.questions.every((_item, index) => {
      return canAnswerQuestion(index);
    });
  }

  function goToPreviousQuestion(): void {
    input.setActiveQuestionIndex(
      Math.max(0, input.getActiveQuestionIndex() - 1),
    );
  }

  function goToNextQuestion(): void {
    const activeQuestionDialog = input.getActiveQuestionDialog();
    const activeQuestionIndex = input.getActiveQuestionIndex();
    if (!activeQuestionDialog || !canAnswerQuestion(activeQuestionIndex)) {
      return;
    }

    input.setActiveQuestionIndex(
      Math.min(
        activeQuestionDialog.questions.length - 1,
        activeQuestionIndex + 1,
      ),
    );
  }

  function buildToolQuestionAnswers(): string[][] {
    const activeQuestionDialog = input.getActiveQuestionDialog();
    if (!activeQuestionDialog) {
      return [];
    }

    return activeQuestionDialog.questions.map((_item, index) => {
      const selected = input.getQuestionSelections()[index] ?? [];
      const customAnswer = (
        input.getQuestionCustomAnswers()[index] ?? ''
      ).trim();
      return customAnswer.length > 0 ? [...selected, customAnswer] : selected;
    });
  }

  function buildOptimisticQuestionAnswerMessage(
    dialog: PlanningQuestionDialog,
  ): string {
    const answers = dialog.questions.map((question, index) => {
      const selected = (input.getQuestionSelections()[index] ?? []).filter(
        (value) => value.trim().length > 0,
      );
      const customAnswer = (
        input.getQuestionCustomAnswers()[index] ?? ''
      ).trim();

      return {
        header: question.header,
        question: question.question,
        selected,
        customAnswer: customAnswer.length > 0 ? customAnswer : undefined,
      };
    });

    return JSON.stringify({
      type: 'question_answer',
      answers,
    });
  }

  return {
    reset,
    initializeFromDialog,
    setSingleQuestionOption,
    toggleQuestionOption,
    setQuestionCustomAnswer,
    canAnswerQuestion,
    canSubmitQuestionAnswers,
    goToPreviousQuestion,
    goToNextQuestion,
    buildToolQuestionAnswers,
    buildOptimisticQuestionAnswerMessage,
  };
}
