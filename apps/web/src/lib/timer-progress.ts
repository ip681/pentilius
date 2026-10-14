/**
 * How far a timer has run, 0-100 (progress bars, 2026-10-14). Uses the real
 * start when the server knows it; otherwise estimates the start from the
 * full duration (e.g. a construction started before start times were stored).
 */
export function timerPercent(startedAt: string | null | undefined, endsAt: string, now: number, fallbackTotalSeconds?: number | null): number | null {
  const end = new Date(endsAt).getTime();
  const start = startedAt ? new Date(startedAt).getTime() : fallbackTotalSeconds ? end - fallbackTotalSeconds * 1000 : null;
  if (start === null || end <= start) return null;
  return Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
}
