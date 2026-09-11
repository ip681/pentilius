'use client';

import { useEffect, useState } from 'react';
import { getFriendsUnreadStatus } from './api-client';
import { onFriendsActivity } from './friends-events';

// Shared between Sidebar and BottomNav (both mounted at once, just
// CSS-hidden by breakpoint) so the check only ever runs once, not twice.
// Refetches on mount (naturally re-checked on every page navigation, since
// GameLayout remounts per page) and whenever a friends-related action fires
// notifyFriendsActivity() — no polling interval.
export function useFriendsUnread(): boolean {
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    function refresh() {
      getFriendsUnreadStatus()
        .then((res) => setHasUnread(res.hasUnread))
        .catch(() => undefined);
    }
    refresh();
    return onFriendsActivity(refresh);
  }, []);

  return hasUnread;
}
