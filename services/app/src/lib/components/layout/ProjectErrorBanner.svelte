<script lang="ts">
  interface Props {
    message: string | null | undefined;
  }

  let { message }: Props = $props();
</script>

{#if message}
  <div
    class="w-full border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-100 sm:px-6"
  >
    <p class="mx-auto w-full max-w-6xl">Project error: {message}</p>
  </div>
{/if}
