/**
 * A dotted translation key, e.g. "auth.login" or "combat.damage_dealt".
 * Kept as a plain string type (not a union) until the real key set stabilizes.
 */
export type TranslationKey = string;

export interface LocalizedMessage {
  key: TranslationKey;
  params?: Record<string, string | number>;
}
