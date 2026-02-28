<script lang="ts">
  interface Props {
    errorMessage: string | null;
    successMessage: string | null;
  }

  let { errorMessage, successMessage }: Props = $props();
</script>

{#if errorMessage}
  <div
    class="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
  >
    {errorMessage}
  </div>
{/if}

{#if successMessage}
  <div
    class="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
  >
    {successMessage}
  </div>
{/if}
