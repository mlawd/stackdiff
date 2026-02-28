<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { resolve } from '$app/paths';
  import { Button } from 'flowbite-svelte';
  import { projectStacksPath } from '$lib/project-paths';

  import { STACK_CREATE_FEATURE_TYPE_OPTIONS } from '../feature-type-options';
  import { toStackCreateFormState } from '../form-state';
  import type { StackCreateActionFailureData } from '../contracts';

  interface Props {
    projectId: string;
    form: StackCreateActionFailureData | null | undefined;
  }

  let { projectId, form }: Props = $props();

  let submitting = $state(false);
  let formState = $derived(toStackCreateFormState(form));
  let selectedType = $derived(formState.values.type);
  let backToPipelineHref = $derived(projectStacksPath(projectId));

  const submitEnhance: SubmitFunction = () => {
    submitting = true;

    return async ({ update }) => {
      await update();
      submitting = false;
    };
  };
</script>

<main class="stacked-shell mx-auto w-full max-w-3xl px-4 py-6 sm:px-8 sm:py-8">
  <section class="stacked-panel stacked-fade-in p-4 sm:p-7">
    <div class="mb-6 border-b stacked-divider pb-4">
      <a
        href={resolve(backToPipelineHref)}
        class="stacked-link text-sm font-semibold">Back to feature pipeline</a
      >
      <h1 class="mt-2 text-3xl font-semibold tracking-tight">
        Create New Feature
      </h1>
      <p class="mt-2 text-sm stacked-subtle">
        Define the work item, pick its type, then continue in the feature
        workspace.
      </p>
    </div>

    {#if formState.formError}
      <div
        class="mb-5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
      >
        {formState.formError}
      </div>
    {/if}

    <form
      method="POST"
      use:enhance={submitEnhance}
      class="stacked-panel-elevated grid gap-4 p-4 sm:p-5"
    >
      <label class="flex flex-col gap-2 text-sm">
        <span class="font-medium text-[var(--stacked-text)]">Feature Title</span
        >
        <input
          name="name"
          required
          placeholder="e.g. User authentication system"
          value={formState.values.name}
          aria-invalid={formState.fieldErrors.name ? 'true' : undefined}
          class="rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-3 py-2 text-sm text-[var(--stacked-text)] outline-none ring-0 transition focus:border-[var(--stacked-accent)]"
        />
      </label>
      {#if formState.fieldErrors.name}
        <p class="-mt-2 text-xs text-red-200">{formState.fieldErrors.name}</p>
      {/if}

      <fieldset class="border-0 p-0">
        <legend class="mb-2 text-sm font-medium text-[var(--stacked-text)]"
          >Feature Type</legend
        >
        <div class="grid gap-2 sm:grid-cols-3">
          {#each STACK_CREATE_FEATURE_TYPE_OPTIONS as option (option.value)}
            <label
              class={`cursor-pointer rounded-lg border bg-[var(--stacked-bg-soft)] p-3 transition hover:border-[var(--stacked-accent)] ${
                selectedType === option.value
                  ? 'border-[var(--stacked-accent)]'
                  : 'border-[var(--stacked-border-soft)]'
              }`}
            >
              <input
                bind:group={selectedType}
                type="radio"
                name="type"
                class="sr-only"
                value={option.value}
              />
              <p class="text-sm font-semibold text-[var(--stacked-text)]">
                {option.label}
              </p>
              <p class="mt-1 text-xs stacked-subtle">{option.description}</p>
            </label>
          {/each}
        </div>
      </fieldset>
      {#if formState.fieldErrors.type}
        <p class="-mt-2 text-xs text-red-200">{formState.fieldErrors.type}</p>
      {/if}

      <label class="flex flex-col gap-2 text-sm">
        <span class="font-medium text-[var(--stacked-text)]">Description</span>
        <textarea
          name="notes"
          rows="4"
          placeholder="Scope, constraints, and intended outcome"
          class="rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] px-3 py-2 text-sm text-[var(--stacked-text)] outline-none ring-0 transition focus:border-[var(--stacked-accent)]"
          >{formState.values.notes}</textarea
        >
      </label>

      <div class="flex flex-wrap items-center justify-end gap-2">
        <Button
          href={resolve(backToPipelineHref)}
          size="sm"
          color="alternative"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          color="primary"
          disabled={submitting}
          loading={submitting}
        >
          Create Feature
        </Button>
      </div>
    </form>
  </section>
</main>
