<script lang="ts">
  let {
    syncError,
    syncSuccess,
    startError,
    startSuccess,
  }: {
    syncError: string | null;
    syncSuccess: string | null;
    startError: string | null;
    startSuccess: string | null;
  } = $props();
</script>

{#if syncError}
  <div
    class="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
  >
    {syncError}
  </div>
{/if}

{#if syncSuccess}
  <div
    class="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
  >
    {syncSuccess}
  </div>
{/if}

{#if startError}
  <div
    class="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
  >
    {startError}
  </div>
{/if}

{#if startSuccess}
  <div
    class="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
  >
    {startSuccess}
  </div>
{/if}
