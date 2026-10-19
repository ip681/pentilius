// One number format, as on the web: a space between thousands from 4 digits up.
export function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const [whole, fraction] = String(Math.abs(rounded)).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return `${rounded < 0 ? '-' : ''}${grouped}${fraction ? `,${fraction}` : ''}`;
}

// Fixed "DD.MM.YYYY HH:mm", as on the web — not locale-dependent.
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3600],
  ['minute', 60],
];

/** "5 minutes" / "5 минути" without the "ago" word, as on the web; a plain fallback if the phone lacks Intl.RelativeTimeFormat. */
export function formatRelativeTime(iso: string, locale: string): string {
  const diffSeconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  const [unit, size] = UNITS.find(([, s]) => diffSeconds >= s) ?? (['second', 1] as [Intl.RelativeTimeFormatUnit, number]);
  const amount = Math.floor(diffSeconds / size);
  try {
    const formatted = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-amount, unit);
    return formatted.replace(/^преди\s+/i, '').replace(/\s+ago$/i, '');
  } catch {
    return `${amount} ${unit}`;
  }
}
