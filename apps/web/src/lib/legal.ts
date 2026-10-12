// Operator details and policy values used by the public information pages
// (About, Rules, Privacy, Support, Delete account) — owner decision,
// 2026-10-12. One place to change them; the page texts in messages/*.json
// reference these as {company}, {eik}, {address}, {email}, {minAge},
// {graceDays} and {updated}.
export const LEGAL = {
  company: 'ОПТИСКЕЙЛ СЪЛЮШЪНС ЕООД',
  companyLatin: 'OPTISCALE SOLUTIONS EOOD',
  eik: '208772002',
  address: { bg: 'София, България', en: 'Sofia, Bulgaria' },
  email: 'support@pentilius.com',
  // Minimum age to register — must also match the store age declarations.
  minAge: 13,
  // Default only — the live value is set in godmaster (GameSettings).
  graceDays: 3,
  updated: '2026-10-12',
} as const;

/** Fills the {placeholders} above into a page text for the given locale. */
export function fillLegal(text: string, locale: string): string {
  const isBg = locale === 'bg';
  const values: Record<string, string> = {
    company: isBg ? LEGAL.company : LEGAL.companyLatin,
    eik: LEGAL.eik,
    address: isBg ? LEGAL.address.bg : LEGAL.address.en,
    email: LEGAL.email,
    minAge: String(LEGAL.minAge),
    graceDays: String(LEGAL.graceDays),
    updated: LEGAL.updated,
  };
  return text.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
