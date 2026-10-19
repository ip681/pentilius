import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string; assetBaseUrl?: string };

// The game server (app.json → expo.extra).
export const API_BASE_URL = extra.apiBaseUrl ?? 'https://pentilius.com/api/v1';
export const ASSET_BASE_URL = extra.assetBaseUrl ?? 'https://pentilius.com';
