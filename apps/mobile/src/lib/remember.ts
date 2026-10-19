// Per-device conveniences (the web keeps them in localStorage): the last
// selected land and the last picked Pentil per land. In memory only — they
// reset when the app restarts, which is fine for a convenience.
const store = new Map<string, string>();

export function remember(key: string, value: string): void {
  store.set(key, value);
}

export function recall(key: string): string | null {
  return store.get(key) ?? null;
}
