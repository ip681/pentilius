import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { GAME_BALANCE } from '../config/game-config';
import { PrismaService } from '../prisma/prisma.service';
import { coreStatus, getCurrentSeason, SeasonService } from './season.service';

// A single cheap query — checked every minute so the new season starts within
// a minute of the announced time players see counting down.
const CHECK_INTERVAL_MS = 60_000;

/**
 * Season reset (owner decision, 2026-10-13). Runs automatically
 * GameSettings.seasonResetDelayDays after the Core closes (or earlier via
 * godmaster's "reset now"). Accounts stay; everything about the season goes:
 * - every clan is disbanded (with its buildings, treasury, wars and chat);
 * - every player's progress resets (level, XP, attribute points, resources,
 *   energy, buildings, research, expeditions, inventory, market listings);
 * - battle history (PvE, PvP, clan wars, bosses) and Core attacks are deleted;
 * - everyone re-picks their race (Player.needsRaceSelection).
 * Kept: accounts, cosmetics, friends, DMs, blocks, reports/bans, and the
 * frozen season results (SeasonClanResult / SeasonPlayerResult).
 * A new Season row is created with the Core unscheduled.
 */
@Injectable()
export class SeasonResetService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SeasonResetService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly seasons: SeasonService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.resetIfDue(), CHECK_INTERVAL_MS);
    this.timer.unref?.();
    setTimeout(() => void this.resetIfDue(), 45_000).unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Resets if the scheduled time has passed — by the server's own clock, so a
   * client can never trigger it early. Called by the minute timer AND by POST
   * /core/season-check when a client's countdown runs out, so the new season
   * starts the moment the countdown hits zero.
   */
  async resetIfDue(): Promise<void> {
    if (this.running) return;
    const season = await getCurrentSeason(this.prisma);
    if (season.resetAt) return;
    const due = await this.seasons.scheduledResetAt(season);
    if (!due || new Date(due).getTime() > Date.now()) return;
    try {
      await this.resetNow(season.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Another request won the race and reset it already — not an error.
      if (message === 'SEASON_ALREADY_RESET' || message === 'RESET_IN_PROGRESS') return;
      this.logger.error(`Automatic season reset failed: ${message}`);
    }
  }

  /**
   * Wipes the season. Only possible once the Core has closed. Finalizes the
   * standings first if nobody has looked at them yet, so the season's results
   * are always frozen before anything is deleted.
   */
  async resetNow(expectedSeasonId: number): Promise<{ newSeasonId: number }> {
    if (this.running) throw new BadRequestException('RESET_IN_PROGRESS');
    this.running = true;
    try {
      const season = await getCurrentSeason(this.prisma);
      if (season.id !== expectedSeasonId || coreStatus(season) !== 'ENDED') {
        throw new BadRequestException('SEASON_NOT_ENDED');
      }
      await this.seasons.ensureFinalized(season);

      const start = GAME_BALANCE.newPlayer;
      const newSeason = await this.prisma.$transaction(
        async (tx) => {
          const claimed = await tx.season.updateMany({ where: { id: season.id, resetAt: null }, data: { resetAt: new Date() } });
          if (claimed.count === 0) throw new BadRequestException('SEASON_ALREADY_RESET');

          // Battle history and season activity.
          await tx.battleReport.deleteMany({});
          await tx.pvpBattleReport.deleteMany({});
          await tx.clanWarAttack.deleteMany({});
          await tx.clanWar.deleteMany({});
          await tx.bossFormationSlot.deleteMany({});
          await tx.bossFormation.deleteMany({});
          await tx.bossFormationDailyPoints.deleteMany({});
          await tx.coreAttack.deleteMany({});
          // Achievements, level rewards and daily tasks restart with the season.
          await tx.achievementProgress.deleteMany({});
          await tx.achievementClaim.deleteMany({});
          await tx.dailyTaskProgress.deleteMany({});
          await tx.dailyTaskClaim.deleteMany({});

          // Every clan is disbanded (season results keep the names).
          await tx.clanMessage.deleteMany({});
          await tx.clanBuilding.deleteMany({});
          await tx.clanMembership.deleteMany({});
          await tx.clan.deleteMany({});

          // Every player's progress.
          await tx.marketListing.deleteMany({});
          await tx.itemInstance.deleteMany({});
          await tx.playerBuilding.deleteMany({});
          await tx.playerResearch.deleteMany({});
          await tx.playerExpedition.deleteMany({});
          const now = new Date();
          await tx.player.updateMany({
            where: { deletedAt: null },
            data: {
              level: 1,
              xp: 0,
              attributePointsAvailable: 0,
              baseDamage: 0,
              baseDefense: 0,
              baseHp: 0,
              baseEvasion: 0,
              metal: start.metal,
              crystal: start.crystal,
              credits: start.credits,
              resourcesUpdatedAt: now,
              actionEnergy: start.actionEnergy,
              actionEnergyMax: start.actionEnergy,
              energyUpdatedAt: now,
              pvpProtectedUntil: null,
              clanWarProtectedUntil: null,
              nextBossFormationActionAt: null,
              lastCoreAttackAt: null,
              needsRaceSelection: true,
              buildQueueBuildingTypeId: null,
              buildQueueMetal: 0,
              buildQueueCrystal: 0,
            },
          });

          return tx.season.create({ data: {} });
        },
        { timeout: 120_000 },
      );

      this.logger.log(`Season ${season.id} reset — season ${newSeason.id} started`);
      return { newSeasonId: newSeason.id };
    } finally {
      this.running = false;
    }
  }
}
