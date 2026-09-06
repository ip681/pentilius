import type {
  ActiveExpeditionDto,
  AuthResponse,
  BaseResponseDto,
  BattleReportDto,
  BossDto,
  BossEncounterResultDto,
  BuildingStateDto,
  ClanDetailDto,
  ClanMessageDto,
  ClanSummaryDto,
  CombatStatsDto,
  ExpeditionClaimResultDto,
  ExpeditionsResponseDto,
  InventoryResponseDto,
  LoginRequest,
  MyClanResponseDto,
  PentiliDto,
  PlayerListEntryDto,
  PlayerProfileDto,
  PlayerPublicProfileDto,
  PvpBattleReportDto,
  PvpScoutDto,
  PvpStatusDto,
  Race,
  RegisterRequest,
  ResearchResponseDto,
  ResearchStateDto,
  RobotAttributesDto,
  RobotSlotDto,
  ZoneDto,
} from '@pentilius/shared';
import { getAccessToken } from './auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';

export class ApiError extends Error {
  // The backend's exception `message` (e.g. "EMAIL_TAKEN"), when the error body carries a
  // machine-readable one — lets the UI show a specific message instead of a generic fallback.
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
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
    const code = await response
      .clone()
      .json()
      .then((body: { message?: string }) => body.message)
      .catch(() => undefined);
    throw new ApiError(response.status, `Request to ${path} failed with status ${response.status}`, code);
  }

  // NestJS sends an empty body (not literal "null") for handlers returning
  // null/void, regardless of status code — response.json() would throw on
  // that, so check for actual content first.
  const text = await response.text();
  if (!text) {
    return undefined as TResponse;
  }
  return JSON.parse(text) as TResponse;
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

export function getPublicProfile(playerId: string): Promise<PlayerPublicProfileDto> {
  return request<PlayerPublicProfileDto>(`/player/${playerId}`, { auth: true });
}

export function updateBio(bio: string): Promise<PlayerPublicProfileDto> {
  return request<PlayerPublicProfileDto>('/player/me/bio', { method: 'POST', auth: true, body: { bio } });
}

export function listPlayers(filter: { race?: Race; search?: string } = {}): Promise<PlayerListEntryDto[]> {
  const params = new URLSearchParams();
  if (filter.race) params.set('race', filter.race);
  if (filter.search) params.set('search', filter.search);
  const query = params.toString();
  return request<PlayerListEntryDto[]>(`/player${query ? `?${query}` : ''}`, { auth: true });
}

// Base / buildings
export function getBase(): Promise<BaseResponseDto> {
  return request<BaseResponseDto>('/base', { auth: true });
}

export function upgradeBuilding(key: string): Promise<BuildingStateDto> {
  return request<BuildingStateDto>(`/base/buildings/${key}/upgrade`, { method: 'POST', auth: true });
}

// Robot / equipment
export function getRobot(): Promise<RobotSlotDto[]> {
  return request<RobotSlotDto[]>('/robot', { auth: true });
}

export function equipItem(itemInstanceId: string): Promise<RobotSlotDto[]> {
  return request<RobotSlotDto[]>(`/robot/equip/${itemInstanceId}`, { method: 'POST', auth: true });
}

export function unequipSlot(slot: string): Promise<RobotSlotDto[]> {
  return request<RobotSlotDto[]>(`/robot/unequip/${slot}`, { method: 'POST', auth: true });
}

export function getRobotAttributes(): Promise<RobotAttributesDto> {
  return request<RobotAttributesDto>('/robot/attributes', { auth: true });
}

export function allocateAttribute(stat: string): Promise<RobotAttributesDto> {
  return request<RobotAttributesDto>('/robot/attributes/allocate', { method: 'POST', auth: true, body: { stat } });
}

export function getRobotCombatStats(): Promise<CombatStatsDto> {
  return request<CombatStatsDto>('/robot/combat-stats', { auth: true });
}

// Inventory
export function getInventory(): Promise<InventoryResponseDto> {
  return request<InventoryResponseDto>('/inventory', { auth: true });
}

export function upgradeItem(itemInstanceId: string): Promise<InventoryResponseDto> {
  return request<InventoryResponseDto>(`/inventory/items/${itemInstanceId}/upgrade`, { method: 'POST', auth: true });
}

export function consumeItem(itemInstanceId: string, buildingKey?: string): Promise<InventoryResponseDto> {
  return request<InventoryResponseDto>(`/inventory/items/${itemInstanceId}/use`, { method: 'POST', auth: true, body: { buildingKey } });
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

// Expeditions
export function getExpeditions(): Promise<ExpeditionsResponseDto> {
  return request<ExpeditionsResponseDto>('/expeditions', { auth: true });
}

export function startExpedition(key: string): Promise<ActiveExpeditionDto> {
  return request<ActiveExpeditionDto>(`/expeditions/${key}/start`, { method: 'POST', auth: true });
}

export function claimExpedition(): Promise<ExpeditionClaimResultDto> {
  return request<ExpeditionClaimResultDto>('/expeditions/claim', { method: 'POST', auth: true });
}

export function cancelExpedition(): Promise<ExpeditionClaimResultDto> {
  return request<ExpeditionClaimResultDto>('/expeditions/cancel', { method: 'POST', auth: true });
}

// Research
export function getResearches(): Promise<ResearchResponseDto> {
  return request<ResearchResponseDto>('/research', { auth: true });
}

export function startResearch(key: string): Promise<ResearchStateDto> {
  return request<ResearchStateDto>(`/research/${key}/start`, { method: 'POST', auth: true });
}

// Bosses
export function getBosses(): Promise<BossDto[]> {
  return request<BossDto[]>('/bosses', { auth: true });
}

export function joinBossEncounter(key: string): Promise<BossDto> {
  return request<BossDto>(`/bosses/${key}/join`, { method: 'POST', auth: true });
}

export function resolveBossEncounter(key: string): Promise<BossEncounterResultDto> {
  return request<BossEncounterResultDto>(`/bosses/${key}/resolve`, { method: 'POST', auth: true });
}

// PvP
export function getPvpStatus(): Promise<PvpStatusDto> {
  return request<PvpStatusDto>('/pvp/status', { auth: true });
}

export function scoutPvpOpponent(): Promise<PvpScoutDto> {
  return request<PvpScoutDto>('/pvp/scout', { auth: true });
}

export function attackPvpOpponent(opponentId: string): Promise<PvpBattleReportDto> {
  return request<PvpBattleReportDto>('/pvp/attack', { method: 'POST', auth: true, body: { opponentId } });
}

export function getPvpReports(): Promise<PvpBattleReportDto[]> {
  return request<PvpBattleReportDto[]>('/pvp/reports', { auth: true });
}

// Clans
export function listClans(): Promise<ClanSummaryDto[]> {
  return request<ClanSummaryDto[]>('/clans', { auth: true });
}

export function getMyClan(): Promise<MyClanResponseDto> {
  return request<MyClanResponseDto>('/clans/me', { auth: true });
}

export function getClan(clanId: string): Promise<ClanDetailDto> {
  return request<ClanDetailDto>(`/clans/${clanId}`, { auth: true });
}

export function updateClan(payload: { name?: string; description?: string }): Promise<ClanDetailDto> {
  return request<ClanDetailDto>('/clans/update', { method: 'POST', auth: true, body: payload });
}

export function createClan(payload: { name: string; tag: string; description?: string }): Promise<ClanDetailDto> {
  return request<ClanDetailDto>('/clans', { method: 'POST', auth: true, body: payload });
}

export function joinClan(clanId: string): Promise<ClanDetailDto> {
  return request<ClanDetailDto>(`/clans/${clanId}/join`, { method: 'POST', auth: true });
}

export function leaveClan(): Promise<void> {
  return request<void>('/clans/leave', { method: 'POST', auth: true });
}

export function disbandClan(): Promise<void> {
  return request<void>('/clans/disband', { method: 'POST', auth: true });
}

export function kickClanMember(playerId: string): Promise<void> {
  return request<void>(`/clans/members/${playerId}/kick`, { method: 'POST', auth: true });
}

export function promoteClanMember(playerId: string): Promise<void> {
  return request<void>(`/clans/members/${playerId}/promote`, { method: 'POST', auth: true });
}

export function demoteClanMember(playerId: string): Promise<void> {
  return request<void>(`/clans/members/${playerId}/demote`, { method: 'POST', auth: true });
}

export function transferClanLeadership(playerId: string): Promise<void> {
  return request<void>(`/clans/members/${playerId}/transfer-leadership`, { method: 'POST', auth: true });
}

export function donateToClan(payload: { metal?: number; crystal?: number; credits?: number }): Promise<ClanDetailDto> {
  return request<ClanDetailDto>('/clans/donate', { method: 'POST', auth: true, body: payload });
}

export function upgradeClanBuilding(key: string): Promise<ClanDetailDto> {
  return request<ClanDetailDto>(`/clans/buildings/${key}/upgrade`, { method: 'POST', auth: true });
}

export function getClanMessages(clanId: string): Promise<ClanMessageDto[]> {
  return request<ClanMessageDto[]>(`/clans/${clanId}/messages`, { auth: true });
}

export function sendClanMessage(clanId: string, text: string): Promise<ClanMessageDto> {
  return request<ClanMessageDto>(`/clans/${clanId}/messages`, { method: 'POST', auth: true, body: { text } });
}
