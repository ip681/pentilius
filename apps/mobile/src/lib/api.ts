import type {
  AuthResponse,
  AuthTokens,
  BaseResponseDto,
  BuildingStateDto,
  InventoryResponseDto,
  LoginRequest,
  PlayerProfileDto,
} from '@pentilius/shared';
import { clearTokens, getAccessToken, getRefreshToken, storeTokens } from './auth-storage';
import { API_BASE_URL } from './config';

// The same requests as the web (apps/web/src/lib/api-client.ts): the server
// decides everything, the app only shows it.
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Access tokens last 15 minutes; one shared refresh for concurrent 401s.
let refreshPromise: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) return null;
      try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (response.status >= 500) return null;
        if (!response.ok) {
          await clearTokens();
          return null;
        }
        const tokens = (await response.json()) as AuthTokens;
        await storeTokens(tokens);
        return tokens.accessToken;
      } catch {
        return null;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function request<T>(path: string, options: { method?: string; body?: unknown; auth?: boolean } = {}, isRetry = false): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = options.auth ? getAccessToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, `Request to ${path} failed: no connection`, 'CONNECTION_LOST');
  }

  if (!response.ok) {
    if (response.status === 401 && options.auth && !isRetry) {
      const fresh = await refreshAccessToken();
      if (fresh) return request<T>(path, options, true);
    }
    const body = (await response.json().catch(() => undefined)) as { message?: string } | undefined;
    throw new ApiError(response.status, `Request to ${path} failed with status ${response.status}`, body?.message, body);
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function login(payload: LoginRequest): Promise<AuthResponse> {
  const result = await request<AuthResponse>('/auth/login', { method: 'POST', body: payload });
  await storeTokens(result);
  return result;
}

export function getProfile(): Promise<PlayerProfileDto> {
  return request<PlayerProfileDto>('/player/me', { auth: true });
}

// Base
export function getBase(): Promise<BaseResponseDto> {
  return request<BaseResponseDto>('/base', { auth: true });
}

export function upgradeBuilding(key: string): Promise<BuildingStateDto> {
  return request<BuildingStateDto>(`/base/buildings/${key}/upgrade`, { method: 'POST', auth: true });
}

export function queueBuilding(key: string): Promise<BaseResponseDto> {
  return request<BaseResponseDto>(`/base/buildings/${key}/queue`, { method: 'POST', auth: true });
}

export function cancelBuildQueue(): Promise<BaseResponseDto> {
  return request<BaseResponseDto>('/base/queue', { method: 'DELETE', auth: true });
}

export function exchangeResources(from: 'METAL' | 'CRYSTAL', amount: number): Promise<BaseResponseDto> {
  return request<BaseResponseDto>('/base/exchange', { method: 'POST', auth: true, body: { from, amount } });
}

// Inventory
export function getInventory(): Promise<InventoryResponseDto> {
  return request<InventoryResponseDto>('/inventory', { auth: true });
}

export function consumeItem(itemInstanceId: string, buildingKey?: string): Promise<InventoryResponseDto> {
  return request<InventoryResponseDto>(`/inventory/items/${itemInstanceId}/use`, { method: 'POST', auth: true, body: { buildingKey } });
}
