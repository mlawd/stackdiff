<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { lockBodyScroll, portalToBody } from '$lib/client/overlay';
  import PlanningChat from '$lib/components/PlanningChat.svelte';
  import { projectStacksPath } from '$lib/project-paths';
  import FeaturePageHeader from '$lib/features/stack-feature/components/FeaturePageHeader.svelte';
  import FeatureStackPanel from '$lib/features/stack-feature/components/FeatureStackPanel.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let hasSavedPlan = $derived(Boolean(data.session.savedPlanPath));

  let planningChatOpen = $state(false);

  function openPlanningChat(): void {
    planningChatOpen = true;
  }

  function closePlanningChat(): void {
    planningChatOpen = false;
  }

  async function handlePlanSaved(): Promise<void> {
    await invalidateAll();
  }

  $effect(() => {
    if (!planningChatOpen) {
      return;
    }

    return lockBodyScroll();
  });
</script>

<main class="stacked-shell mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-6">
  <div class="stacked-fade-in">
    <FeaturePageHeader
      stack={data.stack}
      loadedAt={data.loadedAt}
      backHref={projectStacksPath(data.stack.projectId)}
    />

    <FeatureStackPanel
      stack={data.stack}
      {hasSavedPlan}
      onOpenPlanningChat={openPlanningChat}
    />
  </div>
</main>

<div
  use:portalToBody
  class={planningChatOpen
    ? 'fixed inset-0 z-50 flex h-screen w-screen flex-col bg-[var(--stacked-bg)]'
    : 'hidden'}
  role="dialog"
  aria-modal="true"
  aria-label="Planning chat"
>
  <div
    class="flex items-start justify-between gap-3 border-b stacked-divider px-4 py-3 sm:px-6 sm:py-4"
  >
    <div>
      <p
        class="text-xs font-semibold uppercase tracking-[0.16em] stacked-subtle"
      >
        Planning chat
      </p>
      <p class="mt-1 text-sm text-[var(--stacked-text)]">{data.stack.name}</p>
    </div>
    <button
      type="button"
      class="rounded border border-[var(--stacked-border-soft)] px-2.5 py-1 text-xs stacked-subtle transition hover:text-[var(--stacked-text)]"
      onclick={closePlanningChat}
    >
      Close
    </button>
  </div>

  <div class="min-h-0 flex-1 px-4 py-3 sm:px-6 sm:py-4">
    <PlanningChat
      stackId={data.stack.id}
      session={data.session}
      messages={data.messages}
      awaitingResponse={data.awaitingResponse}
      onPlanSaved={handlePlanSaved}
    />
  </div>
</div>
