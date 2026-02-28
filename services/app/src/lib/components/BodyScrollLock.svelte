<script lang="ts">
  import { onMount } from 'svelte';

  import { lockBodyScroll } from '$lib/client/overlay';

  onMount(() => lockBodyScroll());
</script>
