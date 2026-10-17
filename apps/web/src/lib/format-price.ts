/** A real-money price, e.g. 500 + "eur" -> "5,00 €" (bg) / "€5.00" (en). */
export function formatPrice(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-IE' : 'bg-BG', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}
