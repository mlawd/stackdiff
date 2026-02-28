<script lang="ts">
  import { BrainSolid, UserCircleSolid } from 'flowbite-svelte-icons';

  import { renderMarkdown } from '$lib/markdown';
  import type { PlanningMessage } from '$lib/types/stack';

  import {
    findPreviousQuestionDialog,
    getDisplayMessageContent,
    isJsonObjectOrArray,
    isSavePlanPromptMessage,
    parseQuestionAnswerMessage,
    parseQuestionDialogMessage,
    parseStageSummary,
  } from './chat-parsers';

  interface Props {
    message: PlanningMessage;
    messageIndex: number;
    messages: PlanningMessage[];
  }

  let { message, messageIndex, messages }: Props = $props();

  const messageQuestionDialog = $derived(
    message.role !== 'user'
      ? parseQuestionDialogMessage(message.content)
      : null,
  );
  const messageQuestionAnswers = $derived(
    message.role !== 'assistant'
      ? parseQuestionAnswerMessage(message.content)
      : null,
  );
  const answeredQuestionDialog = $derived(
    messageQuestionAnswers
      ? findPreviousQuestionDialog(messages, messageIndex)
      : null,
  );
  const messageStageSummary = $derived(
    message.role === 'assistant' ? parseStageSummary(message.content) : null,
  );
  const renderAsUserBubble = $derived(
    message.role === 'user' || Boolean(messageQuestionAnswers),
  );
  const hideRawToolPayload = $derived(
    (message.role === 'tool' || message.role === 'system') &&
      !messageQuestionDialog &&
      !messageQuestionAnswers &&
      !messageStageSummary &&
      isJsonObjectOrArray(message.content),
  );
</script>

{#if !hideRawToolPayload}
  <div class="stacked-chat-font flex items-start gap-2">
    {#if renderAsUserBubble}
      <UserCircleSolid class="mt-0.5 h-8 w-8 shrink-0 opacity-80" />
    {:else}
      <BrainSolid class="mt-0.5 h-8 w-8 shrink-0 opacity-80" />
    {/if}
    <div
      class={`w-fit max-w-[90%] rounded-2xl border px-4 py-3 text-sm ${
        renderAsUserBubble
          ? 'mr-auto rounded-tl-none border-[var(--stacked-accent)] bg-blue-500/20 text-blue-50'
          : 'mr-auto rounded-tl-none border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] text-[var(--stacked-text)]'
      }`}
    >
      <p class="mb-1 text-[11px] uppercase tracking-wide opacity-70">
        <span
          >{renderAsUserBubble
            ? 'user'
            : message.role === 'assistant'
              ? 'agent'
              : message.role === 'tool'
                ? 'tool'
                : message.role}</span
        >
      </p>
      {#if messageQuestionDialog}
        <div class="space-y-2">
          <p class="stacked-subtle text-xs uppercase tracking-wide">
            Questions asked
          </p>
          {#each messageQuestionDialog.questions as question, questionIndex (`${question.header}-${questionIndex}`)}
            <div
              class="rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg)]/40 p-3"
            >
              <p
                class="text-xs font-semibold uppercase tracking-wide opacity-70"
              >
                {question.header}
              </p>
              <p class="mt-1 text-sm">{question.question}</p>
              {#if question.options.length > 0}
                <ul class="mt-2 space-y-1 text-sm">
                  {#each question.options as option, optionIndex (`${option.label}-${optionIndex}`)}
                    <li class="stacked-subtle">
                      - {option.label}
                      {#if option.description}
                        <span class="opacity-80">({option.description})</span>
                      {/if}
                    </li>
                  {/each}
                </ul>
              {/if}
              {#if question.allowCustom}
                <p class="mt-2 text-xs stacked-subtle">
                  Includes custom answer input.
                </p>
              {/if}
            </div>
          {/each}
        </div>
      {:else if messageQuestionAnswers}
        <div class="space-y-2">
          <p class="stacked-subtle text-xs uppercase tracking-wide">
            Answers given
          </p>
          {#each messageQuestionAnswers as answer, answerIndex (`${answer.question}-${answerIndex}`)}
            {@const matchedQuestion =
              answeredQuestionDialog?.questions[answerIndex]}
            {@const answerValue = [
              ...answer.selected,
              ...(answer.customAnswer ? [answer.customAnswer] : []),
            ].join(', ')}
            <div
              class="rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg)]/40 p-3"
            >
              <p
                class="text-xs font-semibold uppercase tracking-wide opacity-70"
              >
                {matchedQuestion?.header ?? `Question ${answerIndex + 1}`}
              </p>
              <p class="mt-1 text-sm">{answerValue}</p>
            </div>
          {/each}
        </div>
      {:else if messageStageSummary}
        <div class="space-y-2">
          <p class="stacked-subtle text-xs uppercase tracking-wide">Stages</p>
          {#each messageStageSummary as stage, stageIndex (`${stage.stageName}-${stageIndex}`)}
            <p class="leading-snug">
              <span class="text-sm font-semibold">{stage.stageName}</span>
              <span class="mx-1 opacity-70">-</span>
              <span class="text-sm">{stage.stageDescription}</span>
            </p>
          {/each}
        </div>
      {:else if isSavePlanPromptMessage(message)}
        <div
          class="inline-flex items-center gap-2 rounded-full border border-blue-300/50 bg-blue-400/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-100"
        >
          <span class="opacity-80">Action</span>
          <span class="h-1 w-1 rounded-full bg-blue-100/80"></span>
          <span>Save plan</span>
        </div>
      {:else}
        <div class="stacked-markdown">
          {@html renderMarkdown(getDisplayMessageContent(message))}
        </div>
      {/if}
    </div>
  </div>
{/if}
