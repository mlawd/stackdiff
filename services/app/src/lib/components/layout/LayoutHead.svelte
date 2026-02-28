<script lang="ts">
  import favicon from '$lib/assets/favicon.svg';

  interface Props {
    selectedProjectName: string | null;
    appName?: string;
  }

  let { selectedProjectName, appName = 'stackdiff' }: Props = $props();

  let pageTitle = $derived.by(() => {
    if (!selectedProjectName) {
      return appName;
    }

    return `${appName} - ${selectedProjectName}`;
  });
</script>

<svelte:head>
  <title>{pageTitle}</title>
  <link rel="icon" href={favicon} />
</svelte:head>
