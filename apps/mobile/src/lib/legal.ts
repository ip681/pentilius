import legal from '@pentilius/shared/legal.json';

// Operator details for the information pages — the same file the web reads.
export const LEGAL = legal;

/** Fills {company}, {eik}, {address}, {email}, {minAge}, {graceDays}, {loginDays}, {updated} into a page text. */
export function fillLegal(text: string, locale: string): string {
  const isBg = locale === 'bg';
  const values: Record<string, string> = {
    company: isBg ? LEGAL.company : LEGAL.companyLatin,
    eik: LEGAL.eik,
    address: isBg ? LEGAL.address.bg : LEGAL.address.en,
    email: LEGAL.email,
    minAge: String(LEGAL.minAge),
    graceDays: String(LEGAL.graceDays),
    loginDays: String(LEGAL.loginDays),
    updated: LEGAL.updated,
  };
  return text.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
