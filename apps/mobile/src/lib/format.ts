// One number format, as on the web: a space between thousands from 4 digits up.
export function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const [whole, fraction] = String(Math.abs(rounded)).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return `${rounded < 0 ? '-' : ''}${grouped}${fraction ? `,${fraction}` : ''}`;
}
