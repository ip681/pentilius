import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActiveExpeditionDto, ExpeditionClaimResultDto, ExpeditionsResponseDto, ExpeditionTypeDto } from '@pentilius/shared';
import { GAME_BALANCE } from '../config/game-config';
import { grantItem } from '../inventory/inventory-capacity';
import { EconomyService } from '../player/economy.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExpeditionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
  ) {}

  async getExpeditions(playerId: string): Promise<ExpeditionsResponseDto> {
    const [types, active] = await Promise.all([
      this.prisma.expeditionType.findMany({ include: { bonusItemDefinition: true }, orderBy: { durationMinutes: 'asc' } }),
      this.prisma.playerExpedition.findFirst({
        where: { playerId, claimedAt: null },
        include: { expeditionType: true },
      }),
    ]);

    return {
      types: types.map(toExpeditionTypeDto),
      active: active
        ? {
            expeditionKey: active.expeditionType.key,
            expeditionNameKey: active.expeditionType.nameKey,
            startedAt: active.startedAt.toISOString(),
            endsAt: active.endsAt.toISOString(),
            completed: active.endsAt.getTime() <= Date.now(),
          }
        : null,
    };
  }

  async start(playerId: string, key: string): Promise<ActiveExpeditionDto> {
    const existing = await this.prisma.playerExpedition.findFirst({ where: { playerId, claimedAt: null } });
    if (existing) {
      throw new BadRequestException('An expedition is already in progress. Claim it before starting another.');
    }

    const expeditionType = await this.prisma.expeditionType.findUnique({ where: { key } });
    if (!expeditionType) {
      throw new NotFoundException('Unknown expedition');
    }

    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + expeditionType.durationMinutes * 60_000);
    await this.prisma.playerExpedition.create({
      data: { playerId, expeditionTypeId: expeditionType.id, startedAt, endsAt },
    });

    return {
      expeditionKey: expeditionType.key,
      expeditionNameKey: expeditionType.nameKey,
      startedAt: startedAt.toISOString(),
      endsAt: endsAt.toISOString(),
      completed: false,
    };
  }

  async claim(playerId: string): Promise<ExpeditionClaimResultDto> {
    return this.prisma.$transaction(async (tx) => {
      const active = await tx.playerExpedition.findFirst({
        where: { playerId, claimedAt: null },
        include: { expeditionType: { include: { bonusItemDefinition: true } } },
      });
      if (!active) {
        throw new NotFoundException('No expedition in progress');
      }
      if (active.endsAt.getTime() > Date.now()) {
        throw new BadRequestException('Expedition has not finished yet');
      }

      const { expeditionType } = active;
      await tx.player.update({
        where: { id: playerId },
        data: {
          metal: { increment: expeditionType.metalReward },
          crystal: { increment: expeditionType.crystalReward },
          credits: { increment: expeditionType.creditsReward },
        },
      });

      const { leveledUp, player } = await this.economy.applyXp(playerId, expeditionType.xpReward, tx);

      let bonusItem: ExpeditionClaimResultDto['bonusItem'] = null;
      if (expeditionType.bonusItemDefinition && expeditionType.bonusItemChance && Math.random() < expeditionType.bonusItemChance) {
        const granted = await grantItem(playerId, expeditionType.bonusItemDefinition.id, tx);
        if (granted) {
          bonusItem = {
            itemDefinitionKey: expeditionType.bonusItemDefinition.key,
            itemNameKey: expeditionType.bonusItemDefinition.nameKey,
          };
        }
      }

      await tx.playerExpedition.update({ where: { id: active.id }, data: { claimedAt: new Date() } });

      return {
        rewards: {
          metal: expeditionType.metalReward,
          crystal: expeditionType.crystalReward,
          credits: expeditionType.creditsReward,
          xp: expeditionType.xpReward,
        },
        bonusItem,
        leveledUp,
        playerLevel: player.level,
      };
    });
  }

  /** Ends an in-progress expedition early, paying out earlyCancelPercentage of the reward earned proportionally to elapsed time. No bonus item roll. */
  async cancel(playerId: string): Promise<ExpeditionClaimResultDto> {
    return this.prisma.$transaction(async (tx) => {
      const active = await tx.playerExpedition.findFirst({
        where: { playerId, claimedAt: null },
        include: { expeditionType: true },
      });
      if (!active) {
        throw new NotFoundException('No expedition in progress');
      }
      if (active.endsAt.getTime() <= Date.now()) {
        throw new BadRequestException('Expedition has already finished — claim it instead of cancelling');
      }

      const { expeditionType } = active;
      const totalMs = active.endsAt.getTime() - active.startedAt.getTime();
      const elapsedMs = Date.now() - active.startedAt.getTime();
      const proportion = Math.min(1, elapsedMs / totalMs) * GAME_BALANCE.expeditions.earlyCancelPercentage;

      const rewards = {
        metal: Math.floor(expeditionType.metalReward * proportion),
        crystal: Math.floor(expeditionType.crystalReward * proportion),
        credits: Math.floor(expeditionType.creditsReward * proportion),
        xp: Math.floor(expeditionType.xpReward * proportion),
      };

      await tx.player.update({
        where: { id: playerId },
        data: { metal: { increment: rewards.metal }, crystal: { increment: rewards.crystal }, credits: { increment: rewards.credits } },
      });

      const { leveledUp, player } = await this.economy.applyXp(playerId, rewards.xp, tx);

      await tx.playerExpedition.update({ where: { id: active.id }, data: { claimedAt: new Date(), cancelled: true } });

      return { rewards, bonusItem: null, leveledUp, playerLevel: player.level };
    });
  }
}

function toExpeditionTypeDto(type: {
  key: string;
  nameKey: string;
  durationMinutes: number;
  metalReward: number;
  crystalReward: number;
  creditsReward: number;
  xpReward: number;
  bonusItemChance: number | null;
  bonusItemDefinition: { nameKey: string } | null;
}): ExpeditionTypeDto {
  return {
    key: type.key,
    nameKey: type.nameKey,
    durationMinutes: type.durationMinutes,
    rewards: { metal: type.metalReward, crystal: type.crystalReward, credits: type.creditsReward, xp: type.xpReward },
    bonusItemNameKey: type.bonusItemDefinition?.nameKey ?? null,
    bonusItemChance: type.bonusItemChance,
  };
}
