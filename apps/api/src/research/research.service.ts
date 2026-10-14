import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ResearchResponseDto, ResearchStateDto, ResourcesDto, SpecialLevelDto } from '@pentilius/shared';
import { Player, PlayerResearch, ResearchBonusType, ResearchType } from '@prisma/client';
import { GAME_BALANCE } from '../config/game-config';
import { EconomyService } from '../player/economy.service';
import { PushService } from '../notifications/push.service';
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
    private readonly push: PushService,
  ) {}

  async getResearches(playerId: string): Promise<ResearchResponseDto> {
    const player = await this.economy.settleResources(playerId);
    await this.ensurePlayerResearchesExist(playerId);
    await this.finalizeCompletedResearches(playerId);

    const [researches, researchCap, expeditionUnlocks] = await Promise.all([this.loadResearches(playerId), this.researchCap(playerId), this.loadExpeditionUnlocks()]);
    return { resources: toResourcesDto(player), researches: researches.map((r) => toResearchStateDto(r, expeditionUnlocks)), researchCap };
  }

  /** Expeditions unlocked by the Navigation research (shown as its special levels). */
  private loadExpeditionUnlocks(): Promise<{ nameKey: string; requiredNavigationLevel: number }[]> {
    return this.prisma.expeditionType.findMany({ where: { requiredNavigationLevel: { gt: 0 } }, select: { nameKey: true, requiredNavigationLevel: true } });
  }

  /** Research Center level x researchCapPerLevel (owner decision, 2026-10-14); 0 until it's built. */
  private async researchCap(playerId: string, tx: Pick<PrismaService, 'playerBuilding'> = this.prisma): Promise<number> {
    const center = await tx.playerBuilding.findFirst({
      where: { playerId, buildingType: { key: GAME_BALANCE.buildingKeys.researchCenter } },
      include: { buildingType: true },
    });
    return center ? center.level * (center.buildingType.researchCapPerLevel ?? 1) : 0;
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
      if (playerResearch.level + 1 > (await this.researchCap(playerId, tx))) {
        throw new BadRequestException('RESEARCH_CENTER_LEVEL_REQUIRED');
      }
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
        // Research Methods shortens it (owner decision, 2026-10-14).
        data: {
          researchStartedAt: new Date(),
          researchEndsAt: new Date(
            Date.now() +
              Math.max(1, Math.round(nextLevelCost.researchSeconds * (1 - Math.min(0.9, (await this.economy.getResearchMultiplier(playerId, ResearchBonusType.RESEARCH_SPEED, tx)) - 1)))) * 1000,
          ),
        },
        include: { researchType: { include: { levelCosts: true } } },
      });

      return toResearchStateDto(updated, await this.loadExpeditionUnlocks());
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
      // Same key as the minute scan, so it goes out once whichever sees it first.
      void this.push.sendOnce(playerId, 'RESEARCH_DONE', `${research.id}:${research.researchEndsAt!.toISOString()}`).catch(() => undefined);
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

type ExpeditionUnlock = { nameKey: string; requiredNavigationLevel: number };

function toResearchStateDto(research: ResearchWithType, expeditionUnlocks: ExpeditionUnlock[] = []): ResearchStateDto {
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
    researchStartedAt: research.researchEndsAt ? (research.researchStartedAt?.toISOString() ?? null) : null,
    nextLevelCost: nextLevelCost
      ? {
          metalCost: nextLevelCost.metalCost,
          crystalCost: nextLevelCost.crystalCost,
          creditsCost: nextLevelCost.creditsCost,
          researchSeconds: nextLevelCost.researchSeconds,
        }
      : null,
    specialLevels: researchSpecialLevels(research, expeditionUnlocks),
  };
}

/**
 * Recycling: one extra fragment every N levels; Navigation: the levels that
 * unlock the longer expeditions (owner decisions, 2026-10-14).
 */
function researchSpecialLevels(research: ResearchWithType, expeditionUnlocks: ExpeditionUnlock[]): SpecialLevelDto[] {
  if (research.researchType.bonusType === 'EXPEDITION_REWARDS') {
    return [...expeditionUnlocks]
      .sort((a, b) => a.requiredNavigationLevel - b.requiredNavigationLevel)
      .map((e) => ({ level: e.requiredNavigationLevel, reached: research.level >= e.requiredNavigationLevel, kind: 'EXPEDITION_UNLOCK' as const, nameKey: e.nameKey }));
  }
  if (research.researchType.bonusType !== 'RECYCLING') return [];
  const every = GAME_BALANCE.recyclingExtraFragmentEvery;
  const levels: SpecialLevelDto[] = [];
  for (let level = every; level <= research.researchType.maxLevel; level += every) {
    levels.push({ level, reached: research.level >= level, kind: 'EXTRA_FRAGMENT', nameKey: null });
  }
  return levels;
}
