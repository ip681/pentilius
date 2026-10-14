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
 */
@Injectable()
export class PushSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushSchedulerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  onModuleInit(): void {
    if (!this.push.enabled) return;
    this.timer = setInterval(() => void this.scan(), SCAN_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async scan(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const subscribed = await this.prisma.pushSubscription.findMany({ distinct: ['playerId'], select: { playerId: true } });
      if (subscribed.length === 0) return;
      const ids = subscribed.map((s) => s.playerId);
      const now = Date.now();
      const from = new Date(now - WINDOW_MS);
      const to = new Date(now);

      const [players, buildings, researches, expeditions] = await Promise.all([
        this.prisma.player.findMany({
          where: { id: { in: ids }, deletedAt: null },
          select: { id: true, actionEnergy: true, actionEnergyMax: true, energyUpdatedAt: true, energyRegenBonus: true },
        }),
        this.prisma.playerBuilding.findMany({ where: { playerId: { in: ids }, constructionEndsAt: { gte: from, lte: to } } }),
        this.prisma.playerResearch.findMany({ where: { playerId: { in: ids }, researchEndsAt: { gte: from, lte: to } } }),
        this.prisma.playerExpedition.findMany({ where: { playerId: { in: ids }, claimedAt: null, cancelled: false, endsAt: { gte: from, lte: to } } }),
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

      await this.prisma.pushDispatch.deleteMany({ where: { createdAt: { lt: new Date(now - DISPATCH_RETENTION_MS) } } });
    } catch (error) {
      this.logger.error(`Push scan failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
