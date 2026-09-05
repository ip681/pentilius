import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Research (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let playerId: string;
  const email = `research-${Date.now()}@example.com`;
  const username = `res_${Date.now()}`;
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
      .send({ email, username, password, race: 'ZARYTH' });
    accessToken = registerRes.body.accessToken;
    playerId = registerRes.body.player.id;
  });

  afterAll(async () => {
    await prisma.playerResearch.deleteMany({ where: { playerId } });
    await prisma.itemInstance.deleteMany({ where: { playerId } });
    await prisma.player.delete({ where: { id: playerId } });
    await app.close();
  });

  function auth() {
    return { Authorization: `Bearer ${accessToken}` };
  }

  it('lists every research type at level 0 with no active timer', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/research').set(auth()).expect(200);
    expect(res.body.researches.length).toBeGreaterThanOrEqual(4);
    expect(res.body.researches.every((r: { level: number; researchEndsAt: string | null }) => r.level === 0 && r.researchEndsAt === null)).toBe(true);
  });

  it('starts a research, deducting its cost, and blocks starting the same one twice', async () => {
    const started = await request(app.getHttpServer())
      .post('/api/v1/research/research_metal_production/start')
      .set(auth())
      .expect(201);
    expect(started.body.key).toBe('research_metal_production');
    expect(started.body.level).toBe(0);
    expect(started.body.researchEndsAt).not.toBeNull();

    const profile = await request(app.getHttpServer()).get('/api/v1/player/me').set(auth()).expect(200);
    expect(profile.body.resources.metal).toBe(300); // 500 - 200
    expect(profile.body.resources.crystal).toBe(20); // 100 - 80

    await request(app.getHttpServer()).post('/api/v1/research/research_metal_production/start').set(auth()).expect(400);
  });

  it('allows a second, different research to run in parallel once affordable', async () => {
    await prisma.player.update({ where: { id: playerId }, data: { metal: 1000, crystal: 1000 } });

    const started = await request(app.getHttpServer())
      .post('/api/v1/research/research_crystal_production/start')
      .set(auth())
      .expect(201);
    expect(started.body.key).toBe('research_crystal_production');
    expect(started.body.researchEndsAt).not.toBeNull();

    const list = await request(app.getHttpServer()).get('/api/v1/research').set(auth()).expect(200);
    const metalProd = list.body.researches.find((r: { key: string }) => r.key === 'research_metal_production');
    const crystalProd = list.body.researches.find((r: { key: string }) => r.key === 'research_crystal_production');
    expect(metalProd.researchEndsAt).not.toBeNull();
    expect(crystalProd.researchEndsAt).not.toBeNull();
  });

  it('finalizes a completed research into a level-up on the next read', async () => {
    await prisma.playerResearch.updateMany({
      where: { playerId, researchType: { key: 'research_metal_production' } },
      data: { researchEndsAt: new Date(Date.now() - 1000) },
    });

    const list = await request(app.getHttpServer()).get('/api/v1/research').set(auth()).expect(200);
    const metalProd = list.body.researches.find((r: { key: string }) => r.key === 'research_metal_production');
    const crystalProd = list.body.researches.find((r: { key: string }) => r.key === 'research_crystal_production');
    expect(metalProd.level).toBe(1);
    expect(metalProd.researchEndsAt).toBeNull();
    expect(crystalProd.level).toBe(0); // untouched, still in progress
    expect(crystalProd.researchEndsAt).not.toBeNull();
  });

  it('rejects starting an unknown research key', async () => {
    await request(app.getHttpServer()).post('/api/v1/research/not_a_real_research/start').set(auth()).expect(404);
  });
});
