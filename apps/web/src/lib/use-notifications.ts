'use client';

import type { NotificationsDto } from '@pentilius/shared';
import { useEffect, useState } from 'react';
import { getNotifications } from './api-client';
import { onNotificationsChanged } from './notifications-events';

// The menu dots (owner decision, 2026-10-13), checked the cheap way — like
// useFriendsUnread: once per page (GameLayout remounts per page) and when
// notifyNotificationsChanged() fires. No polling, and not part of the profile.
// Also carries the timers and the last PvP defense for NotificationCenter.
export function useNotifications(enabled: boolean): NotificationsDto | null {
  const [state, setState] = useState<NotificationsDto | null>(null);

  useEffect(() => {
    if (!enabled) return;
    function refresh() {
      getNotifications()
        .then(setState)
        .catch(() => undefined);
    }
    refresh();
    return onNotificationsChanged(refresh);
  }, [enabled]);

  return state;
}
