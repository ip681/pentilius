import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Robot Core Attributes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let playerId: string;
  const email = `ra-${Date.now()}@example.com`;
  const username = `ra_${Date.now()}`;
  const password = 'password123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);

    const registerRes = await request(app.getHttpServer()).post('/api/v1/auth/register').send({ email, username, password, race: 'LUXARI' });
    accessToken = registerRes.body.accessToken;
    playerId = registerRes.body.player.id;
  });

  afterAll(async () => {
    await prisma.itemInstance.deleteMany({ where: { playerId } });
    await prisma.player.delete({ where: { id: playerId } });
    await app.close();
  });

  function auth() {
    return { Authorization: `Bearer ${accessToken}` };
  }

  it('starts a new account with 20 unspent points and every base attribute at 0', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/robot/attributes').set(auth()).expect(200);
    expect(res.body.available).toBe(20);
    expect(res.body.base).toEqual({ damage: 0, defense: 0, hp: 0, evasion: 0 });
    expect(res.body.evasionAtCap).toBe(false);
  });

  it('allocates a point, following the exploding cost-per-rank curve', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/v1/robot/attributes/allocate')
      .set(auth())
      .send({ stat: 'damage' })
      .expect(201);
    expect(first.body.available).toBe(19);
    expect(first.body.base.damage).toBe(1);
  });

  it('rejects an unknown attribute name', async () => {
    await request(app.getHttpServer()).post('/api/v1/robot/attributes/allocate').set(auth()).send({ stat: 'luck' }).expect(400);
  });

  it('rejects allocating Evasion once it reaches the configured cap', async () => {
    // Seed baseEvasion straight to the cap (rank 40 = 20% / 0.5%-per-point) rather
    // than spending the (exponentially expensive) points 40 times over.
    await prisma.player.update({ where: { id: playerId }, data: { baseEvasion: 40, attributePointsAvailable: 1000 } });

    const attributes = await request(app.getHttpServer()).get('/api/v1/robot/attributes').set(auth()).expect(200);
    expect(attributes.body.evasionAtCap).toBe(true);

    const rejected = await request(app.getHttpServer())
      .post('/api/v1/robot/attributes/allocate')
      .set(auth())
      .send({ stat: 'evasion' })
      .expect(400);
    expect(rejected.body.message).toBe('ATTRIBUTE_AT_CAP');

    // The cap is per-stat — Damage can still be allocated normally.
    const stillWorks = await request(app.getHttpServer())
      .post('/api/v1/robot/attributes/allocate')
      .set(auth())
      .send({ stat: 'damage' })
      .expect(201);
    expect(stillWorks.body.base.damage).toBe(2);
  });
});
