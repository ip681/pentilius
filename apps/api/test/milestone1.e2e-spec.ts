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
  const username = `m1_${Date.now()}`;
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

    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, username, password, race: 'LUXARI' });
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

    const inventory = await request(app.getHttpServer()).get('/api/v1/inventory').set(auth()).expect(200);
    expect(inventory.body.items).toHaveLength(7);
    expect(inventory.body.items.every((item: { equipped: boolean }) => !item.equipped)).toBe(true);
    expect(inventory.body.used).toBe(7);
    expect(inventory.body.capacity).toBe(30);
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
    for (const item of inventory.body.items) {
      await request(app.getHttpServer()).post(`/api/v1/robot/equip/${item.id}`).set(auth()).expect(201);
    }

    const robot = await request(app.getHttpServer()).get('/api/v1/robot').set(auth()).expect(200);
    expect(robot.body.every((slot: { item: unknown }) => slot.item !== null)).toBe(true);
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

  it("upgrades an equipped item, spending its tier's upgrade material", async () => {
    const player = await prisma.player.findUniqueOrThrow({ where: { email } });
    const material = await prisma.itemDefinition.findUniqueOrThrow({ where: { key: 'pioneer_upgrade' } });
    // The forced-loot "defeats a Pentili" test above may have already granted a
    // stack (skitterling now drops pioneer_upgrade too) — clear it first so this
    // test controls the exact quantity instead of relying on find-order between two stacks.
    await prisma.itemInstance.deleteMany({ where: { playerId: player.id, itemDefinitionId: material.id } });
    await prisma.itemInstance.create({ data: { playerId: player.id, itemDefinitionId: material.id, quantity: 10 } });

    const inventory = await request(app.getHttpServer()).get('/api/v1/inventory').set(auth()).expect(200);
    const weapon = inventory.body.items.find((item: { itemDefinitionKey: string }) => item.itemDefinitionKey === 'pioneer_left_arm_blaster');

    const upgraded = await request(app.getHttpServer())
      .post(`/api/v1/inventory/items/${weapon.id}/upgrade`)
      .set(auth())
      .expect(201);
    const upgradedWeapon = upgraded.body.items.find((item: { id: string }) => item.id === weapon.id);
    expect(upgradedWeapon.upgradeLevel).toBe(1);

    // Cost to reach level 1 = materialsPerLevel (1) * (0 + 1) = 1; started with 10.
    const materialAfter = upgraded.body.items.find((item: { itemDefinitionKey: string }) => item.itemDefinitionKey === 'pioneer_upgrade');
    expect(materialAfter.quantity).toBe(9);
  });
});
