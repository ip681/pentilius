// Same pattern as profile-events.ts, kept separate on purpose — lets the
// TopBar's unread indicator refresh right after a message is sent/read,
// without tying it to the (much more frequent) profile-changed signal.
const FRIENDS_ACTIVITY_EVENT = 'pentilius:friends-activity';

export function notifyFriendsActivity(): void {
  window.dispatchEvent(new Event(FRIENDS_ACTIVITY_EVENT));
}

export function onFriendsActivity(handler: () => void): () => void {
  window.addEventListener(FRIENDS_ACTIVITY_EVENT, handler);
  return () => window.removeEventListener(FRIENDS_ACTIVITY_EVENT, handler);
}
