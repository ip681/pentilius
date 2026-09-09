// Fixed "DD.MM.YYYY HH:mm" display (owner-specified, e.g. "08.09.2026 23:41") —
// deliberately not locale-dependent like toLocaleString(), which varies
// unpredictably by the visitor's browser/OS settings.
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
