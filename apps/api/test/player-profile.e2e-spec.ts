import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Player public profile (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let playerId: string;
  const suffix = Date.now();
  const email = `profile-${suffix}@example.com`;
  const username = `prof_${suffix}`;
  const password = 'password123';
  let clanId = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, username, password, race: 'THALION' });
    token = reg.body.accessToken;
    playerId = reg.body.player.id;
  });

  afterAll(async () => {
    if (clanId) {
      await prisma.clanMembership.deleteMany({ where: { playerId } });
      await prisma.clanBuilding.deleteMany({ where: { clanId } });
      await prisma.clan.deleteMany({ where: { id: clanId } });
    }
    await prisma.itemInstance.deleteMany({ where: { playerId } });
    await prisma.player.delete({ where: { id: playerId } });
    await app.close();
  });

  function auth() {
    return { Authorization: `Bearer ${token}` };
  }

  it('exposes a public profile with no bio and no clan by default', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/player/${playerId}`).set(auth()).expect(200);
    expect(res.body.username).toBe(username);
    expect(res.body.race).toBe('THALION');
    expect(res.body.bio).toBeNull();
    expect(res.body.clan).toBeNull();
    expect(res.body.email).toBeUndefined();
  });

  it('rejects a bio longer than 280 characters', async () => {
    await request(app.getHttpServer()).post('/api/v1/player/me/bio').set(auth()).send({ bio: 'x'.repeat(281) }).expect(400);
  });

  it('lets the player set their own bio, visible on the public profile', async () => {
    const updated = await request(app.getHttpServer())
      .post('/api/v1/player/me/bio')
      .set(auth())
      .send({ bio: '  Just a test captain.  ' })
      .expect(201);
    expect(updated.body.bio).toBe('Just a test captain.'); // trimmed

    const profile = await request(app.getHttpServer()).get(`/api/v1/player/${playerId}`).set(auth()).expect(200);
    expect(profile.body.bio).toBe('Just a test captain.');

    const me = await request(app.getHttpServer()).get('/api/v1/player/me').set(auth()).expect(200);
    expect(me.body.bio).toBe('Just a test captain.');
  });

  it('clears the bio when set to an empty string', async () => {
    const updated = await request(app.getHttpServer()).post('/api/v1/player/me/bio').set(auth()).send({ bio: '   ' }).expect(201);
    expect(updated.body.bio).toBeNull();
  });

  it('shows clan membership on the public profile once the player joins one', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/clans')
      .set(auth())
      .send({ name: `Profile Clan ${suffix}`, tag: 'PFT' })
      .expect(201);
    clanId = created.body.id;

    const profile = await request(app.getHttpServer()).get(`/api/v1/player/${playerId}`).set(auth()).expect(200);
    expect(profile.body.clan).toEqual({ id: clanId, name: `Profile Clan ${suffix}`, tag: 'PFT', role: 'LEADER' });
  });

  it('finds the player by username search, including their clan tag', async () => {
    const res = await request(app.getHttpServer()).get(`/api/v1/player?search=${username}`).set(auth()).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toEqual({ id: playerId, username, race: 'THALION', level: 1, clanId, clanTag: 'PFT' });
  });

  it('filters the leaderboard by race, excluding a non-matching race', async () => {
    const matching = await request(app.getHttpServer()).get(`/api/v1/player?search=${username}&race=THALION`).set(auth()).expect(200);
    expect(matching.body).toHaveLength(1);

    const nonMatching = await request(app.getHttpServer()).get(`/api/v1/player?search=${username}&race=NEXAR`).set(auth()).expect(200);
    expect(nonMatching.body).toHaveLength(0);
  });

  it('returns 404 for an unknown player id', async () => {
    await request(app.getHttpServer()).get('/api/v1/player/00000000-0000-0000-0000-000000000000').set(auth()).expect(404);
  });
});
