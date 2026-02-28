<script lang="ts">
  import StackCreateForm from '$lib/features/stack-create/components/StackCreateForm.svelte';

  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
</script>

<StackCreateForm projectId={data.selectedProjectId} {form} />
