import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ResearchStateDto, ResourcesDto } from '@pentilius/shared';
import { Player, PlayerResearch, ResearchType } from '@prisma/client';
import { EconomyService } from '../player/economy.service';
import { PrismaService } from '../prisma/prisma.service';

type ResearchWithType = PlayerResearch & { researchType: ResearchType & { levelCosts: { level: number; metalCost: number; crystalCost: number; creditsCost: number; researchSeconds: number }[] } };

/**
 * Mirrors base/base.service.ts's ensure-rows / finalize-completed / get /
 * start-upgrade pattern, including its single-active-slot rule (owner
 * decision, 2026-09-11 — reversed from an earlier "let all 4 technologies
 * run in parallel" call: with only 4 techs capped at level 5 each, parallel
 * research let a dedicated player exhaust the whole tree too quickly,
 * cutting season-long content short instead of stretching it out). Branches,
 * technology list, costs and effects are UNDEFINED
 * (instructions/OPEN_DECISIONS.md: "Research") — this is a working mechanism
 * with clearly placeholder seed content.
 */
@Injectable()
export class ResearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly economy: EconomyService,
  ) {}

  async getResearches(playerId: string) {
    const player = await this.economy.settleResources(playerId);
    await this.ensurePlayerResearchesExist(playerId);
    await this.finalizeCompletedResearches(playerId);

    const researches = await this.loadResearches(playerId);
    return { resources: toResourcesDto(player), researches: researches.map(toResearchStateDto) };
  }

  async startResearch(playerId: string, researchKey: string): Promise<ResearchStateDto> {
    await this.economy.settleResources(playerId);
    await this.ensurePlayerResearchesExist(playerId);
    await this.finalizeCompletedResearches(playerId);

    return this.prisma.$transaction(async (tx) => {
      const researchType = await tx.researchType.findUnique({ where: { key: researchKey } });
      if (!researchType) {
        throw new NotFoundException('Unknown research');
      }

      const playerResearch = await tx.playerResearch.findUniqueOrThrow({
        where: { playerId_researchTypeId: { playerId, researchTypeId: researchType.id } },
      });

      if (playerResearch.researchEndsAt) {
        throw new BadRequestException('Research is already in progress');
      }

      const anyInProgress = await tx.playerResearch.findFirst({
        where: { playerId, researchEndsAt: { not: null } },
      });
      if (anyInProgress) {
        throw new BadRequestException('ANOTHER_RESEARCH_IN_PROGRESS');
      }

      const nextLevelCost = await tx.researchLevelCost.findUnique({
        where: { researchTypeId_level: { researchTypeId: researchType.id, level: playerResearch.level + 1 } },
      });
      if (!nextLevelCost) {
        throw new BadRequestException('Research is already at max level');
      }

      const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
      if (player.metal < nextLevelCost.metalCost || player.crystal < nextLevelCost.crystalCost || player.credits < nextLevelCost.creditsCost) {
        throw new BadRequestException('Not enough resources');
      }

      await tx.player.update({
        where: { id: playerId },
        data: {
          metal: { decrement: nextLevelCost.metalCost },
          crystal: { decrement: nextLevelCost.crystalCost },
          credits: { decrement: nextLevelCost.creditsCost },
        },
      });

      const updated = await tx.playerResearch.update({
        where: { id: playerResearch.id },
        data: { researchEndsAt: new Date(Date.now() + nextLevelCost.researchSeconds * 1000) },
        include: { researchType: { include: { levelCosts: true } } },
      });

      return toResearchStateDto(updated);
    });
  }

  private async ensurePlayerResearchesExist(playerId: string): Promise<void> {
    const researchTypes = await this.prisma.researchType.findMany();
    for (const researchType of researchTypes) {
      await this.prisma.playerResearch.upsert({
        where: { playerId_researchTypeId: { playerId, researchTypeId: researchType.id } },
        update: {},
        create: { playerId, researchTypeId: researchType.id, level: 0 },
      });
    }
  }

  private async finalizeCompletedResearches(playerId: string): Promise<void> {
    const due = await this.prisma.playerResearch.findMany({
      where: { playerId, researchEndsAt: { lte: new Date() } },
    });
    for (const research of due) {
      await this.prisma.playerResearch.update({
        where: { id: research.id },
        data: { level: research.level + 1, researchEndsAt: null },
      });
    }
  }

  private loadResearches(playerId: string): Promise<ResearchWithType[]> {
    return this.prisma.playerResearch.findMany({
      where: { playerId },
      include: { researchType: { include: { levelCosts: true } } },
    });
  }
}

function toResourcesDto(player: Player): ResourcesDto {
  return {
    metal: player.metal,
    crystal: player.crystal,
    credits: player.credits,
  };
}

function toResearchStateDto(research: ResearchWithType): ResearchStateDto {
  const nextLevelCost = research.researchType.levelCosts.find((cost) => cost.level === research.level + 1);
  return {
    key: research.researchType.key,
    nameKey: research.researchType.nameKey,
    descriptionKey: research.researchType.descriptionKey,
    bonusType: research.researchType.bonusType,
    bonusPerLevel: research.researchType.bonusPerLevel,
    iconAssetId: research.researchType.iconAssetId,
    level: research.level,
    maxLevel: research.researchType.maxLevel,
    researchEndsAt: research.researchEndsAt?.toISOString() ?? null,
    nextLevelCost: nextLevelCost
      ? {
          metalCost: nextLevelCost.metalCost,
          crystalCost: nextLevelCost.crystalCost,
          creditsCost: nextLevelCost.creditsCost,
          researchSeconds: nextLevelCost.researchSeconds,
        }
      : null,
  };
}
