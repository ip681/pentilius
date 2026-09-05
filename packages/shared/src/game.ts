export type EquipmentSlot = 'WEAPON' | 'ENGINE' | 'HULL' | 'SHIELD' | 'REACTOR' | 'UTILITY';
export type ResourceType = 'METAL' | 'CRYSTAL' | 'OXYGEN' | 'CREDITS' | 'UPGRADE_STONES';
export type BattleOutcome = 'WIN' | 'LOSS';

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
