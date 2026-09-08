import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemStatsDto, RaceLockInfoDto, ShopItemDto, ShopResponseDto } from '@pentilius/shared';
import { ItemTier } from '@prisma/client';
import { GAME_BALANCE } from '../config/game-config';
import { grantItem } from '../inventory/inventory-capacity';
import { EconomyService } from '../player/economy.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ShopService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
  ) {}

  async getShopItems(): Promise<ShopResponseDto> {
    const items = await this.prisma.itemDefinition.findMany({ orderBy: { key: 'asc' } });
    return {
      items: items.map(
        (item): ShopItemDto => ({
          itemDefinitionKey: item.key,
          nameKey: item.nameKey,
          descriptionKey: item.descriptionKey,
          category: item.category,
          slot: item.slot,
          tier: item.tier,
          iconAssetId: item.iconAssetId,
          priceMetal: item.shopPriceMetal,
          priceCrystal: item.shopPriceCrystal,
          priceCredits: item.shopPriceCredits,
          baseStats: item.category === 'EQUIPMENT' ? toItemStatsDto(item.baseStats as { attack?: number; defense?: number; hp?: number }) : null,
          raceLockInfo: item.category === 'EQUIPMENT' ? toRaceLockInfoDto(item.tier) : null,
        }),
      ),
    };
  }

  async buyItem(playerId: string, itemKey: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const itemDefinition = await tx.itemDefinition.findUnique({ where: { key: itemKey } });
      if (!itemDefinition) {
        throw new NotFoundException('Item not found');
      }

      const player = await this.economy.settleResources(playerId, tx);
      if (
        player.metal < itemDefinition.shopPriceMetal ||
        player.crystal < itemDefinition.shopPriceCrystal ||
        player.credits < itemDefinition.shopPriceCredits
      ) {
        throw new BadRequestException('NOT_ENOUGH_RESOURCES');
      }

      // No race override here (owner decision): a bought item rolls the same
      // tier-based race chance as a loot drop — see inventory-capacity.ts's
      // rollRace(). Quality is still forced NORMAL — no Rare/Excellent options
      // from the Shop (owner decision).
      const granted = await grantItem(playerId, itemDefinition.id, tx, { quality: 'NORMAL' });
      if (!granted) {
        throw new BadRequestException('INVENTORY_FULL');
      }

      await tx.player.update({
        where: { id: playerId },
        data: {
          metal: { decrement: itemDefinition.shopPriceMetal },
          crystal: { decrement: itemDefinition.shopPriceCrystal },
          credits: { decrement: itemDefinition.shopPriceCredits },
        },
      });
    });
  }
}

/** A freshly bought item starts at upgrade level 0, so this is just the raw baseStats — no upgrade multiplier yet. */
function toItemStatsDto(baseStats: { attack?: number; defense?: number; hp?: number }): ItemStatsDto {
  const stats: ItemStatsDto = {};
  if (baseStats.attack) stats.attack = baseStats.attack;
  if (baseStats.defense) stats.defense = baseStats.defense;
  if (baseStats.hp) stats.hp = baseStats.hp;
  return stats;
}

/**
 * Mirrors inventory-capacity.ts's rollRace() odds, for display before the
 * player commits. `ownRaceChance` is the same for every player regardless of
 * their own race — each of the 5 races is equally likely. Null for PIONEER
 * (always universal, no lock risk to warn about).
 */
function toRaceLockInfoDto(tier: ItemTier | null): RaceLockInfoDto | null {
  if (tier === 'COREFORGED') {
    return { ownRaceChance: 1 / 5, universalChance: 0 };
  }
  if (tier === 'ASCENDANT') {
    const universalChance = GAME_BALANCE.raceLock.ascendantUniversalChance;
    return { ownRaceChance: (1 - universalChance) / 5, universalChance };
  }
  return null;
}
