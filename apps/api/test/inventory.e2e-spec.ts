import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('General inventory (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let playerId: string;
  const email = `inv-${Date.now()}@example.com`;
  const username = `inv_${Date.now()}`;
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
    await prisma.battleReport.deleteMany({ where: { playerId } });
    await prisma.itemInstance.deleteMany({ where: { playerId } });
    await prisma.player.delete({ where: { id: playerId } });
    await app.close();
  });

  function auth() {
    return { Authorization: `Bearer ${accessToken}` };
  }

  it('does not count the equipped starter kit against inventory capacity', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/inventory').set(auth()).expect(200);
    // The 7-slot starter kit isn't equipped yet at this point in the suite.
    expect(res.body.used).toBe(7);
    expect(res.body.capacity).toBe(30);

    const items = res.body.items as { id: string }[];
    for (const item of items) {
      await request(app.getHttpServer()).post(`/api/v1/robot/equip/${item.id}`).set(auth()).expect(201);
    }

    const afterEquip = await request(app.getHttpServer()).get('/api/v1/inventory').set(auth()).expect(200);
    expect(afterEquip.body.used).toBe(0);
  });

  it('rejects using a non-consumable item', async () => {
    const inventory = await request(app.getHttpServer()).get('/api/v1/inventory').set(auth()).expect(200);
    const equipmentItem = inventory.body.items[0];

    await request(app.getHttpServer()).post(`/api/v1/inventory/items/${equipmentItem.id}/use`).set(auth()).expect(400);
  });

  it('uses a consumable, restoring energy (capped at max) and decrementing its stack', async () => {
    const energyPack = await prisma.itemDefinition.findUniqueOrThrow({ where: { key: 'energy_pack_small' } });
    const instance = await prisma.itemInstance.create({ data: { playerId, itemDefinitionId: energyPack.id, quantity: 2 } });

    // Player starts full (10/10) — using the pack must not push it past the cap.
    const used = await request(app.getHttpServer()).post(`/api/v1/inventory/items/${instance.id}/use`).set(auth()).expect(201);
    const inventoryItem = (used.body.items as { id: string; quantity: number }[]).find((i) => i.id === instance.id);
    expect(inventoryItem?.quantity).toBe(1);

    const profile = await request(app.getHttpServer()).get('/api/v1/player/me').set(auth()).expect(200);
    expect(profile.body.energy.current).toBe(10);

    // Spend one point, then confirm using the pack restores it.
    await prisma.player.update({ where: { id: playerId }, data: { actionEnergy: 9 } });
    const usedAgain = await request(app.getHttpServer()).post(`/api/v1/inventory/items/${instance.id}/use`).set(auth()).expect(201);
    expect((usedAgain.body.items as { id: string }[]).some((i) => i.id === instance.id)).toBe(false); // stack hit 0, row deleted

    const profileAfter = await request(app.getHttpServer()).get('/api/v1/player/me').set(auth()).expect(200);
    expect(profileAfter.body.energy.current).toBe(10);
  });

  it('skips a loot item drop once the inventory is at capacity, without blocking the resource/XP reward', async () => {
    const junk = await prisma.itemDefinition.findUniqueOrThrow({ where: { key: 'left_arm_pulse_cannon' } });
    // Fill the bag to exactly capacity (30) with unequipped junk.
    await prisma.itemInstance.createMany({
      data: Array.from({ length: 30 }, () => ({ playerId, itemDefinitionId: junk.id })),
    });
    const before = await request(app.getHttpServer()).get('/api/v1/inventory').set(auth()).expect(200);
    expect(before.body.used).toBe(30);

    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0); // forces a win and every loot roll to hit
    const zones = await request(app.getHttpServer()).get('/api/v1/zones').set(auth()).expect(200);
    const verdant = zones.body.find((z: { key: string }) => z.key === 'zone_verdant_flats');
    const pentiliRes = await request(app.getHttpServer()).get(`/api/v1/zones/${verdant.id}/pentili`).set(auth()).expect(200);
    const skitterling = pentiliRes.body.find((p: { key: string }) => p.key === 'pentili_skitterling');

    const attackRes = await request(app.getHttpServer()).post(`/api/v1/pve/attack/${skitterling.id}`).set(auth()).expect(201);
    randomSpy.mockRestore();

    expect(attackRes.body.outcome).toBe('WIN');
    expect(attackRes.body.xpGained).toBeGreaterThan(0); // XP/resources still granted
    expect(attackRes.body.lootSummary.some((entry: { type: string }) => entry.type === 'item')).toBe(false); // the pack drop was skipped — bag was full

    const after = await request(app.getHttpServer()).get('/api/v1/inventory').set(auth()).expect(200);
    expect(after.body.used).toBe(30); // unchanged — nothing new was added

    await prisma.itemInstance.deleteMany({ where: { playerId, itemDefinitionId: junk.id } });
  });
});
