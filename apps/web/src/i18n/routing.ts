import { defineRouting } from 'next-intl/routing';

// instructions/I18N.md: start with en + bg, English is the fallback.
export const routing = defineRouting({
  locales: ['en', 'bg'],
  defaultLocale: 'en',
});
