import { readAppNotificationsEnabled } from '$lib/client/notifications';

export interface ReviewReadyNotifier {
  notify: (stageId: string, stageTitle: string) => void;
}

function canSendBrowserNotifications(): boolean {
  if (typeof Notification === 'undefined') {
    return false;
  }

  if (Notification.permission !== 'granted') {
    return false;
  }

  try {
    return readAppNotificationsEnabled();
  } catch {
    return false;
  }
}

export function createReviewReadyNotifier(
  stackId: string,
): ReviewReadyNotifier {
  const notifiedStageIds = new Set<string>();

  function notify(stageId: string, stageTitle: string): void {
    if (!canSendBrowserNotifications()) {
      return;
    }

    if (notifiedStageIds.has(stageId)) {
      return;
    }

    notifiedStageIds.add(stageId);

    try {
      new Notification('Review', {
        body: `${stageTitle || 'Stage'} is ready for review.`,
        tag: `review:${stackId}:${stageId}`,
      });
    } catch {
      // Ignore notification construction errors.
    }
  }

  return {
    notify,
  };
}
