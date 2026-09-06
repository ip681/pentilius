// Lightweight cross-tree notification so an action that changes the player's
// profile (e.g. spending Action Energy on an attack) can tell GameLayout's
// StatusBar to refresh — without lifting profile state into a shared context.
const PROFILE_CHANGED_EVENT = 'pentilius:profile-changed';

export function notifyProfileChanged(): void {
  window.dispatchEvent(new Event(PROFILE_CHANGED_EVENT));
}

export function onProfileChanged(handler: () => void): () => void {
  window.addEventListener(PROFILE_CHANGED_EVENT, handler);
  return () => window.removeEventListener(PROFILE_CHANGED_EVENT, handler);
}
