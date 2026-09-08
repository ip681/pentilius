import type { AuthTokens } from '@pentilius/shared';
import { clearCachedProfile } from './profile-cache';

const ACCESS_TOKEN_KEY = 'pentilius.accessToken';
const REFRESH_TOKEN_KEY = 'pentilius.refreshToken';

export function storeTokens(tokens: AuthTokens): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  // A logged-out session must never optimistically show the previous player's cached data.
  clearCachedProfile();
}

export function isAuthenticated(): boolean {
  return getAccessToken() !== null;
}
