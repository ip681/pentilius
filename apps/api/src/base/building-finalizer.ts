import { ResearchBonusType } from '@prisma/client';
import { GAME_BALANCE } from '../config/game-config';
import { PushService } from '../notifications/push.service';
import { EconomyService } from '../player/economy.service';
import { PrismaService } from '../prisma/prisma.service';

type Deps = { prisma: PrismaService; economy: EconomyService; push: PushService };

/**
 * Finishes every construction whose time is up (lazy, elapsed-time based), then
 * starts a VIP-queued building. Shared by the Base and the profile load, so
 * effects that matter outside the Base screen — the Reactor's energy bonus —
 * apply as soon as the player does anything, not only on a Base visit.
 */
export async function finalizeDueBuildings(deps: Deps, playerId: string, options: { checkQueue?: boolean } = {}): Promise<void> {
  // Loops because a queued building may itself have finished while the player was away.
  for (let pass = 0; pass < 3; pass++) {
    const due = await deps.prisma.playerBuilding.findMany({
      where: { playerId, constructionEndsAt: { lte: new Date() } },
      include: { buildingType: true },
    });
    let lastEnd: Date | null = null;
    for (const building of due) {
      const level = building.level + 1;
      await deps.prisma.playerBuilding.update({ where: { id: building.id }, data: { level, constructionEndsAt: null } });
      if (!lastEnd || building.constructionEndsAt! > lastEnd) lastEnd = building.constructionEndsAt;
      if (building.buildingType.key === GAME_BALANCE.buildingKeys.reactor) {
        await refreshEnergyBonuses(deps, playerId);
      }
      // Same key as the minute scan, so it goes out once whichever sees it first.
      void deps.push.sendOnce(playerId, 'CONSTRUCTION_DONE', `${building.id}:${building.constructionEndsAt!.toISOString()}`).catch(() => undefined);
    }
    if (due.length === 0 && !(pass === 0 && options.checkQueue)) return;
    if (!(await startQueuedBuilding(deps, playerId, lastEnd))) return;
  }
}

/**
 * Energy bonuses stored on the player (owner decisions, 2026-10-14):
 * - the personal Reactor: faster regeneration, +1 max energy every N levels;
 * - the clan Generator: half of that, +1 max energy at fixed levels.
 * Recomputed on profile load and when the Reactor finishes, so joining or
 * leaving a clan and the clan's Generator apply on the player's next action.
 * Energy accrued so far is settled first with the old rate.
 */
export async function refreshEnergyBonuses(deps: Deps, playerId: string): Promise<void> {
  const [reactor, generatorLevel, player] = await Promise.all([
    deps.prisma.playerBuilding.findFirst({ where: { playerId, buildingType: { key: GAME_BALANCE.buildingKeys.reactor } }, include: { buildingType: true } }),
    clanGeneratorLevel(deps.prisma, playerId),
    deps.prisma.player.findUniqueOrThrow({ where: { id: playerId }, select: { energyRegenBonus: true, actionEnergyMax: true } }),
  ]);
  const reactorLevel = reactor?.level ?? 0;
  const every = reactor?.buildingType.maxEnergyBonusEvery ?? 0;
  const regen = Math.min(0.9, reactorLevel * (reactor?.buildingType.energyRegenBonusPerLevel ?? 0) + generatorLevel.level * generatorLevel.perLevel);
  const max =
    GAME_BALANCE.newPlayer.actionEnergy +
    (every > 0 ? Math.floor(reactorLevel / every) : 0) +
    GAME_BALANCE.clanGenerator.maxEnergyLevels.filter((level) => generatorLevel.level >= level).length;
  if (Math.abs(player.energyRegenBonus - regen) < 1e-9 && player.actionEnergyMax === max) return;
  await deps.economy.settleEnergy(playerId);
  await deps.prisma.player.update({ where: { id: playerId }, data: { energyRegenBonus: regen, actionEnergyMax: max } });
}

/** The player's clan Generator level (a finished but not yet finalized level counts), or 0. */
async function clanGeneratorLevel(prisma: PrismaService, playerId: string): Promise<{ level: number; perLevel: number }> {
  const membership = await prisma.clanMembership.findUnique({ where: { playerId }, select: { clanId: true } });
  if (!membership) return { level: 0, perLevel: 0 };
  const generator = await prisma.clanBuilding.findFirst({
    where: { clanId: membership.clanId, clanBuildingType: { bonusType: 'ENERGY_REGEN' } },
    include: { clanBuildingType: true },
  });
  if (!generator) return { level: 0, perLevel: 0 };
  const finished = generator.constructionEndsAt && generator.constructionEndsAt <= new Date() ? 1 : 0;
  return { level: generator.level + finished, perLevel: generator.clanBuildingType.bonusPerLevel };
}

/**
 * Starts the VIP-queued building once nothing is under construction. It
 * starts when the previous one ended (not when the player came back), so
 * offline time is respected. Returns true if it started.
 */
async function startQueuedBuilding(deps: Deps, playerId: string, previousEnd: Date | null): Promise<boolean> {
  const speedBonus = (await deps.economy.getResearchMultiplier(playerId, ResearchBonusType.CONSTRUCTION_SPEED)) - 1;
  return deps.prisma.$transaction(async (tx) => {
    const player = await tx.player.findUniqueOrThrow({ where: { id: playerId } });
    const buildingTypeId = player.buildQueueBuildingTypeId;
    if (!buildingTypeId) return false;
    const busy = await tx.playerBuilding.findFirst({ where: { playerId, constructionEndsAt: { not: null } } });
    if (busy) return false;

    const claimed = await tx.player.updateMany({
      where: { id: playerId, buildQueueBuildingTypeId: buildingTypeId },
      data: { buildQueueBuildingTypeId: null, buildQueueMetal: 0, buildQueueCrystal: 0 },
    });
    if (claimed.count !== 1) return false;

    const building = await tx.playerBuilding.findUniqueOrThrow({ where: { playerId_buildingTypeId: { playerId, buildingTypeId } } });
    const cost = await tx.buildingLevelCost.findUnique({ where: { buildingTypeId_level: { buildingTypeId, level: building.level + 1 } } });
    if (!cost) {
      // Can't happen in normal play (the level was checked when queued) — refund rather than lose it.
      await tx.player.update({
        where: { id: playerId },
        data: { metal: { increment: player.buildQueueMetal }, crystal: { increment: player.buildQueueCrystal } },
      });
      return false;
    }
    const start = previousEnd ?? new Date();
    await tx.playerBuilding.update({
      where: { id: building.id },
      data: { constructionStartedAt: start, constructionEndsAt: new Date(start.getTime() + constructionMs(cost.constructionSeconds, speedBonus)) },
    });
    return true;
  });
}

/** Construction time after the Construction Technologies research (owner decision, 2026-10-14). */
export function constructionMs(seconds: number, speedBonus: number): number {
  return Math.max(1, Math.round(seconds * (1 - Math.min(0.9, speedBonus)))) * 1000;
}
