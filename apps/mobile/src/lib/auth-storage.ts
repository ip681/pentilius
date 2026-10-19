import * as SecureStore from 'expo-secure-store';
import type { AuthTokens } from '@pentilius/shared';

// Tokens live in the phone's secure storage (Keychain / Keystore), not in plain files.
const ACCESS = 'pentilius.accessToken';
const REFRESH = 'pentilius.refreshToken';

let accessCache: string | null = null;

export async function loadTokens(): Promise<boolean> {
  accessCache = await SecureStore.getItemAsync(ACCESS);
  return accessCache !== null;
}

export function getAccessToken(): string | null {
  return accessCache;
}

export function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH);
}

export async function storeTokens(tokens: AuthTokens): Promise<void> {
  accessCache = tokens.accessToken;
  await SecureStore.setItemAsync(ACCESS, tokens.accessToken);
  await SecureStore.setItemAsync(REFRESH, tokens.refreshToken);
}

export async function clearTokens(): Promise<void> {
  accessCache = null;
  await SecureStore.deleteItemAsync(ACCESS);
  await SecureStore.deleteItemAsync(REFRESH);
}
