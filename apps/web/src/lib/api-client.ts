import type {
  AuthResponse,
  BaseResponseDto,
  BattleReportDto,
  BuildingStateDto,
  InventoryItemDto,
  LoginRequest,
  PentiliDto,
  PlayerProfileDto,
  RegisterRequest,
  ShipSlotDto,
  ZoneDto,
} from '@pentilius/shared';
import { getAccessToken } from './auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<TResponse>(path: string, options: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<TResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.auth) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    throw new ApiError(response.status, `Request to ${path} failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }
  return response.json() as Promise<TResponse>;
}

// Auth (unauthenticated)
export function register(payload: RegisterRequest): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/register', { method: 'POST', body: payload });
}

export function login(payload: LoginRequest): Promise<AuthResponse> {
  return request<AuthResponse>('/auth/login', { method: 'POST', body: payload });
}

// Player
export function getProfile(): Promise<PlayerProfileDto> {
  return request<PlayerProfileDto>('/player/me', { auth: true });
}

// Base / buildings
export function getBase(): Promise<BaseResponseDto> {
  return request<BaseResponseDto>('/base', { auth: true });
}

export function upgradeBuilding(key: string): Promise<BuildingStateDto> {
  return request<BuildingStateDto>(`/base/buildings/${key}/upgrade`, { method: 'POST', auth: true });
}

// Ship / equipment
export function getShip(): Promise<ShipSlotDto[]> {
  return request<ShipSlotDto[]>('/ship', { auth: true });
}

export function equipItem(itemInstanceId: string): Promise<ShipSlotDto[]> {
  return request<ShipSlotDto[]>(`/ship/equip/${itemInstanceId}`, { method: 'POST', auth: true });
}

export function unequipSlot(slot: string): Promise<ShipSlotDto[]> {
  return request<ShipSlotDto[]>(`/ship/unequip/${slot}`, { method: 'POST', auth: true });
}

// Inventory
export function getInventory(): Promise<InventoryItemDto[]> {
  return request<InventoryItemDto[]>('/inventory', { auth: true });
}

export function upgradeItem(itemInstanceId: string): Promise<InventoryItemDto> {
  return request<InventoryItemDto>(`/inventory/items/${itemInstanceId}/upgrade`, { method: 'POST', auth: true });
}

// Zones / Pentili
export function getZones(): Promise<ZoneDto[]> {
  return request<ZoneDto[]>('/zones', { auth: true });
}

export function getPentiliInZone(zoneId: string): Promise<PentiliDto[]> {
  return request<PentiliDto[]>(`/zones/${zoneId}/pentili`, { auth: true });
}

// PvE
export function attackPentili(pentiliId: string): Promise<BattleReportDto> {
  return request<BattleReportDto>(`/pve/attack/${pentiliId}`, { method: 'POST', auth: true });
}

export function getBattleReports(): Promise<BattleReportDto[]> {
  return request<BattleReportDto[]>('/pve/reports', { auth: true });
}
