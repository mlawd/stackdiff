const APP_NOTIFICATIONS_ENABLED_KEY = 'stacked.notifications.enabled';

export type NotificationPermissionState =
  | NotificationPermission
  | 'unsupported';

export function getNotificationPermissionState(): NotificationPermissionState {
  if (typeof Notification === 'undefined') {
    return 'unsupported';
  }

  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof Notification === 'undefined') {
    return 'unsupported';
  }

  return Notification.requestPermission();
}

export function readAppNotificationsEnabled(): boolean {
  if (typeof localStorage === 'undefined') {
    return true;
  }

  const stored = localStorage.getItem(APP_NOTIFICATIONS_ENABLED_KEY);
  if (stored === null) {
    return true;
  }

  return stored === 'true';
}

export function writeAppNotificationsEnabled(enabled: boolean): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(
    APP_NOTIFICATIONS_ENABLED_KEY,
    enabled ? 'true' : 'false',
  );
}
