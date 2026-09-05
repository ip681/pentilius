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
