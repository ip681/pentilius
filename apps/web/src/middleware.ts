import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // godmaster is the site-staff admin area — deliberately outside the
  // player-facing [locale] routing (no i18n, no locale-prefix redirect, and
  // not reachable from any nav link — see AdminUser's schema comment).
  matcher: ['/((?!api|trpc|_next|_vercel|godmaster|.*\\..*).*)'],
};
