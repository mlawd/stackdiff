<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<main class="stacked-shell mx-auto w-full max-w-3xl px-4 py-6 sm:px-8 sm:py-8">
  {#if data.error}
    <div
      class="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
    >
      {data.error}
    </div>
  {/if}
</main>
