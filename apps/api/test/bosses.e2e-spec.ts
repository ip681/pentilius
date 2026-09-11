import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Boss Formations (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenA: string;
  let tokenB: string;
  let tokenC: string;
  let tokenD: string;
  let playerAId: string;
  let playerBId: string;
  let playerCId: string;
  let playerDId: string;
  const suffix = Date.now();
  const emailA = `boss-a-${suffix}@example.com`;
  const emailB = `boss-b-${suffix}@example.com`;
  const emailC = `boss-c-${suffix}@example.com`;
  const emailD = `boss-d-${suffix}@example.com`;
  const usernameA = `bA_${suffix}`;
  const usernameB = `bB_${suffix}`;
  const usernameC = `bC_${suffix}`;
  const usernameD = `bD_${suffix}`;
  const password = 'password123';
  const bossKey = 'boss_ridgeback_alpha';
  let formationId: string;
  let randomSpy: jest.SpyInstance;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);

    const [regA, regB, regC, regD] = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/auth/register').send({ email: emailA, username: usernameA, password, race: 'LUXARI' }),
      request(app.getHttpServer()).post('/api/v1/auth/register').send({ email: emailB, username: usernameB, password, race: 'VORLUN' }),
      request(app.getHttpServer()).post('/api/v1/auth/register').send({ email: emailC, username: usernameC, password, race: 'ZARYTH' }),
      request(app.getHttpServer()).post('/api/v1/auth/register').send({ email: emailD, username: usernameD, password, race: 'LUXARI' }),
    ]);
    tokenA = regA.body.accessToken;
    tokenB = regB.body.accessToken;
    tokenC = regC.body.accessToken;
    tokenD = regD.body.accessToken;
    playerAId = regA.body.player.id;
    playerBId = regB.body.player.id;
    playerCId = regC.body.player.id;
    playerDId = regD.body.player.id;

    // Boss Formations' minLevel is a flat 10 (GAME_BALANCE.bossFormations.minLevel) — A/B/D clear it, C stays at 1 to test the level gate.
    await prisma.player.updateMany({ where: { id: { in: [playerAId, playerBId, playerDId] } }, data: { level: 10 } });

    // Gear A/B up with top-tier equipment so the formation fight resolves as a clean, deterministic win.
    await equipTopTierLoadout(prisma, playerAId);
    await equipTopTierLoadout(prisma, playerBId);

    // Bosses are shared, persistent seed content — clear any formation left behind by a previous run.
    await cleanupBossFormations(prisma, bossKey);
  });

  afterAll(async () => {
    await cleanupBossFormations(prisma, bossKey);
    await prisma.bossFormationDailyPoints.deleteMany({ where: { playerId: { in: [playerAId, playerBId, playerCId, playerDId] } } });
    await prisma.itemInstance.deleteMany({ where: { playerId: { in: [playerAId, playerBId, playerCId, playerDId] } } });
    await prisma.player.deleteMany({ where: { id: { in: [playerAId, playerBId, playerCId, playerDId] } } });
    await app.close();
  });

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('lists bosses with the unlocked flag and no formations yet', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/boss-formations').set(auth(tokenA)).expect(200);
    expect(res.body.minLevel).toBe(10);
    expect(res.body.nextActionAvailableAt).toBeNull();
    const boss = res.body.bosses.find((b: { key: string }) => b.key === bossKey);
    expect(boss.unlocked).toBe(true);
    expect(boss.formations).toHaveLength(0);

    const bossC = (await request(app.getHttpServer()).get('/api/v1/boss-formations').set(auth(tokenC)).expect(200)).body.bosses.find(
      (b: { key: string }) => b.key === bossKey,
    );
    expect(bossC.unlocked).toBe(false);
  });

  it('rejects creating a formation below the minimum level', async () => {
    await request(app.getHttpServer()).post('/api/v1/boss-formations').set(auth(tokenC)).send({ bossKey }).expect(403);
  });

  it('rejects a clan-only formation from a player with no clan', async () => {
    await request(app.getHttpServer()).post('/api/v1/boss-formations').set(auth(tokenC)).send({ bossKey, visibleToClanOnly: true }).expect(400);
  });

  it('creates a public formation and auto-joins the creator into their own race slot', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/boss-formations').set(auth(tokenA)).send({ bossKey }).expect(201);
    formationId = res.body.id;
    expect(res.body.status).toBe('OPEN');
    expect(res.body.slots).toHaveLength(5);
    const luxariSlot = res.body.slots.find((s: { race: string }) => s.race === 'LUXARI');
    expect(luxariSlot.playerId).toBe(playerAId);
    expect(luxariSlot.isCurrentPlayer).toBe(true);
    const vorlunSlot = res.body.slots.find((s: { race: string }) => s.race === 'VORLUN');
    expect(vorlunSlot.playerId).toBeNull();

    const status = await request(app.getHttpServer()).get('/api/v1/boss-formations').set(auth(tokenA)).expect(200);
    expect(status.body.nextActionAvailableAt).not.toBeNull();
  });

  it('blocks a second formation-related action from the same player within the 24h cooldown', async () => {
    await request(app.getHttpServer()).post('/api/v1/boss-formations').set(auth(tokenA)).send({ bossKey }).expect(400);
  });

  it('lets a different race join the open slot', async () => {
    const res = await request(app.getHttpServer()).post(`/api/v1/boss-formations/${formationId}/join`).set(auth(tokenB)).expect(201);
    const vorlunSlot = res.body.slots.find((s: { race: string }) => s.race === 'VORLUN');
    expect(vorlunSlot.playerId).toBe(playerBId);
  });

  it('rejects a second player of an already-filled race', async () => {
    await request(app.getHttpServer()).post(`/api/v1/boss-formations/${formationId}/join`).set(auth(tokenD)).expect(400);
  });

  it('resolves the formation once its enrollment window expires, granting the guaranteed box and daily points', async () => {
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

    await prisma.bossFormation.update({ where: { id: formationId }, data: { resolvesAt: new Date(Date.now() - 1000) } });

    // D has no cooldown yet — safe to use as a neutral reader that triggers the lazy global sweep.
    await request(app.getHttpServer()).get('/api/v1/boss-formations').set(auth(tokenD)).expect(200);

    const res = await request(app.getHttpServer()).get(`/api/v1/boss-formations/${formationId}`).set(auth(tokenA)).expect(200);
    expect(res.body.status).toBe('RESOLVED');
    expect(res.body.result.outcome).toBe('WIN');
    expect(res.body.result.totalDamageDealt).toBeGreaterThan(0);

    const luxariSlot = res.body.slots.find((s: { race: string }) => s.race === 'LUXARI');
    const vorlunSlot = res.body.slots.find((s: { race: string }) => s.race === 'VORLUN');
    expect(luxariSlot.xpGained).toBeGreaterThan(0);
    expect(vorlunSlot.xpGained).toBe(luxariSlot.xpGained); // equal split, not contribution-weighted
    const zarythSlot = res.body.slots.find((s: { race: string }) => s.race === 'ZARYTH');
    expect(zarythSlot.xpGained).toBeNull(); // never filled

    const boss = await prisma.boss.findUniqueOrThrow({ where: { key: bossKey } });
    const [boxA, boxB] = await Promise.all([
      prisma.itemInstance.findFirst({ where: { playerId: playerAId, itemDefinitionId: boss.guaranteedBoxItemDefinitionId } }),
      prisma.itemInstance.findFirst({ where: { playerId: playerBId, itemDefinitionId: boss.guaranteedBoxItemDefinitionId } }),
    ]);
    expect(boxA).not.toBeNull();
    expect(boxB).not.toBeNull();

    const [pointsA, pointsB] = await Promise.all([
      prisma.bossFormationDailyPoints.findFirst({ where: { playerId: playerAId } }),
      prisma.bossFormationDailyPoints.findFirst({ where: { playerId: playerBId } }),
    ]);
    expect(pointsA?.points).toBe(res.body.result.totalDamageDealt);
    expect(pointsB?.points).toBe(res.body.result.totalDamageDealt); // credited in full to every winner, not divided

    randomSpy.mockRestore();
  });
});

async function equipTopTierLoadout(prisma: PrismaService, playerId: string): Promise<void> {
  const keys: { key: string; slot: 'HEAD' | 'LEFT_ARM' | 'RIGHT_ARM' | 'ARMOR' | 'CORE' | 'LEFT_LEG' | 'RIGHT_LEG' }[] = [
    { key: 'coreforged_head_scanner', slot: 'HEAD' },
    { key: 'coreforged_left_arm_blaster', slot: 'LEFT_ARM' },
    { key: 'coreforged_right_arm_guard', slot: 'RIGHT_ARM' },
    { key: 'coreforged_armor_plating', slot: 'ARMOR' },
    { key: 'coreforged_core_battery', slot: 'CORE' },
    { key: 'coreforged_left_leg_actuator', slot: 'LEFT_LEG' },
    { key: 'coreforged_right_leg_actuator', slot: 'RIGHT_LEG' },
  ];
  for (const { key, slot } of keys) {
    const itemDefinition = await prisma.itemDefinition.findUniqueOrThrow({ where: { key } });
    await prisma.itemInstance.create({ data: { playerId, itemDefinitionId: itemDefinition.id, equippedSlot: slot } });
  }
}

async function cleanupBossFormations(prisma: PrismaService, bossKey: string): Promise<void> {
  const boss = await prisma.boss.findUniqueOrThrow({ where: { key: bossKey } });
  const formations = await prisma.bossFormation.findMany({ where: { bossId: boss.id } });
  await prisma.bossFormationSlot.deleteMany({ where: { formationId: { in: formations.map((f) => f.id) } } });
  await prisma.bossFormation.deleteMany({ where: { bossId: boss.id } });
}
