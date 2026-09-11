export type EquipmentSlot = 'HEAD' | 'LEFT_ARM' | 'RIGHT_ARM' | 'ARMOR' | 'CORE' | 'LEFT_LEG' | 'RIGHT_LEG';
export type ItemCategory = 'EQUIPMENT' | 'CONSUMABLE';
// Named equipment sets — see instructions/GAME_SYSTEMS.md. Null for consumables.
export type ItemTier = 'PIONEER' | 'ASCENDANT' | 'COREFORGED';
// "Excellent options" quality. EPIC (2 options) isn't rollable through normal loot yet.
export type ItemQuality = 'NORMAL' | 'RARE' | 'EPIC';
export type ItemOption = 'INCREASE_DAMAGE' | 'CRITICAL_DAMAGE' | 'INCREASE_MAX_HP' | 'DAMAGE_DECREASE' | 'DAMAGE_REFLECT';
export type ResourceType = 'METAL' | 'CRYSTAL' | 'CREDITS';
export type BattleOutcome = 'WIN' | 'LOSS';
// Names/lore LOCKED (instructions/PRODUCT_SPEC.md); identity only for now — no stat bonus.
export type Race = 'LUXARI' | 'VORLUN' | 'ZARYTH' | 'THALION' | 'NEXAR';

export interface ResourcesDto {
  metal: number;
  crystal: number;
  credits: number;
}

export interface EnergyDto {
  current: number;
  max: number;
  // ISO timestamp of the next point's regeneration, or null when already at max.
  nextRegenAt: string | null;
}

export interface PlayerProfileDto {
  id: string;
  email: string;
  username: string;
  race: Race;
  level: number;
  xp: number;
  xpForNextLevel: number | null;
  bio: string | null;
  resources: ResourcesDto;
  energy: EnergyDto;
  // Null until the player saves a choice in Settings.
  preferredLocale: string | null;
  // Cosmetic profile picture (owner decision, 2026-09-09) — defaults to
  // "avatar1"/"frame1" for every account, freely replaceable in Settings.
  // Keys, not asset ids: the frontend builds "avatars.<key>.icon" /
  // "frames.<key>.icon" itself, same convention as race.
  selectedAvatarKey: string;
  selectedFrameKey: string;
}

export interface AvatarDto {
  key: string;
  nameKey: string;
  iconAssetId: string;
}

export interface FrameDto {
  key: string;
  nameKey: string;
  iconAssetId: string;
}

export interface CosmeticsCatalogDto {
  avatars: AvatarDto[];
  frames: FrameDto[];
}

export interface PublicProfileClanDto {
  id: string;
  name: string;
  tag: string;
  role: ClanRole;
}

// Leaderboard (owner decision, 2026-09-10) — split into a player board and a
// clan board (see ClanLeaderboardEntryDto below). Sortable by more than raw
// level so more than one type of play gets its own "#1", reusing data
// already tracked elsewhere (PvpBattleReport, ClanWarAttack) rather than
// introducing new tracking just for this. Deliberately excludes wealth
// (Metal/Crystal/Credits) as a rankable metric — owner decision, same
// privacy reasoning as excluding clan treasury from the clan board.
export type PlayerLeaderboardSortBy = 'level' | 'pvpWins' | 'clanWarDamage';

export interface PlayerLeaderboardEntryDto {
  id: string;
  username: string;
  race: Race;
  level: number;
  clanId: string | null;
  clanTag: string | null;
  selectedAvatarKey: string;
  selectedFrameKey: string;
  // Wins as attacker (outcome WIN) plus successful defenses (outcome LOSS
  // from the attacker's own perspective) — every PvP battle this player
  // actually won, regardless of which side they were on.
  pvpWins: number;
  // Sum of raw damageDealt across every clan-war duel this player has ever
  // attacked in (not just the current war).
  clanWarDamageDealt: number;
  // True rank by the requested sort metric across ALL players — stable
  // regardless of the current search/race filter, unlike a plain row index.
  globalRank: number;
  // Rank by the same metric among players of this player's own race only
  // (e.g. "15th among Luxari").
  raceRank: number;
  isCurrentPlayer: boolean;
}

export interface PlayerLeaderboardPageDto {
  entries: PlayerLeaderboardEntryDto[];
  page: number;
  pageSize: number;
  total: number;
}

// Clan board — owner decision: no treasury (donation amounts stay private)
// and no loss count shown (only total wars fought plus each win type),
// mirroring the same "only show what a clan achieved, not what it lost or
// spent" philosophy applied to the player board's wealth exclusion above.
export type ClanLeaderboardSortBy = 'wars' | 'avgLevel';

export interface ClanLeaderboardEntryDto {
  id: string;
  name: string;
  tag: string;
  memberCount: number;
  averageMemberLevel: number;
  totalWars: number;
  conquestWins: number;
  decisionWins: number;
  rank: number;
  isMyClan: boolean;
}

export interface ClanLeaderboardPageDto {
  entries: ClanLeaderboardEntryDto[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PlayerPublicProfileDto {
  id: string;
  username: string;
  race: Race;
  level: number;
  bio: string | null;
  createdAt: string;
  clan: PublicProfileClanDto | null;
  selectedAvatarKey: string;
  selectedFrameKey: string;
}

export interface BuildingCostDto {
  metalCost: number;
  crystalCost: number;
  constructionSeconds: number;
}

export interface BuildingProductionDto {
  resourceType: ResourceType;
  perHour: number;
}

export interface BuildingStateDto {
  key: string;
  nameKey: string;
  iconAssetId: string;
  level: number;
  maxLevel: number;
  constructionEndsAt: string | null;
  nextLevelCost: BuildingCostDto | null;
  // null when the building isn't built yet, or (for a resource-producing building) has no coded effect.
  currentProduction: BuildingProductionDto | null;
  nextLevelProduction: BuildingProductionDto | null;
  // Flat personal-inventory slot bonus (currently only the Warehouse sets this). Mutually
  // exclusive with currentProduction/nextLevelProduction — a building has one effect or the other.
  currentCapacityBonus: number | null;
  nextLevelCapacityBonus: number | null;
  // Flat Market listing-slot bonus (currently only the Trading Post sets this) — same
  // mutually-exclusive-effect pattern as currentCapacityBonus above.
  currentMarketSlotBonus: number | null;
  nextLevelMarketSlotBonus: number | null;
}

export interface BaseResponseDto {
  resources: ResourcesDto;
  buildings: BuildingStateDto[];
}

export interface EquippedItemDto {
  itemInstanceId: string;
  itemDefinitionKey: string;
  nameKey: string;
  descriptionKey: string;
  iconAssetId: string;
  upgradeLevel: number;
  quality: ItemQuality;
  // Set only for a race-locked instance (see InventoryItemDto.race) — null for universal items.
  race: Race | null;
}

export interface RobotSlotDto {
  slot: EquipmentSlot;
  item: EquippedItemDto | null;
}

export interface CoreAttributeValues {
  damage: number;
  defense: number;
  hp: number;
  evasion: number;
}

export interface RobotAttributesDto {
  available: number;
  base: CoreAttributeValues;
  nextCost: CoreAttributeValues;
  // Only Evasion can ever be capped — Damage/Defense/HP grow indefinitely by design.
  evasionAtCap: boolean;
}

export interface ItemStatsDto {
  attack?: number;
  defense?: number;
  hp?: number;
}

export interface UpgradeCostDto {
  itemDefinitionKey: string;
  quantity: number;
}

export interface SellValueDto {
  metal: number;
  crystal: number;
}

export interface RecycleValueDto {
  fragmentItemDefinitionKey: string;
  ownedFragments: number;
  fragmentsPerStone: number;
}

export interface BoxOpenResultDto {
  nameKey: string;
  iconAssetId: string;
  quality: ItemQuality;
  rolledOptions: ItemOption[];
  race: Race | null;
}

export interface RaceLockInfoDto {
  // Chance the granted instance is locked to the buyer's own specific race —
  // the same figure for every race, since all 5 are equally likely.
  ownRaceChance: number;
  // Chance the granted instance is universal (unlocked). 0 for COREFORGED,
  // which is never universal.
  universalChance: number;
}

export interface ShopItemDto {
  itemDefinitionKey: string;
  nameKey: string;
  descriptionKey: string;
  category: ItemCategory;
  slot: EquipmentSlot | null;
  tier: ItemTier | null;
  iconAssetId: string;
  priceMetal: number;
  priceCrystal: number;
  priceCredits: number;
  // Null for CONSUMABLE items. Base stats at upgrade level 0 — a freshly
  // bought item always starts unupgraded, so this is just the item's raw
  // baseStats (mirrors inventory.service.ts's computeItemStats at level 0).
  baseStats: ItemStatsDto | null;
  // Null for CONSUMABLE items and for PIONEER (always universal, no lock
  // risk). Populated for ASCENDANT/COREFORGED so the buyer can see the odds
  // before committing — see inventory-capacity.ts's rollRace().
  raceLockInfo: RaceLockInfoDto | null;
}

export interface ShopResponseDto {
  items: ShopItemDto[];
}

export interface InventoryItemDto {
  id: string;
  itemDefinitionKey: string;
  nameKey: string;
  descriptionKey: string;
  category: ItemCategory;
  // Null for CONSUMABLE items — they have no equipment slot.
  slot: EquipmentSlot | null;
  // Null for CONSUMABLE items.
  tier: ItemTier | null;
  iconAssetId: string;
  upgradeLevel: number;
  maxUpgradeLevel: number;
  // Stack size — always 1 for EQUIPMENT, may be >1 for CONSUMABLE.
  quantity: number;
  equipped: boolean;
  quality: ItemQuality;
  rolledOptions: ItemOption[];
  // Set only for COREFORGED items — this specific dropped instance can only be
  // equipped by a player of this race. Null for everything else.
  race: Race | null;
  // Null for CONSUMABLE items. Effective stat contribution of this specific
  // item at its current/next upgrade level (baseStats scaled by upgrade bonus).
  currentStats: ItemStatsDto | null;
  // Null for CONSUMABLE items and once already at maxUpgradeLevel.
  nextLevelStats: ItemStatsDto | null;
  // Null for CONSUMABLE items and once already at maxUpgradeLevel.
  upgradeCost: UpgradeCostDto | null;
  // Null for CONSUMABLE items. Always populated for EQUIPMENT regardless of
  // upgrade level (unlike upgradeCost, which nulls out at maxUpgradeLevel).
  sellValue: SellValueDto | null;
  // Null for CONSUMABLE items. Always populated for EQUIPMENT, mirroring sellValue.
  recycleValue: RecycleValueDto | null;
  // True while an ACTIVE Market listing exists for this instance — equip/
  // sell/recycle/upgrade all block on this, and the UI should show a
  // "Listed" state instead of the usual actions.
  listedForSale: boolean;
}

export interface InventoryResponseDto {
  items: InventoryItemDto[];
  capacity: number;
  // Count of unequipped items only — equipped gear doesn't count against capacity.
  used: number;
}

export interface ZonePentiliPreviewDto {
  nameKey: string;
  iconAssetId: string;
}

export interface ZoneDto {
  id: string;
  key: string;
  nameKey: string;
  order: number;
  unlockLevel: number;
  unlocked: boolean;
  iconAssetId: string;
  pentiliPreview: ZonePentiliPreviewDto[];
}

export interface PentiliLootDropDto {
  type: 'resource' | 'item';
  resourceType?: ResourceType;
  itemNameKey?: string;
  itemIconAssetId?: string;
  dropChance: number;
  minQuantity: number;
  maxQuantity: number;
}

export interface PentiliDto {
  id: string;
  key: string;
  nameKey: string;
  level: number;
  maxHp: number;
  attack: number;
  defense: number;
  xpReward: number;
  iconAssetId: string;
  lootDrops: PentiliLootDropDto[];
}

export interface LootResultEntryDto {
  type: 'resource' | 'item';
  resourceType?: ResourceType;
  itemDefinitionKey?: string;
  itemNameKey?: string;
  itemIconAssetId?: string;
  quantity: number;
}

// Unified combat history across PvE/PvP/Boss Hunts (GET /reports) — one row
// shape covering all three sources, mirroring how LootResultEntryDto already
// keys optional fields off a `type`/`source` discriminator instead of a
// nested union.
export type CombatReportSource = 'PVE' | 'PVP' | 'BOSS';

export interface CombatReportDto {
  id: string;
  source: CombatReportSource;
  createdAt: string;
  // Always relative to the viewing player — a PvP defender's own row has
  // this flipped from the underlying attacker-relative stored outcome.
  outcome: BattleOutcome;
  zoneNameKey: string | null; // PvE + Boss only
  opponentNameKey: string | null; // Pentili name (PvE) or Boss name (BOSS) — a translation key
  opponentPlayerId: string | null; // PvP only
  opponentUsername: string | null; // PvP only — a literal player-chosen name, never a translation key
  xpGained: number;
  lootSummary: LootResultEntryDto[];
}

export interface CombatRoundDto {
  round: number;
  playerDamage: number;
  pentiliDamage: number;
  playerHpAfter: number;
  pentiliHpAfter: number;
  // true when the player evaded the opponent's swing this round (pentiliDamage forced to 0)
  playerDodged: boolean;
  // true when the opponent evaded the player's swing this round (playerDamage forced to 0)
  pentiliDodged: boolean;
  // true when that side's hit this round was a critical hit
  playerCritical: boolean;
  pentiliCritical: boolean;
  // Damage reflected back onto this side this round, from the other side's Damage Reflect option.
  playerReflectedDamage: number;
  pentiliReflectedDamage: number;
}

export interface BattleReportDto {
  id: string;
  pentiliKey: string;
  pentiliNameKey: string;
  zoneKey: string;
  outcome: BattleOutcome;
  xpGained: number;
  lootSummary: LootResultEntryDto[];
  damageDealt: number;
  damageTaken: number;
  rounds: CombatRoundDto[];
  playerMaxHp: number;
  pentiliMaxHp: number;
  createdAt: string;
  playerLevel: number;
  leveledUp: boolean;
}

export interface ExpeditionRewardsDto {
  metal: number;
  crystal: number;
  credits: number;
  xp: number;
}

export interface ExpeditionTypeDto {
  key: string;
  nameKey: string;
  durationMinutes: number;
  rewards: ExpeditionRewardsDto;
  bonusItemNameKey: string | null;
  bonusItemIconAssetId: string | null;
  bonusItemChance: number | null;
}

export interface ActiveExpeditionDto {
  expeditionKey: string;
  expeditionNameKey: string;
  startedAt: string;
  endsAt: string;
  completed: boolean;
}

export interface ExpeditionsResponseDto {
  types: ExpeditionTypeDto[];
  active: ActiveExpeditionDto | null;
}

export interface ExpeditionClaimResultDto {
  rewards: ExpeditionRewardsDto;
  bonusItem: { itemDefinitionKey: string; itemNameKey: string; itemIconAssetId: string } | null;
  leveledUp: boolean;
  playerLevel: number;
}

export type ResearchBonusType = 'METAL_PRODUCTION' | 'CRYSTAL_PRODUCTION' | 'COMBAT_ATTACK' | 'COMBAT_HP';

export interface ResearchCostDto {
  metalCost: number;
  crystalCost: number;
  creditsCost: number;
  researchSeconds: number;
}

export interface ResearchStateDto {
  key: string;
  nameKey: string;
  descriptionKey: string;
  bonusType: ResearchBonusType;
  bonusPerLevel: number;
  iconAssetId: string;
  level: number;
  maxLevel: number;
  researchEndsAt: string | null;
  nextLevelCost: ResearchCostDto | null;
}

export interface ResearchResponseDto {
  resources: ResourcesDto;
  researches: ResearchStateDto[];
}

export type BossEncounterStatus = 'OPEN' | 'RESOLVED';

export interface BossEncounterParticipantDto {
  playerId: string;
  race: Race;
  joinedAt: string;
  isCurrentPlayer: boolean;
}

export interface BossEncounterResultDto {
  outcome: BattleOutcome | null; // null: the join window expired with no participants
  rounds: CombatRoundDto[];
  partyMaxHp: number;
  bossMaxHp: number;
  synergyBonusPercent: number;
  participants: {
    playerId: string;
    contributionShare: number;
    xpGained: number;
    lootSummary: LootResultEntryDto[];
  }[];
}

export interface BossPartyPreviewDto {
  attack: number;
  defense: number;
  hp: number;
  synergyBonusPercent: number;
}

export interface BossEncounterDto {
  id: string;
  status: BossEncounterStatus;
  openedAt: string;
  resolvesAt: string;
  participants: BossEncounterParticipantDto[];
  // Live totals for an OPEN encounter (null once no one has joined, or once RESOLVED — see `result` then).
  partyPreview: BossPartyPreviewDto | null;
  result: BossEncounterResultDto | null;
}

export interface BossDto {
  id: string;
  key: string;
  nameKey: string;
  zoneNameKey: string;
  level: number;
  maxHp: number;
  attack: number;
  defense: number;
  xpReward: number;
  iconAssetId: string;
  unlocked: boolean;
  encounter: BossEncounterDto;
}

export interface PvpStatusDto {
  unlocked: boolean;
  minLevel: number;
  attackCostEnergy: number;
}

export interface CombatStatsDto {
  attack: number;
  defense: number;
  hp: number;
  evasion: number;
  // All percentages (e.g. 10 = 10%), summed from equipped items' rolled options.
  criticalDamageBonus: number;
  damageDecrease: number;
  damageReflect: number;
}

export interface PvpScoutDto {
  opponentId: string;
  opponentUsername: string;
  opponentRace: Race;
  opponentLevel: number;
  opponentClanTag: string | null;
  opponentSelectedAvatarKey: string;
  opponentSelectedFrameKey: string;
  myStats: CombatStatsDto;
  opponentStats: CombatStatsDto;
}

export interface PvpBattleReportDto {
  id: string;
  role: 'attacker' | 'defender';
  opponentId: string;
  opponentUsername: string;
  opponentRace: Race;
  opponentSelectedAvatarKey: string;
  opponentSelectedFrameKey: string;
  outcome: BattleOutcome;
  rounds: CombatRoundDto[];
  attackerMaxHp: number;
  defenderMaxHp: number;
  damageDealt: number;
  damageTaken: number;
  lootSummary: LootResultEntryDto[];
  createdAt: string;
}

export type ClanRole = 'LEADER' | 'OFFICER' | 'MEMBER';

export interface ClanTreasuryDto {
  metal: number;
  crystal: number;
  credits: number;
}

// Join requirements (owner decision, 2026-09-10) — automatic eligibility
// filter checked at join time, set by the leader or an officer. minAttributes
// checks the player's raw Core Attribute points (equipment excluded — see
// schema.prisma's comment on Clan.joinMinLevel/etc.). An empty allowedRaces
// array means no race restriction.
export interface ClanJoinRequirementsDto {
  minLevel: number;
  minAttributes: CoreAttributeValues;
  allowedRaces: Race[];
}

export interface ClanSummaryDto {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  memberCount: number;
  memberCap: number;
  leaderId: string;
  leaderUsername: string;
  treasury: ClanTreasuryDto;
  joinRequirements: ClanJoinRequirementsDto;
}

export interface ClanMemberDto {
  playerId: string;
  username: string;
  race: Race;
  level: number;
  role: ClanRole;
  joinedAt: string;
  isCurrentPlayer: boolean;
  contributed: ClanTreasuryDto;
  // No real-time presence system — "online" is a server-computed threshold
  // (GAME_BALANCE.presence.onlineThresholdMinutes) against lastActiveAt.
  online: boolean;
  lastActiveAt: string;
}

export type ClanBuildingBonusType = 'MEMBER_CAPACITY' | 'COMBAT_BONUS' | 'PRODUCTION_BONUS';

export interface ClanBuildingCostDto {
  metalCost: number;
  crystalCost: number;
  creditsCost: number;
  constructionSeconds: number;
}

export interface ClanBuildingStateDto {
  key: string;
  nameKey: string;
  descriptionKey: string;
  bonusType: ClanBuildingBonusType;
  bonusPerLevel: number;
  iconAssetId: string;
  level: number;
  maxLevel: number;
  constructionEndsAt: string | null;
  nextLevelCost: ClanBuildingCostDto | null;
}

// Treasury is null unless the viewer is a member of this clan (owner
// decision, 2026-09-11 — donation amounts stay private on the public clan
// page, same reasoning already applied to the clan leaderboard). Buildings
// stay public — they signal a clan's strength without exposing donations.
// Owner decision (2026-09-11): unlike treasury, current war status is fully
// public — it's an institutional fact (not individual player behavior) and
// showing who's fighting whom adds real strategic depth (e.g. targeting an
// opponent already weakened by another war), consistent with the genre.
export interface ClanActiveWarDto {
  opponentClanId: string;
  opponentClanTag: string;
  opponentClanName: string;
  endsAt: string;
}

export interface ClanDetailDto extends Omit<ClanSummaryDto, 'treasury'> {
  createdAt: string;
  treasury: ClanTreasuryDto | null;
  activeWar: ClanActiveWarDto | null;
  members: ClanMemberDto[];
  myRole: ClanRole | null;
  buildings: ClanBuildingStateDto[];
}

export interface MyClanResponseDto {
  clan: ClanDetailDto | null;
}

export interface ClanMessageDto {
  id: string;
  playerId: string;
  username: string;
  text: string;
  createdAt: string;
}

// Clan-vs-clan war (owner decision, 2026-09-10). See schema.prisma's comment
// on ClanWar/ClanWarAttack for the full mechanic.
export type ClanWarStatusValue = 'ACTIVE' | 'RESOLVED';
export type ClanWarOutcomeValue = 'CONQUEST' | 'DECISION' | 'DRAW';

// Wrapped in an object rather than returned bare (same convention as
// MyClanResponseDto's `clan: ClanDetailDto | null`) — a bare `null` JSON
// body doesn't round-trip reliably through every HTTP client/test harness.
export interface ClanWarStatusResponseDto {
  war: ClanWarStateDto | null;
}

export interface ClanWarStateDto {
  id: string;
  status: ClanWarStatusValue;
  // Whether the current player's own clan is the one that declared this war.
  role: 'attacker' | 'defender';
  myClanId: string;
  myClanName: string;
  myClanTag: string;
  enemyClanId: string;
  enemyClanName: string;
  enemyClanTag: string;
  startedAt: string;
  endsAt: string;
  resolvedAt: string | null;
  myPoolMax: number;
  myPoolRemaining: number;
  enemyPoolMax: number;
  enemyPoolRemaining: number;
  outcome: ClanWarOutcomeValue | null;
  // Null until resolved.
  won: boolean | null;
}

export interface ClanWarTargetDto {
  playerId: string;
  username: string;
  race: Race;
  level: number;
  // Real current combat stats (equipment included) — what the fight actually
  // uses, unlike the war-pool snapshot or join requirements, which are
  // deliberately gear-free for different reasons. Lets an attacker judge
  // their odds before committing Action Energy.
  stats: CombatStatsDto;
  // Null = attackable right now; otherwise an ISO timestamp for when either
  // the target's own 5-minute protection or this attacker's 1-hour
  // same-target cooldown lifts (whichever is later).
  attackableAt: string | null;
}

export interface ClanWarAttackReportDto {
  id: string;
  role: 'attacker' | 'defender';
  opponentId: string;
  opponentUsername: string;
  outcome: BattleOutcome;
  rounds: CombatRoundDto[];
  attackerMaxHp: number;
  defenderMaxHp: number;
  damageDealt: number;
  damageTaken: number;
  lootSummary: LootResultEntryDto[];
  createdAt: string;
}

export interface ClanWarHistoryEntryDto {
  id: string;
  role: 'attacker' | 'defender';
  opponentClanId: string;
  opponentClanName: string;
  opponentClanTag: string;
  outcome: ClanWarOutcomeValue;
  // Null on a DRAW.
  won: boolean | null;
  startedAt: string;
  resolvedAt: string;
  // Signed from the viewing clan's own perspective — positive if gained
  // (won), negative if lost, 0 on a DRAW.
  treasuryMetalChange: number;
  treasuryCrystalChange: number;
  treasuryCreditsChange: number;
}

export interface ClanWarContributionEntryDto {
  playerId: string;
  username: string;
  attackCount: number;
  totalDamageDealt: number;
}

// Per-member breakdown of a single war (active or resolved) — only players
// who actually attacked appear; sorted by damage dealt, highest first.
export interface ClanWarContributionsDto {
  mine: ClanWarContributionEntryDto[];
  enemy: ClanWarContributionEntryDto[];
}

// Friends list (owner decision, 2026-09-09) — step one toward friends-only
// messaging later; no messaging DTOs yet.
export type FriendshipStatusValue = 'NONE' | 'PENDING_SENT' | 'PENDING_RECEIVED' | 'FRIENDS';

export interface FriendshipStatusDto {
  status: FriendshipStatusValue;
  // Set when status is PENDING_SENT/PENDING_RECEIVED, so a profile page can
  // accept/decline/cancel directly without a separate lookup.
  requestId: string | null;
}

export interface FriendDto {
  id: string;
  username: string;
  race: Race;
  level: number;
  // Owner decision (2026-09-11) — true when this conversation has a message
  // since the viewer last opened it. Also drives listFriends()' sort order
  // (most recent conversation first) on the backend.
  hasUnread: boolean;
}

export interface FriendsUnreadStatusDto {
  hasUnread: boolean;
}

export interface FriendRequestDto {
  id: string;
  playerId: string;
  username: string;
  race: Race;
  level: number;
  createdAt: string;
}

export interface FriendRequestsDto {
  incoming: FriendRequestDto[];
  outgoing: FriendRequestDto[];
}

// 1:1 friends-only messaging (owner decision, 2026-09-10). `senderId` is
// enough to tell which side authored it — both participants are already
// known from the conversation being fetched (the viewer and the friend).
export interface DirectMessageDto {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
}

// Player-to-player market (owner decision, 2026-09-10) — instructions/GAME_SYSTEMS.md's
// LOCKED "Trading and auction" direction. Equipment only for now; no listing
// fee; listings never expire on their own.
export interface MarketPriceDto {
  metal: number;
  crystal: number;
  credits: number;
}

export interface MarketListingDto {
  id: string;
  sellerId: string;
  sellerUsername: string;
  itemInstanceId: string;
  itemDefinitionKey: string;
  nameKey: string;
  iconAssetId: string;
  tier: ItemTier;
  quality: ItemQuality;
  upgradeLevel: number;
  maxUpgradeLevel: number;
  currentStats: ItemStatsDto | null;
  slot: EquipmentSlot;
  rolledOptions: ItemOption[];
  race: Race | null;
  price: MarketPriceDto;
  // Visibility restriction (owner decision, 2026-09-10) — both false means
  // public. Both true means visible to clanmates OR friends (union).
  visibleToClanOnly: boolean;
  visibleToFriendsOnly: boolean;
  createdAt: string;
}

// Wrapped with capacity (owner decision, 2026-09-11) — listing capacity is
// now driven by the Trading Post building (base 0, +1/level), not a fixed
// constant, so the frontend needs the current effective value to render an
// accurate "X/Y" counter and gate the "list an item" button correctly.
export interface MyMarketListingsDto {
  listings: MarketListingDto[];
  capacity: number;
}
