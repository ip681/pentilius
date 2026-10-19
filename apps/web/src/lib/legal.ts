// Operator details and policy values used by the public information pages
// (About, Rules, Privacy, Support, Delete account) — owner decision,
// 2026-10-12. One place to change them; the page texts in messages/*.json
// reference these as {company}, {eik}, {address}, {email}, {minAge},
// {graceDays} and {updated}.
import legal from '@pentilius/shared/legal.json';

// The values live in packages/shared/legal.json, so the phone app shows the same.
// - email: the company's working address until a support@pentilius.com mailbox
//   exists (owner decision, 2026-10-15).
// - minAge: minimum age to register — must also match the store age declarations.
// - graceDays: default only — the live value is set in godmaster (GameSettings).
export const LEGAL = legal;

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
