import { getLocales } from 'expo-localization';
import bg from '@pentilius/shared/messages/bg.json';
import en from '@pentilius/shared/messages/en.json';

// The same texts as the web (packages/shared/messages). English is the fallback.
type Messages = Record<string, unknown>;
const MESSAGES: Record<'bg' | 'en', Messages> = { bg, en };

export type Locale = 'bg' | 'en';

let locale: Locale = getLocales()[0]?.languageCode === 'bg' ? 'bg' : 'en';

export function setLocale(next: string | null | undefined): void {
  if (next === 'bg' || next === 'en') locale = next;
}

export function getLocale(): Locale {
  return locale;
}

function lookup(messages: Messages, key: string): string | undefined {
  const value = key.split('.').reduce<unknown>((acc, part) => (acc && typeof acc === 'object' ? (acc as Messages)[part] : undefined), messages);
  return typeof value === 'string' ? value : undefined;
}

/** A text by key, with {name} placeholders filled in. */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  const text = lookup(MESSAGES[locale], key) ?? lookup(MESSAGES.en, key) ?? key;
  return Object.entries(vars).reduce((out, [name, value]) => out.split(`{${name}}`).join(String(value)), text);
}

/** A whole block of texts (e.g. an information page), in the current language or English. */
export function tRaw<T>(key: string): T | undefined {
  const find = (messages: Messages) => key.split('.').reduce<unknown>((acc, part) => (acc && typeof acc === 'object' ? (acc as Messages)[part] : undefined), messages);
  return (find(MESSAGES[locale]) ?? find(MESSAGES.en)) as T | undefined;
}
