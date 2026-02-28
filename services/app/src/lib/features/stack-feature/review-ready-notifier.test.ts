import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/client/notifications', () => ({
  readAppNotificationsEnabled: vi.fn(),
}));

import { readAppNotificationsEnabled } from '$lib/client/notifications';

import { createReviewReadyNotifier } from './review-ready-notifier';

const readAppNotificationsEnabledMock = vi.mocked(readAppNotificationsEnabled);

describe('review ready notifier', () => {
  const originalNotification = globalThis.Notification;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.Notification = originalNotification;
  });

  it('sends a notification once per stage id', () => {
    const notificationSpy = vi.fn();
    globalThis.Notification = class {
      static permission = 'granted';

      constructor(title: string, options?: NotificationOptions) {
        notificationSpy({ title, options });
      }
    } as unknown as typeof Notification;
    readAppNotificationsEnabledMock.mockReturnValue(true);

    const notifier = createReviewReadyNotifier('stack-1');
    notifier.notify('stage-1', 'Stage 1');
    notifier.notify('stage-1', 'Stage 1');

    expect(notificationSpy).toHaveBeenCalledTimes(1);
    expect(notificationSpy).toHaveBeenCalledWith({
      title: 'Review',
      options: {
        body: 'Stage 1 is ready for review.',
        tag: 'review:stack-1:stage-1',
      },
    });
  });

  it('does not send when app notifications are disabled', () => {
    const notificationSpy = vi.fn();
    globalThis.Notification = class {
      static permission = 'granted';

      constructor() {
        notificationSpy();
      }
    } as unknown as typeof Notification;
    readAppNotificationsEnabledMock.mockReturnValue(false);

    const notifier = createReviewReadyNotifier('stack-1');
    notifier.notify('stage-1', 'Stage 1');

    expect(notificationSpy).not.toHaveBeenCalled();
  });
});
