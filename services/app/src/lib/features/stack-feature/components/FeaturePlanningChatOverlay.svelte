<script lang="ts">
  import { portalToBody } from '$lib/client/overlay';
  import BodyScrollLock from '$lib/components/BodyScrollLock.svelte';
  import PlanningChat from '$lib/components/PlanningChat.svelte';
  import type {
    PlanningMessage,
    StackPlanningSession,
    StackViewModel,
  } from '$lib/types/stack';

  interface Props {
    open: boolean;
    stack: StackViewModel;
    session: StackPlanningSession;
    messages: PlanningMessage[];
    awaitingResponse: boolean;
    onClose: () => void;
    onPlanSaved: () => Promise<void>;
  }

  let {
    open,
    stack,
    session,
    messages,
    awaitingResponse,
    onClose,
    onPlanSaved,
  }: Props = $props();
</script>

{#if open}
  <div
    use:portalToBody
    class="fixed inset-0 z-50 flex h-screen w-screen flex-col bg-[var(--stacked-bg)]"
    role="dialog"
    aria-modal="true"
    aria-label="Planning chat"
  >
    <BodyScrollLock />
    <div
      class="flex items-start justify-between gap-3 border-b stacked-divider px-4 py-3 sm:px-6 sm:py-4"
    >
      <div>
        <p
          class="text-xs font-semibold uppercase tracking-[0.16em] stacked-subtle"
        >
          Planning chat
        </p>
        <p class="mt-1 text-sm text-[var(--stacked-text)]">{stack.name}</p>
      </div>
      <button
        type="button"
        class="rounded border border-[var(--stacked-border-soft)] px-2.5 py-1 text-xs stacked-subtle transition hover:text-[var(--stacked-text)]"
        onclick={onClose}
      >
        Close
      </button>
    </div>

    <div class="min-h-0 flex-1 px-4 py-3 sm:px-6 sm:py-4">
      <PlanningChat
        stackId={stack.id}
        {session}
        {messages}
        {awaitingResponse}
        {onPlanSaved}
      />
    </div>
  </div>
{/if}
