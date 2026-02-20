<script lang="ts">
  import { resolve } from "$app/paths";
  import { TabItem, Tabs } from "flowbite-svelte";
  import FeaturePageHeader from "./feature-page/components/FeaturePageHeader.svelte";
  import FeaturePlanPanel from "./feature-page/components/FeaturePlanPanel.svelte";
  import FeatureStackPanel from "./feature-page/components/FeatureStackPanel.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  type FeaturePageTabKey = "plan" | "stack";

  let initializedForStackId = "";
  let activeTab = $state<FeaturePageTabKey>(
    // svelte-ignore state_referenced_locally
    data.stack.status === "created" ? "plan" : "stack",
  );

  $effect(() => {
    if (initializedForStackId === data.stack.id) {
      return;
    }

    initializedForStackId = data.stack.id;
  });
</script>

<main class="stacked-shell mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-6">
  <div class="stacked-fade-in">
    <FeaturePageHeader
      stack={data.stack}
      loadedAt={data.loadedAt}
      backHref={resolve("/")}
    />

    <div class="mb-4 feature-page-tabs">
      <Tabs tabStyle="underline" bind:selected={activeTab}>
        <TabItem key="plan" title="Plan" open={activeTab === "plan"}>
          <FeaturePlanPanel
            stackId={data.stack.id}
            session={data.session}
            messages={data.messages}
            awaitingResponse={data.awaitingResponse}
          />
        </TabItem>
        <TabItem key="stack" title="Stack" open={activeTab === "stack"}>
          <FeatureStackPanel stack={data.stack} />
        </TabItem>
      </Tabs>
    </div>
  </div>
</main>

<style>
  :global(.feature-page-tabs ul[role="tablist"]) {
    border-color: var(--stacked-border-soft);
  }

  :global(.feature-page-tabs button[role="tab"]) {
    color: var(--stacked-text-muted);
  }

  :global(.feature-page-tabs button[role="tab"][aria-selected="true"]) {
    color: var(--stacked-text);
    border-color: var(--stacked-border-soft);
  }

  :global(.feature-page-tabs button[role="tab"]:hover) {
    color: var(--stacked-text);
  }

  :global(.feature-page-tabs [role="tabpanel"]) {
    padding: 1rem;
  }
</style>
