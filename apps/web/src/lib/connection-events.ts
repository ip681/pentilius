// Connection to the server lost/restored (owner decision, 2026-10-13) — e.g.
// while an update restarts the API. api-client reports a loss; ConnectionBanner
// shows it, polls /health and reports the recovery; pages then refresh.
const LOST = 'pentilius:connection-lost';
const RESTORED = 'pentilius:connection-restored';

export type ConnectionLossReason = 'maintenance' | 'network';

export function notifyConnectionLost(reason: ConnectionLossReason): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ConnectionLossReason>(LOST, { detail: reason }));
}

export function onConnectionLost(handler: (reason: ConnectionLossReason) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<ConnectionLossReason>).detail);
  window.addEventListener(LOST, listener);
  return () => window.removeEventListener(LOST, listener);
}

export function notifyConnectionRestored(): void {
  window.dispatchEvent(new Event(RESTORED));
}

export function onConnectionRestored(handler: () => void): () => void {
  window.addEventListener(RESTORED, handler);
  return () => window.removeEventListener(RESTORED, handler);
}
