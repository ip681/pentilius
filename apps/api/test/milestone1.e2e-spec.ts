import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Milestone 1 vertical slice (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  const email = `m1-${Date.now()}@example.com`;
  const password = 'password123';
  let randomSpy: jest.SpyInstance;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);

    const registerRes = await request(app.getHttpServer()).post('/api/v1/auth/register').send({ email, password });
    accessToken = registerRes.body.accessToken;
  });

  afterAll(async () => {
    const player = await prisma.player.findUnique({ where: { email } });
    if (player) {
      await prisma.battleReport.deleteMany({ where: { playerId: player.id } });
      await prisma.itemInstance.deleteMany({ where: { playerId: player.id } });
      await prisma.playerBuilding.deleteMany({ where: { playerId: player.id } });
      await prisma.player.delete({ where: { id: player.id } });
    }
    await app.close();
  });

  function auth() {
    return { Authorization: `Bearer ${accessToken}` };
  }

  it('grants starting resources and a full starter kit on registration', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/player/me').set(auth()).expect(200);
    expect(res.body.level).toBe(1);
    expect(res.body.resources.metal).toBe(500);
    expect(res.body.resources.upgradeStones).toBe(5);

    const inventory = await request(app.getHttpServer()).get('/api/v1/inventory').set(auth()).expect(200);
    expect(inventory.body).toHaveLength(6);
    expect(inventory.body.every((item: { equipped: boolean }) => !item.equipped)).toBe(true);
  });

  it('upgrades a building, deducting resources and starting a timer', async () => {
    const before = await request(app.getHttpServer()).get('/api/v1/base').set(auth()).expect(200);
    const metalMineBefore = before.body.buildings.find((b: { key: string }) => b.key === 'metal_mine');
    expect(metalMineBefore.level).toBe(0);

    const upgraded = await request(app.getHttpServer())
      .post('/api/v1/base/buildings/metal_mine/upgrade')
      .set(auth())
      .expect(201);
    expect(upgraded.body.constructionEndsAt).not.toBeNull();

    const after = await request(app.getHttpServer()).get('/api/v1/base').set(auth()).expect(200);
    expect(after.body.resources.crystal).toBe(50); // started with 100, level 1 costs 50 crystal
  });

  it('equips the full starter kit', async () => {
    const inventory = await request(app.getHttpServer()).get('/api/v1/inventory').set(auth()).expect(200);
    for (const item of inventory.body) {
      await request(app.getHttpServer()).post(`/api/v1/ship/equip/${item.id}`).set(auth()).expect(201);
    }

    const ship = await request(app.getHttpServer()).get('/api/v1/ship').set(auth()).expect(200);
    expect(ship.body.every((slot: { item: unknown }) => slot.item !== null)).toBe(true);
  });

  it('lists zones with the second zone locked below level 3', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/zones').set(auth()).expect(200);
    const verdant = res.body.find((z: { key: string }) => z.key === 'zone_verdant_flats');
    const ashen = res.body.find((z: { key: string }) => z.key === 'zone_ashen_ridge');
    expect(verdant.unlocked).toBe(true);
    expect(ashen.unlocked).toBe(false);
  });

  it('defeats a Pentili, awarding XP and loot, and records a battle report', async () => {
    const zones = await request(app.getHttpServer()).get('/api/v1/zones').set(auth()).expect(200);
    const verdant = zones.body.find((z: { key: string }) => z.key === 'zone_verdant_flats');
    const pentiliRes = await request(app.getHttpServer()).get(`/api/v1/zones/${verdant.id}/pentili`).set(auth()).expect(200);
    const skitterling = pentiliRes.body.find((p: { key: string }) => p.key === 'pentili_skitterling');

    // Force a deterministic win and guaranteed loot rolls for this test.
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

    const attackRes = await request(app.getHttpServer())
      .post(`/api/v1/pve/attack/${skitterling.id}`)
      .set(auth())
      .expect(201);

    randomSpy.mockRestore();

    expect(attackRes.body.outcome).toBe('WIN');
    expect(attackRes.body.xpGained).toBe(10);
    expect(attackRes.body.lootSummary.length).toBeGreaterThan(0);

    const profile = await request(app.getHttpServer()).get('/api/v1/player/me').set(auth()).expect(200);
    expect(profile.body.energy.current).toBe(9); // started at 10, spent 1
    expect(profile.body.xp).toBe(10);

    const reports = await request(app.getHttpServer()).get('/api/v1/pve/reports').set(auth()).expect(200);
    expect(reports.body).toHaveLength(1);
    expect(reports.body[0].outcome).toBe('WIN');
  });

  it('upgrades an equipped item, spending upgrade stones', async () => {
    const inventory = await request(app.getHttpServer()).get('/api/v1/inventory').set(auth()).expect(200);
    const weapon = inventory.body.find((item: { itemDefinitionKey: string }) => item.itemDefinitionKey === 'weapon_starter_blaster');

    const upgraded = await request(app.getHttpServer())
      .post(`/api/v1/inventory/items/${weapon.id}/upgrade`)
      .set(auth())
      .expect(201);
    expect(upgraded.body.upgradeLevel).toBe(1);

    const profile = await request(app.getHttpServer()).get('/api/v1/player/me').set(auth()).expect(200);
    // Started with 5, +1 from the forced skitterling loot roll in the previous test, -5 for this upgrade.
    expect(profile.body.resources.upgradeStones).toBe(1);
  });
});
