import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('PvP (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenA: string;
  let tokenB: string;
  let tokenC: string;
  let playerAId: string;
  let playerBId: string;
  let playerCId: string;
  const suffix = Date.now();
  const emailA = `pvp-a-${suffix}@example.com`;
  const emailB = `pvp-b-${suffix}@example.com`;
  const emailC = `pvp-c-${suffix}@example.com`;
  const usernameA = `pA_${suffix}`;
  const usernameB = `pB_${suffix}`;
  const usernameC = `pC_${suffix}`;
  const password = 'password123';
  let randomSpy: jest.SpyInstance;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);

    const [regA, regB, regC] = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/auth/register').send({ email: emailA, username: usernameA, password, race: 'LUXARI' }),
      request(app.getHttpServer()).post('/api/v1/auth/register').send({ email: emailB, username: usernameB, password, race: 'VORLUN' }),
      request(app.getHttpServer()).post('/api/v1/auth/register').send({ email: emailC, username: usernameC, password, race: 'ZARYTH' }),
    ]);
    tokenA = regA.body.accessToken;
    tokenB = regB.body.accessToken;
    tokenC = regC.body.accessToken;
    playerAId = regA.body.player.id;
    playerBId = regB.body.player.id;
    playerCId = regC.body.player.id;

    // playerC stays at level 1 to verify the level-5 gate on both sides.
    await prisma.player.updateMany({ where: { id: { in: [playerAId, playerBId] } }, data: { level: 6 } });

    // Gear playerA with top-tier equipment; playerB stays with its unequipped
    // starter kit, so the fight resolves as a clean, deterministic win.
    await equipTopTierLoadout(prisma, playerAId);
  });

  afterAll(async () => {
    await prisma.pvpBattleReport.deleteMany({ where: { OR: [{ attackerId: { in: [playerAId, playerBId, playerCId] } }, { defenderId: { in: [playerAId, playerBId, playerCId] } }] } });
    await prisma.itemInstance.deleteMany({ where: { playerId: { in: [playerAId, playerBId, playerCId] } } });
    await prisma.player.deleteMany({ where: { id: { in: [playerAId, playerBId, playerCId] } } });
    await app.close();
  });

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('reports PvP as locked below level 5 and rejects attacking', async () => {
    const status = await request(app.getHttpServer()).get('/api/v1/pvp/status').set(auth(tokenC)).expect(200);
    expect(status.body.unlocked).toBe(false);
    expect(status.body.minLevel).toBe(5);

    await request(app.getHttpServer()).post('/api/v1/pvp/attack').set(auth(tokenC)).expect(403);
  });

  it('reports PvP as unlocked at level 6', async () => {
    const status = await request(app.getHttpServer()).get('/api/v1/pvp/status').set(auth(tokenA)).expect(200);
    expect(status.body.unlocked).toBe(true);
  });

  it('attacks the only eligible opponent, stealing a percentage of resources and spending Action Energy', async () => {
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

    const beforeAttacker = await request(app.getHttpServer()).get('/api/v1/player/me').set(auth(tokenA)).expect(200);

    const result = await request(app.getHttpServer()).post('/api/v1/pvp/attack').set(auth(tokenA)).expect(201);
    expect(result.body.role).toBe('attacker');
    expect(result.body.outcome).toBe('WIN');
    expect(result.body.opponentUsername).toBe(usernameB);
    // Defaults: metal 500, crystal 100, credits 50 — 10% steal.
    const loot: { resourceType: string; quantity: number }[] = result.body.lootSummary;
    expect(loot.find((l) => l.resourceType === 'METAL')?.quantity).toBe(50);
    expect(loot.find((l) => l.resourceType === 'CRYSTAL')?.quantity).toBe(10);
    expect(loot.find((l) => l.resourceType === 'CREDITS')?.quantity).toBe(5);

    const afterAttacker = await request(app.getHttpServer()).get('/api/v1/player/me').set(auth(tokenA)).expect(200);
    expect(afterAttacker.body.resources.metal).toBe(beforeAttacker.body.resources.metal + 50);
    expect(afterAttacker.body.energy.current).toBe(beforeAttacker.body.energy.current - 1);

    const defenderProfile = await request(app.getHttpServer()).get('/api/v1/player/me').set(auth(tokenB)).expect(200);
    expect(defenderProfile.body.resources.metal).toBe(450);

    randomSpy.mockRestore();
  });

  it('excludes the just-attacked, now-protected defender from the next attack', async () => {
    await request(app.getHttpServer()).post('/api/v1/pvp/attack').set(auth(tokenA)).expect(404);
  });

  it('shows the battle on both the attacker and defender reports, from their own perspective', async () => {
    const attackerReports = await request(app.getHttpServer()).get('/api/v1/pvp/reports').set(auth(tokenA)).expect(200);
    expect(attackerReports.body[0].role).toBe('attacker');
    expect(attackerReports.body[0].opponentUsername).toBe(usernameB);

    const defenderReports = await request(app.getHttpServer()).get('/api/v1/pvp/reports').set(auth(tokenB)).expect(200);
    expect(defenderReports.body[0].role).toBe('defender');
    expect(defenderReports.body[0].opponentUsername).toBe(usernameA);
    expect(defenderReports.body[0].outcome).toBe('WIN'); // still stored as the attacker's outcome
  });
});

async function equipTopTierLoadout(prisma: PrismaService, playerId: string): Promise<void> {
  const keys: { key: string; slot: 'WEAPON' | 'HULL' | 'SHIELD' | 'REACTOR' | 'ENGINE' | 'UTILITY' }[] = [
    { key: 'weapon_railgun', slot: 'WEAPON' },
    { key: 'hull_titan_plating', slot: 'HULL' },
    { key: 'shield_aegis_barrier', slot: 'SHIELD' },
    { key: 'reactor_fusion_core', slot: 'REACTOR' },
    { key: 'engine_ion_drive', slot: 'ENGINE' },
    { key: 'utility_deep_scanner', slot: 'UTILITY' },
  ];
  for (const { key, slot } of keys) {
    const itemDefinition = await prisma.itemDefinition.findUniqueOrThrow({ where: { key } });
    await prisma.itemInstance.create({ data: { playerId, itemDefinitionId: itemDefinition.id, equippedSlot: slot } });
  }
}
