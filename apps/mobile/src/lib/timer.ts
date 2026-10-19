/**
 * How far a timer has run, 0-1 — the web's timerPercent. Uses the real start
 * when known; otherwise estimates it from the full duration.
 */
export function timerShare(startedAt: string | null | undefined, endsAt: string, now: number, fallbackTotalSeconds?: number | null): number | null {
  const end = new Date(endsAt).getTime();
  const start = startedAt ? new Date(startedAt).getTime() : fallbackTotalSeconds ? end - fallbackTotalSeconds * 1000 : null;
  if (start === null || end <= start) return null;
  return Math.max(0, Math.min(1, (now - start) / (end - start)));
}
