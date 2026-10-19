import type {
  AchievementsDto,
  AccountDeletionCodeDto,
  AccountDeletionStatusDto,
  BlockedPlayerDto,
  CosmeticsCatalogDto,
  NotificationSettingsDto,
  SupportCategoryValue,
  SupportTicketDto,
  MarketListingDto,
  MyMarketListingsDto,
  ShopResponseDto,
  BlockStatusDto,
  ClanLeaderboardPageDto,
  ClanLeaderboardSortBy,
  DirectMessageDto,
  FriendDto,
  FriendRequestsDto,
  FriendshipStatusDto,
  PlayerLeaderboardPageDto,
  PlayerLeaderboardSortBy,
  PlayerPublicProfileDto,
  PvpBattleReportDto,
  PvpScoutDto,
  ClanDetailDto,
  ClanMessageDto,
  ClanSummaryDto,
  ClanWarAttackReportDto,
  ClanWarContributionsDto,
  ClanWarHistoryEntryDto,
  ClanWarStateDto,
  ClanWarTargetDto,
  CoreAttackResultDto,
  CorePlayerRankingPageDto,
  CorePlayerRankingScope,
  Race,
  ReportReason,
  ReportTargetType,
  ActiveExpeditionDto,
  CombatReportDto,
  ExpeditionClaimResultDto,
  ResearchStateDto,
  BattleReportDto,
  BossFormationDto,
  BoxOpenResultDto,
  CombatStatsDto,
  MultiAttackResultDto,
  PentiliDto,
  RobotAttributesDto,
  AuthResponse,
  AuthTokens,
  BaseResponseDto,
  BossFormationsResponseDto,
  BuildingStateDto,
  ClanWarStatusResponseDto,
  CoreStateDto,
  DailyTasksDto,
  ExpeditionsResponseDto,
  InventoryResponseDto,
  LoginRequest,
  MyClanResponseDto,
  PlayerProfileDto,
  PvpStatusDto,
  ResearchResponseDto,
  RobotSlotDto,
  ZoneDto,
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

// Command Center
export const getRobot = () => request<RobotSlotDto[]>('/robot', { auth: true });
export const getZones = () => request<ZoneDto[]>('/zones', { auth: true });
export const getResearches = () => request<ResearchResponseDto>('/research', { auth: true });
export const getExpeditions = () => request<ExpeditionsResponseDto>('/expeditions', { auth: true });
export const getMyClan = () => request<MyClanResponseDto>('/clans/me', { auth: true });
export const getPvpStatus = () => request<PvpStatusDto>('/pvp/status', { auth: true });
export const getCoreState = () => request<CoreStateDto>('/core', { auth: true });
export const getClanWarStatus = () => request<ClanWarStatusResponseDto>('/clan-wars/status', { auth: true });
export const getBossFormations = () => request<BossFormationsResponseDto>('/boss-formations', { auth: true });
export const getDailyTasks = () => request<DailyTasksDto>('/daily-tasks', { auth: true });
export const getAchievements = () => request<AchievementsDto>('/achievements', { auth: true });

// Robot and inventory
export const getRobotAttributes = () => request<RobotAttributesDto>('/robot/attributes', { auth: true });
export const getRobotCombatStats = () => request<CombatStatsDto>('/robot/combat-stats', { auth: true });
export const equipItem = (id: string) => request<RobotSlotDto[]>(`/robot/equip/${id}`, { method: 'POST', auth: true });
export const unequipSlot = (slot: string) => request<RobotSlotDto[]>(`/robot/unequip/${slot}`, { method: 'POST', auth: true });
export const upgradeItem = (id: string) => request<InventoryResponseDto>(`/inventory/items/${id}/upgrade`, { method: 'POST', auth: true });
export const sellItem = (id: string) => request<InventoryResponseDto>(`/inventory/items/${id}/sell`, { method: 'POST', auth: true });
export const recycleItem = (id: string) => request<InventoryResponseDto>(`/inventory/items/${id}/recycle`, { method: 'POST', auth: true });
export const openBox = (id: string) => request<BoxOpenResultDto>(`/inventory/items/${id}/open`, { method: 'POST', auth: true });
export const allocateAttribute = (stat: string) => request<RobotAttributesDto>('/robot/attributes/allocate', { method: 'POST', auth: true, body: { stat } });

// Lands, Pentili, bosses
export const getPentiliInZone = (zoneId: string) => request<PentiliDto[]>(`/zones/${zoneId}/pentili`, { auth: true });
export const attackPentili = (id: string) => request<BattleReportDto>(`/pve/attack/${id}`, { method: 'POST', auth: true });
export const attackPentiliMulti = (id: string) => request<MultiAttackResultDto>(`/pve/attack/${id}/multi`, { method: 'POST', auth: true });
export const createBossFormation = (bossKey: string, visibility: { visibleToClanOnly: boolean; visibleToFriendsOnly: boolean }) =>
  request<BossFormationDto>('/boss-formations', { method: 'POST', auth: true, body: { bossKey, ...visibility } });
export const joinBossFormation = (id: string) => request<BossFormationDto>(`/boss-formations/${id}/join`, { method: 'POST', auth: true });
export const updateBossFormationVisibility = (id: string, visibility: { visibleToClanOnly: boolean; visibleToFriendsOnly: boolean }) =>
  request<BossFormationDto>(`/boss-formations/${id}/visibility`, { method: 'PATCH', auth: true, body: visibility });

// Daily tasks, achievements, expeditions, research, reports
export const claimDailyTask = (key: string) => request<DailyTasksDto>(`/daily-tasks/${key}/claim`, { method: 'POST', auth: true });
export const claimAchievement = (key: string) => request<AchievementsDto>(`/achievements/${key}/claim`, { method: 'POST', auth: true });
export const startExpedition = (key: string) => request<ActiveExpeditionDto>(`/expeditions/${key}/start`, { method: 'POST', auth: true });
export const claimExpedition = () => request<ExpeditionClaimResultDto>('/expeditions/claim', { method: 'POST', auth: true });
export const cancelExpedition = () => request<ExpeditionClaimResultDto>('/expeditions/cancel', { method: 'POST', auth: true });
export const startResearch = (key: string) => request<ResearchStateDto>(`/research/${key}/start`, { method: 'POST', auth: true });
export const getCombatReports = () => request<CombatReportDto[]>('/reports', { auth: true });

// Clans
export const listClans = () => request<ClanSummaryDto[]>('/clans', { auth: true });
export const getClan = (clanId: string) => request<ClanDetailDto>(`/clans/${clanId}`, { auth: true });
export const createClan = (payload: { name: string; tag: string; description?: string }) => request<ClanDetailDto>('/clans', { method: 'POST', auth: true, body: payload });
export const updateClan = (payload: { name?: string; description?: string }) => request<ClanDetailDto>('/clans/update', { method: 'POST', auth: true, body: payload });
export const updateClanJoinRequirements = (payload: { minLevel?: number; minDamage?: number; minDefense?: number; minHp?: number; minEvasion?: number; allowedRaces?: Race[] }) =>
  request<ClanDetailDto>('/clans/join-requirements', { method: 'POST', auth: true, body: payload });
export const joinClan = (clanId: string) => request<ClanDetailDto>(`/clans/${clanId}/join`, { method: 'POST', auth: true });
export const leaveClan = () => request<void>('/clans/leave', { method: 'POST', auth: true });
export const disbandClan = () => request<void>('/clans/disband', { method: 'POST', auth: true });
export const kickClanMember = (playerId: string) => request<void>(`/clans/members/${playerId}/kick`, { method: 'POST', auth: true });
export const promoteClanMember = (playerId: string) => request<void>(`/clans/members/${playerId}/promote`, { method: 'POST', auth: true });
export const demoteClanMember = (playerId: string) => request<void>(`/clans/members/${playerId}/demote`, { method: 'POST', auth: true });
export const transferClanLeadership = (playerId: string) => request<void>(`/clans/members/${playerId}/transfer-leadership`, { method: 'POST', auth: true });
export const donateToClan = (payload: { metal?: number; crystal?: number; credits?: number }) => request<ClanDetailDto>('/clans/donate', { method: 'POST', auth: true, body: payload });
export const upgradeClanBuilding = (key: string) => request<ClanDetailDto>(`/clans/buildings/${key}/upgrade`, { method: 'POST', auth: true });
export const activateClanBuilding = (key: string) => request<ClanDetailDto>(`/clans/buildings/${key}/activate`, { method: 'POST', auth: true });
export const getClanMessages = (clanId: string) => request<ClanMessageDto[]>(`/clans/${clanId}/messages`, { auth: true });
export const sendClanMessage = (clanId: string, text: string) => request<ClanMessageDto>(`/clans/${clanId}/messages`, { method: 'POST', auth: true, body: { text } });

// Clan wars
export const declareClanWar = (targetClanId: string) => request<ClanWarStateDto>('/clan-wars/declare', { method: 'POST', auth: true, body: { targetClanId } });
export const getClanWarTargets = () => request<ClanWarTargetDto[]>('/clan-wars/targets', { auth: true });
export const attackClanWarTarget = (defenderId: string) => request<ClanWarAttackReportDto>('/clan-wars/attack', { method: 'POST', auth: true, body: { defenderId } });
export const getClanWarHistory = () => request<ClanWarHistoryEntryDto[]>('/clan-wars/history', { auth: true });
export const getClanWarContributions = (warId: string) => request<ClanWarContributionsDto>(`/clan-wars/${warId}/contributions`, { auth: true });

// Core
export const getCorePlayerRanking = (scope: CorePlayerRankingScope, page: number) => request<CorePlayerRankingPageDto>(`/core/players?scope=${scope}&page=${page}`, { auth: true });
export const attackCore = () => request<CoreAttackResultDto>('/core/attack', { method: 'POST', auth: true });

// Moderation (report / block — an app-store requirement for player content)
export const blockPlayer = (playerId: string) => request<void>(`/moderation/blocks/${playerId}`, { method: 'POST', auth: true });
export const createReport = (payload: { targetType: ReportTargetType; targetId: string; reason: ReportReason; comment?: string }) =>
  request<void>('/moderation/reports', { method: 'POST', auth: true, body: payload });

// Friends and messages
export const getFriends = () => request<FriendDto[]>('/friends', { auth: true });
export const getFriendRequests = () => request<FriendRequestsDto>('/friends/requests', { auth: true });
export const getFriendshipStatus = (playerId: string) => request<FriendshipStatusDto>(`/friends/status/${playerId}`, { auth: true });
export const sendFriendRequest = (playerId: string) => request<void>('/friends/request', { method: 'POST', auth: true, body: { playerId } });
export const acceptFriendRequest = (requestId: string) => request<void>(`/friends/accept/${requestId}`, { method: 'POST', auth: true });
export const declineFriendRequest = (requestId: string) => request<void>(`/friends/decline/${requestId}`, { method: 'POST', auth: true });
export const removeFriend = (playerId: string) => request<void>(`/friends/remove/${playerId}`, { method: 'POST', auth: true });
export const getConversation = (friendId: string) => request<DirectMessageDto[]>(`/friends/messages/${friendId}`, { auth: true });
export const sendDirectMessage = (friendId: string, text: string) => request<DirectMessageDto>(`/friends/messages/${friendId}`, { method: 'POST', auth: true, body: { text } });

// Players, profiles, leaderboards
export const getPublicProfile = (playerId: string) => request<PlayerPublicProfileDto>(`/player/${playerId}`, { auth: true });
export const updateBio = (bio: string) => request<PlayerPublicProfileDto>('/player/me/bio', { method: 'POST', auth: true, body: { bio } });
export const getBlockStatus = (playerId: string) => request<BlockStatusDto>(`/moderation/blocks/${playerId}`, { auth: true });
export const unblockPlayer = (playerId: string) => request<void>(`/moderation/blocks/${playerId}`, { method: 'DELETE', auth: true });

function query(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}
export const listPlayers = (filter: { race?: Race; search?: string; sortBy?: PlayerLeaderboardSortBy; page?: number; pageSize?: number } = {}) =>
  request<PlayerLeaderboardPageDto>(`/player${query(filter)}`, { auth: true });
export const getClanLeaderboard = (filter: { sortBy?: ClanLeaderboardSortBy; page?: number; pageSize?: number } = {}) =>
  request<ClanLeaderboardPageDto>(`/clans/leaderboard${query(filter)}`, { auth: true });

// PvP
export const scoutPvpOpponent = () => request<PvpScoutDto>('/pvp/scout', { auth: true });
export const attackPvpOpponent = (opponentId: string) => request<PvpBattleReportDto>('/pvp/attack', { method: 'POST', auth: true, body: { opponentId } });
export const getPvpReports = () => request<PvpBattleReportDto[]>('/pvp/reports', { auth: true });

// Shop (in-game resources only — real-money offers stay on the web; the apps will use store billing)
export const getShop = () => request<ShopResponseDto>('/shop', { auth: true });
export const buyItem = (itemDefinitionKey: string) => request<void>(`/shop/${itemDefinitionKey}/buy`, { method: 'POST', auth: true });

// Market
export const getMarketListings = () => request<MarketListingDto[]>('/market', { auth: true });
export const getMyMarketListings = () => request<MyMarketListingsDto>('/market/mine', { auth: true });
export const createMarketListing = (
  itemInstanceId: string,
  price: { priceMetal: number; priceCrystal: number; priceCredits: number },
  visibility: { visibleToClanOnly: boolean; visibleToFriendsOnly: boolean },
) => request<MarketListingDto>('/market/listings', { method: 'POST', auth: true, body: { itemInstanceId, ...price, ...visibility } });
export const cancelMarketListing = (listingId: string) => request<void>(`/market/listings/${listingId}/cancel`, { method: 'POST', auth: true });
export const buyMarketListing = (listingId: string) => request<void>(`/market/listings/${listingId}/buy`, { method: 'POST', auth: true });

// Settings
type NotificationSettingsResponse = { settings: NotificationSettingsDto; pushPublicKey: string | null };
export const getNotificationSettings = () => request<NotificationSettingsResponse>('/player/me/notification-settings', { auth: true });
export const updateNotificationSettings = (settings: NotificationSettingsDto) =>
  request<NotificationSettingsResponse>('/player/me/notification-settings', { method: 'POST', auth: true, body: { settings } });
export const changePassword = (currentPassword: string, newPassword: string) =>
  request<void>('/player/me/password', { method: 'POST', auth: true, body: { currentPassword, newPassword } });
export const updatePreferredLocale = (locale: string) => request<PlayerProfileDto>('/player/me/locale', { method: 'POST', auth: true, body: { locale } });
export const getCosmeticsCatalog = () => request<CosmeticsCatalogDto>('/player/cosmetics', { auth: true });
export const updateAvatar = (avatarKey: string) => request<PlayerProfileDto>('/player/me/avatar', { method: 'POST', auth: true, body: { avatarKey } });
export const updateFrame = (frameKey: string) => request<PlayerProfileDto>('/player/me/frame', { method: 'POST', auth: true, body: { frameKey } });
export const getBlockedPlayers = () => request<BlockedPlayerDto[]>('/moderation/blocks', { auth: true });
export const getSupportTickets = () => request<SupportTicketDto[]>('/support/tickets', { auth: true });
export const createSupportTicket = (category: SupportCategoryValue, text: string) => request<SupportTicketDto[]>('/support/tickets', { method: 'POST', auth: true, body: { category, text } });
export const replySupportTicket = (ticketId: string, text: string) => request<SupportTicketDto[]>(`/support/tickets/${ticketId}/messages`, { method: 'POST', auth: true, body: { text } });
export const markSupportTicketRead = (ticketId: string) => request<void>(`/support/tickets/${ticketId}/read`, { method: 'POST', auth: true });
export const getAccountDeletionStatus = () => request<AccountDeletionStatusDto>('/player/me/deletion', { auth: true });
export const getAccountDeletionCode = () => request<AccountDeletionCodeDto>('/player/me/deletion/code', { method: 'POST', auth: true });
export const requestAccountDeletion = (password: string, code: string) => request<AccountDeletionStatusDto>('/player/me/deletion', { method: 'POST', auth: true, body: { password, code } });
export const cancelAccountDeletion = () => request<AccountDeletionStatusDto>('/player/me/deletion/cancel', { method: 'POST', auth: true });
