<script lang="ts">
  import { Button } from 'flowbite-svelte';

  import { getChatPanelContext } from '$lib/components/chat/chat-panel-context.svelte';

  const chatPanel = getChatPanelContext();

  const activeQuestion = $derived(
    chatPanel.activeQuestionDialog?.questions[chatPanel.activeQuestionIndex] ??
      null,
  );

  function isQuestionOptionSelected(
    questionIndex: number,
    optionLabel: string,
  ): boolean {
    const selected = chatPanel.questionSelections[questionIndex] ?? [];
    return selected.includes(optionLabel);
  }
</script>

{#if chatPanel.activeQuestionDialog && activeQuestion}
  <div class="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-2 sm:p-3">
    <div
      class="pointer-events-auto rounded-2xl border border-[var(--stacked-border-soft)] bg-[color-mix(in_oklab,var(--stacked-bg-soft)_86%,black_14%)] px-4 py-3 shadow-xl backdrop-blur-sm stacked-chat-font text-sm text-[var(--stacked-text)]"
    >
      <div class="mb-2 flex items-center justify-between gap-3">
        <p class="text-[11px] uppercase tracking-wide opacity-70">
          agent question
        </p>
        <p class="stacked-subtle text-xs">
          Question {chatPanel.activeQuestionIndex + 1} of {chatPanel
            .activeQuestionDialog.questions.length}
        </p>
      </div>
      <div
        class="rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)]/60 p-3"
      >
        <p class="text-xs font-semibold uppercase tracking-wide opacity-70">
          {activeQuestion.header}
        </p>
        <p class="mt-1 text-sm">{activeQuestion.question}</p>
        <div class="mt-2 space-y-2">
          {#each activeQuestion.options as option, optionIndex (`${option.label}-${optionIndex}`)}
            <label
              class="flex items-start gap-2 rounded-md border border-transparent px-2 py-1.5 transition hover:border-[var(--stacked-border-soft)] hover:bg-[var(--stacked-bg)]/50"
            >
              <input
                type={activeQuestion.multiple ? 'checkbox' : 'radio'}
                name={`${chatPanel.panelId}-question-${chatPanel.activeQuestionIndex}`}
                checked={isQuestionOptionSelected(
                  chatPanel.activeQuestionIndex,
                  option.label,
                )}
                onchange={(event) => {
                  const target = event.currentTarget as HTMLInputElement;
                  if (activeQuestion.multiple) {
                    chatPanel.toggleQuestionOption(
                      chatPanel.activeQuestionIndex,
                      option.label,
                      target.checked,
                    );
                    return;
                  }
                  chatPanel.setSingleQuestionOption(
                    chatPanel.activeQuestionIndex,
                    option.label,
                  );
                }}
              />
              <span class="leading-snug">
                <span class="block text-sm">{option.label}</span>
                {#if option.description}
                  <span class="stacked-subtle block text-xs"
                    >{option.description}</span
                  >
                {/if}
              </span>
            </label>
          {/each}
        </div>
        {#if activeQuestion.allowCustom}
          <label class="mt-3 flex flex-col gap-1 text-sm">
            <span class="stacked-subtle text-xs">Type your own answer</span>
            <input
              value={chatPanel.questionCustomAnswers[
                chatPanel.activeQuestionIndex
              ] ?? ''}
              oninput={(event) =>
                chatPanel.setQuestionCustomAnswer(
                  chatPanel.activeQuestionIndex,
                  (event.currentTarget as HTMLInputElement).value,
                )}
              placeholder="Type your own answer"
              class="rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-3 py-2 text-sm text-[var(--stacked-text)] outline-none transition focus:border-[var(--stacked-accent)]"
            />
          </label>
        {/if}
      </div>
      <div class="mt-4 flex items-center justify-end gap-2">
        <Button
          size="sm"
          color="alternative"
          onclick={chatPanel.goToPreviousQuestion}
          disabled={chatPanel.sending ||
            chatPanel.saving ||
            chatPanel.activeQuestionIndex === 0}
        >
          Back
        </Button>
        {#if chatPanel.activeQuestionIndex < chatPanel.activeQuestionDialog.questions.length - 1}
          <Button
            size="sm"
            color="primary"
            onclick={chatPanel.goToNextQuestion}
            disabled={chatPanel.sending ||
              chatPanel.saving ||
              !chatPanel.canAnswerQuestion(chatPanel.activeQuestionIndex)}
          >
            Next
          </Button>
        {:else}
          <Button
            size="sm"
            color="primary"
            onclick={() => void chatPanel.submitQuestionAnswer()}
            disabled={chatPanel.sending ||
              chatPanel.saving ||
              !chatPanel.canSubmitQuestionAnswers()}
          >
            Send Answer
          </Button>
        {/if}
      </div>
    </div>
  </div>
{/if}
