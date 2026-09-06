export type EquipmentSlot = 'HEAD' | 'LEFT_ARM' | 'RIGHT_ARM' | 'ARMOR' | 'CORE' | 'LEFT_LEG' | 'RIGHT_LEG';
export type ItemCategory = 'EQUIPMENT' | 'CONSUMABLE';
export type ResourceType = 'METAL' | 'CRYSTAL' | 'OXYGEN' | 'CREDITS' | 'UPGRADE_STONES';
export type BattleOutcome = 'WIN' | 'LOSS';
// Names/lore LOCKED (instructions/PRODUCT_SPEC.md); identity only for now — no stat bonus.
export type Race = 'LUXARI' | 'VORLUN' | 'ZARYTH' | 'THALION' | 'NEXAR';

export interface ResourcesDto {
  metal: number;
  crystal: number;
  oxygen: number;
  credits: number;
  upgradeStones: number;
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

export interface InventoryItemDto {
  id: string;
  itemDefinitionKey: string;
  nameKey: string;
  descriptionKey: string;
  category: ItemCategory;
  // Null for CONSUMABLE items — they have no equipment slot.
  slot: EquipmentSlot | null;
  iconAssetId: string;
  upgradeLevel: number;
  maxUpgradeLevel: number;
  // Stack size — always 1 for EQUIPMENT, may be >1 for CONSUMABLE.
  quantity: number;
  equipped: boolean;
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

export interface BossEncounterDto {
  id: string;
  status: BossEncounterStatus;
  openedAt: string;
  resolvesAt: string;
  participants: BossEncounterParticipantDto[];
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
  role: ClanRole;
  joinedAt: string;
  isCurrentPlayer: boolean;
  contributed: ClanTreasuryDto;
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
