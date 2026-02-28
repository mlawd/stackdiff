<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import FeaturePlanningChatOverlay from '$lib/features/stack-feature/components/FeaturePlanningChatOverlay.svelte';
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

<FeaturePlanningChatOverlay
  open={planningChatOpen}
  stack={data.stack}
  session={data.session}
  messages={data.messages}
  awaitingResponse={data.awaitingResponse}
  onClose={closePlanningChat}
  onPlanSaved={handlePlanSaved}
/>
