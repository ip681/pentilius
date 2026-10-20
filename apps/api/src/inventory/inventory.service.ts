import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BoxOpenResultDto, InventoryItemDto, InventoryResponseDto, ItemStatsDto, RecycleValueDto, SellValueDto, UpgradeCostDto } from '@pentilius/shared';
import { ItemQuality, ItemTier, Prisma, ResearchBonusType } from '@prisma/client';
import { equipmentRuntime } from '../config/equipment-balance';
import { GAME_BALANCE } from '../config/game-config';
import { getEffectiveInventoryCapacity, getUsedInventorySlots, grantItem } from './inventory-capacity';
import { EconomyService } from '../player/economy.service';
import { PrismaService } from '../prisma/prisma.service';

type Tx = PrismaService | Prisma.TransactionClient;

const FRAGMENT_KEYS_BY_TIER: Record<ItemTier, string> = {
  PIONEER: 'pioneer_fragment',
  ASCENDANT: 'ascendant_fragment',
  COREFORGED: 'coreforged_fragment',
};

/** Loot boxes (owner decision): pioneer_box/ascendant_box/coreforged_box — opened via openBox(), never via the plain useConsumable() path. */
function isBoxKey(key: string): boolean {
  return key.endsWith('_box');
}

/**
 * Fragments auto-convert into their tier's upgrade stone on recycle (recycleItem below),
 * and upgrade stones are spent automatically by upgradeItem() — neither has any baseStats
 * effect to apply, so letting useConsumable() reach them would just delete the item for
 * nothing. Owner-confirmed bug (2026-10-11): the frontend used to offer a "Use" button for
 * both; this is the server-side guard so the same mistake can't resurface through any client.
 */
function isUpgradeMaterialKey(key: string): boolean {
  return key.endsWith('_fragment') || key.endsWith('_upgrade');
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
  ) {}

  async getInventory(playerId: string, tx: Tx = this.prisma): Promise<InventoryResponseDto> {
    const [items, used, capacity, fragmentStacks] = await Promise.all([
      tx.itemInstance.findMany({
        where: { playerId },
        include: { itemDefinition: true },
        orderBy: { acquiredAt: 'asc' },
      }),
      getUsedInventorySlots(playerId, tx),
      getEffectiveInventoryCapacity(playerId, tx),
      tx.itemInstance.findMany({
        where: { playerId, equippedSlot: null, itemDefinition: { key: { in: Object.values(FRAGMENT_KEYS_BY_TIER) } } },
        include: { itemDefinition: true },
      }),
    ]);

    const ownedFragmentsByTier: Partial<Record<ItemTier, number>> = {};
    for (const stack of fragmentStacks) {
      if (stack.itemDefinition.tier) ownedFragmentsByTier[stack.itemDefinition.tier] = stack.quantity;
    }
    const effects = await this.researchEffects(playerId, tx);

    return { items: items.map((item) => toInventoryItemDto(item, ownedFragmentsByTier, effects)), capacity, used, nearlyFullSlots: GAME_BALANCE.inventory.nearlyFullSlots, bulkMaxItems: GAME_BALANCE.itemBulk.maxItems };
  }

  /** Metallurgy and Recycling research effects (owner decision, 2026-10-14). */
  private async researchEffects(playerId: string, tx: Tx = this.prisma): Promise<ResearchEffects> {
    const [metallurgy, recyclingMultiplier, recyclingLevel] = await Promise.all([
      this.economy.getResearchMultiplier(playerId, ResearchBonusType.UPGRADE_MATERIALS, tx),
      this.economy.getResearchMultiplier(playerId, ResearchBonusType.RECYCLING, tx),
      this.economy.getResearchLevel(playerId, ResearchBonusType.RECYCLING, tx),
    ]);
    return {
      materialFactor: 1 - Math.min(0.9, metallurgy - 1),
      sellMultiplier: recyclingMultiplier,
      extraFragments: Math.floor(recyclingLevel / GAME_BALANCE.recyclingExtraFragmentEvery),
    };
  }

  async upgradeItem(playerId: string, itemInstanceId: string): Promise<InventoryResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.itemInstance.findUnique({
        where: { id: itemInstanceId },
        include: { itemDefinition: true },
      });
      if (!item) {
        throw new NotFoundException('Item not found');
      }
      if (item.playerId !== playerId) {
        throw new ForbiddenException('Item does not belong to this player');
      }
      if (item.itemDefinition.category !== 'EQUIPMENT') {
        throw new BadRequestException('ITEM_NOT_EQUIPMENT');
      }
      if (item.listedForSale) {
        throw new BadRequestException('ITEM_LISTED');
      }
      if (item.upgradeLevel >= item.itemDefinition.maxUpgradeLevel) {
        throw new BadRequestException('Item is already at max upgrade level');
      }

      // Each set has its own upgrade material (e.g. Coreforged gear needs coreforged_upgrade).
      const tier = item.itemDefinition.tier!;
      const materialKey = `${tier.toLowerCase()}_upgrade`;
      const cost = upgradeMaterials(item.upgradeLevel, (await this.researchEffects(playerId, tx)).materialFactor);

      const material = await tx.itemDefinition.findUniqueOrThrow({ where: { key: materialKey } });
      const materialStack = await tx.itemInstance.findFirst({
        where: { playerId, itemDefinitionId: material.id, equippedSlot: null },
      });
      if (!materialStack || materialStack.quantity < cost) {
        throw new BadRequestException('NOT_ENOUGH_MATERIALS');
      }

      if (materialStack.quantity === cost) {
        await tx.itemInstance.delete({ where: { id: materialStack.id } });
      } else {
        await tx.itemInstance.update({ where: { id: materialStack.id }, data: { quantity: { decrement: cost } } });
      }
      await tx.itemInstance.update({ where: { id: itemInstanceId }, data: { upgradeLevel: { increment: 1 } } });

      return this.getInventory(playerId, tx);
    });
  }

  async sellItem(playerId: string, itemInstanceId: string): Promise<InventoryResponseDto> {
    return this.sellItems(playerId, [itemInstanceId]);
  }

  async recycleItem(playerId: string, itemInstanceId: string): Promise<InventoryResponseDto> {
    return this.recycleItems(playerId, [itemInstanceId]);
  }

  /**
   * Sells several set items at once (owner decision, 2026-10-20) — one
   * transaction: every item is checked first, so either all are sold or none.
   */
  async sellItems(playerId: string, itemInstanceIds: string[]): Promise<InventoryResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const items = await this.loadOwnFreeEquipment(playerId, itemInstanceIds, 'ITEM_NOT_SELLABLE', tx);
      const { sellMultiplier } = await this.researchEffects(playerId, tx);
      let metal = 0;
      let crystal = 0;
      for (const item of items) {
        const value = computeSellValue(item.itemDefinition.tier!, item.quality, sellMultiplier);
        metal += value.metal;
        crystal += value.crystal;
      }
      await tx.player.update({ where: { id: playerId }, data: { metal: { increment: metal }, crystal: { increment: crystal } } });
      await tx.itemInstance.deleteMany({ where: { id: { in: items.map((i) => i.id) } } });
      return this.getInventory(playerId, tx);
    });
  }

  /**
   * Recycles several set items at once (owner decision, 2026-10-20) into their
   * set's fragments, then turns every full stack into upgrade stones — one
   * transaction, all or none.
   */
  async recycleItems(playerId: string, itemInstanceIds: string[]): Promise<InventoryResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const items = await this.loadOwnFreeEquipment(playerId, itemInstanceIds, 'ITEM_NOT_RECYCLABLE', tx);
      const perItem = GAME_BALANCE.itemRecycle.fragmentsPerItem + (await this.researchEffects(playerId, tx)).extraFragments;
      const byTier = new Map<ItemTier, number>();
      for (const item of items) {
        const tier = item.itemDefinition.tier!;
        byTier.set(tier, (byTier.get(tier) ?? 0) + perItem);
      }
      await tx.itemInstance.deleteMany({ where: { id: { in: items.map((i) => i.id) } } });
      for (const [tier, fragments] of byTier) {
        const fragmentDefinition = await tx.itemDefinition.findUniqueOrThrow({ where: { key: FRAGMENT_KEYS_BY_TIER[tier] } });
        for (let i = 0; i < fragments; i++) {
          await grantItem(playerId, fragmentDefinition.id, tx, { ignoreCapacity: true });
        }
        await this.convertFragmentsToStones(playerId, tier, fragmentDefinition.id, tx);
      }
      return this.getInventory(playerId, tx);
    });
  }

  /** The player's own set items, none equipped or on the Market — or the whole request fails. */
  private async loadOwnFreeEquipment(playerId: string, itemInstanceIds: string[], notAllowedCode: string, tx: Prisma.TransactionClient) {
    const ids = [...new Set(itemInstanceIds)];
    if (ids.length === 0 || ids.length > GAME_BALANCE.itemBulk.maxItems) {
      throw new BadRequestException('TOO_MANY_ITEMS');
    }
    const items = await tx.itemInstance.findMany({ where: { id: { in: ids } }, include: { itemDefinition: true } });
    if (items.length !== ids.length) {
      throw new NotFoundException('Item not found');
    }
    for (const item of items) {
      if (item.playerId !== playerId) {
        throw new ForbiddenException('Item does not belong to this player');
      }
      if (item.itemDefinition.category !== 'EQUIPMENT') {
        throw new BadRequestException(notAllowedCode);
      }
      if (item.equippedSlot !== null) {
        throw new BadRequestException('ITEM_EQUIPPED');
      }
      if (item.listedForSale) {
        throw new BadRequestException('ITEM_LISTED');
      }
    }
    return items;
  }

  /** Auto-convert every full stack of a set's fragments into its upgrade stone (owner decision). */
  private async convertFragmentsToStones(playerId: string, tier: ItemTier, fragmentDefinitionId: string, tx: Prisma.TransactionClient): Promise<void> {
    const fragmentsPerStone = equipmentRuntime().upgrade.fragmentsPerStone;
    let fragmentStack = await tx.itemInstance.findFirst({ where: { playerId, itemDefinitionId: fragmentDefinitionId, equippedSlot: null } });
    if (!fragmentStack || fragmentStack.quantity < fragmentsPerStone) return;
    const upgradeStoneDefinition = await tx.itemDefinition.findUniqueOrThrow({ where: { key: `${tier.toLowerCase()}_upgrade` } });
    while (fragmentStack && fragmentStack.quantity >= fragmentsPerStone) {
      if (fragmentStack.quantity === fragmentsPerStone) {
        await tx.itemInstance.delete({ where: { id: fragmentStack.id } });
        fragmentStack = null;
      } else {
        fragmentStack = await tx.itemInstance.update({
          where: { id: fragmentStack.id },
          data: { quantity: { decrement: fragmentsPerStone } },
        });
      }
      await grantItem(playerId, upgradeStoneDefinition.id, tx, { ignoreCapacity: true });
    }
  }

  async useConsumable(playerId: string, itemInstanceId: string, buildingKey?: string): Promise<InventoryResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.itemInstance.findUnique({
        where: { id: itemInstanceId },
        include: { itemDefinition: true },
      });
      if (!item) {
        throw new NotFoundException('Item not found');
      }
      if (item.playerId !== playerId) {
        throw new ForbiddenException('Item does not belong to this player');
      }
      if (item.itemDefinition.category !== 'CONSUMABLE') {
        throw new BadRequestException('ITEM_NOT_USABLE');
      }
      if (isBoxKey(item.itemDefinition.key)) {
        throw new BadRequestException('ITEM_MUST_BE_OPENED');
      }
      if (isUpgradeMaterialKey(item.itemDefinition.key)) {
        throw new BadRequestException('ITEM_NOT_USABLE');
      }

      const baseStats = item.itemDefinition.baseStats as { energy?: number; buildTimeReductionMinutes?: number };

      const energyGain = baseStats.energy ?? 0;
      if (energyGain > 0) {
        const player = await this.economy.settleEnergy(playerId, tx);
        await tx.player.update({
          where: { id: playerId },
          data: { actionEnergy: Math.min(player.actionEnergyMax, player.actionEnergy + energyGain) },
        });
      }

      const buildTimeReductionMinutes = baseStats.buildTimeReductionMinutes ?? 0;
      if (buildTimeReductionMinutes > 0) {
        if (!buildingKey) {
          throw new BadRequestException('BUILDING_KEY_REQUIRED');
        }
        const buildingType = await tx.buildingType.findUnique({ where: { key: buildingKey } });
        if (!buildingType) {
          throw new NotFoundException('Unknown building');
        }
        const playerBuilding = await tx.playerBuilding.findUniqueOrThrow({
          where: { playerId_buildingTypeId: { playerId, buildingTypeId: buildingType.id } },
        });
        if (!playerBuilding.constructionEndsAt) {
          throw new BadRequestException('BUILDING_NOT_UNDER_CONSTRUCTION');
        }
        await tx.playerBuilding.update({
          where: { id: playerBuilding.id },
          data: { constructionEndsAt: new Date(playerBuilding.constructionEndsAt.getTime() - buildTimeReductionMinutes * 60_000) },
        });
      }

      if (item.quantity <= 1) {
        await tx.itemInstance.delete({ where: { id: itemInstanceId } });
      } else {
        await tx.itemInstance.update({ where: { id: itemInstanceId }, data: { quantity: { decrement: 1 } } });
      }

      return this.getInventory(playerId, tx);
    });
  }

  async openBox(playerId: string, itemInstanceId: string): Promise<BoxOpenResultDto> {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.itemInstance.findUnique({
        where: { id: itemInstanceId },
        include: { itemDefinition: true },
      });
      if (!item) {
        throw new NotFoundException('Item not found');
      }
      if (item.playerId !== playerId) {
        throw new ForbiddenException('Item does not belong to this player');
      }
      if (item.itemDefinition.category !== 'CONSUMABLE' || !isBoxKey(item.itemDefinition.key)) {
        throw new BadRequestException('ITEM_NOT_A_BOX');
      }

      const tier = item.itemDefinition.tier!;
      const candidates = await tx.itemDefinition.findMany({ where: { category: 'EQUIPMENT', tier } });
      const rolledDefinition = candidates[Math.floor(Math.random() * candidates.length)];

      // Owner-specified: a box always yields RARE or EPIC, never NORMAL — distinct from grantItem's default rarity.rareChance roll.
      const quality: ItemQuality = Math.random() < GAME_BALANCE.boxOpen.epicChance ? 'EPIC' : 'RARE';
      const granted = await grantItem(playerId, rolledDefinition.id, tx, { quality });
      if (!granted) {
        throw new BadRequestException('INVENTORY_FULL');
      }

      if (item.quantity <= 1) {
        await tx.itemInstance.delete({ where: { id: itemInstanceId } });
      } else {
        await tx.itemInstance.update({ where: { id: itemInstanceId }, data: { quantity: { decrement: 1 } } });
      }

      const grantedInstance = await tx.itemInstance.findFirstOrThrow({
        where: { playerId, itemDefinitionId: rolledDefinition.id },
        orderBy: { acquiredAt: 'desc' },
      });

      return {
        nameKey: rolledDefinition.nameKey,
        iconAssetId: rolledDefinition.iconAssetId,
        quality: grantedInstance.quality,
        rolledOptions: grantedInstance.rolledOptions,
        race: grantedInstance.race,
      };
    });
  }
}

type ResearchEffects = { materialFactor: number; sellMultiplier: number; extraFragments: number };

/** Materials for the next upgrade, after Metallurgy — never below 1. */
function upgradeMaterials(upgradeLevel: number, materialFactor: number): number {
  return Math.max(1, Math.round(equipmentRuntime().upgrade.materialsPerLevel * (upgradeLevel + 1) * materialFactor));
}

function toInventoryItemDto(
  item: Prisma.ItemInstanceGetPayload<{ include: { itemDefinition: true } }>,
  ownedFragmentsByTier: Partial<Record<ItemTier, number>>,
  effects: ResearchEffects,
): InventoryItemDto {
  const isEquipment = item.itemDefinition.category === 'EQUIPMENT';
  const baseStats = item.itemDefinition.baseStats as { attack?: number; defense?: number; hp?: number };
  const atMaxLevel = item.upgradeLevel >= item.itemDefinition.maxUpgradeLevel;

  return {
    id: item.id,
    itemDefinitionKey: item.itemDefinition.key,
    nameKey: item.itemDefinition.nameKey,
    descriptionKey: item.itemDefinition.descriptionKey,
    category: item.itemDefinition.category,
    slot: item.itemDefinition.slot,
    tier: item.itemDefinition.tier,
    iconAssetId: item.itemDefinition.iconAssetId,
    upgradeLevel: item.upgradeLevel,
    maxUpgradeLevel: item.itemDefinition.maxUpgradeLevel,
    quantity: item.quantity,
    equipped: item.equippedSlot !== null,
    quality: item.quality,
    rolledOptions: item.rolledOptions,
    race: item.race,
    currentStats: isEquipment ? computeItemStats(baseStats, item.upgradeLevel) : null,
    nextLevelStats: isEquipment && !atMaxLevel ? computeItemStats(baseStats, item.upgradeLevel + 1) : null,
    upgradeCost: isEquipment && !atMaxLevel && item.itemDefinition.tier ? computeUpgradeCost(item.itemDefinition.tier, item.upgradeLevel, effects.materialFactor) : null,
    sellValue: isEquipment && item.itemDefinition.tier ? computeSellValue(item.itemDefinition.tier, item.quality, effects.sellMultiplier) : null,
    recycleValue: isEquipment && item.itemDefinition.tier ? computeRecycleValue(item.itemDefinition.tier, ownedFragmentsByTier, effects.extraFragments) : null,
    listedForSale: item.listedForSale,
    energyGain: (item.itemDefinition.baseStats as { energy?: number }).energy ?? null,
  };
}

/** This item's own effective attack/defense/hp contribution at the given upgrade level. */
export function computeItemStats(baseStats: { attack?: number; defense?: number; hp?: number }, upgradeLevel: number): ItemStatsDto {
  const multiplier = 1 + upgradeLevel * equipmentRuntime().upgrade.bonusPerLevel;
  const stats: ItemStatsDto = {};
  if (baseStats.attack) stats.attack = roundToOneDecimal(baseStats.attack * multiplier);
  if (baseStats.defense) stats.defense = roundToOneDecimal(baseStats.defense * multiplier);
  if (baseStats.hp) stats.hp = roundToOneDecimal(baseStats.hp * multiplier);
  return stats;
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Mirrors inventory.service.ts's upgradeItem() cost formula, for display before the player commits. */
function computeUpgradeCost(tier: string, upgradeLevel: number, materialFactor: number): UpgradeCostDto {
  return {
    itemDefinitionKey: `${tier.toLowerCase()}_upgrade`,
    quantity: upgradeMaterials(upgradeLevel, materialFactor),
  };
}

/** Mirrors inventory.service.ts's sellItem() payout formula, for display before the player commits. */
function computeSellValue(tier: ItemTier, quality: ItemQuality, researchMultiplier: number): SellValueDto {
  // Set values from the equipment balance in godmaster (2026-10-19).
  const { sets, qualitySellMultiplier } = equipmentRuntime();
  const set = sets[tier.toLowerCase() as keyof typeof sets];
  // Recycling research raises what selling returns (owner decision, 2026-10-14).
  const multiplier = qualitySellMultiplier[quality] * researchMultiplier;
  return {
    metal: Math.round(set.sellMetal * multiplier),
    crystal: Math.round(set.sellCrystal * multiplier),
  };
}

/** Mirrors inventory.service.ts's recycleItem() fragment yield, for display before the player commits. */
function computeRecycleValue(tier: ItemTier, ownedFragmentsByTier: Partial<Record<ItemTier, number>>, extraFragments: number): RecycleValueDto {
  return {
    fragmentItemDefinitionKey: FRAGMENT_KEYS_BY_TIER[tier],
    ownedFragments: ownedFragmentsByTier[tier] ?? 0,
    fragmentsPerStone: equipmentRuntime().upgrade.fragmentsPerStone,
    fragments: GAME_BALANCE.itemRecycle.fragmentsPerItem + extraFragments,
  };
}
