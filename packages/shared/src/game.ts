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
}

export interface PublicProfileClanDto {
  id: string;
  name: string;
  tag: string;
  role: ClanRole;
}

export interface PlayerListEntryDto {
  id: string;
  username: string;
  race: Race;
  level: number;
  clanId: string | null;
  clanTag: string | null;
}

export interface PlayerPublicProfileDto {
  id: string;
  username: string;
  race: Race;
  level: number;
  bio: string | null;
  createdAt: string;
  clan: PublicProfileClanDto | null;
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
}

export interface BaseResponseDto {
  resources: ResourcesDto;
  buildings: BuildingStateDto[];
}

export interface EquippedItemDto {
  itemInstanceId: string;
  itemDefinitionKey: string;
  nameKey: string;
  iconAssetId: string;
  upgradeLevel: number;
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
}

export interface InventoryResponseDto {
  items: InventoryItemDto[];
  capacity: number;
  // Count of unequipped items only — equipped gear doesn't count against capacity.
  used: number;
}

export interface ZoneDto {
  id: string;
  key: string;
  nameKey: string;
  order: number;
  unlockLevel: number;
  unlocked: boolean;
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
}

export interface LootResultEntryDto {
  type: 'resource' | 'item';
  resourceType?: ResourceType;
  itemDefinitionKey?: string;
  itemNameKey?: string;
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
  bonusItem: { itemDefinitionKey: string; itemNameKey: string } | null;
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
  myStats: CombatStatsDto;
  opponentStats: CombatStatsDto;
}

export interface PvpBattleReportDto {
  id: string;
  role: 'attacker' | 'defender';
  opponentId: string;
  opponentUsername: string;
  opponentRace: Race;
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

export interface ClanDetailDto extends ClanSummaryDto {
  createdAt: string;
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
