// One number format for the whole game (owner decision, 2026-10-19): a space
// between thousands from 4 digits up ("8 230", "11 200"), the same in every
// language — the default Bulgarian format only groups from 5 digits, which
// looked inconsistent next to each other. Fixed rather than per-language so
// the server render and the browser always agree.
const formatter = new Intl.NumberFormat('bg-BG', {
  // 'always' isn't in every TypeScript lib yet; browsers without it fall back to normal grouping.
  useGrouping: 'always' as unknown as boolean,
  maximumFractionDigits: 2,
});

export function formatNumber(value: number): string {
  return formatter.format(value);
}
