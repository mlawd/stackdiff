<script lang="ts">
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import { Button } from 'flowbite-svelte';
  import type { Snippet } from 'svelte';
  import {
    getNotificationPermissionState,
    readAppNotificationsEnabled,
    requestNotificationPermission,
    writeAppNotificationsEnabled,
    type NotificationPermissionState,
  } from '$lib/client/notifications';
  import { projectStacksNewPath, projectStacksPath } from '$lib/project-paths';

  import type { LayoutData } from './$types';

  import '../app.css';
  import favicon from '$lib/assets/favicon.svg';

  let { children, data }: { children: Snippet; data: LayoutData } = $props();
  let notificationPermission =
    $state<NotificationPermissionState>('unsupported');
  let appNotificationsEnabled = $state(true);

  let createFeatureHref = $derived.by(() => {
    if (!data.selectedProjectId) {
      return resolve('/');
    }

    return resolve(projectStacksNewPath(data.selectedProjectId));
  });

  let pipelineHref = $derived.by(() => {
    if (!data.selectedProjectId) {
      return '/' as const;
    }

    return projectStacksPath(data.selectedProjectId);
  });

  function handleProjectChange(event: Event): void {
    const projectId = (event.currentTarget as HTMLSelectElement).value;
    if (!projectId) {
      window.location.assign(resolve('/'));
      return;
    }

    window.location.assign(resolve(projectStacksPath(projectId)));
  }

  let notificationButtonLabel = $derived.by(() => {
    if (notificationPermission === 'unsupported') {
      return 'Notifications unsupported';
    }

    if (notificationPermission === 'denied') {
      return 'Notifications blocked';
    }

    if (notificationPermission === 'default') {
      return 'Enable notifications';
    }

    return appNotificationsEnabled ? 'Notifications on' : 'Notifications muted';
  });

  let notificationButtonDisabled = $derived.by(
    () =>
      notificationPermission === 'unsupported' ||
      notificationPermission === 'denied',
  );

  async function handleNotificationsClick(): Promise<void> {
    notificationPermission = getNotificationPermissionState();
    if (
      notificationPermission === 'unsupported' ||
      notificationPermission === 'denied'
    ) {
      return;
    }

    if (notificationPermission === 'default') {
      notificationPermission = await requestNotificationPermission();
      if (notificationPermission === 'granted') {
        appNotificationsEnabled = true;
        writeAppNotificationsEnabled(true);
      }
      return;
    }

    appNotificationsEnabled = !appNotificationsEnabled;
    writeAppNotificationsEnabled(appNotificationsEnabled);
  }

  onMount(() => {
    notificationPermission = getNotificationPermissionState();
    appNotificationsEnabled = readAppNotificationsEnabled();
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<header
  class="stacked-fade-in mb-0 w-full border-b stacked-divider bg-[var(--stacked-surface)] px-4 py-3 sm:mb-0 sm:px-6"
>
  <div class="mx-auto flex w-full max-w-6xl items-center justify-between">
    <a
      href={resolve(pipelineHref)}
      class="text-sm font-semibold tracking-wide text-[var(--stacked-text)] sm:text-base"
      >stackdiff</a
    >
    <div class="flex items-center gap-3">
      <Button
        type="button"
        size="sm"
        color="alternative"
        onclick={handleNotificationsClick}
        disabled={notificationButtonDisabled}
      >
        {notificationButtonLabel}
      </Button>
      {#if data.projects.length > 0}
        <label class="text-xs font-medium stacked-subtle sm:text-sm">
          <span class="sr-only">Project</span>
          <select
            value={data.selectedProjectId ?? ''}
            onchange={handleProjectChange}
            class="h-9 min-w-44 rounded-lg border border-[var(--stacked-border-soft)] bg-[var(--stacked-bg-soft)] pl-3 pr-9 text-xs text-[var(--stacked-text)] outline-none transition focus:border-[var(--stacked-accent)] sm:text-sm"
          >
            {#each data.projects as project (project.id)}
              <option value={project.id}>{project.name}</option>
            {/each}
          </select>
        </label>
      {/if}
      <Button href={createFeatureHref} size="sm" color="primary">
        Create feature
      </Button>
    </div>
  </div>
</header>

{#if data.projectLoadError}
  <div
    class="w-full border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-100 sm:px-6"
  >
    <p class="mx-auto w-full max-w-6xl">
      Project error: {data.projectLoadError}
    </p>
  </div>
{/if}

{@render children()}
