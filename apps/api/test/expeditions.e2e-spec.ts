import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Expeditions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let playerId: string;
  const email = `expedition-${Date.now()}@example.com`;
  const username = `exp_${Date.now()}`;
  const password = 'password123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);

    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, username, password, race: 'VORLUN' });
    accessToken = registerRes.body.accessToken;
    playerId = registerRes.body.player.id;
  });

  afterAll(async () => {
    await prisma.playerExpedition.deleteMany({ where: { playerId } });
    await prisma.itemInstance.deleteMany({ where: { playerId } });
    await prisma.player.delete({ where: { id: playerId } });
    await app.close();
  });

  function auth() {
    return { Authorization: `Bearer ${accessToken}` };
  }

  it('lists expedition types with no active expedition', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/expeditions').set(auth()).expect(200);
    expect(res.body.types.length).toBeGreaterThanOrEqual(3);
    expect(res.body.active).toBeNull();
  });

  it('starts an expedition and blocks starting a second one', async () => {
    const started = await request(app.getHttpServer())
      .post('/api/v1/expeditions/expedition_short/start')
      .set(auth())
      .expect(201);
    expect(started.body.expeditionKey).toBe('expedition_short');
    expect(started.body.completed).toBe(false);

    await request(app.getHttpServer()).post('/api/v1/expeditions/expedition_long/start').set(auth()).expect(400);
  });

  it('rejects claiming before the expedition ends', async () => {
    await request(app.getHttpServer()).post('/api/v1/expeditions/claim').set(auth()).expect(400);
  });

  it('claims rewards once the expedition has ended', async () => {
    await prisma.playerExpedition.updateMany({
      where: { playerId, claimedAt: null },
      data: { endsAt: new Date(Date.now() - 1000) },
    });

    const claimed = await request(app.getHttpServer()).post('/api/v1/expeditions/claim').set(auth()).expect(201);
    expect(claimed.body.rewards.metal).toBe(60);
    expect(claimed.body.rewards.xp).toBe(15);

    const profile = await request(app.getHttpServer()).get('/api/v1/player/me').set(auth()).expect(200);
    expect(profile.body.resources.metal).toBe(560); // started with 500 + 60 reward

    const status = await request(app.getHttpServer()).get('/api/v1/expeditions').set(auth()).expect(200);
    expect(status.body.active).toBeNull();
  });

  it('rejects cancelling when nothing is in progress', async () => {
    await request(app.getHttpServer()).post('/api/v1/expeditions/cancel').set(auth()).expect(404);
  });

  it('pays out 70% of the proportional reward when cancelled halfway through', async () => {
    await request(app.getHttpServer()).post('/api/v1/expeditions/expedition_medium/start').set(auth()).expect(201);

    // Simulate being exactly halfway through the 300-minute duration.
    await prisma.playerExpedition.updateMany({
      where: { playerId, claimedAt: null },
      data: { startedAt: new Date(Date.now() - 150 * 60_000), endsAt: new Date(Date.now() + 150 * 60_000) },
    });

    const cancelled = await request(app.getHttpServer()).post('/api/v1/expeditions/cancel').set(auth()).expect(201);
    // medium: metal 250, crystal 90, credits 50, xp 70 — at 50% elapsed * 70% payout = 35%.
    expect(cancelled.body.rewards.metal).toBe(87);
    expect(cancelled.body.rewards.crystal).toBe(31);
    expect(cancelled.body.rewards.credits).toBe(17);
    expect(cancelled.body.rewards.xp).toBe(24);
    expect(cancelled.body.bonusItem).toBeNull();

    const status = await request(app.getHttpServer()).get('/api/v1/expeditions').set(auth()).expect(200);
    expect(status.body.active).toBeNull();
  });

  it('rejects cancelling an expedition that has already finished', async () => {
    await request(app.getHttpServer()).post('/api/v1/expeditions/expedition_short/start').set(auth()).expect(201);
    await prisma.playerExpedition.updateMany({
      where: { playerId, claimedAt: null },
      data: { endsAt: new Date(Date.now() - 1000) },
    });

    await request(app.getHttpServer()).post('/api/v1/expeditions/cancel').set(auth()).expect(400);

    // Clean up so afterAll's deleteMany isn't the only thing resolving state.
    await request(app.getHttpServer()).post('/api/v1/expeditions/claim').set(auth()).expect(201);
  });
});
