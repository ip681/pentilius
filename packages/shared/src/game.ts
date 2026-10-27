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
  // When the bar will be full (null when already full) — the "energy full" notification.
  fullAt: string | null;
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
  // Set while an account deletion is pending — the player can cancel until then.
  deletionScheduledFor: string | null;
  // True after a season reset until the player picks a race for the new season.
  needsRaceSelection: boolean;
  // Current season number ("Започна Сезон N!").
  seasonNumber: number;
  // VIP until this moment (null = never/expired long ago); the client compares with now.
  vipUntil: string | null;
  // Email confirmed (optional) — drives the Command Center reminder.
  emailVerified: boolean;
  // GAME_BALANCE.vip.multiAttackCount — the "Attack xN" size.
  vipMultiAttackCount: number;
  // Extra max energy while VIP (GAME_BALANCE.vip.maxEnergyBonus) — shown in Settings.
  vipMaxEnergyBonus: number;
  // Real-money purchases are offered to this player (by country; owner decision, 2026-10-15).
  // Only on GET /player/me.
  paymentsAvailable?: boolean;
  // Once the Core has closed: when the season resets — the client counts down to it
  // on every page and, at zero, moves the player to the new season's race picker.
  seasonResetAt: string | null;
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
  emblem: ClanEmblemDto;
}

// Clan emblem (owner decision, 2026-10-21): a background shape and a symbol,
// white-on-transparent images the client tints with the two colors.
export interface ClanEmblemDto {
  shapeAssetId: string;
  symbolAssetId: string;
  backgroundColor: string;
  symbolColor: string;
  // Symbol size relative to the shape (0..1).
  symbolScale: number;
}

// What the leader picked: image numbers and palette keys.
export interface ClanEmblemChoiceDto {
  shape: number;
  symbol: number;
  backgroundColor: string;
  symbolColor: string;
}

export interface ClanEmblemOptionsDto {
  shapes: { id: number; assetId: string }[];
  symbols: { id: number; assetId: string }[];
  palette: { key: string; hex: string }[];
  symbolScale: number;
  changeCooldownDays: number;
}

// Leaderboard (owner decision, 2026-09-10) — split into a player board and a
// clan board (see ClanLeaderboardEntryDto below). Sortable by more than raw
// level so more than one type of play gets its own "#1", reusing data
// already tracked elsewhere (PvpBattleReport, ClanWarAttack) rather than
// introducing new tracking just for this. Deliberately excludes wealth
// (Metal/Crystal/Credits) as a rankable metric — owner decision, same
// privacy reasoning as excluding clan treasury from the clan board.
export type PlayerLeaderboardSortBy = 'level' | 'pvpWins' | 'clanWarDamage' | 'bossPoints';

export interface PlayerLeaderboardEntryDto {
  id: string;
  username: string;
  // VIP name colour (owner decision, 2026-10-14).
  isVip: boolean;
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
  // Lifetime sum of BossFormationDailyPoints across every day, not just
  // today's UTC bucket (that per-day bucket exists only to support a future
  // daily ranked-reward payout, still unbuilt — this column is the simpler
  // "how much have I ever contributed" view).
  bossFormationPoints: number;
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
  // The viewer's own entry with their TRUE rank, computed over the full
  // (unfiltered, unpaginated) board — present even when they're nowhere on
  // the current page/search/race filter, so "where am I" always works.
  // Null only if the viewer isn't a player being ranked (shouldn't happen
  // for an authenticated player, but kept nullable defensively).
  viewerEntry: PlayerLeaderboardEntryDto | null;
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
  emblem: ClanEmblemDto;
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
  // The viewer's own clan's entry with its TRUE rank, computed over the
  // full board — present even when it's nowhere on the current page. Null
  // if the viewer isn't in a clan.
  viewerEntry: ClanLeaderboardEntryDto | null;
}

export interface PlayerPublicProfileDto {
  id: string;
  username: string;
  // VIP name colour (owner decision, 2026-10-14).
  isVip: boolean;
  race: Race;
  level: number;
  bio: string | null;
  createdAt: string;
  clan: PublicProfileClanDto | null;
  selectedAvatarKey: string;
  selectedFrameKey: string;
  // Past seasons, newest first (owner decision, 2026-10-13).
  seasonHistory: SeasonHistoryEntryDto[];
}

export interface SeasonHistoryEntryDto {
  seasonId: number;
  race: Race;
  level: number;
  clanName: string | null;
  clanTag: string | null;
  clanRole: ClanRole | null;
  clanRank: number | null;
  coreDamage: number;
  coreDamageRank: number | null;
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
  // Null when unknown (started before 2026-10-14) — progress is then estimated.
  constructionStartedAt: string | null;
  nextLevelCost: BuildingCostDto | null;
  // The level after that — what a VIP queues while this building is itself under construction.
  afterNextLevelCost: BuildingCostDto | null;
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
  // Defense System only (owner decision, 2026-10-12): +% defense, applied only
  // while this player is being attacked (PvP / clan-war defender).
  currentDefenseBonusPercent: number | null;
  nextLevelDefenseBonusPercent: number | null;
  // Defensive Wall only: extra minutes of PvP protection after a lost defense.
  currentPvpProtectionMinutes: number | null;
  nextLevelPvpProtectionMinutes: number | null;
  // Hideout only: amount of each resource that can't be stolen.
  currentProtectedResources: ResourcesDto | null;
  nextLevelProtectedResources: ResourcesDto | null;
  // New buildings (owner decision, 2026-10-14); null when not this building.
  currentResearchCap: number | null;
  nextResearchCap: number | null;
  currentEnergyRegenPercent: number | null;
  nextEnergyRegenPercent: number | null;
  currentMaxEnergyBonus: number | null;
  nextMaxEnergyBonus: number | null;
  currentExchangeLimit: number | null;
  nextExchangeLimit: number | null;
  // Levels where something special happens (shown with a check when reached).
  specialLevels: SpecialLevelDto[];
}

export type SpecialLevelKind = 'MAX_ENERGY' | 'EXPEDITION_UNLOCK' | 'EXTRA_FRAGMENT';

export interface SpecialLevelDto {
  level: number;
  reached: boolean;
  kind: SpecialLevelKind;
  // EXPEDITION_UNLOCK: the expedition's name key.
  nameKey: string | null;
}

// Exchange (owner decision, 2026-10-14): Metal <-> Crystal for a small Credits fee.
export interface ExchangeInfoDto {
  level: number;
  dailyLimit: number;
  usedToday: number;
  // Fraction of the par value received (improves with the level).
  rateFactor: number;
  metalPerCrystal: number;
  creditsPer100: number;
}

export interface BuildQueueDto {
  buildingKey: string;
  targetLevel: number;
  metalPaid: number;
  crystalPaid: number;
}

export interface BaseResponseDto {
  resources: ResourcesDto;
  buildings: BuildingStateDto[];
  // VIP one-slot build queue (owner decision, 2026-10-13) — null when empty.
  buildQueue: BuildQueueDto | null;
  isVip: boolean;
  // Null until the Exchange is built.
  exchange: ExchangeInfoDto | null;
  // Shown on the Research Center tile (owner decision, 2026-10-14: research
  // is opened from the Research Center). Null when nothing is being researched.
  activeResearch: ActiveResearchDto | null;
}

export interface ActiveResearchDto {
  nameKey: string;
  // The level being researched.
  level: number;
  endsAt: string;
  // Full duration, for the progress bar.
  totalSeconds: number;
}

export interface MultiAttackResultDto {
  reports: BattleReportDto[];
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
  // Free resets left: each gives every spent point back (owner decision, 2026-10-20).
  respecsAvailable: number;
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
  // Fragments this recycle yields (1 + the Recycling research's extra ones).
  fragments: number;
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
  // Values the description needs, from the live settings — e.g. a fragment's
  // { count } = fragments per stone (godmaster → Balance → Sets).
  descriptionParams: Record<string, number> | null;
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
  // Energy packs: how much Action Energy using it gives; null otherwise.
  energyGain: number | null;
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
  // Every owned item, equipped ones included.
  used: number;
  // Free slots at or below which the client warns that the inventory is nearly full.
  nearlyFullSlots: number;
  // Most set items one bulk sell/recycle can take (GAME_BALANCE.itemBulk.maxItems).
  bulkMaxItems: number;
}

export interface ZonePentiliPreviewDto {
  id: string;
  nameKey: string;
  iconAssetId: string;
  level: number;
  maxHp: number;
  attack: number;
  defense: number;
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
  // Items won but not given because the inventory was full (owner decision, 2026-10-20) —
  // a separate list, so a client that doesn't know it never shows them as received.
  lostLoot: LootResultEntryDto[];
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
  // Items won but not given because the inventory was full (owner decision, 2026-10-20) —
  // a separate list, so a client that doesn't know it never shows them as received.
  lostLoot: LootResultEntryDto[];
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
  // At the player's level, before the Navigation research (owner decision, 2026-10-19).
  rewards: ExpeditionRewardsDto;
  // The bonus item is a random item of this set (the player's highest unlocked zone).
  bonusItemTier: 'PIONEER' | 'ASCENDANT' | 'COREFORGED' | null;
  bonusItemChance: number | null;
  // Research Center level needed (owner decision, 2026-10-14).
  // Navigation research level needed (owner decision, 2026-10-14).
  requiredNavigationLevel: number;
  locked: boolean;
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
  // Cancelling early pays this share of what was earned so far (0.7 = 70%).
  earlyCancelPercentage: number;
}

export interface ExpeditionClaimResultDto {
  rewards: ExpeditionRewardsDto;
  bonusItem: { itemDefinitionKey: string; itemNameKey: string; itemIconAssetId: string } | null;
  // The bonus item that was found but didn't fit (full inventory) — bonusItem stays null then.
  bonusItemLost: { itemDefinitionKey: string; itemNameKey: string; itemIconAssetId: string } | null;
  leveledUp: boolean;
  playerLevel: number;
}

export type ResearchBonusType =
  | 'METAL_PRODUCTION'
  | 'CRYSTAL_PRODUCTION'
  | 'COMBAT_ATTACK'
  | 'COMBAT_HP'
  // Owner decision, 2026-10-14:
  | 'CONSTRUCTION_SPEED'
  | 'RESEARCH_SPEED'
  | 'EXPEDITION_REWARDS'
  | 'UPGRADE_MATERIALS'
  | 'RECYCLING';

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
  // Null when unknown (started before 2026-10-14) — progress is then estimated.
  researchStartedAt: string | null;
  nextLevelCost: ResearchCostDto | null;
  specialLevels: SpecialLevelDto[];
}

export interface ResearchResponseDto {
  resources: ResourcesDto;
  researches: ResearchStateDto[];
  // Researches can't go above this (Research Center level, owner decision 2026-10-14).
  researchCap: number;
}

// Boss Formations (owner decision, 2026-09-11 — fully replaces the old
// open-lobby Boss Hunts DTOs above). A formation is a squad of 5 hard
// race-locked slots against one boss; multiple OPEN formations can exist for
// the same boss at once (visibility differentiates who can see/join which).
export type BossFormationStatus = 'OPEN' | 'RESOLVED';

export interface BossFormationSlotDto {
  race: Race;
  playerId: string | null;
  playerUsername: string | null;
  // VIP name colour (owner decision, 2026-10-14).
  playerIsVip: boolean;
  // The player's profile picture and frame, shown in the filled slot (owner decision, 2026-10-21).
  playerAvatarKey: string | null;
  playerFrameKey: string | null;
  joinedAt: string | null;
  isCurrentPlayer: boolean;
  // Only set once the formation is RESOLVED and this slot was filled.
  xpGained: number | null;
  lootSummary: LootResultEntryDto[] | null;
  // Items won but not given because the inventory was full (owner decision, 2026-10-20) —
  // a separate list, so a client that doesn't know it never shows them as received.
  lostLoot: LootResultEntryDto[];
}

export interface BossFormationResultDto {
  outcome: BattleOutcome | null; // null only if the window expired with zero filled slots
  rounds: CombatRoundDto[];
  partyMaxHp: number;
  bossMaxHp: number;
  // The formation's total damage dealt — credited in full (not divided) to
  // every winning participant's daily leaderboard points.
  totalDamageDealt: number;
}

export interface BossFormationDto {
  id: string;
  bossKey: string;
  creatorId: string;
  creatorUsername: string;
  // VIP name colour (owner decision, 2026-10-14).
  creatorIsVip: boolean;
  status: BossFormationStatus;
  createdAt: string;
  resolvesAt: string;
  visibleToClanOnly: boolean;
  visibleToFriendsOnly: boolean;
  // True only for the creator, and only while still inside the visibility-edit window.
  canEditVisibility: boolean;
  // createdAt + GAME_BALANCE.bossFormations.visibilityEditWindowHours, so the
  // frontend can show a countdown without duplicating that constant — only
  // meaningful (and only sent as non-null) while canEditVisibility is true.
  visibilityEditDeadline: string | null;
  slots: BossFormationSlotDto[];
  result: BossFormationResultDto | null;
}

export interface BossDto {
  id: string;
  key: string;
  nameKey: string;
  zoneId: string;
  zoneNameKey: string;
  level: number;
  maxHp: number;
  attack: number;
  defense: number;
  xpReward: number;
  iconAssetId: string;
  // Owner decision (2026-10-11): per-boss (30/50/70/90), replacing the old
  // flat GAME_BALANCE.bossFormations.minLevel shared by all 4 bosses.
  minLevel: number;
  unlocked: boolean; // player.level >= this boss's own minLevel
  // Always granted to every winning participant (Boss.guaranteedBoxItemDefinitionId) — on
  // top of, not instead of, the independent chance rolls in lootDrops below.
  guaranteedBoxNameKey: string;
  guaranteedBoxIconAssetId: string;
  lootDrops: PentiliLootDropDto[];
  // Only formations visible to the current viewer (public, or matching their clan/friends).
  formations: BossFormationDto[];
}

export interface BossFormationsResponseDto {
  bosses: BossDto[];
  // The viewer's own personal 24h create-or-join cooldown — null if free to act now.
  nextActionAvailableAt: string | null;
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
  // VIP name colour (owner decision, 2026-10-14).
  opponentIsVip: boolean;
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
  emblem: ClanEmblemDto;
  description: string | null;
  memberCount: number;
  memberCap: number;
  leaderId: string;
  leaderUsername: string;
  // VIP name colour (owner decision, 2026-10-14).
  leaderIsVip: boolean;
  treasury: ClanTreasuryDto;
  joinRequirements: ClanJoinRequirementsDto;
}

export interface ClanMemberDto {
  playerId: string;
  username: string;
  // VIP name colour (owner decision, 2026-10-14).
  isVip: boolean;
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

export type ClanBuildingBonusType = 'MEMBER_CAPACITY' | 'COMBAT_BONUS' | 'PRODUCTION_BONUS' | 'BOSS_CORE_DAMAGE' | 'ENERGY_REGEN';

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
  // Activatable buildings only (the Tavern) — null for every other building.
  activation: ClanBuildingActivationDto | null;
  // Levels with something extra (the Generator's +1 max energy).
  specialLevels: SpecialLevelDto[];
}

// Tavern activation state (owner decision, 2026-10-12). activeUntil null =
// inactive. One activation costs `cost` (scales with level) and lasts
// durationHours; it is never renewed automatically — someone re-activates it.
export interface ClanBuildingActivationDto {
  activeUntil: string | null;
  durationHours: number;
  cost: { metal: number; crystal: number; credits: number };
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
  opponentEmblem: ClanEmblemDto;
  endsAt: string;
}

export interface ClanDetailDto extends Omit<ClanSummaryDto, 'treasury'> {
  createdAt: string;
  treasury: ClanTreasuryDto | null;
  activeWar: ClanActiveWarDto | null;
  members: ClanMemberDto[];
  myRole: ClanRole | null;
  buildings: ClanBuildingStateDto[];
  // For the leader's emblem editor: the current pick, and when it can change again (null = now).
  emblemChoice: ClanEmblemChoiceDto;
  emblemChangeAvailableAt: string | null;
}

export interface MyClanResponseDto {
  clan: ClanDetailDto | null;
}

export interface ClanMessageDto {
  id: string;
  playerId: string;
  username: string;
  // VIP senders get a pale-yellow name (owner decision, 2026-10-13).
  isVip: boolean;
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
  myClanEmblem: ClanEmblemDto;
  enemyClanId: string;
  enemyClanName: string;
  enemyClanTag: string;
  enemyClanEmblem: ClanEmblemDto;
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
  // VIP name colour (owner decision, 2026-10-14).
  isVip: boolean;
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
  isVip: boolean;
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
  // VIP name colour (owner decision, 2026-10-14).
  sellerIsVip: boolean;
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
  // Share of a sale's Credits kept back from the seller (owner decision, 2026-10-27).
  creditsSaleFee: number;
}

/** The Credits fee on a Market sale: the share rounded up, at least 1 when the price has Credits. */
export function marketCreditsFee(priceCredits: number, rate: number): number {
  if (priceCredits <= 0 || rate <= 0) return 0;
  return Math.min(priceCredits, Math.max(1, Math.ceil(priceCredits * rate)));
}

// --- Seasons and the Core (owner decision, 2026-10-12) ---

// NOT_SCHEDULED: no opening time set yet. SCHEDULED: opening time set, not
// reached. OPEN: attacks allowed until endsAt. ENDED: final standings frozen.
export type CoreStatus = 'NOT_SCHEDULED' | 'SCHEDULED' | 'OPEN' | 'ENDED';

export interface CoreStandingDto {
  rank: number;
  clanId: string | null;
  clanName: string;
  clanTag: string;
  // null when the clan no longer exists (final standings keep its name).
  emblem: ClanEmblemDto | null;
  damage: number;
  // Relative to the leading clan, which is always 100 (owner decision).
  percentOfLeader: number;
  isMyClan: boolean;
}

// One player's Core damage this season. rank is null only for a clan member
// who hasn't attacked yet (owner decision: every current member is listed,
// zero-damage members last, so leaders can see who isn't taking part).
export interface CorePlayerStandingDto {
  rank: number | null;
  playerId: string;
  username: string;
  // VIP name colour (owner decision, 2026-10-14).
  isVip: boolean;
  race: Race;
  clanTag: string | null;
  damage: number;
  isCurrentPlayer: boolean;
}

export interface CoreTavernStatusDto {
  level: number;
  bonusPercent: number;
  active: boolean;
  activeUntil: string | null;
  // activeUntil minus one activation's length — for the progress bar.
  activeSince: string | null;
}

export interface CoreStateDto {
  seasonId: number;
  status: CoreStatus;
  opensAt: string | null;
  endsAt: string | null;
  durationDays: number;
  serverNow: string;
  // Top N clans (GAME_BALANCE.core.standingsTopN), then the viewer's own
  // clan separately if it isn't already in that list.
  standings: CoreStandingDto[];
  myClanStanding: CoreStandingDto | null;
  inClan: boolean;
  // The viewer's clan — titles the own-clan player ranking. Null if not in a clan.
  myClan: { id: string; name: string; tag: string } | null;
  myDamage: number;
  nextAttackAt: string | null;
  attackCostEnergy: number;
  tavern: CoreTavernStatusDto | null;
  // Once the Core has closed: when the season resets (progress wiped, new season starts).
  resetAt: string | null;
}

// 'clan': every current member of the viewer's clan, by damage dealt FOR THIS
// CLAN (damage from a previous clan stays there), zero-damage members last.
// 'server': every player with damage this season, by total personal damage
// across any clan. Paged (GAME_BALANCE.core.playerRankingPageSize per page);
// viewerEntry is the viewer's own row wherever it falls, shown above the list
// (rank null / damage 0 if they haven't attacked; null only outside a clan
// for the 'clan' scope).
export type CorePlayerRankingScope = 'clan' | 'server';

export interface CorePlayerRankingPageDto {
  scope: CorePlayerRankingScope;
  entries: CorePlayerStandingDto[];
  page: number;
  pageSize: number;
  total: number;
  viewerEntry: CorePlayerStandingDto | null;
}

export interface CoreAttackResultDto {
  damageDealt: number;
  damageTaken: number;
  playerMaxHp: number;
  roundsSurvived: number;
  maxRounds: number;
  rounds: CombatRoundDto[];
  state: CoreStateDto;
}

export interface SeasonResultDto {
  seasonId: number;
  rank: number;
  clanName: string;
  clanTag: string;
  damage: number;
}

// --- Moderation: blocking and reports (owner decision, 2026-10-12) ---

export type ReportTargetType = 'PLAYER' | 'CLAN' | 'CLAN_MESSAGE' | 'DIRECT_MESSAGE';
export type ReportReason = 'HARASSMENT' | 'OFFENSIVE_CONTENT' | 'SPAM' | 'CHEATING' | 'OTHER';

export interface CreateReportRequest {
  targetType: ReportTargetType;
  // The reported player's, clan's or message's own id.
  targetId: string;
  reason: ReportReason;
  comment?: string;
}

export interface BlockedPlayerDto {
  playerId: string;
  username: string;
  race: Race;
  level: number;
  blockedAt: string;
}

export interface BlockStatusDto {
  blocked: boolean;
}

// --- Account deletion (owner decision, 2026-10-12) ---

// A deleted account's username is replaced with this prefix + a short id.
// "~" is not allowed in real usernames, so nobody can register a look-alike;
// clients show any such name as a translated "Deleted player".
export const DELETED_PLAYER_PREFIX = '~deleted~';

export function isDeletedPlayerName(username: string | null | undefined): boolean {
  return !!username && username.startsWith(DELETED_PLAYER_PREFIX);
}

export interface AccountDeletionStatusDto {
  // When the account will be deleted, or null if no deletion is pending.
  scheduledFor: string | null;
  graceDays: number;
}

export interface AccountDeletionCodeDto {
  // One-time confirmation code shown on screen, e.g. "K7M-4QX"; valid 10 minutes.
  code: string;
}

// --- Name and race change (owner decision, 2026-10-27) ---

export interface IdentityChangeStatusDto {
  username: string;
  race: Race;
  credits: number;
  nameCredits: number;
  raceCredits: number;
  // When the next paid change is allowed; null = now.
  nameAvailableAt: string | null;
  raceAvailableAt: string | null;
  // After a race change: how many equipped items locked to another race were taken off.
  unequipped?: number;
}

// godmaster: one row of the history (newest first).
export interface AdminIdentityChangeDto {
  id: string;
  playerId: string;
  username: string;
  kind: 'NAME' | 'RACE';
  oldValue: string;
  newValue: string;
  creditsPaid: number;
  adminUsername: string | null;
  createdAt: string;
}

// --- Daily tasks (owner decision, 2026-10-13) ---

export type DailyTaskType = 'PVE_BATTLE' | 'EXPEDITION_COMPLETED' | 'PVP_BATTLE' | 'BOSS_FORMATION_JOIN' | 'CLAN_DONATION';

export interface DailyTaskRewardDto {
  metal: number;
  crystal: number;
  xp: number;
  energy: number;
}

export interface DailyTaskDto {
  key: string;
  type: DailyTaskType;
  target: number;
  // Capped at target.
  progress: number;
  completed: boolean;
  claimed: boolean;
  reward: DailyTaskRewardDto;
}

export interface DailyTasksDto {
  // Calendar day in Europe/Sofia, and when the next day starts (00:00 Bulgarian time).
  day: string;
  resetAt: string;
  // Only the tasks this player can see right now (level/clan gating; one per chain).
  tasks: DailyTaskDto[];
  // progress/target: how many of today's tasks (every tier of every chain) are done.
  allDone: { completed: boolean; claimed: boolean; bonusItemKey: string; bonusCredits: number; progress: number; target: number };
  streak: DailyStreakDto;
}

// Daily-task streak (owner decision, 2026-10-14).
export interface DailyStreakDto {
  // Days with every task done in this series, out of `target`.
  days: number;
  target: number;
  // Skipped days used in this series, out of `allowedMisses`.
  missesUsed: number;
  allowedMisses: number;
  // The reward can be claimed now.
  ready: boolean;
  // The previous series was lost to too many skipped days (shown once as a note).
  restarted: boolean;
  rewardItemKey: string;
  rewardCredits: number;
}

// Season achievements and level rewards (owner decision, 2026-10-13).
export interface AchievementRewardDto {
  metal: number;
  crystal: number;
  credits: number;
  // An item definition key (box, energy pack) — the client builds "items.<key>.name"/".icon".
  itemKey: string | null;
}

export interface LevelRewardDto {
  level: number;
  claimKey: string;
  // The player's level now — drives the progress bar toward `level`.
  currentLevel: number;
  reached: boolean;
  reward: AchievementRewardDto;
  // XP toward the next level, 0-100 (owner decision, 2026-10-14: the bar
  // shows experience, as a percent). Null once reached.
  xpPercent: number | null;
}

export interface AchievementDto {
  key: string;
  // The tier shown now (the first unclaimed one) — also the claim key.
  tierKey: string;
  tier: number;
  tierCount: number;
  target: number;
  progress: number;
  completed: boolean;
  // Every tier claimed — the last one stays visible as done.
  finished: boolean;
  // FULL_SET tiers only: which set the tier asks for.
  setTier: 'PIONEER' | 'ASCENDANT' | 'COREFORGED' | null;
  reward: AchievementRewardDto;
}

export interface AchievementsDto {
  // Null once every level reward up to the cap is claimed.
  levelReward: LevelRewardDto | null;
  achievements: AchievementDto[];
}

// "Contact the team" (owner decision, 2026-10-13).
export type SupportCategoryValue = 'IDEA' | 'BUG' | 'QUESTION' | 'OTHER';
export type SupportStatusValue = 'OPEN' | 'ANSWERED' | 'CLOSED';

export interface SupportMessageViewDto {
  id: string;
  // Staff messages carry no name for the player — shown as "the Pentilius team".
  fromStaff: boolean;
  text: string;
  createdAt: string;
}

export interface SupportTicketDto {
  id: string;
  category: SupportCategoryValue;
  status: SupportStatusValue;
  unread: boolean;
  createdAt: string;
  updatedAt: string;
  messages: SupportMessageViewDto[];
}

export interface AdminSupportTicketSummaryDto {
  id: string;
  playerId: string;
  username: string;
  category: SupportCategoryValue;
  status: SupportStatusValue;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessage: string;
  lastFromStaff: boolean;
}

export interface AdminSupportTicketsDto {
  // Conversations waiting for staff — the godmaster tab badge.
  openCount: number;
  tickets: AdminSupportTicketSummaryDto[];
}

export interface AdminSupportTicketDetailDto {
  id: string;
  playerId: string;
  username: string;
  category: SupportCategoryValue;
  status: SupportStatusValue;
  createdAt: string;
  messages: (SupportMessageViewDto & { staffUsername: string | null })[];
}

// The menu dots (owner decision, 2026-10-13) — one light check, kept out of the
// profile (loaded far more often), same idea as the friends unread status.
// Timed and event notifications (owner decision, 2026-10-13).
export type NotificationType = 'ENERGY_FULL' | 'CONSTRUCTION_DONE' | 'RESEARCH_DONE' | 'EXPEDITION_DONE' | 'PVP_ATTACKED' | 'BOSS_BATTLE_DONE';
export type NotificationSettingsDto = Record<NotificationType, boolean>;

// A timer the open game turns into an in-game/browser notification when it ends.
export interface NotificationTimerDto {
  type: NotificationType;
  at: string;
  // Translation key of the building / research / expedition name; null for energy.
  nameKey: string | null;
  // The level being built or researched; null otherwise.
  level: number | null;
  // Where a click takes the player when it depends on the timer (a boss
  // fight's replay); null = the usual page for the type.
  path: string | null;
}

export interface NotificationsDto {
  // A daily-task reward or the all-tasks bonus can be claimed.
  dailyTasks: boolean;
  // An achievement tier or a level reward can be claimed.
  achievements: boolean;
  // Staff answered a "contact the team" conversation the player hasn't opened.
  support: boolean;
  // Upcoming (or just-ended) timers for in-game notifications.
  timers: NotificationTimerDto[];
  // The latest PvP battle where this player was the defender.
  lastAttack: { at: string; attacker: string; defenderWon: boolean } | null;
  settings: NotificationSettingsDto;
  // Active staff announcements for this player's language, not dismissed yet (owner decision, 2026-10-21).
  announcements: AnnouncementDto[];
}

// Staff announcements (owner decision, 2026-10-21): a banner on every page.
export type AnnouncementKind = 'INFO' | 'IMPORTANT';

export interface AnnouncementDto {
  id: string;
  kind: AnnouncementKind;
  // Already in the player's language, or English when that language has no text.
  text: string;
}

export type AnnouncementStatus = 'SCHEDULED' | 'ACTIVE' | 'ENDED';

export interface AdminAnnouncementDto {
  id: string;
  kind: AnnouncementKind;
  // Text per language; English is always present.
  texts: Record<string, string>;
  // Languages that see it; empty = everyone.
  locales: string[];
  startsAt: string;
  endsAt: string;
  status: AnnouncementStatus;
  dismissedCount: number;
  createdAt: string;
}

export interface AdminAnnouncementsDto {
  items: AdminAnnouncementDto[];
  // Longest text per language (GAME_BALANCE.announcements.maxTextLength).
  maxTextLength: number;
}

export interface SaveAnnouncementDto {
  kind: AnnouncementKind;
  texts: Record<string, string>;
  locales: string[];
  startsAt: string;
  endsAt: string;
}

// Real-money purchases (owner decision, 2026-10-15).
export type PaymentProductKind = 'CREDITS' | 'VIP';
export type PurchaseStatus = 'PENDING' | 'COMPLETED' | 'CANCELED' | 'REFUNDED';

export interface PaymentProductDto {
  key: string;
  // Custom names from godmaster; null = the translated template
  // ("VIP for {days} days", "{count} Credits").
  nameBg: string | null;
  nameEn: string | null;
  kind: PaymentProductKind;
  credits: number | null;
  vipDays: number | null;
  // Shown price in cents (e.g. 500 = 5.00).
  priceCents: number;
  currency: string;
}

export interface PaymentsCatalogDto {
  // False outside the countries where payments are offered — then nothing is shown.
  available: boolean;
  products: PaymentProductDto[];
}

export interface PurchaseDto {
  id: string;
  productKey: string;
  nameBg: string | null;
  nameEn: string | null;
  // What this purchase granted (for the template name).
  credits: number | null;
  vipDays: number | null;
  kind: PaymentProductKind;
  status: PurchaseStatus;
  amountCents: number;
  currency: string;
  createdAt: string;
  completedAt: string | null;
  // Its sale document and, after a refund, the refund document (Наредба Н-18).
  saleDocumentId: string | null;
  refundDocumentId: string | null;
}

// godmaster's Payments tab (owner decision, 2026-10-17).
export interface AdminPaymentProductDto {
  key: string;
  nameBg: string | null;
  nameEn: string | null;
  kind: PaymentProductKind;
  credits: number | null;
  vipDays: number | null;
  stripePriceId: string | null;
  // Read from Stripe when the price ID is saved.
  priceCents: number;
  currency: string;
  sortOrder: number;
  active: boolean;
  purchaseCount: number;
}

export interface AdminPurchaseDto {
  id: string;
  username: string;
  productNameBg: string | null;
  kind: PaymentProductKind;
  status: PurchaseStatus;
  amountCents: number;
  currency: string;
  credits: number | null;
  vipDays: number | null;
  ipCountry: string | null;
  cardCountry: string | null;
  // Paid with a card from outside the allowed countries.
  flagged: boolean;
  createdAt: string;
  completedAt: string | null;
  refundedAt: string | null;
}

export interface AdminPurchasesResponseDto {
  purchases: AdminPurchaseDto[];
  todayCents: number;
  monthCents: number;
}

export interface AdminPaymentsSettingsDto {
  allowedCountries: string[];
  // A Stripe key is set on this server.
  paymentsEnabled: boolean;
}

// godmaster → Balance → Pentili (owner decision, 2026-10-18). Mirrors
// apps/api/src/config/pentili-balance.ts.
export interface BalanceCurveDto {
  base: number;
  growth: number;
}

export interface PentiliZoneBalanceDto {
  startLevel: number;
  step: number;
  strength: number;
  itemTier: 'pioneer' | 'ascendant' | 'coreforged';
  itemChance: number;
  fragmentChance: number;
  upgradeStoneChance: number;
  energyPackChance: number;
}

export interface PentiliBalanceConfigDto {
  stats: { hp: BalanceCurveDto; attack: BalanceCurveDto; defense: BalanceCurveDto; xp: BalanceCurveDto };
  rewards: { metal: BalanceCurveDto; crystal: BalanceCurveDto; spread: number };
  zones: Record<string, PentiliZoneBalanceDto>;
}

export interface AdminPentiliRowDto {
  key: string;
  nameKey: string;
  zoneKey: string;
  orderInZone: number;
  levelOverride: number | null;
  strength: number;
  specialItemKey: string | null;
  specialItemChance: number | null;
  current: { level: number; maxHp: number; attack: number; defense: number; xpReward: number };
  next: {
    level: number;
    maxHp: number;
    attack: number;
    defense: number;
    xpReward: number;
    metal: [number, number];
    crystal: [number, number];
  };
}

export interface AdminPentiliBalanceDto {
  config: PentiliBalanceConfigDto;
  zones: { key: string; nameKey: string; order: number; unlockLevel: number }[];
  pentili: AdminPentiliRowDto[];
  items: { key: string; nameKey: string }[];
}

// godmaster → Balance → XP (owner decision, 2026-10-19).
export interface XpBalanceConfigDto {
  base: number;
  growth: number;
}

export interface AdminXpLevelDto {
  level: number;
  // XP to reach the next level now, and under the config.
  current: number | null;
  next: number;
  // Fights against the best-paying Pentili available at this level (null if none).
  battles: number | null;
  totalBattles: number;
  energyHours: number | null;
}

// godmaster → Balance → Shop (owner decision, 2026-10-20): what the Shop sells and for how much.
export interface AdminShopItemDto {
  key: string;
  nameKey: string;
  iconAssetId: string;
  category: string;
  tier: string | null;
  slot: string | null;
  inShop: boolean;
  priceMetal: number;
  priceCrystal: number;
  priceCredits: number;
  // Equipment only: what selling returns — a normal item without research, and the most it can
  // ever return (epic, Recycling research maxed), so a buy price below it can be flagged.
  sell: { metal: number; crystal: number; maxMetal: number; maxCrystal: number } | null;
}

export interface AdminShopDto {
  items: AdminShopItemDto[];
}

export interface SaveShopItemDto {
  key: string;
  inShop: boolean;
  priceMetal: number;
  priceCrystal: number;
  priceCredits: number;
}

export interface AdminXpBalanceDto {
  config: XpBalanceConfigDto;
  levels: AdminXpLevelDto[];
  energyMinutes: number;
}

// godmaster → Balance → Buildings & research (owner decision, 2026-10-19).
// Mirrors apps/api/src/config/building-balance.ts.
export interface BuildingBalanceConfigDto {
  production: { metalPerHour: number; crystalPerHour: number; growth: number };
  costHours: number;
  buildTime: BalanceCurveDto;
  buildings: Record<string, { metal: number; crystal: number; time: number; maxLevel: number; effects: Record<string, number> }>;
  research: {
    metal: number;
    crystal: number;
    credits: number;
    time: BalanceCurveDto;
    items: Record<string, { bonusPerLevel: number; maxLevel: number }>;
  };
}

export interface AdminBuildingBalanceDto {
  config: BuildingBalanceConfigDto;
  buildings: {
    key: string;
    nameKey: string;
    levels: {
      level: number;
      metalCost: number;
      crystalCost: number;
      constructionSeconds: number;
      producesPerHour: number | null;
      current: { metalCost: number; crystalCost: number; constructionSeconds: number; producesPerHour: number | null } | null;
    }[];
  }[];
  research: {
    key: string;
    nameKey: string;
    bonusType: string;
    levels: {
      level: number;
      metalCost: number;
      crystalCost: number;
      creditsCost: number;
      researchSeconds: number;
      current: { metalCost: number; crystalCost: number; creditsCost: number; researchSeconds: number } | null;
    }[];
  }[];
}

// godmaster → Balance → Clan buildings (owner decision, 2026-10-19).
// Mirrors apps/api/src/config/clan-balance.ts.
export interface ClanBalanceConfigDto {
  costFactor: number;
  crystal: number;
  credits: number;
  buildTime: BalanceCurveDto;
  buildings: Record<string, { bonusPerLevel: number; maxLevel: number; levelStep: number; cost: number }>;
  // The Cantina's activation; its levels are in `buildings` like the rest.
  tavern: {
    activationHours: number;
    activationMetal: number;
    activationCrystal: number;
    activationCredits: number;
  };
  generatorMaxEnergyLevels: number[];
}

export interface AdminClanBalanceDto {
  config: ClanBalanceConfigDto;
  buildings: {
    key: string;
    nameKey: string;
    bonusType: string;
    levels: {
      level: number;
      metalCost: number;
      crystalCost: number;
      creditsCost: number;
      constructionSeconds: number;
      current: { metalCost: number; crystalCost: number; creditsCost: number; constructionSeconds: number } | null;
    }[];
  }[];
}

// godmaster → Balance → Sets (owner decision, 2026-10-19).
// Mirrors apps/api/src/config/equipment-balance.ts.
export interface EquipmentSlotStatsDto {
  attack: number;
  defense: number;
  hp: number;
}

export interface EquipmentBalanceConfigDto {
  // pioneer / ascendant / coreforged
  sets: Record<string, { maxUpgradeLevel: number; sellMetal: number; sellCrystal: number; slots: Record<string, EquipmentSlotStatsDto> }>;
  upgrade: { bonusPerLevel: number; materialsPerLevel: number; fragmentsPerStone: number };
  qualitySellMultiplier: { NORMAL: number; RARE: number; EPIC: number };
}

// The preview's reference robot: how it spends its attribute points
// (shares), and the bonuses it has (fractions, 0.3 = +30%).
export interface EquipmentSplitDto {
  damage: number;
  defense: number;
  hp: number;
  researchAttack: number;
  researchHp: number;
  forge: number;
}

export interface AdminEquipmentZoneDto {
  zoneKey: string;
  zoneNameKey: string;
  tier: string;
  maxUpgradeLevel: number;
  stonesToMax: number;
  stonesPerBattle: number;
  battlesToMax: number | null;
  fights: {
    pentiliKey: string;
    nameKey: string;
    level: number;
    pentili: { attack: number; defense: number; maxHp: number };
    attributePoints: number;
    // none = no gear, base = the zone's full set at +0, max = at max upgrade.
    robots: { kind: 'none' | 'base' | 'max'; stats: EquipmentSlotStatsDto; winRate: number }[];
  }[];
}

export interface AdminEquipmentBalanceDto {
  config: EquipmentBalanceConfigDto;
  split: EquipmentSplitDto;
  zones: AdminEquipmentZoneDto[];
  // Preview only: the same simulation with the saved values, to compare.
  currentZones: AdminEquipmentZoneDto[] | null;
  simulationRuns: number;
  // The most the researches and the Forge give today (for a "max" button).
  maxBonuses: { researchAttack: number; researchHp: number; forge: number };
}

// godmaster → Balance → Expeditions (owner decision, 2026-10-19).
// Mirrors apps/api/src/config/expedition-balance.ts.
export interface ExpeditionBalanceConfigDto {
  expeditions: Record<string, { durationMinutes: number; fights: number; bonusItemChance: number; requiredNavigationLevel: number }>;
  earlyCancelPercentage: number;
}

export interface AdminExpeditionLevelRowDto {
  level: number;
  // By expedition key, before the Navigation research.
  rewards: Record<string, { metal: number; crystal: number; xp: number }>;
}

export interface AdminExpeditionBalanceDto {
  config: ExpeditionBalanceConfigDto;
  expeditions: { key: string; nameKey: string }[];
  // How many Pentili fights an hour of Action Energy buys, to compare with.
  fightsPerHourFromEnergy: number;
  levels: AdminExpeditionLevelRowDto[];
  // Preview only: the same table with the saved values.
  currentLevels: AdminExpeditionLevelRowDto[] | null;
}

// godmaster → Balance → Bosses (owner decision, 2026-10-19).
// Mirrors apps/api/src/config/boss-balance.ts.
export interface BossBalanceConfigDto {
  bosses: Record<
    string,
    {
      minLevel: number;
      maxHp: number;
      attack: number;
      defense: number;
      xpReward: number;
      boxKey: string;
      resourceFights: number;
      credits: { chance: number; min: number; max: number };
      items: { itemKey: string; chance: number; min: number; max: number }[];
    }
  >;
}

export interface AdminBossRowDto {
  key: string;
  nameKey: string;
  zoneNameKey: string;
  tier: string;
  // What each rewarded participant gets.
  metal: [number, number];
  crystal: [number, number];
  participant: BossParticipantDto;
  // 1 to 5 copies of the participant: XP each, and % of fights won.
  formations: { players: number; xpEach: number; win: number }[];
  // The boss's stats scaled together so `players` participants win about `target` (null if out of reach).
  suggestion: { maxHp: number; attack: number; defense: number; win: number } | null;
  // The strongest Pentil of the boss's zone, to compare the rewards with.
  lastPentil: { level: number; xp: number; metal: number } | null;
}

// godmaster → Balance → Bosses: each boss's example participant (owner
// decision, 2026-10-27), fought 1 to 5 times over in the preview. Wears the
// boss's zone set: `parts` slots (0-7) at `upgrade`, the rest the previous
// set at +0; every attribute point up to `level`, split by the three shares.
export interface BossParticipantDto {
  level: number;
  parts: number;
  upgrade: number;
  damage: number;
  defense: number;
  hp: number;
  // Fractions: research attack/HP, Forge, Cantina.
  researchAttack: number;
  researchHp: number;
  forge: number;
  tavern: number;
}

// godmaster → Balance → Bosses → "test with real players" (owner decision,
// 2026-10-27): real robots, read as the game reads them for a boss fight.
export interface BossRealTestResultDto {
  bossKey: string;
  bossNameKey: string;
  bossIconAssetId: string;
  players: {
    username: string;
    level: number;
    race: Race;
    attack: number;
    defense: number;
    hp: number;
    tavernActive: boolean;
    // For the replay's formation squares.
    avatarKey: string | null;
    frameKey: string | null;
    vip: boolean;
  }[];
  // Names that matched no player.
  missing: string[];
  // Two players of one race — a real formation has one place per race.
  duplicateRaces: boolean;
  // The formation together, and its % of fights won against the boss as it is in the form.
  party: { attack: number; defense: number; hp: number };
  win: number;
  // One more fight, round by round, for the replay in godmaster (owner decision, 2026-10-27).
  sample: { won: boolean; rounds: CombatRoundDto[]; partyMaxHp: number; bossMaxHp: number } | null;
}

export interface AdminBossBalanceDto {
  config: BossBalanceConfigDto;
  bosses: AdminBossRowDto[];
  // Preview only: the same with the saved values.
  currentBosses: AdminBossRowDto[] | null;
  // Every item, for the box and drop pickers.
  items: { key: string; nameKey: string; category: string }[];
  // Participants for the suggestion and the rewards, and the win share (0-1) to suggest for.
  players: number;
  target: number;
  maxBonuses: { researchAttack: number; researchHp: number; forge: number; tavern: number };
  simulationRuns: number;
}

// godmaster → Balance → Other values (owner decision, 2026-10-19).
// Mirrors apps/api/src/config/other-balance.ts; percent values are fractions.
export interface AdminOtherBalanceDto {
  // oneOf: when set, only these values are allowed.
  values: { path: string; kind: 'int' | 'number' | 'percent'; min: number; max: number; oneOf?: number[]; value: number; default: number }[];
}

// godmaster → Balance → Rewards (owner decision, 2026-10-19).
// Mirrors apps/api/src/config/reward-balance.ts.
export interface RewardBalanceConfigDto {
  levelRewards: { metalPerLevel: number; crystalPerLevel: number; boxEveryLevels: number; boxes: { upToLevel: number; itemKey: string }[] };
  dailyTasks: {
    tasks: Record<string, { target: number; reward: { metalPerLevel: number; crystalPerLevel: number; xpPerLevel: number; energy: number } }>;
    allDoneBonusItemKey: string;
    allDoneBonusCredits: number;
    streak: { days: number; allowedMisses: number; rewardItemKey: string; rewardCredits: number };
  };
  achievements: Record<string, { target: number; reward: { metal: number; crystal: number; credits: number; itemKey: string | null } }[]>;
}

export interface AdminRewardLevelRowDto {
  level: number;
  dailyMetal: number;
  dailyXp: number;
  // The same in Pentili fights at that level.
  dailyMetalFights: number;
  dailyXpFights: number;
  levelMetal: number;
  levelMetalFights: number;
}

export interface AdminRewardBalanceDto {
  config: RewardBalanceConfigDto;
  levels: AdminRewardLevelRowDto[];
  currentLevels: AdminRewardLevelRowDto[] | null;
  taskInfo: Record<string, { type: string; chain: string | null }>;
  achievementMetrics: Record<string, string>;
  items: { key: string; nameKey: string }[];
}

// godmaster → player → login records (owner decision, 2026-10-19).
export interface AdminPlayerLoginsDto {
  retentionDays: number;
  events: { createdAt: string; kind: string; ip: string; country: string | null; device: string | null; browser: string | null }[];
  // Other accounts seen from any of this player's addresses.
  sharedAccounts: { playerId: string; username: string; banned: boolean; sharedIps: string[] }[];
}

// --- Sales documents (owner decision, 2026-10-23; Наредба Н-18, чл. 52о) ---
// The seller's details and NRA e-shop data, set in godmaster → Payments.
export interface SellerInfoDto {
  // The seller is a company (ЕООД): name, ЕИК, registered address.
  name: string;
  // 9 to 13 characters in the audit file.
  eik: string;
  address: string;
  // Email or phone.
  contact: string;
  // The e-shop's unique number from the NRA (приложение № 33).
  eshopNumber: string;
  domain: string;
  // The virtual POS number declared to the NRA, e.g. "01-STR-EUR".
  posNumber: string;
  // The Stripe account ID (acct_...).
  merchantId: string;
  // The payment service provider (Stripe), for the audit file: its name and VAT number.
  providerName: string;
  providerVatId: string;
}

export type SaleDocumentKind = 'SALE' | 'REFUND';

export interface SaleDocumentLineDto {
  name: string;
  taxGroup: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
}

export interface SaleDocumentDto {
  id: string;
  kind: SaleDocumentKind;
  // 10 digits, zero-padded.
  number: string;
  test: boolean;
  issuedAt: string;
  orderNumber: string;
  transactionRef: string;
  seller: SellerInfoDto;
  eshopNumber: string;
  posNumber: string;
  lines: SaleDocumentLineDto[];
  totalCents: number;
  currency: string;
  paymentMethod: string;
  qrPayload: string;
  // A refund document's sale.
  saleNumber: string | null;
  saleIssuedAt: string | null;
}

export interface AdminSaleDocumentRowDto {
  id: string;
  kind: SaleDocumentKind;
  number: string;
  test: boolean;
  issuedAt: string;
  username: string;
  orderNumber: string;
  totalCents: number;
  currency: string;
}

export interface AdminAuditFileDto {
  id: string;
  year: number;
  month: number;
  createdAt: string;
  adminUsername: string;
  orderCount: number;
  refundCount: number;
  totalCents: number;
}

export interface AdminSellerSettingsDto {
  seller: SellerInfoDto;
  // Missing fields that block live sales (test sales still work).
  missing: string[];
}
