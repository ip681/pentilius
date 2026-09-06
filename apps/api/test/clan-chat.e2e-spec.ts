import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Clan chat (e2e)', () => {
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
  const usernameA = `chatA_${suffix}`;
  const usernameB = `chatB_${suffix}`;
  const usernameC = `chatC_${suffix}`;
  const clanName = `Chat Test Clan ${suffix}`;
  const clanTag = 'CHT';
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
        .send({ email: `chat-a-${suffix}@example.com`, username: usernameA, password, race: 'LUXARI' }),
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: `chat-b-${suffix}@example.com`, username: usernameB, password, race: 'VORLUN' }),
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: `chat-c-${suffix}@example.com`, username: usernameC, password, race: 'ZARYTH' }),
    ]);
    tokenA = regA.body.accessToken;
    tokenB = regB.body.accessToken;
    tokenC = regC.body.accessToken;
    playerAId = regA.body.player.id;
    playerBId = regB.body.player.id;
    playerCId = regC.body.player.id;

    const created = await request(app.getHttpServer())
      .post('/api/v1/clans')
      .set(auth(tokenA))
      .send({ name: clanName, tag: clanTag });
    clanId = created.body.id;
    await request(app.getHttpServer()).post(`/api/v1/clans/${clanId}/join`).set(auth(tokenB));
    // playerC deliberately stays clanless to exercise the non-member rejection.
  });

  afterAll(async () => {
    await prisma.clanMessage.deleteMany({ where: { clanId } });
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

  it('rejects a non-member from reading or sending messages', async () => {
    await request(app.getHttpServer()).get(`/api/v1/clans/${clanId}/messages`).set(auth(tokenC)).expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/clans/${clanId}/messages`)
      .set(auth(tokenC))
      .send({ text: 'sneaking in' })
      .expect(403);
  });

  it('lets a member send a message and read it back', async () => {
    const sent = await request(app.getHttpServer())
      .post(`/api/v1/clans/${clanId}/messages`)
      .set(auth(tokenA))
      .send({ text: 'hello clan' })
      .expect(201);
    expect(sent.body.username).toBe(usernameA);
    expect(sent.body.text).toBe('hello clan');

    const messages = await request(app.getHttpServer()).get(`/api/v1/clans/${clanId}/messages`).set(auth(tokenA)).expect(200);
    expect(messages.body).toHaveLength(1);
    expect(messages.body[0].text).toBe('hello clan');
  });

  it('rejects a second message from the same player sent too quickly', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/clans/${clanId}/messages`)
      .set(auth(tokenA))
      .send({ text: 'too fast' })
      .expect(400);
  }, 10_000);

  it('returns messages from multiple members in chronological order after the rate limit window passes', async () => {
    await new Promise((resolve) => setTimeout(resolve, 2100));
    await request(app.getHttpServer()).post(`/api/v1/clans/${clanId}/messages`).set(auth(tokenB)).send({ text: 'hi from B' }).expect(201);

    const messages = await request(app.getHttpServer()).get(`/api/v1/clans/${clanId}/messages`).set(auth(tokenB)).expect(200);
    expect(messages.body).toHaveLength(2);
    expect(messages.body[0].text).toBe('hello clan');
    expect(messages.body[1].text).toBe('hi from B');
    expect(new Date(messages.body[0].createdAt).getTime()).toBeLessThanOrEqual(new Date(messages.body[1].createdAt).getTime());
  }, 10_000);

  it('rejects a message over the max length', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/clans/${clanId}/messages`)
      .set(auth(tokenB))
      .send({ text: 'x'.repeat(501) })
      .expect(400);
  });
});
