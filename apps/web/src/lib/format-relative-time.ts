const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3600],
  ['minute', 60],
];

// Locale-aware "X ago" (e.g. "5 minutes ago" / "преди 5 минути") via the
// built-in Intl.RelativeTimeFormat — avoids hand-rolling per-locale plural
// rules for a display-only string.
export function formatRelativeTime(iso: string, locale: string): string {
  const diffSeconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  for (const [unit, secondsInUnit] of UNITS) {
    if (diffSeconds >= secondsInUnit) {
      return rtf.format(-Math.floor(diffSeconds / secondsInUnit), unit);
    }
  }
  return rtf.format(-diffSeconds, 'second');
}
