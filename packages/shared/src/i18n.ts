/**
 * A dotted translation key, e.g. "auth.login" or "combat.damage_dealt".
 * Kept as a plain string type (not a union) until the real key set stabilizes.
 */
export type TranslationKey = string;

/**
 * The game's languages (instructions/I18N.md). English is the source and the
 * fallback. Add a new language here, and every place that lists languages
 * (e.g. godmaster's announcement form) picks it up.
 */
export const SUPPORTED_LOCALES = ['en', 'bg'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export interface LocalizedMessage {
  key: TranslationKey;
  params?: Record<string, string | number>;
}
