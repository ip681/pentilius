import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { energyIntervalMs } from '../player/economy.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from './push.service';

const SCAN_INTERVAL_MS = 60_000;
// Events that ended within this window are still sent (covers a missed scan or
// a short restart); PushDispatch makes sure nothing is sent twice.
const WINDOW_MS = 10 * 60_000;
const DISPATCH_RETENTION_MS = 2 * 24 * 60 * 60_000;

/**
 * Once a minute, finds timers that just ended for players with Web Push
 * enabled — one light scan for everyone, not a job per player
 * (instructions/ARCHITECTURE.md). Event-driven notifications (a PvP attack)
 * are sent straight from where they happen.
 *
 * Other modules can add their own light minute work to the same tick
 * (addMinuteTask) instead of starting another timer — e.g. finishing boss
 * formations whose time is up (owner decision, 2026-10-27). That work runs
 * first, and always — also when Web Push is off.
 */
@Injectable()
export class PushSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushSchedulerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly minuteTasks: { name: string; run: () => Promise<void> }[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), SCAN_INTERVAL_MS);
    this.timer.unref?.();
  }

  addMinuteTask(name: string, run: () => Promise<void>): void {
    this.minuteTasks.push({ name, run });
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const task of this.minuteTasks) {
        try {
          await task.run();
        } catch (error) {
          this.logger.error(`Minute task ${task.name} failed: ${(error as Error).message}`);
        }
      }
      if (this.push.enabled) await this.scan();
    } finally {
      this.running = false;
    }
  }

  async scan(): Promise<void> {
    try {
      const subscribed = await this.prisma.pushSubscription.findMany({ distinct: ['playerId'], select: { playerId: true } });
      if (subscribed.length === 0) return;
      const ids = subscribed.map((s) => s.playerId);
      const now = Date.now();
      const from = new Date(now - WINDOW_MS);
      const to = new Date(now);

      const [players, buildings, researches, expeditions, formations] = await Promise.all([
        this.prisma.player.findMany({
          where: { id: { in: ids }, deletedAt: null },
          select: { id: true, actionEnergy: true, actionEnergyMax: true, energyUpdatedAt: true, energyRegenBonus: true },
        }),
        this.prisma.playerBuilding.findMany({ where: { playerId: { in: ids }, constructionEndsAt: { gte: from, lte: to } } }),
        this.prisma.playerResearch.findMany({ where: { playerId: { in: ids }, researchEndsAt: { gte: from, lte: to } } }),
        this.prisma.playerExpedition.findMany({ where: { playerId: { in: ids }, claimedAt: null, cancelled: false, endsAt: { gte: from, lte: to } } }),
        this.prisma.bossFormation.findMany({
          where: { status: 'RESOLVED', resolvesAt: { gte: from, lte: to }, slots: { some: { playerId: { in: ids } } } },
          select: { id: true, outcome: true, resolvesAt: true, boss: { select: { zoneId: true } }, slots: { select: { playerId: true, joinedAt: true } } },
        }),
      ]);

      for (const player of players) {
        if (player.actionEnergy >= player.actionEnergyMax) continue;
        const fullAt = player.energyUpdatedAt.getTime() + (player.actionEnergyMax - player.actionEnergy) * energyIntervalMs(player);
        if (fullAt >= from.getTime() && fullAt <= now) {
          await this.push.sendOnce(player.id, 'ENERGY_FULL', new Date(fullAt).toISOString());
        }
      }
      for (const b of buildings) await this.push.sendOnce(b.playerId, 'CONSTRUCTION_DONE', `${b.id}:${b.constructionEndsAt!.toISOString()}`);
      for (const r of researches) await this.push.sendOnce(r.playerId, 'RESEARCH_DONE', `${r.id}:${r.researchEndsAt!.toISOString()}`);
      for (const e of expeditions) await this.push.sendOnce(e.playerId, 'EXPEDITION_DONE', e.id);
      const subscribedIds = new Set(ids);
      for (const f of formations) {
        for (const slot of f.slots) {
          // The fighter whose join filled the formation watched it live — no notice for them.
          if (!slot.playerId || !subscribedIds.has(slot.playerId) || (slot.joinedAt && slot.joinedAt >= f.resolvesAt)) continue;
          await this.push.sendOnce(slot.playerId, 'BOSS_BATTLE_DONE', f.id, { won: f.outcome === 'WIN' ? 'true' : 'false' }, `/zones/${f.boss.zoneId}/boss?battle=${f.id}`);
        }
      }

      await this.prisma.pushDispatch.deleteMany({ where: { createdAt: { lt: new Date(now - DISPATCH_RETENTION_MS) } } });
    } catch (error) {
      this.logger.error(`Push scan failed: ${(error as Error).message}`);
    }
  }
}
