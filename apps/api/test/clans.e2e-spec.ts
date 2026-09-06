import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Clans (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokenA: string;
  let tokenB: string;
  let tokenC: string;
  let playerAId: string;
  let playerBId: string;
  let playerCId: string;
  let clanId: string;
  const suffix = Date.now();
  const usernameA = `cA_${suffix}`;
  const usernameB = `cB_${suffix}`;
  const usernameC = `cC_${suffix}`;
  const clanName = `Test Alliance ${suffix}`;
  const clanTag = 'TAL';
  const password = 'password123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);

    const [regA, regB, regC] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: `clan-a-${suffix}@example.com`, username: usernameA, password, race: 'LUXARI' }),
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: `clan-b-${suffix}@example.com`, username: usernameB, password, race: 'VORLUN' }),
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: `clan-c-${suffix}@example.com`, username: usernameC, password, race: 'ZARYTH' }),
    ]);
    tokenA = regA.body.accessToken;
    tokenB = regB.body.accessToken;
    tokenC = regC.body.accessToken;
    playerAId = regA.body.player.id;
    playerBId = regB.body.player.id;
    playerCId = regC.body.player.id;
  });

  afterAll(async () => {
    await prisma.clanMembership.deleteMany({ where: { playerId: { in: [playerAId, playerBId, playerCId] } } });
    if (clanId) {
      await prisma.clanBuilding.deleteMany({ where: { clanId } });
      await prisma.clan.deleteMany({ where: { id: clanId } });
    }
    await prisma.itemInstance.deleteMany({ where: { playerId: { in: [playerAId, playerBId, playerCId] } } });
    await prisma.player.deleteMany({ where: { id: { in: [playerAId, playerBId, playerCId] } } });
    await app.close();
  });

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it('has no clan before creating or joining one', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/clans/me').set(auth(tokenA)).expect(200);
    expect(res.body.clan).toBeNull();
  });

  it('creates a clan, becoming its leader', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/clans')
      .set(auth(tokenA))
      .send({ name: clanName, tag: clanTag, description: 'A test clan' })
      .expect(201);
    expect(res.body.myRole).toBe('LEADER');
    expect(res.body.memberCount).toBe(1);
    expect(res.body.leaderUsername).toBe(usernameA);
    clanId = res.body.id;
  });

  it('rejects creating a second clan while already in one', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/clans')
      .set(auth(tokenA))
      .send({ name: `Other ${suffix}`, tag: 'OTH1' })
      .expect(400);
  });

  it('rejects a duplicate clan name', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/clans')
      .set(auth(tokenB))
      .send({ name: clanName, tag: 'OTH2' })
      .expect(400);
  });

  it('rejects donating from a player not in a clan', async () => {
    await request(app.getHttpServer()).post('/api/v1/clans/donate').set(auth(tokenB)).send({ metal: 10 }).expect(400);
  });

  it('lists the clan for browsing', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/clans').set(auth(tokenB)).expect(200);
    expect(res.body.find((c: { id: string }) => c.id === clanId)).toBeDefined();
  });

  it('lets other players join freely', async () => {
    const joinedB = await request(app.getHttpServer()).post(`/api/v1/clans/${clanId}/join`).set(auth(tokenB)).expect(201);
    expect(joinedB.body.memberCount).toBe(2);

    const joinedC = await request(app.getHttpServer()).post(`/api/v1/clans/${clanId}/join`).set(auth(tokenC)).expect(201);
    expect(joinedC.body.memberCount).toBe(3);
  });

  it('rejects a member trying to kick another member', async () => {
    await request(app.getHttpServer()).post(`/api/v1/clans/members/${playerCId}/kick`).set(auth(tokenB)).expect(403);
  });

  it('rejects donating with no positive amount', async () => {
    await request(app.getHttpServer()).post('/api/v1/clans/donate').set(auth(tokenB)).send({}).expect(400);
  });

  it('rejects donating more than the player has', async () => {
    await request(app.getHttpServer()).post('/api/v1/clans/donate').set(auth(tokenB)).send({ metal: 999999 }).expect(400);
  });

  it('lets a member donate to the clan treasury, tracking their contribution', async () => {
    const before = await request(app.getHttpServer()).get('/api/v1/player/me').set(auth(tokenB)).expect(200);

    const donated = await request(app.getHttpServer())
      .post('/api/v1/clans/donate')
      .set(auth(tokenB))
      .send({ metal: 50, crystal: 10 })
      .expect(201);
    expect(donated.body.treasury).toEqual({ metal: 50, crystal: 10, credits: 0 });
    expect(donated.body.members.find((m: { playerId: string }) => m.playerId === playerBId).contributed).toEqual({
      metal: 50,
      crystal: 10,
      credits: 0,
    });

    const after = await request(app.getHttpServer()).get('/api/v1/player/me').set(auth(tokenB)).expect(200);
    expect(after.body.resources.metal).toBe(before.body.resources.metal - 50);
    expect(after.body.resources.crystal).toBe(before.body.resources.crystal - 10);
  });

  it('lists the three clan buildings at level 0 with their next-level cost', async () => {
    const detail = await request(app.getHttpServer()).get('/api/v1/clans/me').set(auth(tokenA)).expect(200);
    const buildings = detail.body.clan.buildings;
    expect(buildings).toHaveLength(3);
    const memberHall = buildings.find((b: { key: string }) => b.key === 'member_hall');
    expect(memberHall.level).toBe(0);
    expect(memberHall.bonusType).toBe('MEMBER_CAPACITY');
    expect(memberHall.nextLevelCost).toEqual({ metalCost: 500, crystalCost: 200, creditsCost: 100, constructionSeconds: 300 });
  });

  it('rejects a member trying to upgrade a clan building', async () => {
    await request(app.getHttpServer()).post('/api/v1/clans/buildings/member_hall/upgrade').set(auth(tokenB)).expect(403);
  });

  it('rejects upgrading when the treasury cannot afford it', async () => {
    // Treasury only has 50 metal / 10 crystal so far — level 1 needs 500/200/100.
    await request(app.getHttpServer()).post('/api/v1/clans/buildings/member_hall/upgrade').set(auth(tokenA)).expect(400);
  });

  it('lets the leader upgrade a clan building once funded, raising the effective member cap on completion', async () => {
    // A single player's starting resources (500/100/50) can't cover a level-1
    // building alone (500/200/100) — top up before donating, like a second
    // contributing member would in practice.
    await prisma.player.update({ where: { id: playerAId }, data: { metal: 5000, crystal: 5000, credits: 5000 } });

    await request(app.getHttpServer())
      .post('/api/v1/clans/donate')
      .set(auth(tokenA))
      .send({ metal: 500, crystal: 200, credits: 100 })
      .expect(201);

    const started = await request(app.getHttpServer()).post('/api/v1/clans/buildings/member_hall/upgrade').set(auth(tokenA)).expect(201);
    const startedHall = started.body.buildings.find((b: { key: string }) => b.key === 'member_hall');
    expect(startedHall.constructionEndsAt).not.toBeNull();
    // Treasury had 50/10/0, plus the 500/200/100 just donated, minus the 500/200/100 level-1 cost.
    expect(started.body.treasury).toEqual({ metal: 50, crystal: 10, credits: 0 });
    expect(started.body.memberCap).toBe(30); // bonus only applies once the level actually increases

    await request(app.getHttpServer()).post('/api/v1/clans/buildings/member_hall/upgrade').set(auth(tokenA)).expect(400);

    await prisma.clanBuilding.updateMany({
      where: { clanId, clanBuildingType: { key: 'member_hall' } },
      data: { constructionEndsAt: new Date(Date.now() - 1000) },
    });

    const finished = await request(app.getHttpServer()).get('/api/v1/clans/me').set(auth(tokenA)).expect(200);
    const finishedHall = finished.body.clan.buildings.find((b: { key: string }) => b.key === 'member_hall');
    expect(finishedHall.level).toBe(1);
    expect(finishedHall.constructionEndsAt).toBeNull();
    expect(finished.body.clan.memberCap).toBe(35); // base 30 + level 1 * bonusPerLevel 5
  });

  it('rejects a non-leader editing the clan', async () => {
    await request(app.getHttpServer()).post('/api/v1/clans/update').set(auth(tokenB)).send({ description: 'hijacked' }).expect(403);
  });

  it('lets the leader rename the clan and change its description', async () => {
    const renamedTo = `Renamed ${suffix}`;
    const updated = await request(app.getHttpServer())
      .post('/api/v1/clans/update')
      .set(auth(tokenA))
      .send({ name: renamedTo, description: 'Now under new management.' })
      .expect(201);
    expect(updated.body.name).toBe(renamedTo);
    expect(updated.body.description).toBe('Now under new management.');

    const list = await request(app.getHttpServer()).get('/api/v1/clans').set(auth(tokenB)).expect(200);
    expect(list.body.find((c: { id: string }) => c.id === clanId).name).toBe(renamedTo);
  });

  it('rejects renaming to a name already taken by another clan', async () => {
    // A dedicated throwaway player: A/B/C are already clan members by this point in the suite.
    const regD = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `clan-d-${suffix}@example.com`, username: `cD_${suffix}`, password, race: 'NEXAR' });
    const tokenD = regD.body.accessToken;
    const playerDId = regD.body.player.id;

    const other = await request(app.getHttpServer())
      .post('/api/v1/clans')
      .set(auth(tokenD))
      .send({ name: `Someone Else ${suffix}`, tag: 'OTHR' })
      .expect(201);

    await request(app.getHttpServer()).post('/api/v1/clans/update').set(auth(tokenA)).send({ name: `Someone Else ${suffix}` }).expect(400);

    await prisma.clanMembership.deleteMany({ where: { playerId: playerDId } });
    await prisma.clanBuilding.deleteMany({ where: { clanId: other.body.id } });
    await prisma.clan.deleteMany({ where: { id: other.body.id } });
    await prisma.itemInstance.deleteMany({ where: { playerId: playerDId } });
    await prisma.player.deleteMany({ where: { id: playerDId } });
  });

  it('promotes a member to officer, who can then kick regular members', async () => {
    await request(app.getHttpServer()).post(`/api/v1/clans/members/${playerBId}/promote`).set(auth(tokenA)).expect(201);

    const detail = await request(app.getHttpServer()).get('/api/v1/clans/me').set(auth(tokenA)).expect(200);
    expect(detail.body.clan.members.find((m: { playerId: string }) => m.playerId === playerBId).role).toBe('OFFICER');

    await request(app.getHttpServer()).post(`/api/v1/clans/members/${playerCId}/kick`).set(auth(tokenB)).expect(201);

    const afterKick = await request(app.getHttpServer()).get('/api/v1/clans/me').set(auth(tokenC)).expect(200);
    expect(afterKick.body.clan).toBeNull();
  });

  it('rejects an officer kicking the leader or another officer', async () => {
    await request(app.getHttpServer()).post(`/api/v1/clans/members/${playerAId}/kick`).set(auth(tokenB)).expect(403);

    // Rejoin and promote playerC to officer, then verify officers can't kick each other.
    await request(app.getHttpServer()).post(`/api/v1/clans/${clanId}/join`).set(auth(tokenC)).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/clans/members/${playerCId}/promote`).set(auth(tokenA)).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/clans/members/${playerCId}/kick`).set(auth(tokenB)).expect(403);
  });

  it('transfers leadership, demoting the old leader to officer', async () => {
    await request(app.getHttpServer()).post(`/api/v1/clans/members/${playerCId}/transfer-leadership`).set(auth(tokenA)).expect(201);

    const detail = await request(app.getHttpServer()).get('/api/v1/clans/me').set(auth(tokenA)).expect(200);
    expect(detail.body.clan.leaderUsername).toBe(usernameC);
    expect(detail.body.clan.members.find((m: { playerId: string }) => m.playerId === playerAId).role).toBe('OFFICER');

    // The old leader is no longer the leader, so disbanding is now forbidden for them.
    await request(app.getHttpServer()).post('/api/v1/clans/disband').set(auth(tokenA)).expect(403);
  });

  it('hands leadership to the longest-tenured officer when the leader leaves, and disbands when the last member leaves', async () => {
    // playerC (leader) leaves; playerA joined the clan before playerB, so playerA succeeds.
    await request(app.getHttpServer()).post('/api/v1/clans/leave').set(auth(tokenC)).expect(201);
    const detail = await request(app.getHttpServer()).get('/api/v1/clans/me').set(auth(tokenA)).expect(200);
    expect(detail.body.clan.leaderUsername).toBe(usernameA);
    expect(detail.body.clan.memberCount).toBe(2);

    await request(app.getHttpServer()).post('/api/v1/clans/leave').set(auth(tokenA)).expect(201);
    const soleMember = await request(app.getHttpServer()).get('/api/v1/clans/me').set(auth(tokenB)).expect(200);
    expect(soleMember.body.clan.leaderUsername).toBe(usernameB);

    await request(app.getHttpServer()).post('/api/v1/clans/leave').set(auth(tokenB)).expect(201);
    const list = await request(app.getHttpServer()).get('/api/v1/clans').set(auth(tokenB)).expect(200);
    expect(list.body.find((c: { id: string }) => c.id === clanId)).toBeUndefined();
    clanId = '';
  });
});
