import type {
  PlanningMessage,
  PlanningQuestionDialog,
  PlanningQuestionItem,
  PlanningQuestionOption,
} from '$lib/types/stack';

import type { QuestionAnswerItem, StageSummaryItem } from './chat-types';

export const SAVE_PLAN_PROMPT_PREFIX =
  'Create a detailed implementation plan and stages config from this conversation.';

function normalizeQuestionOption(
  option: unknown,
): PlanningQuestionOption | null {
  if (typeof option === 'string') {
    const label = option.trim();
    if (!label) {
      return null;
    }

    return { label };
  }

  if (typeof option !== 'object' || option === null) {
    return null;
  }

  const candidate = option as {
    label?: unknown;
    text?: unknown;
    value?: unknown;
    description?: unknown;
  };

  const label =
    typeof candidate.label === 'string'
      ? candidate.label.trim()
      : typeof candidate.text === 'string'
        ? candidate.text.trim()
        : typeof candidate.value === 'string'
          ? candidate.value.trim()
          : '';

  if (!label) {
    return null;
  }

  const description =
    typeof candidate.description === 'string' &&
    candidate.description.trim().length > 0
      ? candidate.description.trim()
      : undefined;

  return { label, description };
}

function normalizeQuestionItem(item: unknown): PlanningQuestionItem | null {
  if (typeof item !== 'object' || item === null) {
    return null;
  }

  const candidate = item as {
    header?: unknown;
    title?: unknown;
    question?: unknown;
    prompt?: unknown;
    text?: unknown;
    label?: unknown;
    options?: unknown;
    choices?: unknown;
    multiple?: unknown;
    allowCustom?: unknown;
    custom?: unknown;
  };

  const header =
    typeof candidate.header === 'string' && candidate.header.trim().length > 0
      ? candidate.header.trim()
      : typeof candidate.title === 'string' && candidate.title.trim().length > 0
        ? candidate.title.trim()
        : 'Question';

  const question =
    typeof candidate.question === 'string'
      ? candidate.question.trim()
      : typeof candidate.prompt === 'string'
        ? candidate.prompt.trim()
        : typeof candidate.text === 'string'
          ? candidate.text.trim()
          : typeof candidate.label === 'string'
            ? candidate.label.trim()
            : '';

  const optionsRaw = Array.isArray(candidate.options)
    ? candidate.options
    : Array.isArray(candidate.choices)
      ? candidate.choices
      : [];

  const options = optionsRaw
    .map((option) => normalizeQuestionOption(option))
    .filter((option): option is PlanningQuestionOption => option !== null);

  const allowCustom =
    candidate.allowCustom === true ||
    candidate.custom === true ||
    (candidate.allowCustom === undefined &&
      candidate.custom === undefined &&
      options.length === 0);

  if (!question || (options.length === 0 && !allowCustom)) {
    return null;
  }

  return {
    header,
    question,
    options,
    multiple: candidate.multiple === true,
    allowCustom,
  };
}

export function normalizeQuestionDialog(
  payload: unknown,
): PlanningQuestionDialog | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const candidate = payload as {
    questions?: unknown;
    question?: unknown;
    prompt?: unknown;
    options?: unknown;
    choices?: unknown;
  };

  if (Array.isArray(candidate.questions)) {
    const questions = candidate.questions
      .map((item) => normalizeQuestionItem(item))
      .filter((item): item is PlanningQuestionItem => item !== null);

    if (questions.length > 0) {
      return { questions };
    }
  }

  if (
    candidate.question ||
    candidate.prompt ||
    candidate.options ||
    candidate.choices
  ) {
    const fallback = normalizeQuestionItem(payload);
    if (fallback) {
      return {
        questions: [fallback],
      };
    }

    const nested = normalizeQuestionItem(candidate.question);
    if (nested) {
      return {
        questions: [nested],
      };
    }
  }

  return null;
}

export function parseQuestionDialogMessage(
  content: string,
): PlanningQuestionDialog | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return normalizeQuestionDialog(parsed);
  } catch {
    return null;
  }
}

export function parseQuestionAnswerMessage(
  content: string,
): QuestionAnswerItem[] | null {
  const trimmed = content.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }

  const fromArrayAnswers = (answers: unknown): QuestionAnswerItem[] => {
    if (!Array.isArray(answers)) {
      return [];
    }

    return answers
      .map((answer, index) => {
        if (Array.isArray(answer)) {
          const selected = answer
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter((value) => value.length > 0);
          return selected.length > 0
            ? {
                question: `Question ${index + 1}`,
                selected,
              }
            : null;
        }

        if (typeof answer !== 'object' || answer === null) {
          return null;
        }

        const candidate = answer as {
          header?: unknown;
          question?: unknown;
          selected?: unknown;
          customAnswer?: unknown;
        };

        const question =
          typeof candidate.question === 'string' &&
          candidate.question.trim().length > 0
            ? candidate.question.trim()
            : typeof candidate.header === 'string' &&
                candidate.header.trim().length > 0
              ? candidate.header.trim()
              : `Question ${index + 1}`;

        const selected = Array.isArray(candidate.selected)
          ? candidate.selected
              .map((value) => (typeof value === 'string' ? value.trim() : ''))
              .filter((value) => value.length > 0)
          : [];

        const customAnswer =
          typeof candidate.customAnswer === 'string' &&
          candidate.customAnswer.trim().length > 0
            ? candidate.customAnswer.trim()
            : undefined;

        if (selected.length === 0 && !customAnswer) {
          return null;
        }

        return {
          question,
          selected,
          customAnswer,
        };
      })
      .filter((item): item is QuestionAnswerItem => item !== null);
  };

  if (Array.isArray(parsed)) {
    const answers = fromArrayAnswers(parsed);
    return answers.length > 0 ? answers : null;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const candidate = parsed as { type?: unknown; answers?: unknown };
  if (
    candidate.type === 'question_answer' ||
    Array.isArray(candidate.answers)
  ) {
    const answers = fromArrayAnswers(candidate.answers);
    return answers.length > 0 ? answers : null;
  }

  return null;
}

export function findPreviousQuestionDialog(
  history: PlanningMessage[],
  beforeIndex: number,
): PlanningQuestionDialog | null {
  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message.role === 'user') {
      continue;
    }

    const dialog = parseQuestionDialogMessage(message.content);
    if (dialog) {
      return dialog;
    }
  }

  return null;
}

export function parseStageSummary(content: string): StageSummaryItem[] | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const candidate = parsed as {
    stages?: unknown;
  };

  if (!Array.isArray(candidate.stages)) {
    return null;
  }

  const stages = candidate.stages
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null) {
        return null;
      }

      const stage = entry as {
        stageName?: unknown;
        name?: unknown;
        title?: unknown;
        stageDescription?: unknown;
        description?: unknown;
        details?: unknown;
      };

      const stageName =
        typeof stage.stageName === 'string'
          ? stage.stageName.trim()
          : typeof stage.name === 'string'
            ? stage.name.trim()
            : typeof stage.title === 'string'
              ? stage.title.trim()
              : '';

      const stageDescription =
        typeof stage.stageDescription === 'string'
          ? stage.stageDescription.trim()
          : typeof stage.description === 'string'
            ? stage.description.trim()
            : typeof stage.details === 'string'
              ? stage.details.trim()
              : '';

      if (!stageName || !stageDescription) {
        return null;
      }

      return { stageName, stageDescription };
    })
    .filter((item): item is StageSummaryItem => item !== null);

  return stages.length > 0 ? stages : null;
}

export function isJsonObjectOrArray(content: string): boolean {
  const trimmed = content.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
    return false;
  }

  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

export function getDisplayMessageContent(message: PlanningMessage): string {
  if (
    message.role === 'user' &&
    message.content.startsWith(SAVE_PLAN_PROMPT_PREFIX) &&
    message.content.includes('Return ONLY valid JSON')
  ) {
    return 'Save plan';
  }

  return message.content;
}

export function isSavePlanPromptMessage(message: PlanningMessage): boolean {
  return getDisplayMessageContent(message) === 'Save plan';
}
