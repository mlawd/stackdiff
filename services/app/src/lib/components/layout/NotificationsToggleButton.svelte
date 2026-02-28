<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from 'flowbite-svelte';
  import {
    getNotificationPermissionState,
    readAppNotificationsEnabled,
    requestNotificationPermission,
    writeAppNotificationsEnabled,
    type NotificationPermissionState,
  } from '$lib/client/notifications';

  let notificationPermission =
    $state<NotificationPermissionState>('unsupported');
  let appNotificationsEnabled = $state(true);

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

<Button
  type="button"
  size="sm"
  color="alternative"
  onclick={handleNotificationsClick}
  disabled={notificationButtonDisabled}
>
  {notificationButtonLabel}
</Button>
