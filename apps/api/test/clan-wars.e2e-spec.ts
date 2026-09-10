import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Clan wars (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let clanAId: string;
  let clanBId: string;
  let clanTinyId: string;
  const suffix = Date.now();
  const password = 'password123';

  // 5 players per clan (the minimum to participate), plus 2 for a too-small clan.
  const clanAPlayers: { token: string; id: string; username: string }[] = [];
  const clanBPlayers: { token: string; id: string; username: string }[] = [];
  const tinyPlayers: { token: string; id: string; username: string }[] = [];
  const allPlayerIds: string[] = [];

  async function registerBatch(prefix: string, count: number) {
    const races = ['LUXARI', 'VORLUN', 'ZARYTH', 'THALION', 'NEXAR'];
    const results = await Promise.all(
      Array.from({ length: count }, (_, i) => {
        const username = `${prefix}${i}_${suffix}`;
        return request(app.getHttpServer())
          .post('/api/v1/auth/register')
          .send({ email: `${prefix}${i}-${suffix}@example.com`, username, password, race: races[i % races.length] });
      }),
    );
    return results.map((res) => ({ token: res.body.accessToken as string, id: res.body.player.id as string, username: res.body.player.username as string }));
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);

    clanAPlayers.push(...(await registerBatch('cwA', 5)));
    clanBPlayers.push(...(await registerBatch('cwB', 5)));
    tinyPlayers.push(...(await registerBatch('cwT', 2)));
    allPlayerIds.push(...clanAPlayers.map((p) => p.id), ...clanBPlayers.map((p) => p.id), ...tinyPlayers.map((p) => p.id));

    const clanA = await request(app.getHttpServer())
      .post('/api/v1/clans')
      .set(auth(clanAPlayers[0].token))
      .send({ name: `War Clan A ${suffix}`, tag: 'CWA1' })
      .expect(201);
    clanAId = clanA.body.id;
    for (const p of clanAPlayers.slice(1)) {
      await request(app.getHttpServer()).post(`/api/v1/clans/${clanAId}/join`).set(auth(p.token)).expect(201);
    }

    const clanB = await request(app.getHttpServer())
      .post('/api/v1/clans')
      .set(auth(clanBPlayers[0].token))
      .send({ name: `War Clan B ${suffix}`, tag: 'CWB1' })
      .expect(201);
    clanBId = clanB.body.id;
    for (const p of clanBPlayers.slice(1)) {
      await request(app.getHttpServer()).post(`/api/v1/clans/${clanBId}/join`).set(auth(p.token)).expect(201);
    }

    const tiny = await request(app.getHttpServer())
      .post('/api/v1/clans')
      .set(auth(tinyPlayers[0].token))
      .send({ name: `Tiny Clan ${suffix}`, tag: 'TINY1' })
      .expect(201);
    clanTinyId = tiny.body.id;
    await request(app.getHttpServer()).post(`/api/v1/clans/${clanTinyId}/join`).set(auth(tinyPlayers[1].token)).expect(201);
  });

  afterAll(async () => {
    await prisma.clanWarAttack.deleteMany({ where: { OR: [{ attackerId: { in: allPlayerIds } }, { defenderId: { in: allPlayerIds } }] } });
    await prisma.clanWar.deleteMany({ where: { OR: [{ attackerClanId: { in: [clanAId, clanBId, clanTinyId] } }, { defenderClanId: { in: [clanAId, clanBId, clanTinyId] } }] } });
    await prisma.clanMembership.deleteMany({ where: { playerId: { in: allPlayerIds } } });
    await prisma.clanBuilding.deleteMany({ where: { clanId: { in: [clanAId, clanBId, clanTinyId] } } });
    await prisma.clan.deleteMany({ where: { id: { in: [clanAId, clanBId, clanTinyId] } } });
    await prisma.itemInstance.deleteMany({ where: { playerId: { in: allPlayerIds } } });
    await prisma.player.deleteMany({ where: { id: { in: allPlayerIds } } });
    await app.close();
  });

  it('rejects a regular member declaring war', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/clan-wars/declare')
      .set(auth(clanAPlayers[1].token))
      .send({ targetClanId: clanBId })
      .expect(403);
  });

  it('rejects declaring war on a clan below the minimum member count', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/clan-wars/declare')
      .set(auth(clanAPlayers[0].token))
      .send({ targetClanId: clanTinyId })
      .expect(400);
  });

  it('reports no active war before one is declared', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/clan-wars/status').set(auth(clanAPlayers[0].token)).expect(200);
    expect(res.body.war).toBeNull();
  });

  it('lets the leader declare war, putting both clans in a mutual "at war" state', async () => {
    const declared = await request(app.getHttpServer())
      .post('/api/v1/clan-wars/declare')
      .set(auth(clanAPlayers[0].token))
      .send({ targetClanId: clanBId })
      .expect(201);
    expect(declared.body.role).toBe('attacker');
    expect(declared.body.myClanId).toBe(clanAId);
    expect(declared.body.enemyClanId).toBe(clanBId);
    expect(declared.body.status).toBe('ACTIVE');
    expect(declared.body.myPoolMax).toBeGreaterThan(0);
    expect(declared.body.myPoolMax).toBe(declared.body.myPoolRemaining);

    const defenderStatus = await request(app.getHttpServer()).get('/api/v1/clan-wars/status').set(auth(clanBPlayers[0].token)).expect(200);
    expect(defenderStatus.body.war.role).toBe('defender');
    expect(defenderStatus.body.war.myClanId).toBe(clanBId);
    expect(defenderStatus.body.war.enemyClanId).toBe(clanAId);
  });

  it('rejects declaring a second war while one is already active', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/clan-wars/declare')
      .set(auth(clanAPlayers[0].token))
      .send({ targetClanId: clanTinyId })
      .expect(400);
  });

  it('lists the current enemy roster as attack targets, including real combat stats', async () => {
    const targets = await request(app.getHttpServer()).get('/api/v1/clan-wars/targets').set(auth(clanAPlayers[0].token)).expect(200);
    expect(targets.body).toHaveLength(5);
    expect(targets.body.map((t: { playerId: string }) => t.playerId).sort()).toEqual(clanBPlayers.map((p) => p.id).sort());
    expect(targets.body.every((t: { attackableAt: string | null }) => t.attackableAt === null)).toBe(true);
    for (const target of targets.body) {
      expect(typeof target.stats.attack).toBe('number');
      expect(typeof target.stats.defense).toBe('number');
      expect(typeof target.stats.hp).toBe('number');
      expect(typeof target.stats.evasion).toBe('number');
    }
  });

  it('attacks an enemy member, draining their clan pool by the raw damage dealt and protecting the target', async () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

    const before = await request(app.getHttpServer()).get('/api/v1/clan-wars/status').set(auth(clanAPlayers[0].token)).expect(200);

    const attack = await request(app.getHttpServer())
      .post('/api/v1/clan-wars/attack')
      .set(auth(clanAPlayers[0].token))
      .send({ defenderId: clanBPlayers[0].id })
      .expect(201);

    randomSpy.mockRestore();

    expect(attack.body.opponentId).toBe(clanBPlayers[0].id);
    expect(attack.body.damageDealt).toBeGreaterThan(0);

    const after = await request(app.getHttpServer()).get('/api/v1/clan-wars/status').set(auth(clanAPlayers[0].token)).expect(200);
    expect(after.body.war.enemyPoolRemaining).toBe(before.body.war.enemyPoolRemaining - attack.body.damageDealt);
    expect(after.body.war.myPoolRemaining).toBe(before.body.war.myPoolRemaining);

    const targets = await request(app.getHttpServer()).get('/api/v1/clan-wars/targets').set(auth(clanAPlayers[0].token)).expect(200);
    const hitTarget = targets.body.find((t: { playerId: string }) => t.playerId === clanBPlayers[0].id);
    expect(hitTarget.attackableAt).not.toBeNull();
  });

  it("shows the attack in both clans' contribution leaderboards for the active war", async () => {
    const status = await request(app.getHttpServer()).get('/api/v1/clan-wars/status').set(auth(clanAPlayers[0].token)).expect(200);
    const warId: string = status.body.war.id;

    const mineView = await request(app.getHttpServer()).get(`/api/v1/clan-wars/${warId}/contributions`).set(auth(clanAPlayers[0].token)).expect(200);
    const attackerEntry = mineView.body.mine.find((e: { playerId: string }) => e.playerId === clanAPlayers[0].id);
    expect(attackerEntry).toBeDefined();
    expect(attackerEntry.attackCount).toBe(1);
    expect(attackerEntry.totalDamageDealt).toBeGreaterThan(0);
    expect(mineView.body.enemy).toEqual([]); // clan B hasn't attacked back yet

    // Same war, viewed from clan B's side — attacker now shows up under "enemy".
    const enemyView = await request(app.getHttpServer()).get(`/api/v1/clan-wars/${warId}/contributions`).set(auth(clanBPlayers[0].token)).expect(200);
    expect(enemyView.body.mine).toEqual([]);
    expect(enemyView.body.enemy.find((e: { playerId: string }) => e.playerId === clanAPlayers[0].id)).toBeDefined();
  });

  it('rejects the same attacker re-hitting the same target during the cooldown', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/clan-wars/attack')
      .set(auth(clanAPlayers[0].token))
      .send({ defenderId: clanBPlayers[0].id })
      .expect(400);
    expect(res.body.message).toBe('ATTACK_COOLDOWN');
  });

  it('rejects a different attacker hitting a target still protected from the earlier attack', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/clan-wars/attack')
      .set(auth(clanAPlayers[1].token))
      .send({ defenderId: clanBPlayers[0].id })
      .expect(400);
    expect(res.body.message).toBe('TARGET_PROTECTED');
  });

  it('rejects attacking someone outside the enemy clan', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/clan-wars/attack')
      .set(auth(clanAPlayers[0].token))
      .send({ defenderId: clanAPlayers[1].id })
      .expect(404);
  });

  it('resolves the war as a CONQUEST the moment a pool is driven to 0, transferring 15% of the treasury and closing it to further attacks', async () => {
    const status = await request(app.getHttpServer()).get('/api/v1/clan-wars/status').set(auth(clanAPlayers[0].token)).expect(200);
    const warId: string = status.body.war.id;

    // Force the defending clan (B) down to a trivial pool so any hit finishes it off,
    // and give both clans known treasuries to verify the 15% CONQUEST transfer precisely.
    await prisma.clanWar.update({ where: { id: warId }, data: { defenderPoolRemaining: 1 } });
    await prisma.clan.update({ where: { id: clanAId }, data: { treasuryMetal: 0, treasuryCrystal: 0, treasuryCredits: 0 } });
    await prisma.clan.update({ where: { id: clanBId }, data: { treasuryMetal: 1000, treasuryCrystal: 200, treasuryCredits: 40 } });

    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
    const finishing = await request(app.getHttpServer())
      .post('/api/v1/clan-wars/attack')
      .set(auth(clanAPlayers[2].token))
      .send({ defenderId: clanBPlayers[1].id })
      .expect(201);
    randomSpy.mockRestore();
    expect(finishing.body.damageDealt).toBeGreaterThan(0);

    const attackerAfter = await request(app.getHttpServer()).get('/api/v1/clan-wars/status').set(auth(clanAPlayers[0].token)).expect(200);
    expect(attackerAfter.body.war).toBeNull(); // no longer active — war just resolved

    const resolved = await prisma.clanWar.findUniqueOrThrow({ where: { id: warId } });
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.outcome).toBe('CONQUEST');
    expect(resolved.winnerClanId).toBe(clanAId);
    // 15% of clan B's 1000/200/40 treasury.
    expect(resolved.treasuryMetalTransferred).toBe(150);
    expect(resolved.treasuryCrystalTransferred).toBe(30);
    expect(resolved.treasuryCreditsTransferred).toBe(6);

    const [winnerClan, loserClan] = await Promise.all([
      prisma.clan.findUniqueOrThrow({ where: { id: clanAId } }),
      prisma.clan.findUniqueOrThrow({ where: { id: clanBId } }),
    ]);
    expect(winnerClan.treasuryMetal).toBe(150);
    expect(winnerClan.treasuryCrystal).toBe(30);
    expect(winnerClan.treasuryCredits).toBe(6);
    expect(loserClan.treasuryMetal).toBe(850);
    expect(loserClan.treasuryCrystal).toBe(170);
    expect(loserClan.treasuryCredits).toBe(34);

    await request(app.getHttpServer())
      .post('/api/v1/clan-wars/attack')
      .set(auth(clanAPlayers[0].token))
      .send({ defenderId: clanBPlayers[2].id })
      .expect(404);
  });

  it("records the resolved war in both clans' history, signed from each clan's own perspective", async () => {
    const winnerHistory = await request(app.getHttpServer()).get('/api/v1/clan-wars/history').set(auth(clanAPlayers[0].token)).expect(200);
    expect(winnerHistory.body).toHaveLength(1);
    expect(winnerHistory.body[0].role).toBe('attacker');
    expect(winnerHistory.body[0].opponentClanId).toBe(clanBId);
    expect(winnerHistory.body[0].outcome).toBe('CONQUEST');
    expect(winnerHistory.body[0].won).toBe(true);
    expect(winnerHistory.body[0].treasuryMetalChange).toBe(150);
    expect(winnerHistory.body[0].treasuryCrystalChange).toBe(30);
    expect(winnerHistory.body[0].treasuryCreditsChange).toBe(6);

    const loserHistory = await request(app.getHttpServer()).get('/api/v1/clan-wars/history').set(auth(clanBPlayers[0].token)).expect(200);
    expect(loserHistory.body).toHaveLength(1);
    expect(loserHistory.body[0].role).toBe('defender');
    expect(loserHistory.body[0].opponentClanId).toBe(clanAId);
    expect(loserHistory.body[0].outcome).toBe('CONQUEST');
    expect(loserHistory.body[0].won).toBe(false);
    expect(loserHistory.body[0].treasuryMetalChange).toBe(-150);
    expect(loserHistory.body[0].treasuryCrystalChange).toBe(-30);
    expect(loserHistory.body[0].treasuryCreditsChange).toBe(-6);
  });

  it('rejects an immediate rematch between the same two clans during the cooldown window', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/clan-wars/declare')
      .set(auth(clanAPlayers[0].token))
      .send({ targetClanId: clanBId })
      .expect(400);
  });
});
