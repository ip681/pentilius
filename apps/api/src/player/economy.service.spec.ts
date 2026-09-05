import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { EconomyService } from './economy.service';

describe('EconomyService', () => {
  let economy: EconomyService;
  let prisma: {
    player: { findUniqueOrThrow: jest.Mock; update: jest.Mock };
    playerBuilding: { findMany: jest.Mock };
    playerResearch: { findMany: jest.Mock };
    levelThreshold: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      player: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
      playerBuilding: { findMany: jest.fn() },
      playerResearch: { findMany: jest.fn().mockResolvedValue([]) },
      levelThreshold: { findUnique: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [EconomyService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    economy = moduleRef.get(EconomyService);
  });

  describe('settleResources', () => {
    it('adds nothing when no time has elapsed', async () => {
      const now = new Date();
      prisma.player.findUniqueOrThrow.mockResolvedValue({ id: 'p1', resourcesUpdatedAt: now });
      prisma.playerBuilding.findMany.mockResolvedValue([]);

      const result = await economy.settleResources('p1');

      expect(prisma.player.update).not.toHaveBeenCalled();
      expect(result.resourcesUpdatedAt).toBe(now);
    });

    it('credits production from buildings for the elapsed time', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000);
      prisma.player.findUniqueOrThrow.mockResolvedValue({ id: 'p1', resourcesUpdatedAt: twoHoursAgo });
      prisma.playerBuilding.findMany.mockResolvedValue([
        {
          level: 1,
          buildingType: { levelCosts: [{ level: 1, producesResourceType: 'METAL', producesPerHour: 100 }] },
        },
      ]);
      prisma.player.update.mockResolvedValue({ id: 'p1', metal: 200 });

      await economy.settleResources('p1');

      const updateArgs = prisma.player.update.mock.calls[0][0];
      expect(updateArgs.data.metal.increment).toBe(200);
      expect(updateArgs.data.crystal.increment).toBe(0);
    });
  });

  describe('settleEnergy', () => {
    it('does not regenerate past the cap', async () => {
      prisma.player.findUniqueOrThrow.mockResolvedValue({ actionEnergy: 10, actionEnergyMax: 10, energyUpdatedAt: new Date(0) });

      const result = await economy.settleEnergy('p1');

      expect(prisma.player.update).not.toHaveBeenCalled();
      expect(result.actionEnergy).toBe(10);
    });

    it('adds one point per regen interval elapsed, preserving remainder time', async () => {
      const intervalMs = 30 * 60_000;
      const start = new Date(Date.now() - intervalMs * 2.5);
      prisma.player.findUniqueOrThrow.mockResolvedValue({ actionEnergy: 5, actionEnergyMax: 10, energyUpdatedAt: start });
      prisma.player.update.mockResolvedValue({ actionEnergy: 7 });

      await economy.settleEnergy('p1');

      const updateArgs = prisma.player.update.mock.calls[0][0];
      expect(updateArgs.data.actionEnergy).toBe(7);
      expect(updateArgs.data.energyUpdatedAt.getTime()).toBe(start.getTime() + intervalMs * 2);
    });
  });

  describe('applyXp', () => {
    it('cascades through multiple level-ups when xp gained covers several thresholds', async () => {
      prisma.player.findUniqueOrThrow.mockResolvedValue({ id: 'p1', xp: 10, level: 1 });
      prisma.levelThreshold.findUnique.mockImplementation(({ where }: { where: { level: number } }) => {
        const thresholds: Record<number, number> = { 1: 20, 2: 30 };
        return Promise.resolve(thresholds[where.level] ? { level: where.level, xpRequired: thresholds[where.level] } : null);
      });
      prisma.player.update.mockImplementation(({ data }) => Promise.resolve({ id: 'p1', ...data }));

      const result = await economy.applyXp('p1', 45);

      // 10 + 45 = 55 xp; level1->2 costs 20 (35 left), level2->3 costs 30 (5 left), no threshold for level 3
      expect(result.player.level).toBe(3);
      expect(result.player.xp).toBe(5);
      expect(result.leveledUp).toBe(true);
    });

    it('reports no level-up when xp gained does not reach the next threshold', async () => {
      prisma.player.findUniqueOrThrow.mockResolvedValue({ id: 'p1', xp: 0, level: 1 });
      prisma.levelThreshold.findUnique.mockResolvedValue({ level: 1, xpRequired: 100 });
      prisma.player.update.mockImplementation(({ data }) => Promise.resolve({ id: 'p1', ...data }));

      const result = await economy.applyXp('p1', 10);

      expect(result.leveledUp).toBe(false);
      expect(result.player.level).toBe(1);
      expect(result.player.xp).toBe(10);
    });
  });
});
