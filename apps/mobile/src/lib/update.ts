import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import { ASSET_BASE_URL } from './config';

// While the Android app isn't in Google Play, it is served from the game's own
// server, with version.json next to it saying which version is the newest.
// Google Play (and the App Store) will do this themselves later.
const VERSION_URL = `${ASSET_BASE_URL}/download/version.json`;
export const APK_URL = `${ASSET_BASE_URL}/download/pentilius.apk`;

export const CURRENT_VERSION = Constants.expoConfig?.version ?? '0.0.0';

/** -1 / 0 / 1 for "1.2.0" style versions. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number(n) || 0);
  const pb = b.split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

let cached: Promise<string | null> | null = null;

/** The newest version on the server if it's newer than this app; checked once per app start. */
function fetchNewerVersion(): Promise<string | null> {
  if (Platform.OS !== 'android') return Promise.resolve(null);
  cached ??= fetch(VERSION_URL, { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { version?: string } | null) => (data?.version && compareVersions(data.version, CURRENT_VERSION) > 0 ? data.version : null))
    .catch(() => null);
  return cached;
}

export function useNewerVersion(): string | null {
  const [newer, setNewer] = useState<string | null>(null);
  useEffect(() => {
    fetchNewerVersion().then(setNewer);
  }, []);
  return newer;
}

/** Downloads the new APK in the browser; Android then offers "Update" over the installed app. */
export function downloadUpdate(): void {
  Linking.openURL(APK_URL);
}
