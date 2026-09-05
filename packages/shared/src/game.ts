export type EquipmentSlot = 'WEAPON' | 'ENGINE' | 'HULL' | 'SHIELD' | 'REACTOR' | 'UTILITY';
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
}

export interface PlayerProfileDto {
  id: string;
  email: string;
  username: string;
  race: Race;
  level: number;
  xp: number;
  xpForNextLevel: number | null;
  resources: ResourcesDto;
  energy: EnergyDto;
}

export interface BuildingCostDto {
  metalCost: number;
  crystalCost: number;
  constructionSeconds: number;
}

export interface BuildingStateDto {
  key: string;
  nameKey: string;
  iconAssetId: string;
  level: number;
  maxLevel: number;
  constructionEndsAt: string | null;
  nextLevelCost: BuildingCostDto | null;
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

export interface ShipSlotDto {
  slot: EquipmentSlot;
  item: EquippedItemDto | null;
}

export interface InventoryItemDto {
  id: string;
  itemDefinitionKey: string;
  nameKey: string;
  slot: EquipmentSlot;
  iconAssetId: string;
  upgradeLevel: number;
  maxUpgradeLevel: number;
  equipped: boolean;
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
