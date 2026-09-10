import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Clan join requirements (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let clanId: string;
  let tokenLeader: string;
  let tokenOfficer: string;
  let tokenMember: string;
  let tokenCandidate: string;
  let playerLeaderId: string;
  let playerOfficerId: string;
  let playerMemberId: string;
  let playerCandidateId: string;
  const suffix = Date.now();
  const password = 'password123';
  const allPlayerIds: string[] = [];

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

    const [regLeader, regOfficer, regMember, regCandidate] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: `jr-leader-${suffix}@example.com`, username: `jrL_${suffix}`, password, race: 'LUXARI' }),
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: `jr-officer-${suffix}@example.com`, username: `jrO_${suffix}`, password, race: 'VORLUN' }),
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: `jr-member-${suffix}@example.com`, username: `jrM_${suffix}`, password, race: 'ZARYTH' }),
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: `jr-candidate-${suffix}@example.com`, username: `jrC_${suffix}`, password, race: 'THALION' }),
    ]);
    tokenLeader = regLeader.body.accessToken;
    tokenOfficer = regOfficer.body.accessToken;
    tokenMember = regMember.body.accessToken;
    tokenCandidate = regCandidate.body.accessToken;
    playerLeaderId = regLeader.body.player.id;
    playerOfficerId = regOfficer.body.player.id;
    playerMemberId = regMember.body.player.id;
    playerCandidateId = regCandidate.body.player.id;
    allPlayerIds.push(playerLeaderId, playerOfficerId, playerMemberId, playerCandidateId);

    const clan = await request(app.getHttpServer())
      .post('/api/v1/clans')
      .set(auth(tokenLeader))
      .send({ name: `ReqClan ${suffix}`, tag: 'JREQ1' })
      .expect(201);
    clanId = clan.body.id;

    await request(app.getHttpServer()).post(`/api/v1/clans/${clanId}/join`).set(auth(tokenOfficer)).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/clans/members/${playerOfficerId}/promote`).set(auth(tokenLeader)).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/clans/${clanId}/join`).set(auth(tokenMember)).expect(201);
  });

  afterAll(async () => {
    await prisma.clanMembership.deleteMany({ where: { playerId: { in: allPlayerIds } } });
    // Guarded: if setup failed before clanId was ever assigned, an unguarded
    // `where: { clanId }` / `where: { id: clanId }` would resolve to an
    // unfiltered deleteMany and wipe that table globally — happened once.
    if (clanId) {
      await prisma.clanBuilding.deleteMany({ where: { clanId } });
      await prisma.clan.deleteMany({ where: { id: clanId } });
    }
    await prisma.itemInstance.deleteMany({ where: { playerId: { in: allPlayerIds } } });
    await prisma.player.deleteMany({ where: { id: { in: allPlayerIds } } });
    await app.close();
  });

  it('starts with no join requirements', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/clans/${clanId}`).set(auth(tokenLeader)).expect(200);
    expect(res.body.joinRequirements).toEqual({
      minLevel: 0,
      minAttributes: { damage: 0, defense: 0, hp: 0, evasion: 0 },
      allowedRaces: [],
    });
  });

  it('rejects a regular member setting join requirements', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/clans/join-requirements')
      .set(auth(tokenMember))
      .send({ minLevel: 3 })
      .expect(403);
  });

  it('lets the leader set level, attribute and race requirements', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/clans/join-requirements')
      .set(auth(tokenLeader))
      .send({ minLevel: 3, minDamage: 5, minDefense: 2, minHp: 10, minEvasion: 1, allowedRaces: ['THALION', 'NEXAR'] })
      .expect(201);
    expect(res.body.joinRequirements).toEqual({
      minLevel: 3,
      minAttributes: { damage: 5, defense: 2, hp: 10, evasion: 1 },
      allowedRaces: ['THALION', 'NEXAR'],
    });
  });

  it('rejects a candidate below the level requirement', async () => {
    // Candidate is level 1 by default; raise their attributes so only level is the blocker.
    await prisma.player.update({ where: { id: playerCandidateId }, data: { baseDamage: 5, baseDefense: 2, baseHp: 10, baseEvasion: 1 } });
    const res = await request(app.getHttpServer()).post(`/api/v1/clans/${clanId}/join`).set(auth(tokenCandidate)).expect(400);
    expect(res.body.message).toBe('JOIN_REQUIREMENTS_NOT_MET');
  });

  it('rejects a candidate outside the allowed races even once level/attributes are met', async () => {
    // Candidate registered as THALION (allowed) — swap the requirement to only NEXAR to test the block.
    await prisma.player.update({ where: { id: playerCandidateId }, data: { level: 5 } });
    await request(app.getHttpServer())
      .post('/api/v1/clans/join-requirements')
      .set(auth(tokenOfficer)) // officers can manage requirements too
      .send({ allowedRaces: ['NEXAR'] })
      .expect(201);

    const res = await request(app.getHttpServer()).post(`/api/v1/clans/${clanId}/join`).set(auth(tokenCandidate)).expect(400);
    expect(res.body.message).toBe('JOIN_REQUIREMENTS_NOT_MET');
  });

  it('lets a candidate who meets every requirement join', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/clans/join-requirements')
      .set(auth(tokenLeader))
      .send({ allowedRaces: ['THALION', 'NEXAR'] })
      .expect(201);

    const joined = await request(app.getHttpServer()).post(`/api/v1/clans/${clanId}/join`).set(auth(tokenCandidate)).expect(201);
    expect(joined.body.memberCount).toBe(4);
  });

  it('clearing requirements (back to defaults) allows anyone again', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/clans/join-requirements')
      .set(auth(tokenLeader))
      .send({ minLevel: 0, minDamage: 0, minDefense: 0, minHp: 0, minEvasion: 0, allowedRaces: [] })
      .expect(201);

    const res = await request(app.getHttpServer()).get(`/api/v1/clans/${clanId}`).set(auth(tokenLeader)).expect(200);
    expect(res.body.joinRequirements.allowedRaces).toEqual([]);
    expect(res.body.joinRequirements.minLevel).toBe(0);
  });
});
