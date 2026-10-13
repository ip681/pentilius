// Same pattern as friends-events.ts: fired after something that can change a
// menu dot (claiming a reward, opening a team reply), so the dots refresh
// right away instead of on the next page change.
const NOTIFICATIONS_EVENT = 'pentilius:notifications-changed';

export function notifyNotificationsChanged(): void {
  window.dispatchEvent(new Event(NOTIFICATIONS_EVENT));
}

export function onNotificationsChanged(handler: () => void): () => void {
  window.addEventListener(NOTIFICATIONS_EVENT, handler);
  return () => window.removeEventListener(NOTIFICATIONS_EVENT, handler);
}
