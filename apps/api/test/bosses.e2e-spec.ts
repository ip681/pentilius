import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Boss Hunts (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenA: string;
  let tokenB: string;
  let tokenC: string;
  let playerAId: string;
  let playerBId: string;
  let playerCId: string;
  const suffix = Date.now();
  const emailA = `boss-a-${suffix}@example.com`;
  const emailB = `boss-b-${suffix}@example.com`;
  const emailC = `boss-c-${suffix}@example.com`;
  const usernameA = `bA_${suffix}`;
  const usernameB = `bB_${suffix}`;
  const usernameC = `bC_${suffix}`;
  const password = 'password123';
  const bossKey = 'boss_ridgeback_alpha';
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

    // zone_ashen_ridge unlocks at level 3; playerC stays at level 1 to test the locked-zone rejection.
    await prisma.player.updateMany({ where: { id: { in: [playerAId, playerBId] } }, data: { level: 5 } });

    // Gear playerA/B up with top-tier equipment so the fight against the
    // boss's full stats resolves as a clean, deterministic win.
    await equipTopTierLoadout(prisma, playerAId);
    await equipTopTierLoadout(prisma, playerBId);

    // Bosses are shared, persistent seed content (not per-test fixtures), so
    // clear out any encounter left behind by a previous run or by manual
    // testing against this dev database — this suite assumes a clean slate.
    const boss = await prisma.boss.findUniqueOrThrow({ where: { key: bossKey } });
    const staleEncounters = await prisma.bossEncounter.findMany({ where: { bossId: boss.id } });
    await prisma.bossEncounterParticipant.deleteMany({ where: { encounterId: { in: staleEncounters.map((e) => e.id) } } });
    await prisma.bossEncounter.deleteMany({ where: { bossId: boss.id } });
  });

  afterAll(async () => {
    const boss = await prisma.boss.findUniqueOrThrow({ where: { key: bossKey } });
    const encounters = await prisma.bossEncounter.findMany({ where: { bossId: boss.id } });
    await prisma.bossEncounterParticipant.deleteMany({ where: { encounterId: { in: encounters.map((e) => e.id) } } });
    await prisma.bossEncounter.deleteMany({ where: { bossId: boss.id } });
    await prisma.itemInstance.deleteMany({ where: { playerId: { in: [playerAId, playerBId, playerCId] } } });
    await prisma.player.deleteMany({ where: { id: { in: [playerAId, playerBId, playerCId] } } });
    await app.close();
  });

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('rejects joining a boss in a zone the player has not unlocked', async () => {
    await request(app.getHttpServer()).post(`/api/v1/bosses/${bossKey}/join`).set(auth(tokenC)).expect(403);
  });

  it('lists bosses with the unlocked flag and an open encounter with no participants yet', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/bosses').set(auth(tokenA)).expect(200);
    const boss = res.body.find((b: { key: string }) => b.key === bossKey);
    expect(boss.unlocked).toBe(true);
    expect(boss.encounter.status).toBe('OPEN');
    expect(boss.encounter.participants).toHaveLength(0);
  });

  it('joins the open encounter and deducts one Action Energy', async () => {
    const before = await request(app.getHttpServer()).get('/api/v1/player/me').set(auth(tokenA)).expect(200);

    const joined = await request(app.getHttpServer()).post(`/api/v1/bosses/${bossKey}/join`).set(auth(tokenA)).expect(201);
    expect(joined.body.encounter.participants).toHaveLength(1);
    expect(joined.body.encounter.participants[0].isCurrentPlayer).toBe(true);

    const after = await request(app.getHttpServer()).get('/api/v1/player/me').set(auth(tokenA)).expect(200);
    expect(after.body.energy.current).toBe(before.body.energy.current - 1);
  });

  it('blocks joining the same encounter twice', async () => {
    await request(app.getHttpServer()).post(`/api/v1/bosses/${bossKey}/join`).set(auth(tokenA)).expect(400);
  });

  it('allows a second player of a different race to join the same open encounter', async () => {
    const joined = await request(app.getHttpServer()).post(`/api/v1/bosses/${bossKey}/join`).set(auth(tokenB)).expect(201);
    expect(joined.body.encounter.participants).toHaveLength(2);
  });

  it('rejects manual resolve from a player who never joined', async () => {
    await request(app.getHttpServer()).post(`/api/v1/bosses/${bossKey}/resolve`).set(auth(tokenC)).expect(403);
  });

  it('resolves the encounter, applying racial synergy and splitting rewards by attack contribution', async () => {
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

    const resolved = await request(app.getHttpServer()).post(`/api/v1/bosses/${bossKey}/resolve`).set(auth(tokenA)).expect(201);
    expect(resolved.body.outcome).toBe('WIN');
    expect(resolved.body.synergyBonusPercent).toBeCloseTo(0.05); // 2 unique races
    expect(resolved.body.participants).toHaveLength(2);

    const shareSum = resolved.body.participants.reduce((sum: number, p: { contributionShare: number }) => sum + p.contributionShare, 0);
    expect(shareSum).toBeCloseTo(1);
    for (const participant of resolved.body.participants) {
      expect(participant.xpGained).toBeGreaterThan(0);
    }

    randomSpy.mockRestore();
  });

  it('reflects the resolved result on the next read without creating a new encounter', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/bosses').set(auth(tokenA)).expect(200);
    const boss = res.body.find((b: { key: string }) => b.key === bossKey);
    expect(boss.encounter.status).toBe('RESOLVED');
    expect(boss.encounter.result.outcome).toBe('WIN');
    expect(boss.encounter.result.participants).toHaveLength(2);
  });

  it('opens a fresh encounter once a player joins again after a resolved one', async () => {
    const joined = await request(app.getHttpServer()).post(`/api/v1/bosses/${bossKey}/join`).set(auth(tokenA)).expect(201);
    expect(joined.body.encounter.status).toBe('OPEN');
    expect(joined.body.encounter.participants).toHaveLength(1);
  });

  it('auto-finalizes an empty encounter once its join window expires, with a null outcome', async () => {
    const boss = await prisma.boss.findUniqueOrThrow({ where: { key: bossKey } });
    const emptyEncounter = await prisma.bossEncounter.create({
      data: { bossId: boss.id, resolvesAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app.getHttpServer()).get('/api/v1/bosses').set(auth(tokenA)).expect(200);
    const bossDto = res.body.find((b: { key: string }) => b.key === bossKey);
    expect(bossDto.encounter.id).toBe(emptyEncounter.id);
    expect(bossDto.encounter.status).toBe('RESOLVED');
    expect(bossDto.encounter.result.outcome).toBeNull();
    expect(bossDto.encounter.result.participants).toHaveLength(0);
  });
});

async function equipTopTierLoadout(prisma: PrismaService, playerId: string): Promise<void> {
  const keys: { key: string; slot: 'HEAD' | 'LEFT_ARM' | 'RIGHT_ARM' | 'ARMOR' | 'CORE' | 'LEFT_LEG' | 'RIGHT_LEG' }[] = [
    { key: 'head_targeting_array', slot: 'HEAD' },
    { key: 'left_arm_pulse_cannon', slot: 'LEFT_ARM' },
    { key: 'right_arm_railgun', slot: 'RIGHT_ARM' },
    { key: 'armor_titan_plating', slot: 'ARMOR' },
    { key: 'core_fusion_battery', slot: 'CORE' },
    { key: 'left_leg_servo_drive', slot: 'LEFT_LEG' },
    { key: 'right_leg_servo_drive', slot: 'RIGHT_LEG' },
  ];
  for (const { key, slot } of keys) {
    const itemDefinition = await prisma.itemDefinition.findUniqueOrThrow({ where: { key } });
    await prisma.itemInstance.create({ data: { playerId, itemDefinitionId: itemDefinition.id, equippedSlot: slot } });
  }
}
